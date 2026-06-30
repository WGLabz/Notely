const { assertTrustedIpcSender } = require("../ipc/ipcSecurity.cjs");

function registerSyncIpcHandlers(ipcMain, deps) {
  const {
    BrowserWindow,
    fs,
    path,
    filePathWithin,
    normalizeToPosix,
    parseDocument,
    createVersionSnapshot,
    hashContent,
    moveFileToRemoved,
    getMetadataStore,
    getNotesRoot,
    getActiveProject,
    getP2PService,
    readP2PStatusSnapshot,
  } = deps;

  function registerTrustedHandler(channel, handler) {
    ipcMain.handle(channel, (event, payload) => {
      assertTrustedIpcSender(BrowserWindow, event, channel);
      return handler(event, payload);
    });
  }

  registerTrustedHandler("p2p:start-discovery", () => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    p2pService.startDiscovery();
    return p2pService.getStatus();
  });

  registerTrustedHandler("p2p:stop-discovery", () => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    p2pService.stopDiscovery();
    return p2pService.getStatus();
  });

  registerTrustedHandler("p2p:set-device-name", (_event, payload) => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    p2pService.setDeviceName(payload?.name);
    return p2pService.getStatus();
  });

  registerTrustedHandler("p2p:create-invite", (_event, payload) => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    return p2pService.createInvite({ targetPeerId: payload?.peerId });
  });

  registerTrustedHandler("p2p:pair-with-code", async (_event, payload) => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    return await p2pService.pairWithCode({
      peerId: payload?.peerId,
      code: payload?.code,
      reauth: Boolean(payload?.reauth)
    });
  });

  registerTrustedHandler("p2p:set-key-policy", (_event, payload) => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    p2pService.setKeyPolicyDays(payload?.days);
    return p2pService.getStatus();
  });

  registerTrustedHandler("p2p:manual-connect", async (_event, payload) => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    return await p2pService.manualConnect({
      address: payload?.address,
      listenPort: payload?.listenPort
    });
  });

  registerTrustedHandler("p2p:remove-trusted-peer", (_event, payload) => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    p2pService.removeTrustedPeer(payload?.peerId);
    return p2pService.getStatus();
  });

  registerTrustedHandler("p2p:rotate-workspace-keys", async (_event, payload) => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }

    return await p2pService.rotateWorkspaceKeys(payload?.peerId);
  });

  registerTrustedHandler("p2p:run-sync-self-test", async () => {
    const p2pService = getP2PService();
    if (!p2pService) {
      throw new Error("P2P service unavailable.");
    }
    return await p2pService.runSyncSelfTest();
  });

  registerTrustedHandler("p2p:get-status", () => {
    const p2pService = getP2PService();
    if (p2pService) {
      return p2pService.getStatus();
    }
    return readP2PStatusSnapshot();
  });

  registerTrustedHandler("sync:list-conflicts", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const activeProject = getActiveProject();
    const workspaceRoot = path.resolve(activeProject?.rootPath || notesRoot);
    const rows = getMetadataStore().getWorkspaceActivity(workspaceRoot, payload?.limit || 200);

    const conflicts = rows
      .filter((entry) => String(entry.reason || "").startsWith("p2p-sync-conflict:"))
      .map((entry, index) => ({
        id: `${entry.createdAt || "unknown"}-${index}`,
        reason: String(entry.reason || ""),
        createdAt: entry.createdAt || null,
        filePath: entry.filePath || "",
        relativePath: normalizeToPosix(path.relative(workspaceRoot, entry.filePath || "")),
        conflictPath: entry.versionPath || ""
      }))
      .filter((entry) => entry.conflictPath && fs.existsSync(entry.conflictPath));

    return {
      workspaceRoot,
      total: conflicts.length,
      conflicts
    };
  });

  registerTrustedHandler("sync:read-conflict-files", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const localPath = path.resolve(String(payload?.filePath || ""));
    const conflictPath = path.resolve(String(payload?.conflictPath || ""));

    if (!filePathWithin(notesRoot, localPath)) {
      throw new Error("Invalid file path.");
    }
    if (!fs.existsSync(localPath)) {
      throw new Error("Local note file not found.");
    }
    if (!fs.existsSync(conflictPath)) {
      throw new Error("Conflict file not found.");
    }

    const localContent = fs.readFileSync(localPath, "utf8");
    const conflictContent = fs.readFileSync(conflictPath, "utf8");
    const localDoc = parseDocument(localContent, localPath);
    const conflictDoc = parseDocument(conflictContent, conflictPath);

    return {
      local: {
        content: localContent,
        header: localDoc.header,
        rawNotes: localDoc.rawNotes,
        cleansed: localDoc.cleansed
      },
      conflict: {
        content: conflictContent,
        header: conflictDoc.header,
        rawNotes: conflictDoc.rawNotes,
        cleansed: conflictDoc.cleansed
      }
    };
  });

  registerTrustedHandler("sync:resolve-conflict", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const localPath = path.resolve(String(payload?.filePath || ""));
    const conflictPath = path.resolve(String(payload?.conflictPath || ""));
    const resolution = String(payload?.resolution || "");
    const mergedContent = payload?.mergedContent;

    if (!filePathWithin(notesRoot, localPath)) {
      throw new Error("Invalid file path.");
    }
    if (!fs.existsSync(localPath)) {
      throw new Error("Local note file not found.");
    }
    if (!fs.existsSync(conflictPath)) {
      throw new Error("Conflict file not found.");
    }

    if (resolution === "remote") {
      const conflictContent = fs.readFileSync(conflictPath, "utf8");
      const previous = fs.readFileSync(localPath, "utf8");
      const backupPath = createVersionSnapshot(localPath, previous, "before-conflict-resolve");
      fs.writeFileSync(localPath, conflictContent, "utf8");
      getMetadataStore().addHistory({
        filePath: localPath,
        versionPath: backupPath,
        fileHash: hashContent(previous),
        reason: "conflict-resolved-remote",
        createdAt: new Date().toISOString()
      });
    } else if (resolution === "merged" && typeof mergedContent === "string") {
      const previous = fs.readFileSync(localPath, "utf8");
      const backupPath = createVersionSnapshot(localPath, previous, "before-conflict-merge");
      fs.writeFileSync(localPath, mergedContent, "utf8");
      getMetadataStore().addHistory({
        filePath: localPath,
        versionPath: backupPath,
        fileHash: hashContent(previous),
        reason: "conflict-resolved-merged",
        createdAt: new Date().toISOString()
      });
    }

    const movedPath = moveFileToRemoved(conflictPath, "conflicts");
    return { ok: true, movedPath };
  });

  registerTrustedHandler("activity:get-workspace", (_event, payload) => {
    const notesRoot = getNotesRoot();
    const activeProject = getActiveProject();
    const workspaceRoot = path.resolve(activeProject?.rootPath || notesRoot);
    const rows = getMetadataStore().getWorkspaceActivity(workspaceRoot, payload?.limit);

    const activity = rows.map((entry, index) => {
      const rawReason = String(entry.reason || "unknown");
      const syncReasonMatch = rawReason.match(/^(p2p-sync-[^:]+):(.+)$/);
      const normalizedReason = syncReasonMatch ? syncReasonMatch[1] : rawReason;
      const actor = syncReasonMatch ? `peer:${syncReasonMatch[2]}` : "local-user";

      return {
        id: `${entry.createdAt || "unknown"}-${index}`,
        filePath: entry.filePath,
        fileName: path.basename(entry.filePath || ""),
        relativePath: normalizeToPosix(path.relative(workspaceRoot, entry.filePath || "")),
        reason: normalizedReason,
        createdAt: entry.createdAt || null,
        versionPath: entry.versionPath || "",
        fileHash: entry.fileHash || "",
        actor
      };
    });

    return {
      workspaceRoot,
      workspaceLabel: activeProject?.isRoot ? "Root" : (activeProject?.name || "Workspace"),
      total: activity.length,
      activity
    };
  });
}

module.exports = { registerSyncIpcHandlers };
