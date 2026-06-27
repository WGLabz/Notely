const { createP2PSyncHistory } = require("./p2pSyncHistory.cjs");
const {
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
      const allFiles = walkFiles(notesRoot, { excludeDirs: [".notes-app", "removed", "images"] });
      const mdFiles = allFiles.filter((f) => {
        const lower = f.toLowerCase();
        return lower.endsWith(".md") && !path.basename(f).includes(".sync-conflict-");
      });

      const truncated = mdFiles.length > fullSyncMaxFiles;
      const plannedFiles = truncated ? mdFiles.slice(0, fullSyncMaxFiles) : mdFiles;
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
            const content = fs.readFileSync(filePath, "utf8");
            const relativePath = normalizeToPosix(path.relative(notesRoot, filePath));
            if (!isValidSyncRelativePath(normalizeToPosix, relativePath)) {
              continue;
            }

            const queued = p2pService.queueSyncToPeer(targetPeerId, {
              eventId: randomId(10),
              timestamp: new Date().toISOString(),
              docId: relativePath.toLowerCase(),
              op: "update",
              baseHash: null,
              newHash: hashContent(content),
              payload: {
                relativePath,
                content,
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

    const relativePath = normalizeToPosix(path.relative(notesRoot, resolved));
    if (!isValidSyncRelativePath(normalizeToPosix, relativePath)) {
      return;
    }

    const op = String(event?.op || "").trim();
    if (!["create", "update", "delete"].includes(op)) {
      return;
    }

    p2pService.broadcastSyncEvent({
      eventId: randomId(10),
      timestamp: new Date().toISOString(),
      docId: relativePath.toLowerCase(),
      op,
      baseHash: event?.baseHash || null,
      newHash: event?.newHash || null,
      payload: {
        relativePath,
        content: typeof event?.content === "string" ? event.content : null,
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
      const relativePath = normalizeToPosix(String(event?.payload?.relativePath || "").trim());
      if (!["create", "update", "delete"].includes(op) || !isValidSyncRelativePath(normalizeToPosix, relativePath)) {
        return;
      }

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

        const localContent = fs.readFileSync(resolved, "utf8");
        const localHash = hashContent(localContent);
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

        const result = deleteDocumentFile(resolved);
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
      let incomingContent = typeof event?.payload?.content === "string"
        ? event.payload.content
        : null;

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

      if (!fs.existsSync(resolved)) {
        fs.writeFileSync(resolved, incomingContent, "utf8");
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-applied", peerId),
          versionPath: `p2p://${event?.eventId || "unknown"}`,
          fileHash: hashContent(incomingContent)
        });
        pushSyncApplied({ op, relativePath, filePath: resolved, peerName: peerName || peerId });
        return;
      }

      const localContent = fs.readFileSync(resolved, "utf8");
      const localHash = hashContent(localContent);
      if (event?.newHash && localHash === event.newHash) {
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-duplicate-ignored", peerId),
          versionPath: `p2p://${event?.eventId || "unknown"}`,
          fileHash: localHash
        });
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

      const conflictPath = createSyncConflictCopy({ path, slugify, nowStamp, getUniquePath, fs }, resolved, peerId, incomingContent);
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
