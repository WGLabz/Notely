const { assertTrustedIpcSender } = require("../ipc/ipcSecurity.cjs");
const { buildWorkspaceGraph } = require("./workspaceGraph.cjs");

function registerDocumentIpcHandlers(ipcMain, deps) {
  const {
    BrowserWindow,
    dialog,
    shell,
    fs,
    os,
    path,
    pathToFileURL,
    slugify,
    hashContent,
    filePathWithin,
    listRootEntries,
    listDirectoryEntries,
    listWorkspaceFileEntries,
    getNotesRoot,
    getActiveProject,
    createDocumentInProject,
    createFolderInProject,
    renameDocumentFile,
    deleteDocumentFile,
    deleteFolderInProject,
    parseDocument,
    buildDocumentContent,
    emitLocalP2PSyncEvent,
    buildNoteDelta,
    dashboardCache,
    ensureWebPreviewServer,
    prepareDocumentPreview,
    syncWebPreviewScope,
    tryOpenInChrome,
    getLastPdfExportPath,
    rememberPdfExportPath,
    buildPdfExportMarkdown,
    buildPdfExportHtml,
    getAppDataDir,
  } = deps;

  const PDF_WRITE_RETRY_DELAYS_MS = [120, 320, 700];

  function isRetryableWriteError(error) {
    const code = String(error?.code || "").toUpperCase();
    return code === "EBUSY" || code === "EPERM" || code === "EACCES";
  }

  async function writeFileWithRetries(filePath, data) {
    let lastError = null;
    for (let attempt = 0; attempt <= PDF_WRITE_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        fs.writeFileSync(filePath, data);
        return;
      } catch (error) {
        if (!isRetryableWriteError(error)) {
          throw error;
        }
        lastError = error;
        if (attempt >= PDF_WRITE_RETRY_DELAYS_MS.length) {
          break;
        }
        const waitMs = PDF_WRITE_RETRY_DELAYS_MS[attempt];
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    throw lastError;
  }

  function registerTrustedHandler(channel, handler) {
    ipcMain.handle(channel, (event, payload) => {
      assertTrustedIpcSender(BrowserWindow, event, channel);
      return handler(event, payload);
    });
  }

  const lastAppHashes = new Map();
  let watchedPath = null;

  function stopWatching(filePath) {
    if (filePath) {
      const resolved = path.resolve(filePath);
      if (watchedPath === resolved) {
        try {
          fs.unwatchFile(watchedPath);
          console.log(`[Watcher] Stopped watch on: "${watchedPath}"`);
        } catch (e) {
          console.error("[Watcher] Unwatch error:", e);
        }
        watchedPath = null;
      }
    } else if (watchedPath) {
      try {
        fs.unwatchFile(watchedPath);
        console.log(`[Watcher] Stopped watch on: "${watchedPath}"`);
      } catch (e) {
        console.error("[Watcher] Unwatch error:", e);
      }
      watchedPath = null;
    }
  }

  function startWatching(filePath, webContents) {
    stopWatching();
    watchedPath = path.resolve(filePath);
    console.log(`[Watcher] Starting poll watch on: "${watchedPath}"`);

    try {
      fs.watchFile(watchedPath, { interval: 500 }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) {
          console.log(`[Watcher] File mod time changed: ${prev.mtime} -> ${curr.mtime}`);
          try {
            if (fs.existsSync(watchedPath)) {
              const content = fs.readFileSync(watchedPath, "utf8");
              const currentHash = hashContent(content);
              const knownHash = lastAppHashes.get(watchedPath);
              console.log(`[Watcher] File hash check: current="${currentHash}", known="${knownHash}"`);
              if (knownHash && currentHash !== knownHash) {
                console.log(`[Watcher] Hash mismatch detected! Sending notification for: "${watchedPath}"`);
                if (webContents && !webContents.isDestroyed()) {
                  webContents.send("document:changed-on-disk", { filePath: watchedPath });
                }
              }
            }
          } catch (e) {
            console.error("[Watcher] Read error:", e);
          }
        }
      });
    } catch (e) {
      console.error("[Watcher] Setup error:", e);
    }
  }

  registerTrustedHandler("documents:list", (_event, payload) => {
    const activeProject = getActiveProject();
    const notesRoot = getNotesRoot();
    const projectRoot = path.resolve(activeProject?.rootPath || notesRoot);
    const requestedFolderPath = String(payload?.folderPath || "").trim();
    const targetDir = path.resolve(requestedFolderPath || projectRoot);

    if (!filePathWithin(projectRoot, targetDir)) {
      throw new Error("Invalid folder path.");
    }

    if (activeProject?.isRoot && targetDir.toLowerCase() === path.resolve(notesRoot).toLowerCase()) {
      return listRootEntries(notesRoot);
    }

    return listDirectoryEntries(targetDir, { includeProjectSlug: false });
  });

  registerTrustedHandler("documents:list-task-sources", () => {
    const activeProject = getActiveProject();
    const notesRoot = getNotesRoot();
    const projectRoot = path.resolve(activeProject?.rootPath || notesRoot);
    return listWorkspaceFileEntries(projectRoot);
  });

  registerTrustedHandler("documents:get-dashboard-cache", () => {
    return dashboardCache?.getDashboardState?.() || { continueWriting: [], recentNotes: [] };
  });

  registerTrustedHandler("documents:create", (_event, payload) => {
    const activeProject = getActiveProject();
    const rootDir = activeProject.rootPath;
    const created = createDocumentInProject(rootDir, payload);
    const content = buildDocumentContent(created);
    emitLocalP2PSyncEvent({
      op: "create",
      filePath: created.filePath,
      baseHash: null,
      newHash: hashContent(content),
      content,
      baseContent: null,
      delta: {
        header: created.header || "",
        rawNotes: created.rawNotes || "",
        cleansed: created.cleansed || ""
      }
    });
    dashboardCache?.recordSave?.(created);
    return created;
  });

  registerTrustedHandler("folders:create", (_event, payload) => {
    const activeProject = getActiveProject();
    const rootDir = activeProject.rootPath;
    return createFolderInProject(rootDir, payload);
  });

  registerTrustedHandler("folders:delete", (_event, payload) => {
    const activeProject = getActiveProject();
    const rootDir = activeProject.rootPath;
    const result = deleteFolderInProject(rootDir, payload?.folderPath);
    dashboardCache?.removeFolder?.(payload?.folderPath);
    return result;
  });

  registerTrustedHandler("documents:rename", (_event, payload) => {
    const previousFilePath = payload?.filePath;
    const renamed = renameDocumentFile(previousFilePath, payload);
    dashboardCache?.renameEntry?.(previousFilePath, renamed);
    try {
      const { aiService } = require("../../../ai/core/AIService.js");
      aiService.onNoteRename(previousFilePath, renamed.filePath);
    } catch (aiErr) {
      console.error("[documentIpc] Failed to trigger AI onNoteRename:", aiErr.message);
    }
    return renamed;
  });

  registerTrustedHandler("documents:delete", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const resolved = path.resolve(String(payload?.filePath || ""));
    if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error("Document file does not exist.");
    }

    const previous = fs.readFileSync(resolved, "utf8");
    const previousHash = hashContent(previous);
    const result = deleteDocumentFile(resolved);

    try {
      const { aiService } = require("../../../ai/core/AIService.js");
      aiService.onNoteDelete(resolved);
    } catch (aiErr) {
      console.error("[documentIpc] Failed to trigger AI onNoteDelete:", aiErr.message);
    }

    emitLocalP2PSyncEvent({
      op: "delete",
      filePath: resolved,
      baseHash: previousHash,
      newHash: null,
      content: null,
      baseContent: previous
    });

    dashboardCache?.removeFile?.(resolved);

    return result;
  });

  registerTrustedHandler("documents:read", (event, filePath) => {
    const activeProject = getActiveProject();
    const notesRoot = getNotesRoot();
    const projectRoot = path.resolve(activeProject?.rootPath || notesRoot);
    const resolved = path.resolve(filePath);
    if (!filePathWithin(projectRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    const content = fs.readFileSync(resolved, "utf8");
    lastAppHashes.set(resolved, hashContent(content));
    return parseDocument(content, resolved);
  });

  registerTrustedHandler("documents:mark-opened", (event, filePath) => {
    const activeProject = getActiveProject();
    const notesRoot = getNotesRoot();
    const projectRoot = path.resolve(activeProject?.rootPath || notesRoot);
    const resolved = path.resolve(String(filePath || ""));
    if (!filePathWithin(projectRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error("Document file does not exist.");
    }

    const content = fs.readFileSync(resolved, "utf8");
    lastAppHashes.set(resolved, hashContent(content));

    const parsed = parseDocument(content, resolved);
    dashboardCache?.recordOpen?.(parsed);
    return true;
  });

  registerTrustedHandler("documents:start-watching", (event, filePath) => {
    const activeProject = getActiveProject();
    const notesRoot = getNotesRoot();
    const projectRoot = path.resolve(activeProject?.rootPath || notesRoot);
    const resolved = path.resolve(filePath);
    if (!filePathWithin(projectRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    startWatching(resolved, event.sender);
    return true;
  });

  registerTrustedHandler("documents:stop-watching", (_event, filePath) => {
    stopWatching(filePath);
    return true;
  });

  registerTrustedHandler("documents:read-markdown-source", (_event, filePath) => {
    const activeProject = getActiveProject();
    const notesRoot = getNotesRoot();
    const projectRoot = path.resolve(activeProject?.rootPath || notesRoot);
    const resolved = path.resolve(String(filePath || ""));
    if (!filePathWithin(projectRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error("Document file does not exist.");
    }
    return fs.readFileSync(resolved, "utf8");
  });

  registerTrustedHandler("documents:save", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const resolved = path.resolve(payload.filePath);
    if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }

    const previous = fs.readFileSync(resolved, "utf8");

    const next = buildDocumentContent(payload);
    if (next === previous) {
      const unchanged = parseDocument(next, resolved);
      dashboardCache?.recordSave?.(unchanged);
      return unchanged;
    }

    lastAppHashes.set(resolved, hashContent(next));
    fs.writeFileSync(resolved, next, "utf8");

    try {
      const { aiService } = require("../../../ai/core/AIService.js");
      aiService.onNoteSave(resolved);
    } catch (aiErr) {
      console.error("[documentIpc] Failed to trigger AI onNoteSave:", aiErr.message);
    }

    emitLocalP2PSyncEvent({
      op: "update",
      filePath: resolved,
      baseHash: hashContent(previous),
      newHash: hashContent(next),
      content: next,
      baseContent: previous,
      delta: buildNoteDelta({
        filePath: resolved,
        previousContent: previous,
        nextContent: next
      })
    });

    const parsed = parseDocument(next, resolved);
    dashboardCache?.recordSave?.(parsed);
    return parsed;
  });

  registerTrustedHandler("documents:open-in-editor", async (_event, filePath) => {
    const notesRoot = getNotesRoot();
    const resolved = path.resolve(filePath || "");
    if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error("Document file does not exist.");
    }

    try {
      const vscodeUri = `vscode://file/${resolved.replace(/\\/g, "/")}`;
      await shell.openExternal(encodeURI(vscodeUri));
      return { openedWith: "vscode" };
    } catch {
      const fallbackResult = await shell.openPath(resolved);
      if (fallbackResult) {
        throw new Error(fallbackResult);
      }
      return { openedWith: "default" };
    }
  });

  registerTrustedHandler("documents:open-web-view", async (_event, payload) => {
    if (!payload?.filePath && typeof syncWebPreviewScope === "function") {
      syncWebPreviewScope();
    }

    let previewUrl = `${await ensureWebPreviewServer()}/`;
    if (payload?.filePath) {
      const prepared = await prepareDocumentPreview(payload.filePath, payload.content);
      previewUrl = prepared.previewUrl;
    }

    const openedWithChrome = tryOpenInChrome(previewUrl);

    if (!openedWithChrome) {
      await shell.openExternal(previewUrl);
    }

    return {
      openedWith: openedWithChrome ? "chrome" : "default",
      previewUrl
    };
  });

  registerTrustedHandler("documents:download-pdf", async (_event, payload) => {
    const notesRoot = getNotesRoot();
    const resolved = path.resolve(String(payload?.filePath || ""));
    if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }

    const includeRawNotes = Boolean(payload?.includeRawNotes);
    const includeCleansed = Boolean(payload?.includeCleansed);
    const pdfQualityPreset = ["full", "balanced", "compact"].includes(payload?.pdfQualityPreset)
      ? payload.pdfQualityPreset
      : "full";
    const downsampleImages = Boolean(payload?.downsampleImages) || pdfQualityPreset !== "full";
    if (!includeRawNotes && !includeCleansed) {
      throw new Error("Select at least one section to export.");
    }

    const focusedWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    const defaultName = `${path.basename(resolved, ".md") || "note"}.pdf`;
    const lastPdfExportPath = getLastPdfExportPath();
    const defaultSavePath = lastPdfExportPath
      ? path.join(lastPdfExportPath, defaultName)
      : path.join(path.dirname(resolved), defaultName);
    const saveResult = await dialog.showSaveDialog(focusedWindow, {
      title: "Save note as PDF",
      defaultPath: defaultSavePath,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "notely-pdf-"));
    const tempMarkdownPath = path.join(tempDir, `${slugify(path.basename(resolved))}-export.md`);
    const tempHtmlPath = path.join(tempDir, `${slugify(path.basename(resolved))}-export.html`);
    const markdownContent = buildPdfExportMarkdown(payload, { includeRawNotes, includeCleansed });
    fs.writeFileSync(tempMarkdownPath, markdownContent, "utf8");

    try {
      const baseHref = pathToFileURL(`${path.dirname(resolved)}${path.sep}`).href;
      const html = buildPdfExportHtml({
        title: payload?.title || path.basename(resolved, ".md"),
        markdownContent,
        baseHref,
        sourceDir: path.dirname(resolved),
        downsampleImages,
        pdfQualityPreset
      });
      fs.writeFileSync(tempHtmlPath, html, "utf8");

      const pdfWindow = new BrowserWindow({
        show: false,
        width: 1280,
        height: 1600,
        backgroundColor: "#ffffff",
        webPreferences: {
          backgroundThrottling: false,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false
        }
      });

      try {
        await pdfWindow.loadFile(tempHtmlPath);
        await pdfWindow.webContents.executeJavaScript("document.fonts ? document.fonts.ready : Promise.resolve()");

        const pdfData = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true
        });

        try {
          await writeFileWithRetries(saveResult.filePath, pdfData);
        } catch (error) {
          if (isRetryableWriteError(error)) {
            throw new Error(`Unable to save PDF because the target file is busy or locked: ${saveResult.filePath}. Close any app using it (including preview panes/OneDrive sync locks) and try again.`);
          }
          throw error;
        }
        rememberPdfExportPath(saveResult.filePath);
      } finally {
        if (!pdfWindow.isDestroyed()) {
          pdfWindow.close();
        }
      }

      return { canceled: false, filePath: saveResult.filePath };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures for temporary export files.
      }
    }
  });



  registerTrustedHandler("workspace:graph-data", () => {
    const activeProject = getActiveProject();
    const notesRoot = getNotesRoot();
    const workspaceRoot = path.resolve(activeProject?.rootPath || notesRoot);
    return buildWorkspaceGraph(fs, path, workspaceRoot);
  });


  registerTrustedHandler("trash:list", (_event) => {
    const removedDir = path.join(getAppDataDir(), "removed");
    if (!fs.existsSync(removedDir)) {
      return [];
    }

    const items = [];
    function walk(dir, group) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (group === "folders") {
            const relativePath = path.relative(path.join(removedDir, "folders"), fullPath);
            const stats = fs.statSync(fullPath);
            items.push({
              name: entry.name,
              relativePath,
              group,
              deletedAt: stats.mtimeMs,
              isDirectory: true
            });
          }
          walk(fullPath, group);
        } else {
          const relativePath = path.relative(path.join(removedDir, group), fullPath);
          const stats = fs.statSync(fullPath);
          items.push({
            name: entry.name,
            relativePath,
            group,
            deletedAt: stats.mtimeMs,
            isDirectory: false
          });
        }
      }
    }

    walk(path.join(removedDir, "notes"), "notes");
    walk(path.join(removedDir, "folders"), "folders");

    items.sort((a, b) => b.deletedAt - a.deletedAt);
    return items;
  });

  registerTrustedHandler("trash:restore", (_event, payload) => {
    const { relativePath, group } = payload || {};
    if (!relativePath || !group) {
      throw new Error("Invalid payload.");
    }
    const notesRoot = getNotesRoot();
    const removedDir = path.join(getAppDataDir(), "removed");
    const sourcePath = path.join(removedDir, group, relativePath);
    const targetPath = path.join(notesRoot, relativePath);

    if (!fs.existsSync(sourcePath)) {
      throw new Error("File not found in trash.");
    }

    const targetParent = path.dirname(targetPath);
    if (!fs.existsSync(targetParent)) {
      fs.mkdirSync(targetParent, { recursive: true });
    }

    fs.renameSync(sourcePath, targetPath);

    if (group === "notes") {
      const metadataStore = deps.getMetadataStore ? deps.getMetadataStore() : null;
      metadataStore?.renameHistoryFilePath(sourcePath, targetPath);
      dashboardCache?.addEntry?.(targetPath);
    }
    return { success: true };
  });

  registerTrustedHandler("trash:empty", (_event) => {
    const removedDir = path.join(getAppDataDir(), "removed");
    if (fs.existsSync(removedDir)) {
      fs.rmSync(removedDir, { recursive: true, force: true });
    }
    return { success: true };
  });
}

module.exports = { registerDocumentIpcHandlers };
