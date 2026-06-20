/**
 * IPC service for Electron communication
 */

function getNotesApi() {
  if (!window.notesApi) {
    throw new Error(
      "Notes API not available. Make sure the app is running under Electron."
    );
  }
  return window.notesApi;
}

export function onMenuAction(callback) {
  const api = getNotesApi();
  if (typeof api.onMenuAction !== "function") {
    return () => {};
  }
  return api.onMenuAction(callback);
}

export function updateMenuContext(context) {
  const api = getNotesApi();
  if (typeof api.updateMenuContext !== "function") {
    return;
  }
  api.updateMenuContext(context || {});
}

export async function getNotesRootSetting() {
  const api = getNotesApi();
  if (typeof api.getNotesRootSetting !== "function") {
    throw new Error("Notes folder settings are unavailable. Please restart the app.");
  }
  return api.getNotesRootSetting();
}

export async function setNotesRootSetting(notesRoot) {
  const api = getNotesApi();
  if (typeof api.setNotesRootSetting !== "function") {
    throw new Error("Notes folder settings are unavailable. Please restart the app.");
  }
  return api.setNotesRootSetting({ notesRoot });
}

export async function pickFolder() {
  const api = getNotesApi();
  if (typeof api.pickFolder !== "function") {
    throw new Error("Folder picker is unavailable. Please restart the app.");
  }
  return api.pickFolder();
}

export async function listDocuments(folderPath) {
  const api = getNotesApi();
  return api.listDocuments({ folderPath });
}

export async function createDocument(title, parentPath) {
  const api = getNotesApi();
  if (typeof api.createDocument !== "function") {
    throw new Error("Create note action unavailable. Please restart the app.");
  }
  return api.createDocument({ title, parentPath });
}

export async function createFolder(name, parentPath) {
  const api = getNotesApi();
  if (typeof api.createFolder !== "function") {
    throw new Error("Create folder action unavailable. Please restart the app.");
  }
  return api.createFolder({ name, parentPath });
}

export async function renameDocument(filePath, title) {
  const api = getNotesApi();
  if (typeof api.renameDocument !== "function") {
    throw new Error("Rename note action unavailable. Please restart the app.");
  }
  return api.renameDocument({ filePath, title });
}

export async function deleteDocument(filePath) {
  const api = getNotesApi();
  if (typeof api.deleteDocument !== "function") {
    throw new Error("Delete note action unavailable. Please restart the app.");
  }
  return api.deleteDocument({ filePath });
}

export async function listProjects() {
  const api = getNotesApi();
  if (typeof api.listProjects !== "function") {
    throw new Error("Project list action unavailable. Please restart the app.");
  }
  return api.listProjects();
}

export async function setActiveProject(slug) {
  const api = getNotesApi();
  if (typeof api.setActiveProject !== "function") {
    throw new Error("Switch project action unavailable. Please restart the app.");
  }
  return api.setActiveProject({ slug });
}

export async function getP2PStatus() {
  const api = getNotesApi();
  if (typeof api.getP2PStatus !== "function") {
    throw new Error("P2P status unavailable. Please restart the app.");
  }
  return api.getP2PStatus();
}

export async function startP2PDiscovery() {
  const api = getNotesApi();
  if (typeof api.startP2PDiscovery !== "function") {
    throw new Error("P2P discovery unavailable. Please restart the app.");
  }
  return api.startP2PDiscovery();
}

export async function stopP2PDiscovery() {
  const api = getNotesApi();
  if (typeof api.stopP2PDiscovery !== "function") {
    throw new Error("P2P discovery unavailable. Please restart the app.");
  }
  return api.stopP2PDiscovery();
}

export async function setP2PDeviceName(name) {
  const api = getNotesApi();
  if (typeof api.setP2PDeviceName !== "function") {
    throw new Error("P2P device naming unavailable. Please restart the app.");
  }
  return api.setP2PDeviceName({ name });
}

export async function createP2PInvite(peerId) {
  const api = getNotesApi();
  if (typeof api.createP2PInvite !== "function") {
    throw new Error("P2P invite unavailable. Please restart the app.");
  }
  return api.createP2PInvite({ peerId });
}

export async function pairP2PWithCode(peerId, code) {
  const api = getNotesApi();
  if (typeof api.pairP2PWithCode !== "function") {
    throw new Error("P2P pairing unavailable. Please restart the app.");
  }
  return api.pairP2PWithCode({ peerId, code });
}

export async function manualP2PConnect(address, listenPort) {
  const api = getNotesApi();
  if (typeof api.manualP2PConnect !== "function") {
    throw new Error("P2P manual connect unavailable. Please restart the app.");
  }
  return api.manualP2PConnect({ address, listenPort });
}

export async function removeTrustedP2PPeer(peerId) {
  const api = getNotesApi();
  if (typeof api.removeTrustedP2PPeer !== "function") {
    throw new Error("P2P trust management unavailable. Please restart the app.");
  }
  return api.removeTrustedP2PPeer({ peerId });
}

export async function rotateP2PWorkspaceKeys(peerId) {
  const api = getNotesApi();
  if (typeof api.rotateP2PWorkspaceKeys !== "function") {
    throw new Error("P2P key rotation unavailable. Please restart the app.");
  }
  return api.rotateP2PWorkspaceKeys({ peerId });
}

export async function runP2PSyncSelfTest() {
  const api = getNotesApi();
  if (typeof api.runP2PSyncSelfTest !== "function") {
    throw new Error("P2P sync self-test unavailable. Please restart the app.");
  }
  return api.runP2PSyncSelfTest();
}

export async function listP2PSyncConflicts(limit = 200) {
  const api = getNotesApi();
  if (typeof api.listP2PSyncConflicts !== "function") {
    throw new Error("P2P conflict list unavailable. Please restart the app.");
  }
  return api.listP2PSyncConflicts({ limit });
}

export async function getWorkspaceActivity(limit = 200) {
  const api = getNotesApi();
  if (typeof api.getWorkspaceActivity !== "function") {
    throw new Error("Workspace activity unavailable. Please restart the app.");
  }
  return api.getWorkspaceActivity({ limit });
}

export async function readDocument(filePath) {
  const api = getNotesApi();
  return api.readDocument(filePath);
}

export async function saveDocument(payload) {
  const api = getNotesApi();
  return api.saveDocument(payload);
}

export async function getHistory(filePath) {
  const api = getNotesApi();
  return api.getHistory(filePath);
}

export async function restoreHistory(payload) {
  const api = getNotesApi();
  return api.restoreHistory(payload);
}

export async function readVersion(filePath, versionPath) {
  const api = getNotesApi();
  if (typeof api.readVersion !== "function") {
    throw new Error("Read version action unavailable. Please restart the app.");
  }
  return api.readVersion({ filePath, versionPath });
}

export async function deleteVersion(filePath, versionPath) {
  const api = getNotesApi();
  if (typeof api.deleteVersion !== "function") {
    throw new Error("Delete version action unavailable. Please restart the app.");
  }
  return api.deleteVersion({ filePath, versionPath });
}

export async function openInEditor(filePath) {
  const api = getNotesApi();
  const openFn =
    (typeof api.openInEditor === "function" && api.openInEditor) ||
    (typeof api.openFileInEditor === "function" && api.openFileInEditor);

  if (!openFn) {
    throw new Error("Open action unavailable. Please restart the app to load the latest desktop API.");
  }

  return openFn(filePath);
}

export async function openWebView(filePath, content) {
  const api = getNotesApi();
  if (typeof api.openWebView !== "function") {
    throw new Error("Web view action unavailable. Please restart the app to load the latest desktop API.");
  }

  if (!filePath) {
    return api.openWebView({});
  }

  return api.openWebView({ filePath, content });
}

export async function downloadPdf(payload) {
  const api = getNotesApi();
  if (typeof api.downloadPdf !== "function") {
    throw new Error("PDF download action unavailable. Please restart the app to load the latest desktop API.");
  }

  return api.downloadPdf(payload);
}

export async function saveImage(fileName, base64Data) {
  const api = getNotesApi();
  return api.saveImage({ fileName, base64Data });
}

export async function listImages(basePath) {
  const api = getNotesApi();
  return api.listImages({ basePath });
}

export async function getImageUsage(basePath) {
  const api = getNotesApi();
  if (typeof api.getImageUsage !== "function") {
    throw new Error("Image usage action unavailable. Please restart the app.");
  }
  return api.getImageUsage({ basePath });
}

export async function readImage(basePath, assetPath) {
  const api = getNotesApi();
  return api.readImage({ basePath, assetPath });
}

export async function deleteImage(basePath, assetPath) {
  const api = getNotesApi();
  return api.deleteImage({ basePath, assetPath });
}

export async function replaceImage(basePath, assetPath, base64Data) {
  const api = getNotesApi();
  return api.replaceImage({ basePath, assetPath, base64Data });
}

export async function runTerminalCommand(command, cwd) {
  const api = getNotesApi();
  if (typeof api.runTerminalCommand !== "function") {
    throw new Error("Embedded terminal is unavailable. Please restart the app.");
  }
  return api.runTerminalCommand({ command, cwd });
}

export async function createTerminalSession(cwd) {
  const api = getNotesApi();
  if (typeof api.createTerminalSession !== "function") {
    throw new Error("Interactive terminal is unavailable. Please restart the app.");
  }
  return api.createTerminalSession({ cwd });
}

export async function writeTerminalInput(sessionId, data) {
  const api = getNotesApi();
  if (typeof api.writeTerminalInput !== "function") {
    throw new Error("Interactive terminal is unavailable. Please restart the app.");
  }
  return api.writeTerminalInput({ sessionId, data });
}

export async function resizeTerminal(sessionId, cols, rows) {
  const api = getNotesApi();
  if (typeof api.resizeTerminal !== "function") {
    return true;
  }
  return api.resizeTerminal({ sessionId, cols, rows });
}

export async function killTerminalSession(sessionId) {
  const api = getNotesApi();
  if (typeof api.killTerminalSession !== "function") {
    return true;
  }
  return api.killTerminalSession({ sessionId });
}

export function onTerminalData(callback) {
  const api = getNotesApi();
  if (typeof api.onTerminalData !== "function") {
    return () => {};
  }
  return api.onTerminalData(callback);
}

export function onTerminalExit(callback) {
  const api = getNotesApi();
  if (typeof api.onTerminalExit !== "function") {
    return () => {};
  }
  return api.onTerminalExit(callback);
}
