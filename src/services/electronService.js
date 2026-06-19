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

export async function listDocuments() {
  const api = getNotesApi();
  return api.listDocuments();
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
