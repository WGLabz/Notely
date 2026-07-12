const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn } = require("node:child_process");
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
const { createDashboardCache } = require("./lib/core/dashboardCache.cjs");
const { createDocumentFileOps } = require("./lib/documents/documentFileOps.cjs");
const { createMainHelpers } = require("./lib/core/mainHelpers.cjs");
const { registerWorkspaceExportIpcHandlers } = require("./lib/export/workspaceExportIpc.cjs");
const { setupDiagramHandlers } = require("./diagram-handlers.cjs");
const { initializeAIHandlers } = require("./ai/aiHandlers.cjs");
const { registerGitIpcHandlers } = require("./lib/git/gitIpc.cjs");
const gitService = require("./lib/git/gitService.cjs");


const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const projectRoot = app.getAppPath();
const generatedVersionPath = path.join(projectRoot, "electron", "app-version.generated.json");
const sessionDataPath = path.join(app.getPath("userData"), "session-data");
const chromiumCachePath = path.join(sessionDataPath, "Cache");
const getMarkdownIt = () => require("markdown-it");
const getP2PLiveService = () => require("./p2p/p2pLive.cjs").P2PLiveService;

if (process.platform === "win32") {
  app.setAppUserModelId("app.notely.desktop");
}

// Register help-doc scheme as privileged so CSS/JS files can load and make requests
const { protocol } = require("electron");
protocol.registerSchemesAsPrivileged([
  { scheme: "help-doc", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }
]);

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
let dashboardCache;
let shutdownAISystemRef = () => {};
let aiInitTriggered = false;
const FULL_SYNC_BATCH_SIZE = 25;
const FULL_SYNC_MAX_FILES = 1000;
const VERSION_HISTORY_LIMIT = 50;

function triggerDeferredAIInit() {
  if (aiInitTriggered) return;
  aiInitTriggered = true;

  // Initialize AI in background without awaiting to avoid blocking UI responsiveness.
  const AI_INIT_TIMEOUT_MS = 8000;
  const initTimeout = setTimeout(() => {
    console.warn("[startup] AI initialization taking longer than expected (>8s), continuing anyway...");
  }, AI_INIT_TIMEOUT_MS);
  initializeAIForWorkspace()
    .catch((err) => {
      console.error("[AI] Background initialization failed:", err?.message || err);
    })
    .finally(() => {
      clearTimeout(initTimeout);
    });
}

function readGeneratedVersionInfo() {
  const fallbackVersion = String(app.getVersion() || "0.0.0");
  const fallbackName = String(app.getName() || "Notely");
  try {
    if (!fs.existsSync(generatedVersionPath)) {
      return {
        appName: fallbackName,
        version: fallbackVersion,
        versionCore: fallbackVersion,
        commitHash: "",
      };
    }

    const parsed = JSON.parse(String(fs.readFileSync(generatedVersionPath, "utf8") || "{}"));
    const fullVersion = String(parsed.version || fallbackVersion).trim() || fallbackVersion;
    const versionCore = String(parsed.versionCore || fullVersion).trim() || fullVersion;
    const commitHash = String(parsed.commitHash || "").trim();
    return {
      appName: fallbackName,
      version: fullVersion,
      versionCore,
      commitHash,
    };
  } catch (error) {
    console.warn("[startup] Unable to read generated app version info:", error?.message || error);
    return {
      appName: fallbackName,
      version: fallbackVersion,
      versionCore: fallbackVersion,
      commitHash: "",
    };
  }
}

async function initializeAIForWorkspace() {
  try {
    const { initializeAISystem, shutdownAISystem } = require("../src/ai/index.js");
    const AIConfig = require("../src/ai/utils/AIConfig");
    const { PROVIDER_REGISTRY } = require("../src/ai/llm/providerRegistry");
    const config = new AIConfig();

    shutdownAISystemRef = shutdownAISystem;

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

function findGitRepositoryRoot(dir) {
  let current = path.resolve(String(dir || ""));
  while (true) {
    const gitPath = path.join(current, ".git");
    if (fs.existsSync(gitPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function isWorkspaceGitRoot(workspaceDir) {
  return findGitRepositoryRoot(workspaceDir) !== null;
}

function getGitDirForWorkspace(workspaceDir) {
  const gitRoot = findGitRepositoryRoot(workspaceDir);
  if (!gitRoot) return "";

  const gitPath = path.join(gitRoot, ".git");
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
  const resolvedNotesDir = path.resolve(String(workspaceDir || ""));
  const gitRoot = findGitRepositoryRoot(resolvedNotesDir);
  if (!gitRoot) return false;

  const gitignorePath = path.join(gitRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return false;

  const notesAppPath = path.join(resolvedNotesDir, ".notes-app");
  const relativeNotesAppPath = normalizeToPosix(path.relative(gitRoot, notesAppPath)).replace(/\/+$/, "");
  const ignoreEntry = `${relativeNotesAppPath || ".notes-app"}/`;
  const existing = String(fs.readFileSync(gitignorePath, "utf8") || "");

  return existing
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/"))
    .some((line) => line === ignoreEntry || line === ignoreEntry.slice(0, -1));
}

function removeNotesAppGitignoreEntry(workspaceDir) {
  const resolvedNotesDir = path.resolve(String(workspaceDir || ""));
  const gitRoot = findGitRepositoryRoot(resolvedNotesDir);
  if (!gitRoot) return false;

  const gitignorePath = path.join(gitRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return false;

  const notesAppPath = path.join(resolvedNotesDir, ".notes-app");
  const relativeNotesAppPath = normalizeToPosix(path.relative(gitRoot, notesAppPath)).replace(/\/+$/, "");
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
  const resolvedNotesDir = path.resolve(String(notesDir || ""));
  const gitRoot = findGitRepositoryRoot(resolvedNotesDir);
  if (!gitRoot) return false;

  const gitignorePath = path.join(gitRoot, ".gitignore");
  const notesAppPath = path.join(resolvedNotesDir, ".notes-app");
  const relativeNotesAppPath = normalizeToPosix(path.relative(gitRoot, notesAppPath)).replace(/\/+$/, "");
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
  const gitRoot = findGitRepositoryRoot(workspaceRoot);
  const isGitRoot = gitRoot !== null;

  return {
    workspaceRoot: gitRoot || workspaceRoot,
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

function getThemePreferenceSetting() {
  const settings = readUserSettings();
  return settings?.themePreference === "light" || settings?.themePreference === "dark"
    ? settings.themePreference
    : "auto";
}

function getStoredZoomFactor() {
  const settings = readUserSettings();
  const numeric = Number(settings?.zoomFactor);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.75, Math.min(2, Number(numeric.toFixed(2))));
}

function resolveEffectiveTheme(themePreference) {
  if (themePreference === "light" || themePreference === "dark") return themePreference;
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function broadcastThemeChange() {
  const themePreference = getThemePreferenceSetting();
  const effectiveTheme = resolveEffectiveTheme(themePreference);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.send("appearance:theme-changed", { themePreference, effectiveTheme });
  }
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

  try {
    cleanupLegacyInTreeThumbnails(notesRoot);
  } catch (error) {
    console.warn("[startup] Unable to clean up legacy thumbnails folder:", error?.message || error);
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
  const P2PLiveService = getP2PLiveService();
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

  // Trigger one-time legacy history migration (async, best-effort, non-blocking)
  gitService.detectGit().then((detection) => {
    if (!detection.ok || !detection.data.available) return;
    gitService.migrateFromLegacy(notesRoot, metadataStore).then((result) => {
      if (!result.ok) return;
      if (!result.data.alreadyMigrated && result.data.migrated > 0) {
        console.log(`[git] Migrated ${result.data.migrated} legacy version(s) to git commits.`);
      }
    }).catch((err) => {
      console.warn("[git] Legacy migration error:", err?.message || err);
    });
  });
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
      } catch {
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
  } catch {
    // Best-effort cleanup: leaving an empty legacy folder is harmless.
  }
}

function cleanupLegacyInTreeThumbnails(workspaceRoot) {
  const legacyThumbnailsDir = path.join(workspaceRoot, "media", "images", "thumbnails");
  if (fs.existsSync(legacyThumbnailsDir)) {
    try {
      fs.rmSync(legacyThumbnailsDir, { recursive: true, force: true });
      console.info("[startup] Cleaned up legacy in-tree thumbnails directory.");
    } catch (err) {
      console.warn("[startup] Failed to remove legacy thumbnails folder:", err.message);
    }
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

const { WALK_EXCLUDE_DIRS, shouldHideDirectory, walkFiles, listDirectoryEntries, listWorkspaceFileEntries, listRootEntries } = workspaceEntries;

dashboardCache = createDashboardCache({
  fs,
  path,
  ensureDir,
  getNotesRoot: () => notesRoot,
  getActiveProject,
  filePathWithin,
  listWorkspaceFileEntries,
});

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
  shell,
  fs,
  path,
  crypto,
  nativeImage,
  pathToFileURL,
  getMarkdownIt,
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
  getAppDataDir: () => appDataDir,
  emitLocalP2PSyncEvent: (payload) => p2pSyncEngine.emitLocalP2PSyncEvent(payload),
  hashContent,
  getLastPdfExportPath,
  rememberPdfExportPath,
});

const {
  buildPdfExportHtml,
  getImageAnnotationForMarkdownAsset,
  renderImageHtmlWithAnnotation
} = imageMedia;

const terminalIpc = createTerminalIpc({
  BrowserWindow,
  getPty: () => require("node-pty"),
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
  getMarkdownIt,
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
  getInitialZoomFactor: getStoredZoomFactor,
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
    const themePreference = getThemePreferenceSetting();
    nativeTheme.themeSource = themePreference === "auto" ? "system" : themePreference;
    nativeTheme.on("updated", () => {
      if (getThemePreferenceSetting() === "auto") {
        broadcastThemeChange();
      }
    });

    const { contentTypeForFile } = require("./lib/shared/utils.cjs");

    // Register custom protocol to handle docs absolute paths (e.g. /assets/...) cleanly
    protocol.registerFileProtocol("help-doc", (request, callback) => {
      console.log("[help-doc protocol] Request URL:", request.url);
      let urlPath = request.url.replace(/^help-doc:\/\/docs\//, "");
      // Also strip root help-doc:// if docs/ was bypassed
      urlPath = urlPath.replace(/^help-doc:\/\//, "");
      // Remove query parameters or hash anchors
      urlPath = urlPath.split(/[?#]/)[0];
      // Decode path
      urlPath = decodeURIComponent(urlPath);
      // Map to docs-site-dist
      let fullPath = path.join(app.getAppPath(), "docs-site-dist", urlPath);

      // Resolve directories and paths without extensions to files
      const fs = require("node:fs");
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          fullPath = path.join(fullPath, "index.html");
        } else if (!path.extname(fullPath)) {
          if (fs.existsSync(fullPath + ".html")) {
            fullPath = fullPath + ".html";
          } else if (fs.existsSync(path.join(fullPath, "index.html"))) {
            fullPath = path.join(fullPath, "index.html");
          }
        }
      } catch (e) {
        console.error("[help-doc protocol] Error checking path stats:", e);
      }

      const mime = contentTypeForFile(fullPath);
      console.log("[help-doc protocol] Resolved File Path:", fullPath, "Mime:", mime);
      
      const response = { path: fullPath };
      if (mime && mime !== "application/octet-stream") {
        response.headers = {
          "content-type": mime,
          "cache-control": "no-cache"
        };
      }
      callback(response);
    });

    // Register AI IPC handlers in the ready phase so renderer calls never race missing handlers.
    initializeAIHandlers(app, aiAgent);
    windowLifecycle.applyContentSecurityPolicy();
    windowLifecycle.focusOrCreateWindow();
    broadcastThemeChange();

    // Defer workspace and AI initialization so splash/main window can appear quickly.
    setImmediate(() => {
      applyNotesRoot(resolveInitialNotesRoot());
    });

    // Fallback: ensure AI eventually initializes even if renderer boot-ready IPC is missed.
    setTimeout(() => {
      triggerDeferredAIInit();
    }, 15000);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  shutdownAISystemRef();

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

ipcMain.on("app:boot-ready", (event) => {
  assertTrustedIpcSender(BrowserWindow, event, "app:boot-ready");
  windowLifecycle.markRendererBootReady(event.sender);
  triggerDeferredAIInit();
});

ipcMain.on("app:boot-progress", (event, payload) => {
  assertTrustedIpcSender(BrowserWindow, event, "app:boot-progress");
  windowLifecycle.updateRendererBootProgress(event.sender, payload);
});

registerCoreIpcHandlers(ipcMain, {
  BrowserWindow,
  app,
  clipboard,
  dialog,
  fs,
  process,
  path,
  shell,
  filePathWithin,
  projectRoot,
  ensureDir,
  readUserSettings,
  writeUserSettings,
  applyNotesRoot,
  getGitWorkspaceMetadata,
  setAutoIgnoreMetadataInGit,
  getNotesRoot: () => notesRoot,
  listProjectsState,
  getAppInfo: () => readGeneratedVersionInfo(),
  getActiveProjectSlug: () => activeProjectSlug,
  setActiveProjectSlug: (slug) => {
    activeProjectSlug = slug;
  },
  createReferenceWindow: (filePath) => windowLifecycle.createReferenceWindow(filePath),
  nativeTheme,
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
  listWorkspaceFileEntries,
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
  dashboardCache,
  ensureDir,
  ensureWebPreviewServer: webPreview.ensureWebPreviewServer,
  prepareDocumentPreview: webPreview.prepareDocumentPreview,
  syncWebPreviewScope: webPreview.syncScopeToActiveProject,
  tryOpenInChrome: webPreview.tryOpenInChrome,
  getLastPdfExportPath,
  rememberPdfExportPath,
  buildPdfExportMarkdown,
  buildPdfExportHtml,
});

registerWorkspaceExportIpcHandlers(ipcMain, {
  BrowserWindow,
  dialog,
  fs,
  os,
  path,
  ensureDir,
  filePathWithin,
  getMarkdownIt,
  readUserSettings,
  writeUserSettings,
  getNotesRoot: () => notesRoot,
  getActiveProject,
  parseDocument,
  buildPdfExportMarkdown,
  buildPdfExportHtml,
});

imageMedia.registerIpcHandlers(ipcMain);
setupDiagramHandlers(ipcMain, appDataDir, {
  getNotesRoot: () => notesRoot,
  filePathWithin,
  emitLocalP2PSyncEvent: (payload) => p2pSyncEngine.emitLocalP2PSyncEvent(payload),
  hashContent,
});

registerGitIpcHandlers(ipcMain, {
  assertTrustedIpcSender,
  BrowserWindow,
  getNotesRoot: () => notesRoot,
});
