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
    getNotesRoot,
    getVersionsRoot,
    getActiveProject,
    createDocumentInProject,
    createFolderInProject,
    renameDocumentFile,
    deleteDocumentFile,
    parseDocument,
    buildDocumentContent,
    emitLocalP2PSyncEvent,
    buildNoteDelta,
    hasMatchingFileBackedVersion,
    createVersionSnapshot,
    metadataStore,
    ensureDir,
    ensureWebPreviewServer,
    prepareDocumentPreview,
    tryOpenInChrome,
    getLastPdfExportPath,
    rememberPdfExportPath,
    buildPdfExportMarkdown,
    buildPdfExportHtml,
  } = deps;

  ipcMain.handle("documents:list", (_event, payload) => {
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

  ipcMain.handle("documents:create", (_event, payload) => {
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
    return created;
  });

  ipcMain.handle("folders:create", (_event, payload) => {
    const activeProject = getActiveProject();
    const rootDir = activeProject.rootPath;
    return createFolderInProject(rootDir, payload);
  });

  ipcMain.handle("documents:rename", (_event, payload) => {
    return renameDocumentFile(payload?.filePath, payload);
  });

  ipcMain.handle("documents:delete", (_event, payload) => {
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

    return result;
  });

  ipcMain.handle("documents:read", (_event, filePath) => {
    const notesRoot = getNotesRoot();
    const resolved = path.resolve(filePath);
    if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    return parseDocument(fs.readFileSync(resolved, "utf8"), resolved);
  });

  ipcMain.handle("documents:save", (_event, payload) => {
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
      return parseDocument(next, resolved);
    }

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

        metadataStore.addHistory({
          filePath: resolved,
          versionPath,
          fileHash: previousHash,
          reason: saveReason,
          createdAt: new Date().toISOString()
        });
      }
    }

    return parseDocument(next, resolved);
  });

  ipcMain.handle("documents:history", (_event, filePath) => {
    const resolved = path.resolve(filePath);
    return metadataStore.getHistory(resolved);
  });

  ipcMain.handle("documents:restore", (_event, payload) => {
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

    metadataStore.addHistory({
      filePath: resolved,
      versionPath: rollbackPath,
      fileHash: hashContent(current),
      reason: "before-restore",
      createdAt: new Date().toISOString()
    });

    return parseDocument(restored, resolved);
  });

  ipcMain.handle("documents:open-in-editor", async (_event, filePath) => {
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

  ipcMain.handle("documents:open-web-view", async (_event, payload) => {
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

  ipcMain.handle("documents:download-pdf", async (_event, payload) => {
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
    const saveResult = await dialog.showSaveDialog(focusedWindow, {
      title: "Save note as PDF",
      defaultPath: lastPdfExportPath || path.join(path.dirname(resolved), defaultName),
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

        fs.writeFileSync(saveResult.filePath, pdfData);
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

  ipcMain.handle("documents:read-version", (_event, payload) => {
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

  ipcMain.handle("documents:delete-version", (_event, payload) => {
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
}

module.exports = { registerDocumentIpcHandlers };
