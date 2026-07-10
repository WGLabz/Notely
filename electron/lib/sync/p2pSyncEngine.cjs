const { createP2PSyncHistory } = require("./p2pSyncHistory.cjs");
const {
  normalizeRelativePath,
  isMarkdownSyncPath,
  isValidSyncRelativePath,
  createSyncConflictCopy,
  tryMergeDocumentContent,
  buildNoteDelta,
  applyNoteDelta,
} = require("./p2pSyncContent.cjs");

function createP2PSyncEngine(deps) {
  const {
    fs,
    path,
    slugify,
    nowStamp,
    randomId,
    hashContent,
    filePathWithin,
    normalizeToPosix,
    ensureDir,
    getUniquePath,
    walkFiles,
    deleteDocumentFile,
    parseDocument,
    buildDocumentContent,
    getNotesRoot,
    getVersionsRoot,
    getMetadataStore,
    getP2PService,
    getMainWindow,
    fullSyncBatchSize,
    fullSyncMaxFiles,
    versionHistoryLimit,
  } = deps;

  const syncHistory = createP2PSyncHistory({
    fs,
    path,
    slugify,
    nowStamp,
    ensureDir,
    filePathWithin,
    hashContent,
    getVersionsRoot,
    getMetadataStore,
    versionHistoryLimit,
  });

  const {
    buildP2PSyncReason,
    addSyncHistoryEntry,
    createVersionSnapshot,
    pruneVersionHistory,
    hasMatchingFileBackedVersion,
  } = syncHistory;

  function computeContentHash(value, encoding = "utf8") {
    return hashContent(encoding === "base64" ? String(value || "") : String(value || ""));
  }

  function readSyncFilePayload(resolvedPath, relativePath) {
    const normalizedRelativePath = normalizeRelativePath(normalizeToPosix, relativePath);
    if (isMarkdownSyncPath(normalizedRelativePath)) {
      const content = fs.readFileSync(resolvedPath, "utf8");
      return {
        content,
        contentBase64: null,
        contentEncoding: "utf8",
        hash: computeContentHash(content, "utf8")
      };
    }

    const binary = fs.readFileSync(resolvedPath);
    const contentBase64 = binary.toString("base64");
    return {
      content: null,
      contentBase64,
      contentEncoding: "base64",
      hash: computeContentHash(contentBase64, "base64")
    };
  }

  function listSyncCandidateFiles(notesRoot) {
    const candidates = new Set();
    const skipDirNames = new Set([
      ".git", ".svn", ".hg", "node_modules", "dist", "build", ".artifacts", ".cache", "__pycache__", "removed", ".versions", "coverage"
    ]);

    const addIfFile = (targetPath) => {
      try {
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
          candidates.add(path.resolve(targetPath));
        }
      } catch {
        // Ignore unreadable entries.
      }
    };

    const collectRecursively = (startDir) => {
      if (!startDir || !fs.existsSync(startDir)) return;
      const stack = [path.resolve(startDir)];
      while (stack.length) {
        const current = stack.pop();
        let entries = [];
        try {
          entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const entry of entries) {
          const nextPath = path.join(current, entry.name);
          if (entry.isDirectory()) {
            stack.push(nextPath);
          } else if (entry.isFile()) {
            addIfFile(nextPath);
          }
        }
      }
    };

    const collectNestedNotesAppDiagrams = (rootDir) => {
      if (!rootDir || !fs.existsSync(rootDir)) return;
      const stack = [path.resolve(rootDir)];
      while (stack.length) {
        const current = stack.pop();
        let entries = [];
        try {
          entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (skipDirNames.has(entry.name)) continue;

          const nextPath = path.join(current, entry.name);
          if (entry.name === ".notes-app") {
            collectRecursively(path.join(nextPath, "excali-diagrams"));
            continue;
          }

          stack.push(nextPath);
        }
      }
    };

    for (const filePath of walkFiles(notesRoot, { excludeDirs: [".notes-app", "removed", "images", "excali-diagrams", "media"] })) {
      addIfFile(filePath);
    }

    collectRecursively(path.join(notesRoot, "images"));
    collectRecursively(path.join(notesRoot, "media", "images"));
    collectRecursively(path.join(notesRoot, "media", "docs"));
    collectRecursively(path.join(notesRoot, "excali-diagrams"));
    collectRecursively(path.join(notesRoot, ".notes-app", "excali-diagrams"));
    collectNestedNotesAppDiagrams(notesRoot);

    return Array.from(candidates);
  }

  async function initiateFullSyncForPeer(peerId) {
    const p2pService = getP2PService();
    const notesRoot = getNotesRoot();
    if (!p2pService || !notesRoot) {
      return;
    }

    const targetPeerId = String(peerId || "").trim();
    if (!targetPeerId) {
      return;
    }

    const publishProgress = (payload) => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("p2p:full-sync-progress", {
          peerId: targetPeerId,
          ...payload
        });
      }
    };

    try {
      const allFiles = listSyncCandidateFiles(notesRoot);
      const syncFiles = allFiles.filter((f) => {
        const relativePath = normalizeRelativePath(normalizeToPosix, path.relative(notesRoot, f));
        if (!isValidSyncRelativePath(normalizeToPosix, relativePath)) {
          return false;
        }
        return !path.basename(f).includes(".sync-conflict-");
      });

      const truncated = syncFiles.length > fullSyncMaxFiles;
      const plannedFiles = truncated ? syncFiles.slice(0, fullSyncMaxFiles) : syncFiles;
      const totalFiles = plannedFiles.length;
      let queuedFiles = 0;

      publishProgress({
        phase: "starting",
        totalFiles,
        queuedFiles,
        remainingFiles: totalFiles,
        truncated,
        completed: totalFiles === 0,
        failed: false,
        startedAt: new Date().toISOString()
      });

      for (let batchStart = 0; batchStart < plannedFiles.length; batchStart += fullSyncBatchSize) {
        const batch = plannedFiles.slice(batchStart, batchStart + fullSyncBatchSize);

        for (const filePath of batch) {
          try {
            const relativePath = normalizeRelativePath(normalizeToPosix, path.relative(notesRoot, filePath));
            if (!isValidSyncRelativePath(normalizeToPosix, relativePath)) {
              continue;
            }
            const payload = readSyncFilePayload(filePath, relativePath);

            const queued = p2pService.queueSyncToPeer(targetPeerId, {
              eventId: randomId(10),
              timestamp: new Date().toISOString(),
              docId: relativePath.toLowerCase(),
              op: "update",
              baseHash: null,
              newHash: payload.hash,
              payload: {
                relativePath,
                content: payload.content,
                contentBase64: payload.contentBase64,
                contentEncoding: payload.contentEncoding,
                baseContent: null,
                delta: null
              }
            });
            if (!queued) {
              throw new Error("Peer is no longer available for full sync.");
            }

            queuedFiles += 1;
          } catch {
            // Skip unreadable files.
          }
        }

        await p2pService.drainSyncOutbox();

        publishProgress({
          phase: "sending",
          totalFiles,
          queuedFiles,
          remainingFiles: Math.max(0, totalFiles - queuedFiles),
          truncated,
          completed: false,
          failed: false,
          startedAt: null
        });
      }

      publishProgress({
        phase: "completed",
        totalFiles,
        queuedFiles,
        remainingFiles: Math.max(0, totalFiles - queuedFiles),
        truncated,
        completed: true,
        failed: false,
        startedAt: null
      });
    } catch (error) {
      publishProgress({
        phase: "failed",
        totalFiles: 0,
        queuedFiles: 0,
        remainingFiles: 0,
        truncated: false,
        completed: true,
        failed: true,
        error: error?.message || "Full sync failed.",
        startedAt: null
      });
      console.error("[p2p] initiateFullSyncForPeer failed:", error?.message);
    }
  }

  function emitLocalP2PSyncEvent(event) {
    const p2pService = getP2PService();
    if (!p2pService) {
      return;
    }

    const notesRoot = getNotesRoot();
    const resolved = path.resolve(String(event?.filePath || ""));
    if (!filePathWithin(notesRoot, resolved)) {
      return;
    }

    const relativePath = normalizeRelativePath(normalizeToPosix, path.relative(notesRoot, resolved));
    if (!isValidSyncRelativePath(normalizeToPosix, relativePath)) {
      return;
    }

    const op = String(event?.op || "").trim();
    if (!["create", "update", "delete"].includes(op)) {
      return;
    }

    let content = typeof event?.content === "string" ? event.content : null;
    let contentBase64 = typeof event?.contentBase64 === "string" ? event.contentBase64 : null;
    let contentEncoding = String(event?.contentEncoding || "").trim().toLowerCase();
    if (!contentEncoding) {
      contentEncoding = contentBase64 ? "base64" : "utf8";
    }

    if (contentEncoding === "base64" && !contentBase64 && typeof content === "string") {
      contentBase64 = content;
      content = null;
    }

    if (contentEncoding === "utf8" && !content && typeof contentBase64 === "string") {
      content = Buffer.from(contentBase64, "base64").toString("utf8");
    }

    const computedNewHash = event?.newHash
      || (contentEncoding === "base64" && contentBase64 ? computeContentHash(contentBase64, "base64") : null)
      || (contentEncoding === "utf8" && content ? computeContentHash(content, "utf8") : null);

    p2pService.broadcastSyncEvent({
      eventId: randomId(10),
      timestamp: new Date().toISOString(),
      docId: relativePath.toLowerCase(),
      op,
      baseHash: event?.baseHash || null,
      newHash: computedNewHash,
      payload: {
        relativePath,
        content,
        contentBase64,
        contentEncoding,
        baseContent: typeof event?.baseContent === "string" ? event.baseContent : null,
        delta: event?.delta && typeof event.delta === "object" ? event.delta : null
      }
    }).catch((error) => {
      console.error("P2P sync broadcast failed:", error?.message || error);
    });
  }

  function pushSyncApplied(payload) {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sync:applied", payload);
    }
  }

  function handleIncomingP2PSyncEvent({ peerId, peerName, event }) {
    try {
      const op = String(event?.op || "").trim();
      const relativePath = normalizeRelativePath(normalizeToPosix, String(event?.payload?.relativePath || "").trim());
      if (!["create", "update", "delete"].includes(op) || !isValidSyncRelativePath(normalizeToPosix, relativePath)) {
        return;
      }
      const isMarkdown = isMarkdownSyncPath(relativePath);

      const notesRoot = getNotesRoot();
      const resolved = path.resolve(notesRoot, relativePath);
      if (!filePathWithin(notesRoot, resolved)) {
        return;
      }

      ensureDir(path.dirname(resolved));
      const baseReason = buildP2PSyncReason("p2p-sync-received", peerId);
      addSyncHistoryEntry({
        filePath: resolved,
        reason: baseReason,
        versionPath: `p2p://${event?.eventId || "unknown"}`,
        fileHash: String(event?.newHash || event?.baseHash || hashContent(baseReason))
      });

      if (op === "delete") {
        if (!fs.existsSync(resolved)) {
          addSyncHistoryEntry({
            filePath: resolved,
            reason: buildP2PSyncReason("p2p-sync-stale-ignored", peerId),
            versionPath: `p2p://${event?.eventId || "unknown"}`,
            fileHash: String(event?.baseHash || hashContent("delete-stale"))
          });
          return;
        }

        const localContent = isMarkdown ? fs.readFileSync(resolved, "utf8") : null;
        const localBinaryBase64 = isMarkdown ? null : fs.readFileSync(resolved).toString("base64");
        const localHash = isMarkdown
          ? computeContentHash(localContent, "utf8")
          : computeContentHash(localBinaryBase64, "base64");
        if (event?.baseHash && event.baseHash !== localHash) {
          addSyncHistoryEntry({
            filePath: resolved,
            reason: buildP2PSyncReason("p2p-sync-delete-conflict", peerId),
            versionPath: `p2p://${event?.eventId || "unknown"}`,
            fileHash: localHash
          });
          pushSyncApplied({ op: "delete-conflict", relativePath, filePath: resolved, peerName: peerName || peerId });
          return;
        }

        const result = isMarkdown
          ? deleteDocumentFile(resolved)
          : (fs.unlinkSync(resolved), { movedPath: null });
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-delete-applied", peerId),
          versionPath: result?.movedPath || `p2p://${event?.eventId || "unknown"}`,
          fileHash: localHash
        });
        pushSyncApplied({ op: "delete", relativePath, filePath: resolved, peerName: peerName || peerId });
        return;
      }

      const incomingDelta = event?.payload?.delta && typeof event.payload.delta === "object"
        ? event.payload.delta
        : null;
      const incomingEncoding = String(event?.payload?.contentEncoding || "").trim().toLowerCase() || (isMarkdown ? "utf8" : "base64");
      let incomingContent = typeof event?.payload?.content === "string"
        ? event.payload.content
        : null;
      let incomingBase64 = typeof event?.payload?.contentBase64 === "string"
        ? event.payload.contentBase64
        : null;

      if (!isMarkdown) {
        if (!incomingBase64 && incomingEncoding === "base64" && incomingContent) {
          incomingBase64 = incomingContent;
        }
        if (!incomingBase64) {
          return;
        }
      } else {
        if (!incomingContent && incomingEncoding === "base64" && incomingBase64) {
          incomingContent = Buffer.from(incomingBase64, "base64").toString("utf8");
        }

        if (!incomingContent && incomingDelta && fs.existsSync(resolved)) {
          const localForDelta = fs.readFileSync(resolved, "utf8");
          incomingContent = applyNoteDelta({ parseDocument, buildDocumentContent }, {
            filePath: resolved,
            baseContent: localForDelta,
            delta: incomingDelta
          });
        }

        if (!incomingContent) {
          return;
        }
      }

      const incomingBuffer = !isMarkdown ? Buffer.from(incomingBase64, "base64") : null;
      const incomingHash = isMarkdown
        ? computeContentHash(incomingContent, "utf8")
        : computeContentHash(incomingBase64, "base64");

      if (!fs.existsSync(resolved)) {
        if (isMarkdown) {
          fs.writeFileSync(resolved, incomingContent, "utf8");
        } else {
          fs.writeFileSync(resolved, incomingBuffer);
        }
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-applied", peerId),
          versionPath: `p2p://${event?.eventId || "unknown"}`,
          fileHash: incomingHash
        });
        pushSyncApplied({ op, relativePath, filePath: resolved, peerName: peerName || peerId });
        return;
      }

      const localContent = isMarkdown ? fs.readFileSync(resolved, "utf8") : null;
      const localBinaryBase64 = isMarkdown ? null : fs.readFileSync(resolved).toString("base64");
      const localHash = isMarkdown
        ? computeContentHash(localContent, "utf8")
        : computeContentHash(localBinaryBase64, "base64");
      if (event?.newHash && localHash === event.newHash) {
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-duplicate-ignored", peerId),
          versionPath: `p2p://${event?.eventId || "unknown"}`,
          fileHash: localHash
        });
        return;
      }

      if (!isMarkdown) {
        if (event?.baseHash && localHash === event.baseHash) {
          fs.writeFileSync(resolved, incomingBuffer);
          addSyncHistoryEntry({
            filePath: resolved,
            reason: buildP2PSyncReason("p2p-sync-applied", peerId),
            versionPath: `p2p://${event?.eventId || "unknown"}`,
            fileHash: localHash
          });
          pushSyncApplied({ op, relativePath, filePath: resolved, peerName: peerName || peerId });
          return;
        }

        const conflictPath = createSyncConflictCopy(
          { path, slugify, nowStamp, getUniquePath, fs },
          resolved,
          peerId,
          incomingBuffer,
          { isBinary: true }
        );
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-conflict", peerId),
          versionPath: conflictPath,
          fileHash: incomingHash
        });
        pushSyncApplied({ op: "conflict", relativePath, filePath: resolved, peerName: peerName || peerId });
        return;
      }

      if (event?.baseHash && localHash === event.baseHash) {
        const backupPath = createVersionSnapshot(resolved, localContent, "before-p2p-sync");
        fs.writeFileSync(resolved, incomingContent, "utf8");
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-applied", peerId),
          versionPath: backupPath,
          fileHash: localHash
        });
        pushSyncApplied({ op, relativePath, filePath: resolved, peerName: peerName || peerId });
        return;
      }

      const mergedContent = tryMergeDocumentContent({ parseDocument, buildDocumentContent }, {
        filePath: resolved,
        baseContent: event?.payload?.baseContent,
        localContent,
        remoteContent: incomingContent
      });

      if (typeof mergedContent === "string" && mergedContent !== localContent) {
        const backupPath = createVersionSnapshot(resolved, localContent, "before-p2p-merge");
        fs.writeFileSync(resolved, mergedContent, "utf8");
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-merged", peerId),
          versionPath: backupPath,
          fileHash: localHash
        });
        pushSyncApplied({ op: "merge", relativePath, filePath: resolved, peerName: peerName || peerId });
        return;
      }

      if (typeof mergedContent === "string" && mergedContent === localContent) {
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-duplicate-ignored", peerId),
          versionPath: `p2p://${event?.eventId || "unknown"}`,
          fileHash: localHash
        });
        return;
      }

      const conflictPath = createSyncConflictCopy(
        { path, slugify, nowStamp, getUniquePath, fs },
        resolved,
        peerId,
        incomingContent,
        { isBinary: false }
      );
      addSyncHistoryEntry({
        filePath: resolved,
        reason: buildP2PSyncReason("p2p-sync-conflict", peerId),
        versionPath: conflictPath,
        fileHash: hashContent(incomingContent)
      });
      pushSyncApplied({ op: "conflict", relativePath, filePath: resolved, peerName: peerName || peerId });
    } catch (error) {
      console.error("P2P sync apply failed:", error?.message || error);
    }
  }

  return {
    createVersionSnapshot,
    pruneVersionHistory,
    hasMatchingFileBackedVersion,
    buildNoteDelta: (payload) => buildNoteDelta(parseDocument, payload),
    initiateFullSyncForPeer,
    emitLocalP2PSyncEvent,
    handleIncomingP2PSyncEvent,
  };
}

module.exports = { createP2PSyncEngine };
