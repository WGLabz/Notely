const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn } = require("node:child_process");
const pty = require("node-pty");
const MarkdownIt = require("markdown-it");
const { P2PLiveService } = require("./p2p/p2pLive.cjs");
const { initializeAIHandlers } = require("./ai/aiHandlers.cjs");
const { initializeAISystem, shutdownAISystem } = require("../src/ai/index.js");
const {
  slugify,
  nowStamp,
  randomId,
  hashContent,
  filePathWithin,
  normalizeToPosix,
  escapeHtml,
  safeDecode,
  encodePathForUrl,
  decodeUrlPath,
  contentTypeForFile
} = require("./lib/utils.cjs");
const { buildPdfExportMarkdown, buildPdfStyles } = require("./lib/pdf.cjs");
const { buildWebsiteHtml } = require("./lib/websiteTemplate.cjs");
const { buildAppMenu } = require("./lib/appMenu.cjs");
const { createWebsiteRenderer } = require("./lib/websiteRenderer.cjs");
const { createImageMedia } = require("./lib/imageMedia.cjs");
const { createTerminalIpc } = require("./lib/terminalIpc.cjs");
const { registerCoreIpcHandlers } = require("./lib/coreIpc.cjs");
const { registerDocumentIpcHandlers } = require("./lib/documents/documentIpc.cjs");
const { registerSyncIpcHandlers } = require("./lib/sync/syncIpc.cjs");
const { createWebPreview } = require("./lib/webPreview.cjs");
const { createWindowLifecycle } = require("./lib/windowLifecycle.cjs");
const { createP2PSyncEngine } = require("./lib/sync/p2pSyncEngine.cjs");
const { createWorkspaceEntries, DEFAULT_WALK_EXCLUDE_DIRS } = require("./lib/documents/workspaceEntries.cjs");
const { createMetadataStore } = require("./lib/metadataStore.cjs");
const { createDocumentFileOps } = require("./lib/documents/documentFileOps.cjs");
const { createMainHelpers } = require("./lib/mainHelpers.cjs");

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const projectRoot = app.getAppPath();
const sessionDataPath = path.join(app.getPath("userData"), "session-data");
const chromiumCachePath = path.join(sessionDataPath, "Cache");

if (process.platform === "win32") {
  app.setAppUserModelId("app.notely.desktop");
}

try {
  fs.mkdirSync(chromiumCachePath, { recursive: true });
  app.setPath("sessionData", sessionDataPath);
  app.commandLine.appendSwitch("disk-cache-dir", chromiumCachePath);
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
} catch (error) {
  console.warn("[startup] Unable to initialize custom Chromium cache path:", error?.message || error);
}

const userConfigPath = path.join(app.getPath("userData"), "settings.json");
let notesRoot = "";
let appDataDir = "";
let versionsRoot = "";
const ROOT_PROJECT_SLUG = "__root__";
let activeProjectSlug = ROOT_PROJECT_SLUG;
let p2pService = null;
let aiAgent = null;
let p2pSyncEngine = null;
let mainHelpers;
const FULL_SYNC_BATCH_SIZE = 25;
const FULL_SYNC_MAX_FILES = 1000;
const VERSION_HISTORY_LIMIT = 50;

async function initializeAIForWorkspace() {
  try {
    const AIConfig = require("../src/ai/utils/AIConfig");
    const config = new AIConfig();
    const geminiKey = config.getAPIKey("gemini");
    const llmProvider = geminiKey
      ? { name: "gemini", config: { apiKey: geminiKey } }
      : null;

    const result = await initializeAISystem(appDataDir, notesRoot, llmProvider);
    aiAgent = result.agent;
    console.log("[AI] System initialized");
  } catch (error) {
    aiAgent = null;
    console.error("[AI] Initialization failed:", error?.message || error);
  } finally {
    initializeAIHandlers(app, aiAgent);
  }
}

function ensureDir(dirPath) {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("Invalid directory path.");
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function readUserSettings() {
  return mainHelpers.readUserSettings();
}

function writeUserSettings(nextSettings) {
  return mainHelpers.writeUserSettings(nextSettings);
}

function getLastPdfExportPath() {
  return mainHelpers.getLastPdfExportPath();
}

function rememberPdfExportPath(filePath) {
  return mainHelpers.rememberPdfExportPath(filePath);
}

function resolveInitialNotesRoot() {
  return mainHelpers.resolveInitialNotesRoot();
}

function applyNotesRoot(nextRootPath) {
  notesRoot = path.resolve(nextRootPath);
  appDataDir = path.join(notesRoot, ".notes-app");
  versionsRoot = path.join(appDataDir, "versions");

  ensureDir(notesRoot);
  ensureDir(versionsRoot);

  metadataStore = createMetadataStore({
    fs,
    path,
    ensureDir,
    getAppDataDir: () => appDataDir,
    getNotesRoot: () => notesRoot,
    filePathWithin,
    pruneVersionHistory: (filePath, limit) => p2pSyncEngine.pruneVersionHistory(filePath, limit),
  });

  if (p2pService) {
    p2pService.shutdown();
  }
  p2pService = new P2PLiveService({
    storageDir: appDataDir,
    onSyncEvent: (payload) => p2pSyncEngine.handleIncomingP2PSyncEvent(payload),
    onPeerTrusted: (peerId) => {
      setImmediate(() => {
        p2pSyncEngine.initiateFullSyncForPeer(peerId).catch((error) => {
          console.error("[p2p] full sync on trust failed:", error?.message || error);
        });
      });
    }
  });
  p2pService.init();

  activeProjectSlug = ROOT_PROJECT_SLUG;
}

function readP2PStatusSnapshot() {
  return mainHelpers.readP2PStatusSnapshot();
}

function getUniquePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }

  const ext = path.extname(targetPath);
  const baseName = path.basename(targetPath, ext);
  const dirName = path.dirname(targetPath);
  let counter = 1;
  let candidate = targetPath;

  while (fs.existsSync(candidate)) {
    candidate = path.join(dirName, `${baseName}-${counter}${ext}`);
    counter += 1;
  }

  return candidate;
}

function moveFileToRemoved(filePath, group) {
  const resolved = path.resolve(String(filePath || ""));
  if (!filePathWithin(notesRoot, resolved)) {
    throw new Error("Invalid path.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("File does not exist.");
  }

  const safeGroup = String(group || "files").trim() || "files";
  const relativePath = path.relative(notesRoot, resolved);
  const targetPath = path.join(notesRoot, "removed", safeGroup, relativePath);
  ensureDir(path.dirname(targetPath));
  const finalPath = getUniquePath(targetPath);
  fs.renameSync(resolved, finalPath);
  return finalPath;
}

function listProjectsState() {
  return mainHelpers.listProjectsState();
}

function getActiveProject() {
  return mainHelpers.getActiveProject();
}

function parseDocument(content, filePath) {
  return mainHelpers.parseDocument(content, filePath);
}

function buildDocumentContent(document) {
  return mainHelpers.buildDocumentContent(document);
}

const workspaceEntries = createWorkspaceEntries({
  fs,
  path,
  ensureDir,
  parseDocument,
  walkExcludeDirs: DEFAULT_WALK_EXCLUDE_DIRS,
});

const { WALK_EXCLUDE_DIRS, shouldHideDirectory, walkFiles, listDirectoryEntries, listRootEntries } = workspaceEntries;

mainHelpers = createMainHelpers({
  fs,
  path,
  process,
  app,
  projectRoot,
  userConfigPath,
  ensureDir,
  hashContent,
  rootProjectSlug: ROOT_PROJECT_SLUG,
  getNotesRoot: () => notesRoot,
  getActiveProjectSlug: () => activeProjectSlug,
  setActiveProjectSlug: (slug) => {
    activeProjectSlug = slug;
  },
});

const documentFileOps = createDocumentFileOps({
  fs,
  path,
  slugify,
  ensureDir,
  filePathWithin,
  parseDocument,
  buildDocumentContent,
  moveFileToRemoved,
  getNotesRoot: () => notesRoot,
  getMetadataStore: () => metadataStore,
  shouldHideDirectory,
});

const imageMedia = createImageMedia({
  fs,
  path,
  crypto,
  nativeImage,
  pathToFileURL,
  MarkdownIt,
  buildPdfStyles,
  escapeHtml,
  safeDecode,
  filePathWithin,
  normalizeToPosix,
  ensureDir,
  getActiveProject,
  walkFiles,
  WALK_EXCLUDE_DIRS,
  moveFileToRemoved,
  getUniquePath,
  getNotesRoot: () => notesRoot,
  getAppDataDir: () => appDataDir
});

const {
  buildPdfExportHtml,
  getImageAnnotationForMarkdownAsset,
  renderImageHtmlWithAnnotation
} = imageMedia;

const terminalIpc = createTerminalIpc({
  BrowserWindow,
  pty,
  filePathWithin,
  ensureDir,
  getNotesRoot: () => notesRoot,
  getActiveProject,
});

let websiteRenderers;

const webPreview = createWebPreview({
  fs,
  path,
  http,
  spawn,
  process,
  filePathWithin,
  normalizeToPosix,
  encodePathForUrl,
  decodeUrlPath,
  contentTypeForFile,
  walkExcludeDirs: WALK_EXCLUDE_DIRS,
  getNotesRoot: () => notesRoot,
  getActiveProject,
  getRenderers: () => websiteRenderers,
});

websiteRenderers = createWebsiteRenderer({
  path,
  fs,
  MarkdownIt,
  escapeHtml,
  encodePathForUrl,
  normalizeToPosix,
  safeDecode,
  walkFiles,
  parseDocument,
  getImageAnnotationForMarkdownAsset,
  renderImageHtmlWithAnnotation,
  buildWebsiteHtml,
  WALK_EXCLUDE_DIRS,
  getScopeRoot: () => webPreview.getScopeRoot(),
  getScopeLabel: () => webPreview.getScopeLabel(),
  getNotesRoot: () => notesRoot
});

function createDocumentInProject(rootDir, payload) {
  return documentFileOps.createDocumentInProject(rootDir, payload);
}

function createFolderInProject(rootDir, payload) {
  return documentFileOps.createFolderInProject(rootDir, payload);
}

function renameDocumentFile(filePath, payload) {
  return documentFileOps.renameDocumentFile(filePath, payload);
}

function deleteDocumentFile(filePath) {
  return documentFileOps.deleteDocumentFile(filePath);
}

let metadataStore;

const windowLifecycle = createWindowLifecycle({
  app,
  BrowserWindow,
  Menu,
  shell,
  session,
  fs,
  path,
  process,
  projectRoot,
  rendererUrl,
  buildAppMenu,
  terminalIpc,
});

p2pSyncEngine = createP2PSyncEngine({
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
  getNotesRoot: () => notesRoot,
  getVersionsRoot: () => versionsRoot,
  getMetadataStore: () => metadataStore,
  getP2PService: () => p2pService,
  getMainWindow: () => windowLifecycle.getMainWindow(),
  fullSyncBatchSize: FULL_SYNC_BATCH_SIZE,
  fullSyncMaxFiles: FULL_SYNC_MAX_FILES,
  versionHistoryLimit: VERSION_HISTORY_LIMIT,
});

const canRunApp = windowLifecycle.registerAppWindowEvents();

if (canRunApp) {
  app.whenReady().then(async () => {
    windowLifecycle.applyContentSecurityPolicy();
    applyNotesRoot(resolveInitialNotesRoot());
    await initializeAIForWorkspace();
    windowLifecycle.focusOrCreateWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  shutdownAISystem();

  webPreview.dispose();

  terminalIpc.disposeAll();

  if (p2pService) {
    p2pService.shutdown();
    p2pService = null;
  }
});

ipcMain.on("app-menu:update-context", windowLifecycle.handleMenuContextUpdate);

registerCoreIpcHandlers(ipcMain, {
  BrowserWindow,
  dialog,
  process,
  path,
  ensureDir,
  readUserSettings,
  writeUserSettings,
  applyNotesRoot,
  getNotesRoot: () => notesRoot,
  listProjectsState,
  getActiveProjectSlug: () => activeProjectSlug,
  setActiveProjectSlug: (slug) => {
    activeProjectSlug = slug;
  },
});

terminalIpc.registerHandlers(ipcMain);

registerSyncIpcHandlers(ipcMain, {
  fs,
  path,
  filePathWithin,
  normalizeToPosix,
  parseDocument,
  createVersionSnapshot: (...args) => p2pSyncEngine.createVersionSnapshot(...args),
  hashContent,
  moveFileToRemoved,
  metadataStore,
  getNotesRoot: () => notesRoot,
  getActiveProject,
  getP2PService: () => p2pService,
  readP2PStatusSnapshot,
});

registerDocumentIpcHandlers(ipcMain, {
  BrowserWindow,
  dialog,
  shell,
  fs,
  os,
  path,
  pathToFileURL,
  slugify,
  nowStamp,
  hashContent,
  filePathWithin,
  listRootEntries,
  listDirectoryEntries,
  getNotesRoot: () => notesRoot,
  getVersionsRoot: () => versionsRoot,
  getActiveProject,
  createDocumentInProject,
  createFolderInProject,
  renameDocumentFile,
  deleteDocumentFile,
  parseDocument,
  buildDocumentContent,
  emitLocalP2PSyncEvent: (payload) => p2pSyncEngine.emitLocalP2PSyncEvent(payload),
  buildNoteDelta: (payload) => p2pSyncEngine.buildNoteDelta(payload),
  hasMatchingFileBackedVersion: (filePath, fileHash) => p2pSyncEngine.hasMatchingFileBackedVersion(filePath, fileHash),
  createVersionSnapshot: (...args) => p2pSyncEngine.createVersionSnapshot(...args),
  metadataStore,
  ensureDir,
  ensureWebPreviewServer: webPreview.ensureWebPreviewServer,
  prepareDocumentPreview: webPreview.prepareDocumentPreview,
  tryOpenInChrome: webPreview.tryOpenInChrome,
  getLastPdfExportPath,
  rememberPdfExportPath,
  buildPdfExportMarkdown,
  buildPdfExportHtml,
});

imageMedia.registerIpcHandlers(ipcMain);
