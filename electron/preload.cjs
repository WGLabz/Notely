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
  notifyBootReady: () => ipcRenderer.send("app:boot-ready"),
  notifyBootProgress: (payload) => ipcRenderer.send("app:boot-progress", payload),
  updateMenuContext: (payload) => ipcRenderer.send("app-menu:update-context", payload),
  getAppearanceSettings: () => ipcRenderer.invoke("settings:get-appearance"),
  getOnboardingComplete: () => ipcRenderer.invoke("settings:get-onboarding-complete"),
  setOnboardingComplete: (payload) => ipcRenderer.invoke("settings:set-onboarding-complete", payload),
  setThemePreference: (payload) => ipcRenderer.invoke("settings:set-theme-preference", payload),
  setZoomFactor: (payload) => ipcRenderer.invoke("settings:set-zoom-factor", payload),
  onThemeChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("appearance:theme-changed", listener);
    return () => ipcRenderer.removeListener("appearance:theme-changed", listener);
  },
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  maximizeWindow: () => ipcRenderer.send("window:maximize"),
  closeWindow: () => ipcRenderer.send("window:close"),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onWindowMaximizedChanged: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:maximized-changed", listener);
    return () => ipcRenderer.removeListener("window:maximized-changed", listener);
  },
  popupAppMenu: (payload) => ipcRenderer.send("window:popup-app-menu", payload),
  showContextMenu: (template) => ipcRenderer.send("window:show-context-menu", template),
  onContextMenuAction: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("window:context-menu-action", listener);
    return () => ipcRenderer.removeListener("window:context-menu-action", listener);
  },
  getMenuLabels: () => ipcRenderer.invoke("window:get-menu-labels"),
  getMenuStructure: () => ipcRenderer.invoke("window:get-menu-structure"),
  executeMenuItem: (payload) => ipcRenderer.send("window:execute-menu-item", payload),
  onMenuUpdated: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("window:menu-updated", listener);
    return () => ipcRenderer.removeListener("window:menu-updated", listener);
  },
  aiQuery: (payload) => ipcRenderer.invoke("ai:query", payload),
  aiGetApiKey: (payload) => ipcRenderer.invoke("ai:config:get-api-key", payload),
  aiSetApiKey: (payload) => ipcRenderer.invoke("ai:config:set-api-key", payload),
  aiGetPreferences: (payload) => ipcRenderer.invoke("ai:config:get-preferences", payload),
  aiSetPreferences: (payload) => ipcRenderer.invoke("ai:config:set-preferences", payload),  aiGetProviderModel: (payload) => ipcRenderer.invoke('ai:config:get-provider-model', payload),
  aiSetProviderModel: (payload) => ipcRenderer.invoke('ai:config:set-provider-model', payload),  aiTestConnection: (payload) => ipcRenderer.invoke("ai:config:test-connection", payload),
  aiClearData: (payload) => ipcRenderer.invoke("ai:config:clear-data", payload),
  aiGenerateEmbeddings: (payload) => ipcRenderer.invoke("ai:embeddings:generate", payload),
  aiBuildGraph: (payload) => ipcRenderer.invoke("ai:graph:build", payload),
  aiDetectPatterns: (payload) => ipcRenderer.invoke("ai:patterns:detect", payload),
  getNotesRootSetting: () => ipcRenderer.invoke("settings:get-notes-root"),
  getAppInfo: () => ipcRenderer.invoke("settings:get-app-info"),
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  setNotesRootSetting: (payload) => ipcRenderer.invoke("settings:set-notes-root", payload),
  getGitWorkspaceMetadata: () => ipcRenderer.invoke("settings:get-git-workspace-meta"),
  setAutoIgnoreGitMetadata: (payload) => ipcRenderer.invoke("settings:set-auto-ignore-git-metadata", payload),
  captureCurrentDisplay: () => ipcRenderer.invoke("screen:capture-current-display"),
  pickFolder: () => ipcRenderer.invoke("settings:pick-folder"),
  openReferenceNoteWindow: (payload) => ipcRenderer.invoke("window:open-reference-note", payload),
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
  openWorkspaceInEditor: (payload) => ipcRenderer.invoke("workspace:open-in-editor", payload),
  revealWorkspaceInExplorer: (payload) => ipcRenderer.invoke("workspace:reveal-in-explorer", payload),
  getWorkspaceGraph: () => ipcRenderer.invoke("workspace:graph-data"),
  getSemanticGraph: () => ipcRenderer.invoke("workspace:semantic-graph"),
  listDocuments: (payload) => ipcRenderer.invoke("documents:list", payload),
  listWorkspaceTaskDocuments: () => ipcRenderer.invoke("documents:list-task-sources"),
  getDashboardCache: () => ipcRenderer.invoke("documents:get-dashboard-cache"),
  createDocument: (payload) => ipcRenderer.invoke("documents:create", payload),
  createFolder: (payload) => ipcRenderer.invoke("folders:create", payload),
  deleteFolder: (payload) => ipcRenderer.invoke("folders:delete", payload),
  renameDocument: (payload) => ipcRenderer.invoke("documents:rename", payload),
  deleteDocument: (payload) => ipcRenderer.invoke("documents:delete", payload),
  readDocument: (filePath) => ipcRenderer.invoke("documents:read", filePath),
  trashList: () => ipcRenderer.invoke("trash:list"),
  trashRestore: (payload) => ipcRenderer.invoke("trash:restore", payload),
  trashEmpty: () => ipcRenderer.invoke("trash:empty"),
  markDocumentOpened: (filePath) => ipcRenderer.invoke("documents:mark-opened", filePath),
  readMarkdownSource: (filePath) => ipcRenderer.invoke("documents:read-markdown-source", filePath),
  saveDocument: (payload) => ipcRenderer.invoke("documents:save", payload),
  startWatching: (filePath) => ipcRenderer.invoke("documents:start-watching", filePath),
  stopWatching: (filePath) => ipcRenderer.invoke("documents:stop-watching", filePath),
  onDocumentChangedOnDisk: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("document:changed-on-disk", listener);
    return () => ipcRenderer.removeListener("document:changed-on-disk", listener);
  },
  readDiagramSource: (payload) => ipcRenderer.invoke("diagram:read-source", payload),
  writeDiagramSource: (payload) => ipcRenderer.invoke("diagram:write-source", payload),
  writeDiagramImage: (payload) => ipcRenderer.invoke("diagram:write-image", payload),
  readDiagramImage: (payload) => ipcRenderer.invoke("diagram:read-image", payload),
  deleteDiagram: (payload) => ipcRenderer.invoke("diagram:delete", payload),
  diagramExists: (payload) => ipcRenderer.invoke("diagram:exists", payload),
  drawioReadSource: (payload) => ipcRenderer.invoke("drawio:read-source", payload),
  drawioWriteSource: (payload) => ipcRenderer.invoke("drawio:write-source", payload),
  drawioWriteImage: (payload) => ipcRenderer.invoke("drawio:write-image", payload),
  drawioReadImage: (payload) => ipcRenderer.invoke("drawio:read-image", payload),
  drawioDelete: (payload) => ipcRenderer.invoke("drawio:delete", payload),
  drawioExists: (payload) => ipcRenderer.invoke("drawio:exists", payload),
  openInEditor: (filePath) => ipcRenderer.invoke("documents:open-in-editor", filePath),
  openFileInEditor: (filePath) => ipcRenderer.invoke("documents:open-in-editor", filePath),
  openWebView: (payload) => ipcRenderer.invoke("documents:open-web-view", payload),
  downloadPdf: (payload) => ipcRenderer.invoke("documents:download-pdf", payload),
  getWorkspaceExportDefaults: () => ipcRenderer.invoke("workspace-export:get-defaults"),
  browseWorkspaceExportDestination: () => ipcRenderer.invoke("workspace-export:browse-destination"),
  exportWorkspaceZip: (payload) => ipcRenderer.invoke("workspace-export:run", payload),
  onWorkspaceExportProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("workspace-export:progress", listener);
    return () => ipcRenderer.removeListener("workspace-export:progress", listener);
  },
  saveImage: (payload) => ipcRenderer.invoke("images:save", payload),
  listImages: (payload) => ipcRenderer.invoke("images:list", payload),
  getImageUsage: (payload) => ipcRenderer.invoke("images:usage", payload),
  readImage: (payload) => ipcRenderer.invoke("images:read", payload),
  openMediaInDefaultApp: (payload) => ipcRenderer.invoke("images:open-default-app", payload),
  getImageAnnotation: (payload) => ipcRenderer.invoke("images:get-annotation", payload),
  setImageAnnotation: (payload) => ipcRenderer.invoke("images:set-annotation", payload),
  getImageOriginalStatus: (payload) => ipcRenderer.invoke("images:get-original-status", payload),
  restoreImageOriginal: (payload) => ipcRenderer.invoke("images:restore-original", payload),
  deleteImage: (payload) => ipcRenderer.invoke("images:delete", payload),
  replaceImage: (payload) => ipcRenderer.invoke("images:replace", payload),
  renameImage: (payload) => ipcRenderer.invoke("images:rename", payload),
  downloadImage: (payload) => ipcRenderer.invoke("images:download", payload),
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
  },

  // ── Git Version Control ────────────────────────────────────────────────────
  gitDetect: () => ipcRenderer.invoke("git:detect"),
  gitGetRepoInfo: (payload) => ipcRenderer.invoke("git:get-repo-info", payload),
  gitInitRepo: (payload) => ipcRenderer.invoke("git:init-repo", payload),
  gitGetStatus: (payload) => ipcRenderer.invoke("git:get-status", payload),
  gitGetLog: (payload) => ipcRenderer.invoke("git:get-log", payload),
  gitGetCommitFiles: (payload) => ipcRenderer.invoke("git:get-commit-files", payload),
  gitGetFileAtCommit: (payload) => ipcRenderer.invoke("git:get-file-at-commit", payload),
  gitGetFileDiff: (payload) => ipcRenderer.invoke("git:get-file-diff", payload),
  gitCommit: (payload) => ipcRenderer.invoke("git:commit", payload),
  gitRestoreFileAtCommit: (payload) => ipcRenderer.invoke("git:restore-file-at-commit", payload),
  gitListBranches: (payload) => ipcRenderer.invoke("git:list-branches", payload),
  gitCreateBranch: (payload) => ipcRenderer.invoke("git:create-branch", payload),
  gitRenameBranch: (payload) => ipcRenderer.invoke("git:rename-branch", payload),
  gitDeleteBranch: (payload) => ipcRenderer.invoke("git:delete-branch", payload),
  gitSwitchBranch: (payload) => ipcRenderer.invoke("git:switch-branch", payload),
  gitMergeBranch: (payload) => ipcRenderer.invoke("git:merge-branch", payload),
  gitListTags: (payload) => ipcRenderer.invoke("git:list-tags", payload),
  gitCreateTag: (payload) => ipcRenderer.invoke("git:create-tag", payload),
  gitDeleteTag: (payload) => ipcRenderer.invoke("git:delete-tag", payload),
  gitStashList: (payload) => ipcRenderer.invoke("git:stash-list", payload),
  gitStashPush: (payload) => ipcRenderer.invoke("git:stash-push", payload),
  gitStashPop: (payload) => ipcRenderer.invoke("git:stash-pop", payload),
  gitStashDrop: (payload) => ipcRenderer.invoke("git:stash-drop", payload),
  gitListRemotes: (payload) => ipcRenderer.invoke("git:list-remotes", payload),
  gitAddRemote: (payload) => ipcRenderer.invoke("git:add-remote", payload),
  gitRemoveRemote: (payload) => ipcRenderer.invoke("git:remove-remote", payload),
  gitPush: (payload) => ipcRenderer.invoke("git:push", payload),
  gitPull: (payload) => ipcRenderer.invoke("git:pull", payload),
  gitFetch: (payload) => ipcRenderer.invoke("git:fetch", payload),
  gitSearch: (payload) => ipcRenderer.invoke("git:search", payload),
  gitGetDeletedFiles: (payload) => ipcRenderer.invoke("git:get-deleted-files", payload),
  gitGetWorkspaceStats: (payload) => ipcRenderer.invoke("git:get-workspace-stats", payload),
  gitMigrateLegacy: (payload) => ipcRenderer.invoke("git:migrate-legacy", payload),
  gitEnsureManagedGitignore: (payload) => ipcRenderer.invoke("git:ensure-managed-gitignore", payload),
  gitRemoveManagedGitignore: (payload) => ipcRenderer.invoke("git:remove-managed-gitignore", payload),
  executeCodeBlock: (payload) => ipcRenderer.invoke("code:execute", payload),
  checkIsDirectory: (payload) => ipcRenderer.invoke("system:is-directory", payload),
  openFolder: (payload) => ipcRenderer.invoke("shell:open-folder", payload),
  getWorkspaceMetadata: () => ipcRenderer.invoke("workspace-metadata:get-all"),
  updateWorkspaceMetadata: (payload) => ipcRenderer.invoke("workspace-metadata:update", payload),
  onWorkspaceMetadataChanged: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("workspace-metadata:changed", listener);
    return () => ipcRenderer.removeListener("workspace-metadata:changed", listener);
  },
  exportNotePackage: (payload) => ipcRenderer.invoke("note-package:export", payload),
  importNotePackage: (payload) => ipcRenderer.invoke("note-package:import", payload),
  browseExportDestination: (payload) => ipcRenderer.invoke("note-package:browse-export-destination", payload),
  browseImportFile: () => ipcRenderer.invoke("note-package:browse-import-file"),
  getNotePackageDefaults: () => ipcRenderer.invoke("note-package:get-defaults"),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", { url }),
});

