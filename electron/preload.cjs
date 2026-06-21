const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notesApi", {
  onMenuAction: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, action) => callback(action);
    ipcRenderer.on("app-menu:action", listener);
    return () => ipcRenderer.removeListener("app-menu:action", listener);
  },
  updateMenuContext: (payload) => ipcRenderer.send("app-menu:update-context", payload),
  aiQuery: (payload) => ipcRenderer.invoke("ai:query", payload),
  aiGetApiKey: (payload) => ipcRenderer.invoke("ai:config:get-api-key", payload),
  aiSetApiKey: (payload) => ipcRenderer.invoke("ai:config:set-api-key", payload),
  aiGetPreferences: (payload) => ipcRenderer.invoke("ai:config:get-preferences", payload),
  aiSetPreferences: (payload) => ipcRenderer.invoke("ai:config:set-preferences", payload),
  aiTestConnection: (payload) => ipcRenderer.invoke("ai:config:test-connection", payload),
  aiClearData: (payload) => ipcRenderer.invoke("ai:config:clear-data", payload),
  aiGenerateEmbeddings: (payload) => ipcRenderer.invoke("ai:embeddings:generate", payload),
  aiBuildGraph: (payload) => ipcRenderer.invoke("ai:graph:build", payload),
  aiDetectPatterns: (payload) => ipcRenderer.invoke("ai:patterns:detect", payload),
  getNotesRootSetting: () => ipcRenderer.invoke("settings:get-notes-root"),
  setNotesRootSetting: (payload) => ipcRenderer.invoke("settings:set-notes-root", payload),
  pickFolder: () => ipcRenderer.invoke("settings:pick-folder"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  setActiveProject: (payload) => ipcRenderer.invoke("projects:set-active", payload),
  getP2PStatus: () => ipcRenderer.invoke("p2p:get-status"),
  startP2PDiscovery: () => ipcRenderer.invoke("p2p:start-discovery"),
  stopP2PDiscovery: () => ipcRenderer.invoke("p2p:stop-discovery"),
  setP2PDeviceName: (payload) => ipcRenderer.invoke("p2p:set-device-name", payload),
  createP2PInvite: (payload) => ipcRenderer.invoke("p2p:create-invite", payload),
  pairP2PWithCode: (payload) => ipcRenderer.invoke("p2p:pair-with-code", payload),
  setP2PKeyPolicyDays: (payload) => ipcRenderer.invoke("p2p:set-key-policy", payload),
  manualP2PConnect: (payload) => ipcRenderer.invoke("p2p:manual-connect", payload),
  removeTrustedP2PPeer: (payload) => ipcRenderer.invoke("p2p:remove-trusted-peer", payload),
  rotateP2PWorkspaceKeys: (payload) => ipcRenderer.invoke("p2p:rotate-workspace-keys", payload),
  runP2PSyncSelfTest: () => ipcRenderer.invoke("p2p:run-sync-self-test"),
  listP2PSyncConflicts: (payload) => ipcRenderer.invoke("sync:list-conflicts", payload),
  readP2PConflictFiles: (payload) => ipcRenderer.invoke("sync:read-conflict-files", payload),
  resolveP2PConflict: (payload) => ipcRenderer.invoke("sync:resolve-conflict", payload),
  onP2PSyncApplied: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("sync:applied", listener);
    return () => ipcRenderer.removeListener("sync:applied", listener);
  },
  onP2PFullSyncProgress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("p2p:full-sync-progress", listener);
    return () => ipcRenderer.removeListener("p2p:full-sync-progress", listener);
  },
  getWorkspaceActivity: (payload) => ipcRenderer.invoke("activity:get-workspace", payload),
  listDocuments: (payload) => ipcRenderer.invoke("documents:list", payload),
  createDocument: (payload) => ipcRenderer.invoke("documents:create", payload),
  createFolder: (payload) => ipcRenderer.invoke("folders:create", payload),
  renameDocument: (payload) => ipcRenderer.invoke("documents:rename", payload),
  deleteDocument: (payload) => ipcRenderer.invoke("documents:delete", payload),
  readDocument: (filePath) => ipcRenderer.invoke("documents:read", filePath),
  saveDocument: (payload) => ipcRenderer.invoke("documents:save", payload),
  getHistory: (filePath) => ipcRenderer.invoke("documents:history", filePath),
  restoreHistory: (payload) => ipcRenderer.invoke("documents:restore", payload),
  readVersion: (payload) => ipcRenderer.invoke("documents:read-version", payload),
  deleteVersion: (payload) => ipcRenderer.invoke("documents:delete-version", payload),
  openInEditor: (filePath) => ipcRenderer.invoke("documents:open-in-editor", filePath),
  openFileInEditor: (filePath) => ipcRenderer.invoke("documents:open-in-editor", filePath),
  openWebView: (payload) => ipcRenderer.invoke("documents:open-web-view", payload),
  downloadPdf: (payload) => ipcRenderer.invoke("documents:download-pdf", payload),
  saveImage: (payload) => ipcRenderer.invoke("images:save", payload),
  listImages: (payload) => ipcRenderer.invoke("images:list", payload),
  getImageUsage: (payload) => ipcRenderer.invoke("images:usage", payload),
  readImage: (payload) => ipcRenderer.invoke("images:read", payload),
  deleteImage: (payload) => ipcRenderer.invoke("images:delete", payload),
  replaceImage: (payload) => ipcRenderer.invoke("images:replace", payload),
  renameImage: (payload) => ipcRenderer.invoke("images:rename", payload),
  runTerminalCommand: (payload) => ipcRenderer.invoke("terminal:run", payload),
  createTerminalSession: (payload) => ipcRenderer.invoke("terminal:create", payload),
  writeTerminalInput: (payload) => ipcRenderer.invoke("terminal:write", payload),
  resizeTerminal: (payload) => ipcRenderer.invoke("terminal:resize", payload),
  killTerminalSession: (payload) => ipcRenderer.invoke("terminal:kill", payload),
  onTerminalData: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
  onTerminalExit: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:exit", listener);
    return () => ipcRenderer.removeListener("terminal:exit", listener);
  }
});
