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

export function notifyBootReady() {
  const api = getNotesApi();
  if (typeof api.notifyBootReady !== "function") {
    return;
  }
  api.notifyBootReady();
}

export function notifyBootProgress(progress) {
  const api = getNotesApi();
  if (typeof api.notifyBootProgress !== "function") {
    return;
  }
  api.notifyBootProgress(progress || {});
}

export async function getAppearanceSettings() {
  const api = getNotesApi();
  if (typeof api.getAppearanceSettings !== "function") {
    return {
      themePreference: "auto",
      effectiveTheme: "light",
      zoomFactor: 0.8,
    };
  }
  return api.getAppearanceSettings();
}

export async function getOnboardingComplete() {
  const api = getNotesApi();
  if (typeof api.getOnboardingComplete !== "function") {
    return { onboardingComplete: false };
  }
  return api.getOnboardingComplete();
}

export async function setOnboardingComplete(onboardingComplete) {
  const api = getNotesApi();
  if (typeof api.setOnboardingComplete !== "function") {
    return { onboardingComplete: false };
  }
  return api.setOnboardingComplete({ onboardingComplete });
}

export async function setThemePreference(themePreference) {
  const api = getNotesApi();
  if (typeof api.setThemePreference !== "function") {
    return {
      themePreference: "auto",
      effectiveTheme: "light",
    };
  }
  return api.setThemePreference({ themePreference });
}

export async function setZoomFactor(zoomFactor) {
  const api = getNotesApi();
  if (typeof api.setZoomFactor !== "function") {
    return { zoomFactor: 0.8 };
  }
  return api.setZoomFactor({ zoomFactor });
}

export function onThemeChanged(callback) {
  const api = getNotesApi();
  if (typeof api.onThemeChanged !== "function") {
    return () => {};
  }
  return api.onThemeChanged(callback);
}

export async function aiQuery(query, context = {}) {
  const api = getNotesApi();
  if (typeof api.aiQuery !== "function") {
    throw new Error("AI queries are unavailable. Please restart the app.");
  }
  return api.aiQuery({ query, context });
}

export async function aiQueryStream(query, context = {}, queryId) {
  const api = getNotesApi();
  if (typeof api.aiQueryStream !== "function") {
    throw new Error("AI streaming queries are unavailable. Please restart the app.");
  }
  return api.aiQueryStream({ query, context, queryId });
}

export async function aiQueryAbort(queryId) {
  const api = getNotesApi();
  if (typeof api.aiQueryAbort !== "function") {
    throw new Error("AI query cancellation is unavailable. Please restart the app.");
  }
  return api.aiQueryAbort({ queryId });
}

export function onChatStreamChunk(callback) {
  const api = getNotesApi();
  if (typeof api.onChatStreamChunk !== "function") {
    return () => {};
  }
  return api.onChatStreamChunk(callback);
}

export async function aiGetApiKey(provider) {
  const api = getNotesApi();
  if (typeof api.aiGetApiKey !== "function") {
    throw new Error("AI configuration is unavailable. Please restart the app.");
  }
  return api.aiGetApiKey({ provider });
}

export async function aiGetProviderList() {
  const api = getNotesApi();
  if (typeof api.aiGetProviderList !== "function") {
    throw new Error("AI configuration is unavailable. Please restart the app.");
  }
  return api.aiGetProviderList();
}

export async function aiEnable() {
  const api = getNotesApi();
  if (typeof api.aiEnable !== "function") return { success: false };
  return api.aiEnable();
}

export async function aiDisable() {
  const api = getNotesApi();
  if (typeof api.aiDisable !== "function") return { success: false };
  return api.aiDisable();
}

export async function aiGetHealth() {
  const api = getNotesApi();
  if (typeof api.aiGetHealth !== "function") return { success: false };
  return api.aiGetHealth();
}

export async function aiSetApiKey(provider, apiKey) {
  const api = getNotesApi();
  if (typeof api.aiSetApiKey !== "function") {
    throw new Error("AI configuration is unavailable. Please restart the app.");
  }
  return api.aiSetApiKey({ provider, apiKey });
}

export async function aiGetProviderModel(provider) {
  const api = getNotesApi();
  if (typeof api.aiGetProviderModel !== 'function') return { success: false };
  return api.aiGetProviderModel({ provider });
}

export async function aiSetProviderModel(provider, model) {
  const api = getNotesApi();
  if (typeof api.aiSetProviderModel !== 'function') return { success: false };
  return api.aiSetProviderModel({ provider, model });
}

export async function aiGetPreferences() {
  const api = getNotesApi();
  if (typeof api.aiGetPreferences !== "function") {
    throw new Error("AI preferences are unavailable. Please restart the app.");
  }
  return api.aiGetPreferences({});
}

export async function aiSetPreferences(preferences) {
  const api = getNotesApi();
  if (typeof api.aiSetPreferences !== "function") {
    throw new Error("AI preferences are unavailable. Please restart the app.");
  }
  return api.aiSetPreferences({ preferences });
}

export async function aiTestConnection(provider) {
  const api = getNotesApi();
  if (typeof api.aiTestConnection !== "function") {
    throw new Error("AI connection testing is unavailable. Please restart the app.");
  }
  return api.aiTestConnection({ provider });
}

export async function aiClearData() {
  const api = getNotesApi();
  if (typeof api.aiClearData !== "function") {
    throw new Error("AI data management is unavailable. Please restart the app.");
  }
  return api.aiClearData({});
}

export async function aiGenerateEmbeddings(forceRefresh = true) {
  const api = getNotesApi();
  if (typeof api.aiGenerateEmbeddings !== "function") {
    throw new Error("AI embeddings are unavailable. Please restart the app.");
  }
  return api.aiGenerateEmbeddings({ forceRefresh });
}

export async function aiRebuildEmbeddings() {
  const api = getNotesApi();
  if (typeof api.aiRebuildEmbeddings !== 'function') throw new Error('AI embeddings are unavailable.');
  return api.aiRebuildEmbeddings();
}

export async function aiGetEmbeddingsStatus(payload = {}) {
  const api = getNotesApi();
  if (typeof api.aiGetEmbeddingsStatus !== 'function') throw new Error('AI embeddings are unavailable.');
  return api.aiGetEmbeddingsStatus(payload);
}

export async function aiPauseWorker() {
  const api = getNotesApi();
  if (typeof api.aiPauseWorker !== 'function') throw new Error('AI worker is unavailable.');
  return api.aiPauseWorker();
}

export async function aiResumeWorker() {
  const api = getNotesApi();
  if (typeof api.aiResumeWorker !== 'function') throw new Error('AI worker is unavailable.');
  return api.aiResumeWorker();
}

export async function aiDownloadModel() {
  const api = getNotesApi();
  if (typeof api.aiDownloadModel !== 'function') throw new Error('ONNX downloader is unavailable.');
  return api.aiDownloadModel();
}

export async function aiDownloadGraphModel() {
  const api = getNotesApi();
  if (typeof api.aiDownloadGraphModel !== 'function') throw new Error('Graph model downloader is unavailable.');
  return api.aiDownloadGraphModel();
}

export async function aiGetModelStatus() {
  const api = getNotesApi();
  if (typeof api.aiGetModelStatus !== 'function') throw new Error('ONNX downloader is unavailable.');
  return api.aiGetModelStatus();
}

export async function aiGetGraphModelStatus() {
  const api = getNotesApi();
  if (typeof api.aiGetGraphModelStatus !== 'function') throw new Error('Graph model downloader is unavailable.');
  return api.aiGetGraphModelStatus();
}

export function onModelDownloadProgress(callback) {
  const api = getNotesApi();
  if (typeof api.onModelDownloadProgress !== 'function') return () => {};
  return api.onModelDownloadProgress(callback);
}

export function onGraphModelDownloadProgress(callback) {
  const api = getNotesApi();
  if (typeof api.onGraphModelDownloadProgress !== 'function') return () => {};
  return api.onGraphModelDownloadProgress(callback);
}


export async function aiBuildGraph() {
  const api = getNotesApi();
  if (typeof api.aiBuildGraph !== "function") {
    throw new Error("AI graph operations are unavailable. Please restart the app.");
  }
  return api.aiBuildGraph({});
}

export async function aiGetGraph() {
  const api = getNotesApi();
  if (typeof api.aiGetGraph !== "function") {
    throw new Error("AI graph operations are unavailable. Please restart the app.");
  }
  return api.aiGetGraph({});
}

export async function aiGetGraphStatus() {
  const api = getNotesApi();
  if (typeof api.aiGetGraphStatus !== "function") {
    throw new Error("AI graph operations are unavailable. Please restart the app.");
  }
  return api.aiGetGraphStatus({});
}

export async function aiGetLogs(subsystem = null, limit = 100) {
  const api = getNotesApi();
  if (typeof api.aiGetLogs !== "function") return { success: false, data: [] };
  return api.aiGetLogs({ subsystem, limit });
}

export async function aiClearLogs(subsystem = null) {
  const api = getNotesApi();
  if (typeof api.aiClearLogs !== "function") return { success: false };
  return api.aiClearLogs({ subsystem });
}

export async function aiClearEmbeddingsData() {
  const api = getNotesApi();
  if (typeof api.aiClearEmbeddingsData !== "function") return { success: false };
  return api.aiClearEmbeddingsData();
}

export async function aiClearGraphData() {
  const api = getNotesApi();
  if (typeof api.aiClearGraphData !== "function") return { success: false };
  return api.aiClearGraphData();
}

export async function aiDetectPatterns() {
  const api = getNotesApi();
  if (typeof api.aiDetectPatterns !== "function") {
    throw new Error("AI pattern detection is unavailable. Please restart the app.");
  }
  return api.aiDetectPatterns({});
}

export async function getNotesRootSetting() {
  const api = getNotesApi();
  if (typeof api.getNotesRootSetting !== "function") {
    throw new Error("Workspace settings are unavailable. Please restart the app.");
  }
  return api.getNotesRootSetting();
}

export async function getAppInfo() {
  const api = getNotesApi();
  if (typeof api.getAppInfo !== "function") {
    return {
      appName: "Notely",
      version: "0.0.0",
      versionCore: "0.0.0",
      commitHash: "",
    };
  }
  return api.getAppInfo();
}

export async function setNotesRootSetting(notesRoot) {
  const api = getNotesApi();
  if (typeof api.setNotesRootSetting !== "function") {
    throw new Error("Workspace settings are unavailable. Please restart the app.");
  }
  return api.setNotesRootSetting({ notesRoot });
}

export async function getGitWorkspaceMetadata() {
  const api = getNotesApi();
  if (typeof api.getGitWorkspaceMetadata !== "function") {
    return {
      workspaceRoot: "",
      isGitRoot: false,
      branch: "",
      autoIgnoreMetadataInGit: true,
      gitignoreHasNotesApp: false,
    };
  }
  return api.getGitWorkspaceMetadata();
}

export async function setAutoIgnoreGitMetadata(enabled) {
  const api = getNotesApi();
  if (typeof api.setAutoIgnoreGitMetadata !== "function") {
    throw new Error("Git metadata settings are unavailable. Please restart the app.");
  }
  return api.setAutoIgnoreGitMetadata({ enabled: enabled !== false });
}

export async function pickFolder() {
  const api = getNotesApi();
  if (typeof api.pickFolder !== "function") {
    throw new Error("Folder picker is unavailable. Please restart the app.");
  }
  return api.pickFolder();
}

export async function captureCurrentDisplay() {
  const api = getNotesApi();
  if (typeof api.captureCurrentDisplay !== "function") {
    throw new Error("Area snipping is unavailable. Please restart the app.");
  }
  return api.captureCurrentDisplay();
}

export async function listDocuments(folderPath) {
  const api = getNotesApi();
  return api.listDocuments({ folderPath });
}

export async function listWorkspaceTaskDocuments() {
  const api = getNotesApi();
  if (typeof api.listWorkspaceTaskDocuments !== "function") {
    return [];
  }
  const documents = await api.listWorkspaceTaskDocuments();
  return Array.isArray(documents) ? documents : [];
}

export async function getDashboardCache() {
  const api = getNotesApi();
  if (typeof api.getDashboardCache !== "function") {
    return { continueWriting: [], recentNotes: [] };
  }
  const cache = await api.getDashboardCache();
  return {
    continueWriting: Array.isArray(cache?.continueWriting) ? cache.continueWriting : [],
    recentNotes: Array.isArray(cache?.recentNotes) ? cache.recentNotes : [],
  };
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

export async function deleteFolder(folderPath) {
  const api = getNotesApi();
  if (typeof api.deleteFolder !== "function") {
    throw new Error("Delete folder action unavailable. Please restart the app.");
  }
  return api.deleteFolder({ folderPath });
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

export async function pairP2PWithCodeReauth(peerId, code, reauth) {
  const api = getNotesApi();
  if (typeof api.pairP2PWithCode !== "function") {
    throw new Error("P2P pairing unavailable. Please restart the app.");
  }
  return api.pairP2PWithCode({ peerId, code, reauth: Boolean(reauth) });
}

export async function setP2PKeyPolicyDays(days) {
  const api = getNotesApi();
  if (typeof api.setP2PKeyPolicyDays !== "function") {
    throw new Error("P2P key policy unavailable. Please restart the app.");
  }
  return api.setP2PKeyPolicyDays({ days });
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

export async function readP2PConflictFiles(filePath, conflictPath) {
  const api = getNotesApi();
  if (typeof api.readP2PConflictFiles !== "function") {
    throw new Error("Conflict file reader unavailable. Please restart the app.");
  }
  return api.readP2PConflictFiles({ filePath, conflictPath });
}

export async function resolveP2PConflict(filePath, conflictPath, resolution, mergedContent) {
  const api = getNotesApi();
  if (typeof api.resolveP2PConflict !== "function") {
    throw new Error("Conflict resolution unavailable. Please restart the app.");
  }
  return api.resolveP2PConflict({
    filePath,
    conflictPath,
    resolution: typeof resolution === "string" ? resolution : "merged",
    mergedContent: typeof mergedContent === "string" ? mergedContent : undefined
  });
}

export function onP2PSyncApplied(callback) {
  const api = getNotesApi();
  if (typeof api.onP2PSyncApplied !== "function") {
    return () => {};
  }
  return api.onP2PSyncApplied(callback);
}

export function onP2PFullSyncProgress(callback) {
  const api = getNotesApi();
  if (typeof api.onP2PFullSyncProgress !== "function") {
    return () => {};
  }
  return api.onP2PFullSyncProgress(callback);
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

export function onDocumentChangedOnDisk(callback) {
  const api = getNotesApi();
  if (typeof api.onDocumentChangedOnDisk !== "function") {
    return () => {};
  }
  return api.onDocumentChangedOnDisk(callback);
}

export async function stopWatching() {
  const api = getNotesApi();
  if (typeof api.stopWatching !== "function") {
    return;
  }
  return api.stopWatching();
}

export async function markDocumentOpened(filePath) {
  const api = getNotesApi();
  if (typeof api.markDocumentOpened !== "function") {
    return false;
  }
  return api.markDocumentOpened(filePath);
}

export async function readMarkdownSource(filePath) {
  const api = getNotesApi();
  if (typeof api.readMarkdownSource !== "function") {
    throw new Error("Markdown source read action unavailable. Please restart the app.");
  }
  return api.readMarkdownSource(filePath);
}

export async function saveDocument(payload) {
  const api = getNotesApi();
  return api.saveDocument(payload);
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

export async function openWorkspaceInEditor(folderPath) {
  const api = getNotesApi();
  if (typeof api.openWorkspaceInEditor !== "function") {
    throw new Error("Workspace open action unavailable. Please restart the app to load the latest desktop API.");
  }

  return api.openWorkspaceInEditor({ folderPath });
}

export async function revealWorkspaceInExplorer(folderPath) {
  const api = getNotesApi();
  if (typeof api.revealWorkspaceInExplorer !== "function") {
    throw new Error("Workspace reveal action unavailable. Please restart the app to load the latest desktop API.");
  }

  return api.revealWorkspaceInExplorer({ folderPath });
}


export async function downloadPdf(payload) {
  const api = getNotesApi();
  if (typeof api.downloadPdf !== "function") {
    throw new Error("PDF download action unavailable. Please restart the app to load the latest desktop API.");
  }

  return api.downloadPdf(payload);
}

export async function getWorkspaceExportDefaults() {
  const api = getNotesApi();
  if (typeof api.getWorkspaceExportDefaults !== "function") {
    return {
      destinationPath: "",
      fileName: "notelyproject.zip",
      includeMetadata: false,
      mode: "raw",
    };
  }
  return api.getWorkspaceExportDefaults();
}

export async function browseWorkspaceExportDestination() {
  const api = getNotesApi();
  if (typeof api.browseWorkspaceExportDestination !== "function") {
    throw new Error("Export destination browser unavailable. Please restart the app.");
  }
  return api.browseWorkspaceExportDestination();
}

export async function exportWorkspaceZip(payload) {
  const api = getNotesApi();
  if (typeof api.exportWorkspaceZip !== "function") {
    throw new Error("Workspace export is unavailable. Please restart the app.");
  }
  return api.exportWorkspaceZip(payload || {});
}

export function onWorkspaceExportProgress(callback) {
  const api = getNotesApi();
  if (typeof api.onWorkspaceExportProgress !== "function") {
    return () => {};
  }
  return api.onWorkspaceExportProgress(callback);
}

export async function saveImage(fileName, base64Data, basePath, options = {}) {
  const api = getNotesApi();
  return api.saveImage({
    fileName,
    base64Data,
    basePath,
    storageTarget: options.storageTarget,
  });
}

export async function listImages(basePath, options = {}) {
  const api = getNotesApi();
  return api.listImages({
    basePath,
    includeAnnotations: Boolean(options.includeAnnotations),
    includeOriginalStatus: Boolean(options.includeOriginalStatus),
  });
}

export async function getImageUsage(basePath) {
  const api = getNotesApi();
  if (typeof api.getImageUsage !== "function") {
    throw new Error("Image usage action unavailable. Please restart the app.");
  }
  return api.getImageUsage({ basePath });
}

export async function readImage(basePath, assetPath, options = {}) {
  const api = getNotesApi();
  return api.readImage({ basePath, assetPath, thumbnail: Boolean(options.thumbnail) });
}

export async function openMediaInDefaultApp(basePath, assetPath) {
  const api = getNotesApi();
  if (typeof api.openMediaInDefaultApp !== "function") {
    throw new Error("Open media action unavailable. Please restart the app.");
  }
  return api.openMediaInDefaultApp({ basePath, assetPath });
}

export async function getImageAnnotation(basePath, assetPath) {
  const api = getNotesApi();
  if (typeof api.getImageAnnotation !== "function") return null;
  return api.getImageAnnotation({ basePath, assetPath });
}

export async function setImageAnnotation(basePath, assetPath, annotation) {
  const api = getNotesApi();
  if (typeof api.setImageAnnotation !== "function") {
    throw new Error("Image annotation action unavailable. Please restart the app.");
  }
  return api.setImageAnnotation({ basePath, assetPath, annotation });
}

export async function getImageOriginalStatus(basePath, assetPath) {
  const api = getNotesApi();
  if (typeof api.getImageOriginalStatus !== "function") {
    return { hasOriginal: false };
  }
  return api.getImageOriginalStatus({ basePath, assetPath });
}

export async function restoreImageOriginal(basePath, assetPath) {
  const api = getNotesApi();
  if (typeof api.restoreImageOriginal !== "function") {
    throw new Error("Image restore action unavailable. Please restart the app.");
  }
  return api.restoreImageOriginal({ basePath, assetPath });
}

export async function deleteImage(basePath, assetPath, options = {}) {
  const api = getNotesApi();
  return api.deleteImage({
    basePath,
    assetPath,
    removeAllReferences: Boolean(options.removeAllReferences),
  });
}

export async function replaceImage(basePath, assetPath, base64Data) {
  const api = getNotesApi();
  return api.replaceImage({ basePath, assetPath, base64Data });
}

export async function renameImage(basePath, assetPath, nextFileName) {
  const api = getNotesApi();
  if (typeof api.renameImage !== "function") {
    throw new Error("Image rename action unavailable. Please restart the app.");
  }
  return api.renameImage({ basePath, assetPath, nextFileName });
}

export async function downloadImage(base64Data, defaultFilename) {
  const api = getNotesApi();
  if (typeof api.downloadImage !== "function") {
    throw new Error("Image download action unavailable. Please restart the app.");
  }
  return api.downloadImage({ base64Data, defaultFilename });
}

export async function createTerminalSession(cwd, options = {}) {
  const api = getNotesApi();
  if (typeof api.createTerminalSession !== "function") {
    throw new Error("Interactive terminal is unavailable. Please restart the app.");
  }
  return api.createTerminalSession({
    cwd,
    role: typeof options.role === "string" ? options.role : undefined,
    shell: options.shell === "bash" || options.shell === "cmd" ? options.shell : undefined,
  });
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

// ── Git Version Control ────────────────────────────────────────────────────────

function requireGitApi(api, methodName) {
  if (typeof api[methodName] !== "function") {
    throw new Error(`Git action '${methodName}' unavailable. Please restart the app.`);
  }
}

export async function gitDetect() {
  const api = getNotesApi();
  requireGitApi(api, "gitDetect");
  return api.gitDetect();
}

export async function gitGetRepoInfo(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitGetRepoInfo");
  return api.gitGetRepoInfo({ workspacePath });
}

export async function gitInitRepo(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitInitRepo");
  return api.gitInitRepo({ workspacePath });
}

export async function gitGetStatus(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitGetStatus");
  return api.gitGetStatus({ workspacePath });
}

export async function gitGetLog({ workspacePath, filePath, limit, skip, branch } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitGetLog");
  return api.gitGetLog({ workspacePath, filePath, limit, skip, branch });
}

export async function gitGetCommitFiles({ workspacePath, commitHash } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitGetCommitFiles");
  return api.gitGetCommitFiles({ workspacePath, commitHash });
}

export async function gitGetFileAtCommit({ workspacePath, commitHash, filePath } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitGetFileAtCommit");
  return api.gitGetFileAtCommit({ workspacePath, commitHash, filePath });
}

export async function gitGetFileDiff({ workspacePath, fromHash, toHash, filePath } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitGetFileDiff");
  return api.gitGetFileDiff({ workspacePath, fromHash, toHash, filePath });
}

export async function gitCommit({ workspacePath, message, filePaths } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitCommit");
  return api.gitCommit({ workspacePath, message, filePaths });
}

export async function gitRestoreFileAtCommit({ workspacePath, commitHash, filePath } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitRestoreFileAtCommit");
  return api.gitRestoreFileAtCommit({ workspacePath, commitHash, filePath });
}

export async function gitListBranches(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitListBranches");
  return api.gitListBranches({ workspacePath });
}

export async function gitCreateBranch({ workspacePath, name, from } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitCreateBranch");
  return api.gitCreateBranch({ workspacePath, name, from });
}

export async function gitRenameBranch({ workspacePath, oldName, newName } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitRenameBranch");
  return api.gitRenameBranch({ workspacePath, oldName, newName });
}

export async function gitDeleteBranch({ workspacePath, name, force } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitDeleteBranch");
  return api.gitDeleteBranch({ workspacePath, name, force });
}

export async function gitSwitchBranch({ workspacePath, name } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitSwitchBranch");
  return api.gitSwitchBranch({ workspacePath, name });
}

export async function gitMergeBranch({ workspacePath, from } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitMergeBranch");
  return api.gitMergeBranch({ workspacePath, from });
}

export async function gitListTags(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitListTags");
  return api.gitListTags({ workspacePath });
}

export async function gitCreateTag({ workspacePath, name, commitHash, message } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitCreateTag");
  return api.gitCreateTag({ workspacePath, name, commitHash, message });
}

export async function gitDeleteTag({ workspacePath, name } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitDeleteTag");
  return api.gitDeleteTag({ workspacePath, name });
}

export async function gitStashList(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitStashList");
  return api.gitStashList({ workspacePath });
}

export async function gitStashPush({ workspacePath, message } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitStashPush");
  return api.gitStashPush({ workspacePath, message });
}

export async function gitStashPop({ workspacePath, index } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitStashPop");
  return api.gitStashPop({ workspacePath, index });
}

export async function gitStashDrop({ workspacePath, index } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitStashDrop");
  return api.gitStashDrop({ workspacePath, index });
}

export async function gitListRemotes(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitListRemotes");
  return api.gitListRemotes({ workspacePath });
}

export async function gitAddRemote({ workspacePath, name, url } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitAddRemote");
  return api.gitAddRemote({ workspacePath, name, url });
}

export async function gitRemoveRemote({ workspacePath, name } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitRemoveRemote");
  return api.gitRemoveRemote({ workspacePath, name });
}

export async function gitPush({ workspacePath, remote, branch, auth } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitPush");
  return api.gitPush({ workspacePath, remote, branch, auth });
}

export async function gitPull({ workspacePath, remote, branch, auth } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitPull");
  return api.gitPull({ workspacePath, remote, branch, auth });
}

export async function gitFetch({ workspacePath, remote, auth } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitFetch");
  return api.gitFetch({ workspacePath, remote, auth });
}

export async function gitSearch({ workspacePath, query, type } = {}) {
  const api = getNotesApi();
  requireGitApi(api, "gitSearch");
  return api.gitSearch({ workspacePath, query, type });
}

export async function gitGetDeletedFiles(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitGetDeletedFiles");
  return api.gitGetDeletedFiles({ workspacePath });
}

export async function gitGetWorkspaceStats(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitGetWorkspaceStats");
  return api.gitGetWorkspaceStats({ workspacePath });
}

export async function gitMigrateLegacy(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitMigrateLegacy");
  return api.gitMigrateLegacy({ workspacePath });
}

export async function gitEnsureManagedGitignore(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitEnsureManagedGitignore");
  return api.gitEnsureManagedGitignore({ workspacePath });
}

export async function gitRemoveManagedGitignore(workspacePath) {
  const api = getNotesApi();
  requireGitApi(api, "gitRemoveManagedGitignore");
  return api.gitRemoveManagedGitignore({ workspacePath });
}

export async function checkForUpdates() {
  const api = getNotesApi();
  if (typeof api.checkForUpdates !== "function") {
    return { success: false, error: "Auto-updater API not available" };
  }
  return api.checkForUpdates();
}

export async function executeCodeBlock(language, code) {
  const api = getNotesApi();
  if (typeof api.executeCodeBlock !== "function") {
    return { success: false, stdout: "", stderr: "Code execution API is not available", exitCode: -1 };
  }
  return api.executeCodeBlock({ language, code });
}

export async function checkIsDirectory(folderPath, relativeTo) {
  const api = getNotesApi();
  if (typeof api.checkIsDirectory !== "function") {
    return false;
  }
  return api.checkIsDirectory({ folderPath, relativeTo });
}

export async function openFolder(folderPath) {
  const api = getNotesApi();
  if (typeof api.openFolder !== "function") {
    throw new Error("Shell openFolder API is not available");
  }
  return api.openFolder({ folderPath });
}

export async function openExternal(url) {
  const api = getNotesApi();
  if (typeof api.openExternal !== "function") {
    window.open(url, "_blank");
    return { success: true };
  }
  return api.openExternal(url);
}

// ─── Phase 5: Conversations ───────────────────────────────────────────────

export async function aiListConversations() {
  const api = getNotesApi();
  if (typeof api.aiListConversations !== 'function') throw new Error('Conversation API unavailable.');
  return api.aiListConversations();
}

export async function aiGetConversation(id) {
  const api = getNotesApi();
  if (typeof api.aiGetConversation !== 'function') throw new Error('Conversation API unavailable.');
  return api.aiGetConversation({ id });
}

export async function aiCreateConversation(title, persona) {
  const api = getNotesApi();
  if (typeof api.aiCreateConversation !== 'function') throw new Error('Conversation API unavailable.');
  return api.aiCreateConversation({ title, persona });
}

export async function aiDeleteConversation(id) {
  const api = getNotesApi();
  if (typeof api.aiDeleteConversation !== 'function') throw new Error('Conversation API unavailable.');
  return api.aiDeleteConversation({ id });
}

export async function aiClearConversations() {
  const api = getNotesApi();
  if (typeof api.aiClearConversations !== 'function') throw new Error('Conversation API unavailable.');
  return api.aiClearConversations();
}

export async function aiSetConversationPersona(conversationId, personaId) {
  const api = getNotesApi();
  if (typeof api.aiSetConversationPersona !== 'function') throw new Error('Conversation API unavailable.');
  return api.aiSetConversationPersona({ conversationId, personaId });
}

export async function aiGetMessages(conversationId) {
  const api = getNotesApi();
  if (typeof api.aiGetMessages !== 'function') throw new Error('Conversation API unavailable.');
  return api.aiGetMessages({ conversationId });
}

export async function aiAddMessage(conversationId, role, content, metadata = null) {
  const api = getNotesApi();
  if (typeof api.aiAddMessage !== 'function') throw new Error('Conversation API unavailable.');
  return api.aiAddMessage({ conversationId, role, content, metadata });
}

// ─── Phase 5: Personas ────────────────────────────────────────────────────

export async function aiListPersonas() {
  const api = getNotesApi();
  if (typeof api.aiListPersonas !== 'function') throw new Error('Persona API unavailable.');
  return api.aiListPersonas();
}

export async function aiGetPersona(id) {
  const api = getNotesApi();
  if (typeof api.aiGetPersona !== 'function') throw new Error('Persona API unavailable.');
  return api.aiGetPersona({ id });
}

export async function aiSavePersona(persona) {
  const api = getNotesApi();
  if (typeof api.aiSavePersona !== 'function') throw new Error('Persona API unavailable.');
  return api.aiSavePersona(persona);
}

export async function aiDeletePersona(id) {
  const api = getNotesApi();
  if (typeof api.aiDeletePersona !== 'function') throw new Error('Persona API unavailable.');
  return api.aiDeletePersona({ id });
}

export async function aiImportPersona(filePath) {
  const api = getNotesApi();
  if (typeof api.aiImportPersona !== 'function') throw new Error('Persona API unavailable.');
  return api.aiImportPersona({ filePath });
}

export async function aiExportPersona(id, destPath) {
  const api = getNotesApi();
  if (typeof api.aiExportPersona !== 'function') throw new Error('Persona API unavailable.');
  return api.aiExportPersona({ id, destPath });
}

// ─── Phase 5: Candidate Knowledge ────────────────────────────────────────

export async function aiListPendingKnowledge() {
  const api = getNotesApi();
  if (typeof api.aiListPendingKnowledge !== 'function') throw new Error('Knowledge API unavailable.');
  return api.aiListPendingKnowledge();
}

export async function aiApproveKnowledge(id) {
  const api = getNotesApi();
  if (typeof api.aiApproveKnowledge !== 'function') throw new Error('Knowledge API unavailable.');
  return api.aiApproveKnowledge({ id });
}

export async function aiRejectKnowledge(id) {
  const api = getNotesApi();
  if (typeof api.aiRejectKnowledge !== 'function') throw new Error('Knowledge API unavailable.');
  return api.aiRejectKnowledge({ id });
}
