const { assertTrustedIpcSender } = require("../ipc/ipcSecurity.cjs");
const { buildWorkspaceGraph } = require("./workspaceGraph.cjs");
const SemanticGraphCache = require("./SemanticGraphCache.cjs");

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
    nowStamp,
    hashContent,
    filePathWithin,
    listRootEntries,
    listDirectoryEntries,
    listWorkspaceFileEntries,
    getNotesRoot,
    getVersionsRoot,
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
    hasMatchingFileBackedVersion,
    createVersionSnapshot,
    getMetadataStore,
    metadataStore,
    dashboardCache,
    ensureDir,
    ensureWebPreviewServer,
    prepareDocumentPreview,
    syncWebPreviewScope,
    tryOpenInChrome,
    getLastPdfExportPath,
    rememberPdfExportPath,
    buildPdfExportMarkdown,
    buildPdfExportHtml,
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

  function resolveMetadataStore() {
    const store = typeof getMetadataStore === "function" ? getMetadataStore() : metadataStore;
    if (!store) {
      throw new Error("Metadata store is not initialized yet.");
    }
    return store;
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

    const saveReason = String(payload?.reason || "manual-save");
    const isAutoSave = saveReason === "autosave";

    const previous = fs.readFileSync(resolved, "utf8");

    const next = buildDocumentContent(payload);
    if (next === previous) {
      const unchanged = parseDocument(next, resolved);
      dashboardCache?.recordSave?.(unchanged);
      return unchanged;
    }

    lastAppHashes.set(resolved, hashContent(next));
    fs.writeFileSync(resolved, next, "utf8");

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

    if (!isAutoSave) {
      const previousHash = hashContent(previous);
      if (!hasMatchingFileBackedVersion(resolved, previousHash)) {
        const versionPath = createVersionSnapshot(resolved, previous, saveReason);

        resolveMetadataStore().addHistory({
          filePath: resolved,
          versionPath,
          fileHash: previousHash,
          reason: saveReason,
          createdAt: new Date().toISOString()
        });
      }
    }

    const parsed = parseDocument(next, resolved);
    dashboardCache?.recordSave?.(parsed);
    return parsed;
  });

  registerTrustedHandler("documents:history", (_event, filePath) => {
    const resolved = path.resolve(filePath);
    return resolveMetadataStore().getHistory(resolved);
  });

  registerTrustedHandler("documents:restore", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const versionsRoot = getVersionsRoot();
    const resolved = path.resolve(payload.filePath);
    const versionPath = path.resolve(payload.versionPath);
    if (!filePathWithin(notesRoot, resolved) || !filePathWithin(versionsRoot, versionPath)) {
      throw new Error("Invalid restore path.");
    }

    const current = fs.readFileSync(resolved, "utf8");
    const rollbackDir = path.join(versionsRoot, slugify(path.basename(resolved)));
    ensureDir(rollbackDir);
    const rollbackPath = path.join(rollbackDir, `${nowStamp()}-before-restore.md`);
    fs.writeFileSync(rollbackPath, current, "utf8");

    const restored = fs.readFileSync(versionPath, "utf8");
    fs.writeFileSync(resolved, restored, "utf8");

    resolveMetadataStore().addHistory({
      filePath: resolved,
      versionPath: rollbackPath,
      fileHash: hashContent(current),
      reason: "before-restore",
      createdAt: new Date().toISOString()
    });

    return parseDocument(restored, resolved);
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

  registerTrustedHandler("documents:read-version", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const versionsRoot = getVersionsRoot();
    const resolvedFilePath = path.resolve(payload?.filePath || "");
    const resolvedVersionPath = path.resolve(payload?.versionPath || "");

    if (!filePathWithin(notesRoot, resolvedFilePath) || path.extname(resolvedFilePath).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    if (!filePathWithin(versionsRoot, resolvedVersionPath) || path.extname(resolvedVersionPath).toLowerCase() !== ".md") {
      throw new Error("Invalid version path.");
    }
    if (!fs.existsSync(resolvedVersionPath)) {
      throw new Error("Version file does not exist.");
    }

    return fs.readFileSync(resolvedVersionPath, "utf8");
  });

  registerTrustedHandler("documents:delete-version", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const versionsRoot = getVersionsRoot();
    const resolvedFilePath = path.resolve(payload?.filePath || "");
    const resolvedVersionPath = path.resolve(payload?.versionPath || "");

    if (!filePathWithin(notesRoot, resolvedFilePath) || path.extname(resolvedFilePath).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    if (!filePathWithin(versionsRoot, resolvedVersionPath) || path.extname(resolvedVersionPath).toLowerCase() !== ".md") {
      throw new Error("Invalid version path.");
    }

    if (fs.existsSync(resolvedVersionPath)) {
      fs.unlinkSync(resolvedVersionPath);
    }
    metadataStore.deleteHistoryVersion(resolvedFilePath, resolvedVersionPath);
    return true;
  });

  registerTrustedHandler("workspace:graph-data", () => {
    const activeProject = getActiveProject();
    const notesRoot = getNotesRoot();
    const workspaceRoot = path.resolve(activeProject?.rootPath || notesRoot);
    return buildWorkspaceGraph(fs, path, workspaceRoot);
  });

  registerTrustedHandler("workspace:semantic-graph", async () => {
    try {
      const activeProject = getActiveProject();
      const notesRoot = getNotesRoot();
      const workspaceRoot = path.resolve(activeProject?.rootPath || notesRoot);
      
      // Get base graph first
      const baseGraph = buildWorkspaceGraph(fs, path, workspaceRoot);
      
      // Get embedding staleness info from AIConfig
      let staleness = null;
      try {
        const AIConfig = require('../../../src/ai/utils/AIConfig');
        const config = new AIConfig();
        staleness = config.getEmbeddingStaleness();
      } catch (err) {
        console.warn('[Semantic Graph] Failed to get staleness:', err.message);
      }
      
      // Try to get semantic clustering
      const aiAgent = deps.getAIAgent?.();
      if (!aiAgent?.embeddingService?.isAvailable()) {
        console.log('[Semantic Graph] Embeddings unavailable, returning base graph only');
        return { ...baseGraph, clusters: [], similarities: {}, staleness };
      }

      // Check cache
      const appDataDir = path.join(require('os').homedir(), 'AppData', 'Roaming', 'Notely');
      const cache = new SemanticGraphCache(appDataDir);
      
      if (cache.isFresh(workspaceRoot)) {
        const cached = cache.load();
        if (cached?.clusters) {
          console.log('[Semantic Graph] Using cached clustering');
          return { ...baseGraph, clusters: cached.clusters, staleness };
        }
      }

      // Load document contents for semantic analysis
      console.log('[Semantic Graph] Computing semantic clusters...');
      const documents = baseGraph.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        filePath: node.filePath,
        content: (() => {
          try {
            return fs.readFileSync(node.filePath, 'utf8');
          } catch {
            return '';
          }
        })(),
      }));

      const SemanticClusteringService = require('../../../src/ai/services/SemanticClusteringService.js');
      const clusteringService = new SemanticClusteringService(aiAgent.embeddingService, 0.65);
      const { clusters } = await clusteringService.analyzeDocuments(documents);

      // Cache results
      cache.save({ workspaceRoot, clusters });

      return { ...baseGraph, clusters, staleness };
    } catch (error) {
      console.error('[Semantic Graph] Error:', error.message);
      // Fallback to base graph on error
      const activeProject = getActiveProject();
      const notesRoot = getNotesRoot();
      const workspaceRoot = path.resolve(activeProject?.rootPath || notesRoot);
      let staleness = null;
      try {
        const AIConfig = require('../../../src/ai/utils/AIConfig');
        const config = new AIConfig();
        staleness = config.getEmbeddingStaleness();
      } catch {
        // Ignore staleness fetch error in error handler
      }
      return { ...buildWorkspaceGraph(fs, path, workspaceRoot), clusters: [], staleness };
    }
  });
}

module.exports = { registerDocumentIpcHandlers };
