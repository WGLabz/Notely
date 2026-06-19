const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notesApi", {
  listDocuments: () => ipcRenderer.invoke("documents:list"),
  readDocument: (filePath) => ipcRenderer.invoke("documents:read", filePath),
  saveDocument: (payload) => ipcRenderer.invoke("documents:save", payload),
  getHistory: (filePath) => ipcRenderer.invoke("documents:history", filePath),
  restoreHistory: (payload) => ipcRenderer.invoke("documents:restore", payload),
  saveImage: (payload) => ipcRenderer.invoke("images:save", payload),
  listImages: (payload) => ipcRenderer.invoke("images:list", payload),
  readImage: (payload) => ipcRenderer.invoke("images:read", payload),
  deleteImage: (payload) => ipcRenderer.invoke("images:delete", payload),
  replaceImage: (payload) => ipcRenderer.invoke("images:replace", payload)
});
