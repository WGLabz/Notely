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
const { registerDocumentIpcHandlers } = require("./lib/documentIpc.cjs");
const { registerSyncIpcHandlers } = require("./lib/syncIpc.cjs");
const { createWebPreview } = require("./lib/webPreview.cjs");
const { createWindowLifecycle } = require("./lib/windowLifecycle.cjs");
const { createP2PSyncEngine } = require("./lib/p2pSyncEngine.cjs");

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
  if (!fs.existsSync(userConfigPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(userConfigPath, "utf8"));
  } catch {
    return {};
  }
}

function writeUserSettings(nextSettings) {
  ensureDir(path.dirname(userConfigPath));
  fs.writeFileSync(userConfigPath, JSON.stringify(nextSettings, null, 2), "utf8");
}

function getLastPdfExportPath() {
  const settings = readUserSettings();
  const lastPath = typeof settings?.lastPdfExportPath === "string"
    ? settings.lastPdfExportPath.trim()
    : "";
  if (!lastPath) return "";

  try {
    const resolvedLastPath = path.resolve(lastPath);
    if (fs.existsSync(path.dirname(resolvedLastPath))) {
      return resolvedLastPath;
    }
  } catch {
    return "";
  }

  return "";
}

function rememberPdfExportPath(filePath) {
  if (!filePath || typeof filePath !== "string") return;
  const settings = readUserSettings();
  settings.lastPdfExportPath = path.resolve(filePath);
  writeUserSettings(settings);
}

function resolveInitialNotesRoot() {
  const envNotesRoot = process.env.NOTES_ROOT;
  if (envNotesRoot && envNotesRoot.trim()) {
    return path.resolve(envNotesRoot.trim());
  }

  const settings = readUserSettings();
  if (settings?.notesRoot && typeof settings.notesRoot === "string") {
    return path.resolve(settings.notesRoot);
  }

  return path.join(app.getPath("documents"), "Notely Notes");
}

function applyNotesRoot(nextRootPath) {
  notesRoot = path.resolve(nextRootPath);
  appDataDir = path.join(notesRoot, ".notes-app");
  versionsRoot = path.join(appDataDir, "versions");

  ensureDir(notesRoot);
  ensureDir(versionsRoot);

  metadataStore = new MetadataStore();

  if (p2pService) {
    p2pService.shutdown();
  }
  p2pService = new P2PLiveService({
    storageDir: appDataDir,
    onSyncEvent: handleIncomingP2PSyncEvent,
    onPeerTrusted: (peerId) => {
      setImmediate(() => {
        initiateFullSyncForPeer(peerId).catch((error) => {
          console.error("[p2p] full sync on trust failed:", error?.message || error);
        });
      });
    }
  });
  p2pService.init();

  activeProjectSlug = ROOT_PROJECT_SLUG;
}

function readP2PStatusSnapshot() {
  const harnessRoot = path.join(projectRoot, ".artifacts", "p2p-harness");
  const summaryPath = path.join(harnessRoot, "summary.json");

  if (!fs.existsSync(summaryPath)) {
    return {
      available: false,
      source: summaryPath,
      generatedAt: null,
      sessionId: null,
      workspaceId: null,
      peerCount: 0,
      trustedLinkCount: 0,
      workspaceKeyCount: 0,
      peers: []
    };
  }

  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch {
    return {
      available: false,
      source: summaryPath,
      generatedAt: null,
      sessionId: null,
      workspaceId: null,
      peerCount: 0,
      trustedLinkCount: 0,
      workspaceKeyCount: 0,
      peers: []
    };
  }

  const peers = Array.isArray(summary?.peers)
    ? summary.peers
      .filter((peer) => peer && typeof peer === "object")
      .map((peer) => ({
        name: String(peer.name || "Unknown peer"),
        peerId: String(peer.peerId || ""),
        trustedPeerCount: Array.isArray(peer.trustedPeers) ? peer.trustedPeers.length : 0,
        workspaceKeyCount: Array.isArray(peer.workspaceKeys) ? peer.workspaceKeys.length : 0,
        inboxCount: Number.isFinite(peer.inboxCount) ? peer.inboxCount : 0
      }))
    : [];

  const trustedLinkCount = peers.reduce((total, peer) => total + peer.trustedPeerCount, 0);
  const workspaceKeyCount = peers.reduce((total, peer) => total + peer.workspaceKeyCount, 0);

  return {
    available: true,
    source: summaryPath,
    generatedAt: summary?.generatedAt || null,
    sessionId: summary?.sessionId || null,
    workspaceId: summary?.workspaceId || null,
    peerCount: peers.length,
    trustedLinkCount,
    workspaceKeyCount,
    peers
  };
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
  ensureDir(notesRoot);
  const projects = [
    {
      slug: ROOT_PROJECT_SLUG,
      name: "Root",
      rootPath: notesRoot,
      isRoot: true
    },
    ...fs.readdirSync(notesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !entry.name.startsWith("."))
      .filter((entry) => entry.name !== "images")
      .filter((entry) => entry.name !== "removed")
      .map((entry) => ({
        slug: entry.name,
        name: entry.name,
        rootPath: path.join(notesRoot, entry.name),
        isRoot: false
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  ];

  if (!projects.some((item) => item.slug === activeProjectSlug)) {
    activeProjectSlug = ROOT_PROJECT_SLUG;
  }

  const activeProject = projects.find((item) => item.slug === activeProjectSlug)
    || projects[0]
    || {
      slug: ROOT_PROJECT_SLUG,
      name: "Root",
      rootPath: notesRoot,
      isRoot: true
    };

  return {
    projects: projects.map((item) => ({
      slug: item.slug,
      name: item.name,
      rootPath: item.rootPath,
      isRoot: Boolean(item.isRoot)
    })),
    activeProject: {
      slug: activeProject.slug,
      name: activeProject.name,
      rootPath: activeProject.rootPath,
      isRoot: Boolean(activeProject.isRoot)
    }
  };
}

function getActiveProject() {
  const state = listProjectsState();
  return state.activeProject;
}

function parseDocument(content, filePath) {
  const normalized = content.replace(/\r\n/g, "\n");
  const rawMatch = normalized.match(/^#\s*(RawNotes|Notes|Quick Notes)\s*$/im);
  const cleansedMatch = normalized.match(/^#\s*(Cleansed|Formal Notes|Professional Version)\s*$/im);
  const firstSectionIndex = Math.min(
    ...[rawMatch?.index, cleansedMatch?.index].filter((value) => Number.isInteger(value))
  );
  const header = Number.isFinite(firstSectionIndex)
    ? normalized.slice(0, firstSectionIndex).trim()
    : normalized.trim();

  const rawStart = rawMatch ? rawMatch.index + rawMatch[0].length : -1;
  const cleansedStart = cleansedMatch ? cleansedMatch.index + cleansedMatch[0].length : -1;
  const rawEnd = cleansedMatch ? cleansedMatch.index : normalized.length;
  const cleansedEnd = normalized.length;

  const metadata = {};
  header.split("\n").forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) metadata[match[1].trim().toLowerCase()] = match[2].trim();
  });

  return {
    filePath,
    fileName: path.basename(filePath),
    title: path.basename(filePath, ".md"),
    metadata,
    header,
    rawNotes: rawStart >= 0 ? normalized.slice(rawStart, rawEnd).trim() : "",
    cleansed: cleansedStart >= 0 ? normalized.slice(cleansedStart, cleansedEnd).trim() : "",
    hasRawNotes: rawStart >= 0,
    hasCleansed: cleansedStart >= 0,
    hash: hashContent(content)
  };
}

function buildDocumentContent(document) {
  const header = (document.header || "").trim();
  const parts = [];
  if (header) parts.push(header);
  parts.push("# RawNotes\n" + (document.rawNotes || "").trim());
  parts.push("# Cleansed\n" + (document.cleansed || "").trim());
  return parts.join("\n\n") + "\n";
}

function createVersionSnapshot(filePath, content, tag) {
  return p2pSyncEngine.createVersionSnapshot(filePath, content, tag);
}

function pruneVersionHistory(filePath, limit = VERSION_HISTORY_LIMIT) {
  return p2pSyncEngine.pruneVersionHistory(filePath, limit);
}

function hasMatchingFileBackedVersion(filePath, fileHash) {
  return p2pSyncEngine.hasMatchingFileBackedVersion(filePath, fileHash);
}

function buildNoteDelta({ filePath, previousContent, nextContent }) {
  return p2pSyncEngine.buildNoteDelta({ filePath, previousContent, nextContent });
}

async function initiateFullSyncForPeer(peerId) {
  return p2pSyncEngine.initiateFullSyncForPeer(peerId);
}

function emitLocalP2PSyncEvent(event) {
  return p2pSyncEngine.emitLocalP2PSyncEvent(event);
}

function handleIncomingP2PSyncEvent(payload) {
  return p2pSyncEngine.handleIncomingP2PSyncEvent(payload);
}

function shouldHideDirectory(name) {
  const lowerName = String(name || "").toLowerCase();
  return lowerName.startsWith(".") || lowerName === "images" || lowerName === "removed";
}

function extractPreviewImagesFromMarkdown(content, sourceFilePath, limit = 4) {
  const markdownImagePattern = /!\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g;
  const images = [];
  const seen = new Set();
  let match;

  while (images.length < limit && (match = markdownImagePattern.exec(String(content || "")))) {
    const rawPath = String(match[1] || "").trim();
    const assetPath = rawPath.startsWith("<") && rawPath.endsWith(">")
      ? rawPath.slice(1, -1)
      : rawPath;
    if (!assetPath || /^(https?:|data:|blob:)/i.test(assetPath)) continue;

    const key = `${sourceFilePath}:${assetPath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    images.push({
      path: assetPath,
      sourceFilePath,
      name: path.basename(assetPath.split(/[?#]/)[0] || assetPath)
    });
  }

  return images;
}

function collectFolderPreviewImages(folderPath, limit = 4) {
  const images = [];
  const markdownFiles = walkFiles(folderPath, { excludeDirs: Array.from(WALK_EXCLUDE_DIRS) })
    .filter((item) => path.extname(item).toLowerCase() === ".md");

  for (const markdownFile of markdownFiles) {
    if (images.length >= limit) break;
    try {
      const content = fs.readFileSync(markdownFile, "utf8");
      images.push(...extractPreviewImagesFromMarkdown(content, markdownFile, limit - images.length));
    } catch {
      // Folder thumbnails are best-effort.
    }
  }

  return images.slice(0, limit);
}

function listDirectoryEntries(rootDir, options = {}) {
  ensureDir(rootDir);
  const { includeProjectSlug = false } = options;

  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isDirectory()) {
        return !shouldHideDirectory(entry.name);
      }
      return entry.isFile() && entry.name.toLowerCase().endsWith(".md");
    })
    .map((entry) => {
      const entryPath = path.join(rootDir, entry.name);
      const stat = fs.statSync(entryPath);

      if (entry.isDirectory()) {
        return {
          entryType: "folder",
          slug: includeProjectSlug ? entry.name : undefined,
          filePath: entryPath,
          title: entry.name,
          metadata: {},
          updatedAt: stat.mtime.toISOString(),
          previewImages: collectFolderPreviewImages(entryPath)
        };
      }

      const content = fs.readFileSync(entryPath, "utf8");
      const parsed = parseDocument(content, entryPath);
      return {
        entryType: "file",
        filePath: entryPath,
        fileName: parsed.fileName,
        title: parsed.title,
        metadata: parsed.metadata,
        updatedAt: stat.mtime.toISOString(),
        previewImages: extractPreviewImagesFromMarkdown(content, entryPath),
        hash: parsed.hash
      };
    })
    .sort((a, b) => {
      if (a.entryType !== b.entryType) {
        return a.entryType === "folder" ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
}

function walkFiles(rootDir, options = {}) {
  const excludeDirs = new Set(options.excludeDirs || []);
  const files = [];

  const visit = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        visit(nextPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  };

  visit(rootDir);
  return files;
}

const WALK_EXCLUDE_DIRS = new Set([
  ".notes-app", ".versions", "node_modules", ".git", ".svn", ".hg",
  "dist", "build", ".artifacts", ".cache", "__pycache__", "removed",
  ".venv", "venv", ".next", ".nuxt", "coverage"
]);

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

function listRootEntries(rootDir) {
  return listDirectoryEntries(rootDir, { includeProjectSlug: true });
}

function createDocumentInProject(rootDir, payload) {
  const requestedTitle = String(payload?.title || "").trim();
  if (!requestedTitle) {
    throw new Error("Note title is required.");
  }

  const resolvedRoot = path.resolve(rootDir);
  const requestedParentPath = String(payload?.parentPath || "").trim();
  const targetDir = path.resolve(requestedParentPath || resolvedRoot);
  if (!filePathWithin(resolvedRoot, targetDir)) {
    throw new Error("Invalid target folder path.");
  }

  ensureDir(targetDir);

  const safeBaseName = slugify(requestedTitle);
  let fileName = `${safeBaseName}.md`;
  let filePath = path.join(targetDir, fileName);
  let counter = 2;

  while (fs.existsSync(filePath)) {
    fileName = `${safeBaseName}-${counter}.md`;
    filePath = path.join(rootDir, fileName);
    counter += 1;
  }

  const initialContent = buildDocumentContent({
    header: `Title: ${requestedTitle}`,
    rawNotes: "",
    cleansed: ""
  });

  fs.writeFileSync(filePath, initialContent, "utf8");
  return parseDocument(initialContent, filePath);
}

function createFolderInProject(rootDir, payload) {
  const folderName = String(payload?.name || "").trim();
  if (!folderName) {
    throw new Error("Folder name is required.");
  }
  if (folderName === "." || folderName === "..") {
    throw new Error("Invalid folder name.");
  }
  if (/[/\\]/.test(folderName)) {
    throw new Error("Use a single folder name without slashes.");
  }
  if (folderName.startsWith(".")) {
    throw new Error("Hidden folder names are not allowed.");
  }
  if (shouldHideDirectory(folderName)) {
    throw new Error("This folder name is reserved.");
  }

  const requestedParentPath = String(payload?.parentPath || "").trim();
  const resolvedRoot = path.resolve(rootDir);
  const parentPath = path.resolve(requestedParentPath || resolvedRoot);
  if (!filePathWithin(resolvedRoot, parentPath)) {
    throw new Error("Invalid parent folder path.");
  }

  ensureDir(parentPath);

  const nextFolderPath = path.join(parentPath, folderName);
  if (!filePathWithin(resolvedRoot, nextFolderPath)) {
    throw new Error("Invalid folder path.");
  }
  if (fs.existsSync(nextFolderPath)) {
    throw new Error("A file or folder with that name already exists.");
  }

  fs.mkdirSync(nextFolderPath, { recursive: false });
  const stat = fs.statSync(nextFolderPath);
  return {
    entryType: "folder",
    filePath: nextFolderPath,
    title: folderName,
    metadata: {},
    updatedAt: stat.mtime.toISOString()
  };
}

function updateDocumentHeaderTitle(header, nextTitle) {
  const trimmedTitle = String(nextTitle || "").trim();
  const normalizedHeader = String(header || "").trim();

  if (!trimmedTitle) {
    return normalizedHeader;
  }

  if (!normalizedHeader) {
    return `Title: ${trimmedTitle}`;
  }

  if (/^title\s*:/im.test(normalizedHeader)) {
    return normalizedHeader.replace(/^title\s*:.*$/im, `Title: ${trimmedTitle}`);
  }

  return `Title: ${trimmedTitle}\n${normalizedHeader}`;
}

function renameDocumentFile(filePath, payload) {
  const resolved = path.resolve(String(filePath || ""));
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("Document file does not exist.");
  }

  const requestedTitle = String(payload?.title || "").trim();
  if (!requestedTitle) {
    throw new Error("Note title is required.");
  }

  const nextFileName = `${slugify(requestedTitle)}.md`;
  const nextResolved = path.join(path.dirname(resolved), nextFileName);
  const currentContent = fs.readFileSync(resolved, "utf8");
  const parsed = parseDocument(currentContent, resolved);
  const nextHeader = updateDocumentHeaderTitle(parsed.header, requestedTitle);
  const nextContent = buildDocumentContent({
    ...parsed,
    header: nextHeader,
  });

  const isSamePath = resolved.toLowerCase() === nextResolved.toLowerCase();
  if (!isSamePath && fs.existsSync(nextResolved)) {
    throw new Error("A note with that file name already exists.");
  }

  if (!isSamePath) {
    fs.renameSync(resolved, nextResolved);
    metadataStore.renameHistoryFilePath(resolved, nextResolved);
  }

  fs.writeFileSync(nextResolved, nextContent, "utf8");
  return parseDocument(nextContent, nextResolved);
}

function deleteDocumentFile(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("Document file does not exist.");
  }

  const movedPath = moveFileToRemoved(resolved, "notes");
  metadataStore.renameHistoryFilePath(resolved, movedPath);
  return { movedPath };
}

class MetadataStore {
  constructor() {
    ensureDir(appDataDir);
    this.jsonPath = path.join(appDataDir, "app-state.json");
    this.dbPath = path.join(appDataDir, "app.sqlite");
    this.db = null;

    try {
      const { DatabaseSync } = require("node:sqlite");
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS history_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
      version_path TEXT NOT NULL,
          file_hash TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    } catch {
      this.state = fs.existsSync(this.jsonPath)
        ? JSON.parse(fs.readFileSync(this.jsonPath, "utf8"))
        : { history: [] };
    }
  }

  addHistory(entry) {
    if (this.db) {
      this.db.prepare(`
        INSERT INTO history_entries (file_path, version_path, file_hash, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(entry.filePath, entry.versionPath, entry.fileHash, entry.reason, entry.createdAt);
      pruneVersionHistory(entry.filePath);
      return;
    }

    this.state.history.push(entry);
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
    pruneVersionHistory(entry.filePath);
  }

  getHistory(filePath) {
    if (this.db) {
      return this.db.prepare(`
        SELECT version_path AS versionPath, file_hash AS fileHash, reason, created_at AS createdAt
        FROM history_entries
        WHERE file_path = ?
        ORDER BY created_at DESC
      `).all(filePath);
    }

    return this.state.history
      .filter((entry) => entry.filePath === filePath)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getWorkspaceActivity(workspaceRoot, limit = 200) {
    const resolvedRoot = path.resolve(String(workspaceRoot || notesRoot));
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));

    if (this.db) {
      const prefix = `${resolvedRoot.toLowerCase()}%`;
      return this.db.prepare(`
        SELECT file_path AS filePath, version_path AS versionPath, file_hash AS fileHash, reason, created_at AS createdAt
        FROM history_entries
        WHERE lower(file_path) LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(prefix, safeLimit);
    }

    return this.state.history
      .filter((entry) => filePathWithin(resolvedRoot, entry.filePath))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit)
      .map((entry) => ({
        filePath: entry.filePath,
        versionPath: entry.versionPath,
        fileHash: entry.fileHash,
        reason: entry.reason,
        createdAt: entry.createdAt
      }));
  }

  deleteHistoryVersion(filePath, versionPath) {
    if (this.db) {
      this.db.prepare(`
        DELETE FROM history_entries
        WHERE file_path = ? AND version_path = ?
      `).run(filePath, versionPath);
      return;
    }

    this.state.history = this.state.history.filter(
      (entry) => !(entry.filePath === filePath && entry.versionPath === versionPath)
    );
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
  }

  renameHistoryFilePath(previousFilePath, nextFilePath) {
    if (this.db) {
      this.db.prepare(`
        UPDATE history_entries
        SET file_path = ?
        WHERE file_path = ?
      `).run(nextFilePath, previousFilePath);
      return;
    }

    this.state.history = this.state.history.map((entry) => (
      entry.filePath === previousFilePath
        ? { ...entry, filePath: nextFilePath }
        : entry
    ));
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
  }
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
  createVersionSnapshot,
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
  emitLocalP2PSyncEvent,
  buildNoteDelta,
  hasMatchingFileBackedVersion,
  createVersionSnapshot,
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
