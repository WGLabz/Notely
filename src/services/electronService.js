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

export async function listDocuments() {
  const api = getNotesApi();
  return api.listDocuments();
}

export async function createDocument(title) {
  const api = getNotesApi();
  if (typeof api.createDocument !== "function") {
    throw new Error("Create note action unavailable. Please restart the app.");
  }
  return api.createDocument({ title });
}

export async function listProjects() {
  const api = getNotesApi();
  if (typeof api.listProjects !== "function") {
    throw new Error("Project list action unavailable. Please restart the app.");
  }
  return api.listProjects();
}

export async function createProject(name) {
  const api = getNotesApi();
  if (typeof api.createProject !== "function") {
    throw new Error("Create project action unavailable. Please restart the app.");
  }
  return api.createProject({ name });
}

export async function setActiveProject(slug) {
  const api = getNotesApi();
  if (typeof api.setActiveProject !== "function") {
    throw new Error("Switch project action unavailable. Please restart the app.");
  }
  return api.setActiveProject({ slug });
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

export async function saveImage(fileName, base64Data) {
  const api = getNotesApi();
  return api.saveImage({ fileName, base64Data });
}

export async function listImages(basePath) {
  const api = getNotesApi();
  return api.listImages({ basePath });
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
