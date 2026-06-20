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
  getNotesRootSetting: () => ipcRenderer.invoke("settings:get-notes-root"),
  setNotesRootSetting: (payload) => ipcRenderer.invoke("settings:set-notes-root", payload),
  pickFolder: () => ipcRenderer.invoke("settings:pick-folder"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  setActiveProject: (payload) => ipcRenderer.invoke("projects:set-active", payload),
  listDocuments: () => ipcRenderer.invoke("documents:list"),
  createDocument: (payload) => ipcRenderer.invoke("documents:create", payload),
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
