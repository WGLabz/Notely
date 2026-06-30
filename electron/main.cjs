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
} = require("./lib/shared/utils.cjs");
const { buildPdfExportMarkdown, buildPdfStyles } = require("./lib/media/pdf.cjs");
const { buildWebsiteHtml } = require("./lib/web/websiteTemplate.cjs");
const { buildAppMenu } = require("./lib/core/appMenu.cjs");
const { createWebsiteRenderer } = require("./lib/web/websiteRenderer.cjs");
const { createImageMedia } = require("./lib/media/imageMedia.cjs");
const { createTerminalIpc } = require("./lib/ipc/terminalIpc.cjs");
const { registerCoreIpcHandlers } = require("./lib/ipc/coreIpc.cjs");
const { registerDocumentIpcHandlers } = require("./lib/documents/documentIpc.cjs");
const { registerSyncIpcHandlers } = require("./lib/sync/syncIpc.cjs");
const { createWebPreview } = require("./lib/web/webPreview.cjs");
const { createWindowLifecycle } = require("./lib/core/windowLifecycle.cjs");
const { assertTrustedIpcSender } = require("./lib/ipc/ipcSecurity.cjs");
const { createP2PSyncEngine } = require("./lib/sync/p2pSyncEngine.cjs");
const { createWorkspaceEntries, DEFAULT_WALK_EXCLUDE_DIRS } = require("./lib/documents/workspaceEntries.cjs");
const { createMetadataStore } = require("./lib/core/metadataStore.cjs");
const { createDocumentFileOps } = require("./lib/documents/documentFileOps.cjs");
const { createMainHelpers } = require("./lib/core/mainHelpers.cjs");

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
    const { PROVIDER_REGISTRY } = require("../src/ai/llm/providerRegistry");
    const config = new AIConfig();

    // Pick the first text provider that has a configured API key.
    let llmProvider = null;
    for (const entry of Object.values(PROVIDER_REGISTRY)) {
      if (!entry.available) continue;
      const apiKey = config.getAPIKey(entry.id);
      if (apiKey) {
        const savedModel = config.getProviderModel(entry.id);
        llmProvider = {
          name: entry.id,
          config: { apiKey, model: savedModel || entry.defaultModel },
        };
        break;
      }
    }

    // Resolve HuggingFace embedding token (independent of text provider).
    const hfToken = config.getAPIKey("huggingface");
    const embeddingConfig = hfToken ? { token: hfToken } : null;

    const result = await initializeAISystem(appDataDir, notesRoot, llmProvider, embeddingConfig);
    aiAgent = result.agent;
    console.log(
      "[AI] System initialized",
      llmProvider ? `text: ${llmProvider.name}` : "(no text provider)",
      embeddingConfig ? "| embeddings: HuggingFace" : "| embeddings: unavailable"
    );
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

function isWorkspaceGitRoot(workspaceDir) {
  const gitPath = path.join(path.resolve(String(workspaceDir || "")), ".git");
  return fs.existsSync(gitPath);
}

function getGitDirForWorkspace(workspaceDir) {
  const gitPath = path.join(path.resolve(String(workspaceDir || "")), ".git");
  if (!fs.existsSync(gitPath)) return "";

  const stat = fs.statSync(gitPath);
  if (stat.isDirectory()) return gitPath;
  if (!stat.isFile()) return "";

  const content = String(fs.readFileSync(gitPath, "utf8") || "").trim();
  const match = content.match(/^gitdir:\s*(.+)$/i);
  if (!match) return "";

  const rawGitDir = match[1].trim();
  return path.isAbsolute(rawGitDir)
    ? path.resolve(rawGitDir)
    : path.resolve(path.dirname(gitPath), rawGitDir);
}

function getGitBranchForWorkspace(workspaceDir) {
  const gitDir = getGitDirForWorkspace(workspaceDir);
  if (!gitDir) return "";

  const headPath = path.join(gitDir, "HEAD");
  if (!fs.existsSync(headPath)) return "";

  const headValue = String(fs.readFileSync(headPath, "utf8") || "").trim();
  const refMatch = headValue.match(/^ref:\s+refs\/heads\/(.+)$/i);
  if (refMatch) return refMatch[1].trim();
  return headValue ? `detached-${headValue.slice(0, 7)}` : "";
}

function getAutoIgnoreMetadataInGitSetting() {
  const settings = readUserSettings();
  return settings.autoIgnoreMetadataInGit !== false;
}

function hasNotesAppGitignoreEntry(workspaceDir) {
  const resolvedWorkspace = path.resolve(String(workspaceDir || ""));
  const gitignorePath = path.join(resolvedWorkspace, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return false;

  const notesAppPath = path.join(resolvedWorkspace, ".notes-app");
  const relativeNotesAppPath = normalizeToPosix(path.relative(resolvedWorkspace, notesAppPath)).replace(/\/+$/, "");
  const ignoreEntry = `${relativeNotesAppPath || ".notes-app"}/`;
  const existing = String(fs.readFileSync(gitignorePath, "utf8") || "");

  return existing
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/"))
    .some((line) => line === ignoreEntry || line === ignoreEntry.slice(0, -1));
}

function removeNotesAppGitignoreEntry(workspaceDir) {
  const resolvedWorkspace = path.resolve(String(workspaceDir || ""));
  const gitignorePath = path.join(resolvedWorkspace, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return false;

  const notesAppPath = path.join(resolvedWorkspace, ".notes-app");
  const relativeNotesAppPath = normalizeToPosix(path.relative(resolvedWorkspace, notesAppPath)).replace(/\/+$/, "");
  const ignoreEntry = `${relativeNotesAppPath || ".notes-app"}/`;
  const ignoreEntryAlt = ignoreEntry.slice(0, -1);

  const existing = String(fs.readFileSync(gitignorePath, "utf8") || "");
  const lines = existing.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const normalized = String(line || "").trim().replace(/\\/g, "/");
    return normalized !== ignoreEntry && normalized !== ignoreEntryAlt;
  });

  if (filtered.length === lines.length) return false;

  const trailingNewline = existing.endsWith("\n") ? "\n" : "";
  const nextValue = `${filtered.join("\n")}${trailingNewline}`;
  fs.writeFileSync(gitignorePath, nextValue, "utf8");
  return true;
}

function ensureNotesAppIgnoredInGit(notesDir) {
  const resolvedWorkspace = path.resolve(String(notesDir || ""));
  if (!isWorkspaceGitRoot(resolvedWorkspace)) return false;

  const gitignorePath = path.join(resolvedWorkspace, ".gitignore");
  const notesAppPath = path.join(resolvedWorkspace, ".notes-app");
  const relativeNotesAppPath = normalizeToPosix(path.relative(resolvedWorkspace, notesAppPath)).replace(/\/+$/, "");
  const ignoreEntry = `${relativeNotesAppPath || ".notes-app"}/`;

  const existing = fs.existsSync(gitignorePath)
    ? String(fs.readFileSync(gitignorePath, "utf8") || "")
    : "";

  const hasEntry = existing
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/"))
    .some((line) => line === ignoreEntry || line === ignoreEntry.slice(0, -1));

  if (hasEntry) return false;

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
  const nextValue = `${existing}${needsLeadingNewline ? "\n" : ""}${ignoreEntry}\n`;
  fs.writeFileSync(gitignorePath, nextValue, "utf8");
  return true;
}

function getGitWorkspaceMetadata() {
  const workspaceRoot = path.resolve(String(notesRoot || ""));
  const isGitRoot = isWorkspaceGitRoot(workspaceRoot);

  return {
    workspaceRoot,
    isGitRoot,
    branch: isGitRoot ? getGitBranchForWorkspace(workspaceRoot) : "",
    autoIgnoreMetadataInGit: getAutoIgnoreMetadataInGitSetting(),
    gitignoreHasNotesApp: isGitRoot ? hasNotesAppGitignoreEntry(workspaceRoot) : false,
  };
}

function setAutoIgnoreMetadataInGit(enabled) {
  const settings = readUserSettings();
  settings.autoIgnoreMetadataInGit = enabled !== false;
  writeUserSettings(settings);

  if (!isWorkspaceGitRoot(notesRoot)) {
    return getGitWorkspaceMetadata();
  }

  if (settings.autoIgnoreMetadataInGit) {
    try {
      ensureNotesAppIgnoredInGit(notesRoot);
    } catch (error) {
      console.warn("[settings] Unable to apply .gitignore metadata preference:", error?.message || error);
    }
  } else {
    try {
      removeNotesAppGitignoreEntry(notesRoot);
    } catch (error) {
      console.warn("[settings] Unable to remove .gitignore metadata preference:", error?.message || error);
    }
  }

  return getGitWorkspaceMetadata();
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
  const removedRoot = path.join(appDataDir, "removed");

  ensureDir(notesRoot);
  ensureDir(versionsRoot);
  ensureDir(removedRoot);

  if (getAutoIgnoreMetadataInGitSetting()) {
    try {
      ensureNotesAppIgnoredInGit(notesRoot);
    } catch (error) {
      console.warn("[startup] Unable to update .gitignore for .notes-app:", error?.message || error);
    }
  }

  try {
    migrateLegacyRemovedDirectory();
  } catch (error) {
    console.warn("[startup] Unable to migrate legacy removed folder:", error?.message || error);
  }

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

function moveDirectoryContents(sourceDir, targetDir) {
  ensureDir(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      moveDirectoryContents(sourcePath, targetPath);
      try {
        fs.rmdirSync(sourcePath);
      } catch (_error) {
        // Leave non-empty directories in place if any nested move failed.
      }
      continue;
    }

    const finalPath = getUniquePath(targetPath);
    ensureDir(path.dirname(finalPath));
    fs.renameSync(sourcePath, finalPath);
  }
}

function migrateLegacyRemovedDirectory() {
  const legacyRemovedDir = path.join(notesRoot, "removed");
  const managedRemovedDir = path.join(appDataDir, "removed");

  if (!fs.existsSync(legacyRemovedDir)) return;
  if (!fs.statSync(legacyRemovedDir).isDirectory()) return;

  moveDirectoryContents(legacyRemovedDir, managedRemovedDir);
  try {
    fs.rmSync(legacyRemovedDir, { recursive: true, force: false });
  } catch (_error) {
    // Best-effort cleanup: leaving an empty legacy folder is harmless.
  }
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
  const targetPath = path.join(appDataDir, "removed", safeGroup, relativePath);
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
  BrowserWindow,
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

function deleteFolderInProject(rootDir, folderPath) {
  return documentFileOps.deleteFolderInProject(rootDir, folderPath);
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

ipcMain.on("app-menu:update-context", (event, context) => {
  assertTrustedIpcSender(BrowserWindow, event, "app-menu:update-context");
  windowLifecycle.handleMenuContextUpdate(event, context);
});

registerCoreIpcHandlers(ipcMain, {
  BrowserWindow,
  dialog,
  process,
  path,
  ensureDir,
  readUserSettings,
  writeUserSettings,
  applyNotesRoot,
  getGitWorkspaceMetadata,
  setAutoIgnoreMetadataInGit,
  getNotesRoot: () => notesRoot,
  listProjectsState,
  getActiveProjectSlug: () => activeProjectSlug,
  setActiveProjectSlug: (slug) => {
    activeProjectSlug = slug;
  },
});

terminalIpc.registerHandlers(ipcMain);

registerSyncIpcHandlers(ipcMain, {
  BrowserWindow,
  fs,
  path,
  filePathWithin,
  normalizeToPosix,
  parseDocument,
  createVersionSnapshot: (...args) => p2pSyncEngine.createVersionSnapshot(...args),
  hashContent,
  moveFileToRemoved,
  getMetadataStore: () => metadataStore,
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
  getAIAgent: () => aiAgent,
  createDocumentInProject,
  createFolderInProject,
  renameDocumentFile,
  deleteDocumentFile,
  deleteFolderInProject,
  parseDocument,
  buildDocumentContent,
  emitLocalP2PSyncEvent: (payload) => p2pSyncEngine.emitLocalP2PSyncEvent(payload),
  buildNoteDelta: (payload) => p2pSyncEngine.buildNoteDelta(payload),
  hasMatchingFileBackedVersion: (filePath, fileHash) => p2pSyncEngine.hasMatchingFileBackedVersion(filePath, fileHash),
  createVersionSnapshot: (...args) => p2pSyncEngine.createVersionSnapshot(...args),
  getMetadataStore: () => metadataStore,
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
