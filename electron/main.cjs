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
const { P2PLiveService } = require("./p2pLive.cjs");
const { initializeAIHandlers } = require("./aiHandlers.cjs");
const { initializeAISystem, shutdownAISystem } = require("../src/ai/index.js");

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
let mainWindow = null;
let webPreviewServer = null;
let webPreviewPort = 0;
const webPreviewContentOverrides = new Map();
let webPreviewScopeRoot = "";
let webPreviewScopeLabel = "Project";
const terminalSessions = new Map();
let nextTerminalSessionId = 1;
let p2pService = null;
let aiAgent = null;
const FULL_SYNC_BATCH_SIZE = 25;
const FULL_SYNC_MAX_FILES = 1000;
const THUMBNAIL_DIR_NAME = "thumbnails";
const THUMBNAIL_MAX_WIDTH = 360;
const THUMBNAIL_JPEG_QUALITY = 72;
const VERSION_HISTORY_LIMIT = 50;
const RASTER_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".ico"]);

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

function slugify(value) {
  return value
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";
}

function nowStamp() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("-");
}

function randomId(bytes = 10) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashContent(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function filePathWithin(rootDir, targetPath) {
  if (!rootDir || !targetPath) {
    return false;
  }

  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);

  // Same path is considered "within".
  if (resolvedRoot === resolvedTarget) {
    return true;
  }

  // Use path.relative so confinement is evaluated on path segment boundaries.
  // A sibling like `<root>-evil` produces a relative path starting with `..`,
  // which a naive startsWith() prefix check would incorrectly accept.
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative) {
    return true;
  }

  return !relative.startsWith("..") && !path.isAbsolute(relative);
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

function buildP2PSyncReason(baseReason, peerId) {
  const safePeerId = String(peerId || "unknown-peer").trim() || "unknown-peer";
  return `${baseReason}:${safePeerId}`;
}

function isValidSyncRelativePath(relativePath) {
  const normalized = normalizeToPosix(String(relativePath || "").trim());
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    return false;
  }
  return normalized.toLowerCase().endsWith(".md");
}

function addSyncHistoryEntry({ filePath, reason, versionPath, fileHash }) {
  metadataStore.addHistory({
    filePath,
    versionPath: String(versionPath || `p2p://${reason}`),
    fileHash: String(fileHash || hashContent(`${reason}:${filePath}`)),
    reason,
    createdAt: new Date().toISOString()
  });
}

function createVersionSnapshot(filePath, content, tag) {
  const slug = slugify(path.basename(filePath));
  const versionDir = path.join(versionsRoot, slug);
  ensureDir(versionDir);
  const stamp = nowStamp();
  const versionPath = path.join(versionDir, `${stamp}-${slugify(tag || "snapshot")}.md`);
  fs.writeFileSync(versionPath, content, "utf8");
  return versionPath;
}

function isFileBackedVersionPath(versionPath) {
  if (!versionPath || typeof versionPath !== "string") return false;
  try {
    const resolvedVersionPath = path.resolve(versionPath);
    return filePathWithin(versionsRoot, resolvedVersionPath) && path.extname(resolvedVersionPath).toLowerCase() === ".md";
  } catch {
    return false;
  }
}

function pruneVersionHistory(filePath, limit = VERSION_HISTORY_LIMIT) {
  if (!metadataStore || !filePath) return;
  const safeLimit = Math.max(1, Number(limit) || VERSION_HISTORY_LIMIT);
  const fileBackedEntries = metadataStore.getHistory(filePath)
    .filter((entry) => isFileBackedVersionPath(entry.versionPath));

  for (const entry of fileBackedEntries.slice(safeLimit)) {
    const resolvedVersionPath = path.resolve(entry.versionPath);
    try {
      if (fs.existsSync(resolvedVersionPath)) {
        fs.unlinkSync(resolvedVersionPath);
      }
    } catch {
      // History cleanup is best-effort; stale metadata is removed below.
    }
    metadataStore.deleteHistoryVersion(filePath, entry.versionPath);
  }
}

function hasMatchingFileBackedVersion(filePath, fileHash) {
  if (!metadataStore || !filePath || !fileHash) return false;
  return metadataStore.getHistory(filePath).some((entry) => {
    if (entry.fileHash !== fileHash || !isFileBackedVersionPath(entry.versionPath)) return false;
    try {
      return fs.existsSync(path.resolve(entry.versionPath));
    } catch {
      return false;
    }
  });
}

function createSyncConflictCopy(filePath, peerId, incomingContent) {
  const ext = path.extname(filePath) || ".md";
  const baseName = path.basename(filePath, ext);
  const conflictName = `${baseName}.sync-conflict-${slugify(peerId || "peer")}-${nowStamp()}${ext}`;
  const conflictPath = getUniquePath(path.join(path.dirname(filePath), conflictName));
  fs.writeFileSync(conflictPath, incomingContent, "utf8");
  return conflictPath;
}

function tryMergeSection(baseValue, localValue, remoteValue) {
  if (localValue === remoteValue) return localValue;
  if (localValue === baseValue) return remoteValue;
  if (remoteValue === baseValue) return localValue;
  return null;
}

function tryMergeDocumentContent({ filePath, baseContent, localContent, remoteContent }) {
  if (typeof baseContent !== "string") {
    return null;
  }

  const baseDoc = parseDocument(baseContent, filePath);
  const localDoc = parseDocument(localContent, filePath);
  const remoteDoc = parseDocument(remoteContent, filePath);

  const mergedHeader = tryMergeSection(baseDoc.header, localDoc.header, remoteDoc.header);
  const mergedRaw = tryMergeSection(baseDoc.rawNotes, localDoc.rawNotes, remoteDoc.rawNotes);
  const mergedCleansed = tryMergeSection(baseDoc.cleansed, localDoc.cleansed, remoteDoc.cleansed);

  if (mergedHeader === null || mergedRaw === null || mergedCleansed === null) {
    return null;
  }

  return buildDocumentContent({
    header: mergedHeader,
    rawNotes: mergedRaw,
    cleansed: mergedCleansed
  });
}

function buildNoteDelta({ filePath, previousContent, nextContent }) {
  const previousDoc = parseDocument(String(previousContent || ""), filePath);
  const nextDoc = parseDocument(String(nextContent || ""), filePath);
  const delta = {};

  if (previousDoc.header !== nextDoc.header) {
    delta.header = nextDoc.header;
  }
  if (previousDoc.rawNotes !== nextDoc.rawNotes) {
    delta.rawNotes = nextDoc.rawNotes;
  }
  if (previousDoc.cleansed !== nextDoc.cleansed) {
    delta.cleansed = nextDoc.cleansed;
  }

  return delta;
}

function applyNoteDelta({ filePath, baseContent, delta }) {
  const baseDoc = parseDocument(String(baseContent || ""), filePath);
  return buildDocumentContent({
    header: typeof delta?.header === "string" ? delta.header : baseDoc.header,
    rawNotes: typeof delta?.rawNotes === "string" ? delta.rawNotes : baseDoc.rawNotes,
    cleansed: typeof delta?.cleansed === "string" ? delta.cleansed : baseDoc.cleansed
  });
}

async function initiateFullSyncForPeer(peerId) {
  if (!p2pService || !notesRoot) {
    return;
  }

  const targetPeerId = String(peerId || "").trim();
  if (!targetPeerId) {
    return;
  }

  const publishProgress = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("p2p:full-sync-progress", {
        peerId: targetPeerId,
        ...payload
      });
    }
  };

  try {
    const allFiles = walkFiles(notesRoot, { excludeDirs: [".notes-app", "removed", "images"] });
    const mdFiles = allFiles.filter((f) => {
      const lower = f.toLowerCase();
      return lower.endsWith(".md") && !path.basename(f).includes(".sync-conflict-");
    });

    const truncated = mdFiles.length > FULL_SYNC_MAX_FILES;
    const plannedFiles = truncated ? mdFiles.slice(0, FULL_SYNC_MAX_FILES) : mdFiles;
    const totalFiles = plannedFiles.length;
    let queuedFiles = 0;

    publishProgress({
      phase: "starting",
      totalFiles,
      queuedFiles,
      remainingFiles: totalFiles,
      truncated,
      completed: totalFiles === 0,
      failed: false,
      startedAt: new Date().toISOString()
    });

    for (let batchStart = 0; batchStart < plannedFiles.length; batchStart += FULL_SYNC_BATCH_SIZE) {
      const batch = plannedFiles.slice(batchStart, batchStart + FULL_SYNC_BATCH_SIZE);

      for (const filePath of batch) {
        try {
          const content = fs.readFileSync(filePath, "utf8");
          const relativePath = normalizeToPosix(path.relative(notesRoot, filePath));
          if (!isValidSyncRelativePath(relativePath)) {
            continue;
          }

          const queued = p2pService.queueSyncToPeer(targetPeerId, {
            eventId: randomId(10),
            timestamp: new Date().toISOString(),
            docId: relativePath.toLowerCase(),
            op: "update",
            baseHash: null,
            newHash: hashContent(content),
            payload: {
              relativePath,
              content,
              baseContent: null,
              delta: null
            }
          });
          if (!queued) {
            throw new Error("Peer is no longer available for full sync.");
          }

          queuedFiles += 1;
        } catch {
          // Skip unreadable files.
        }
      }

      await p2pService.drainSyncOutbox();

      publishProgress({
        phase: "sending",
        totalFiles,
        queuedFiles,
        remainingFiles: Math.max(0, totalFiles - queuedFiles),
        truncated,
        completed: false,
        failed: false,
        startedAt: null
      });
    }

    publishProgress({
      phase: "completed",
      totalFiles,
      queuedFiles,
      remainingFiles: Math.max(0, totalFiles - queuedFiles),
      truncated,
      completed: true,
      failed: false,
      startedAt: null
    });
  } catch (error) {
    publishProgress({
      phase: "failed",
      totalFiles: 0,
      queuedFiles: 0,
      remainingFiles: 0,
      truncated: false,
      completed: true,
      failed: true,
      error: error?.message || "Full sync failed.",
      startedAt: null
    });
    console.error("[p2p] initiateFullSyncForPeer failed:", error?.message);
  }
}

function emitLocalP2PSyncEvent(event) {
  if (!p2pService) {
    return;
  }

  const resolved = path.resolve(String(event?.filePath || ""));
  if (!filePathWithin(notesRoot, resolved)) {
    return;
  }

  const relativePath = normalizeToPosix(path.relative(notesRoot, resolved));
  if (!isValidSyncRelativePath(relativePath)) {
    return;
  }

  const op = String(event?.op || "").trim();
  if (!["create", "update", "delete"].includes(op)) {
    return;
  }

  p2pService.broadcastSyncEvent({
    eventId: randomId(10),
    timestamp: new Date().toISOString(),
    docId: relativePath.toLowerCase(),
    op,
    baseHash: event?.baseHash || null,
    newHash: event?.newHash || null,
    payload: {
      relativePath,
      content: typeof event?.content === "string" ? event.content : null,
      baseContent: typeof event?.baseContent === "string" ? event.baseContent : null,
      delta: event?.delta && typeof event.delta === "object" ? event.delta : null
    }
  }).catch((error) => {
    console.error("P2P sync broadcast failed:", error?.message || error);
  });
}

function pushSyncApplied(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync:applied", payload);
  }
}

function handleIncomingP2PSyncEvent({ peerId, peerName, event }) {
  try {
    const op = String(event?.op || "").trim();
    const relativePath = normalizeToPosix(String(event?.payload?.relativePath || "").trim());
    if (!["create", "update", "delete"].includes(op) || !isValidSyncRelativePath(relativePath)) {
      return;
    }

    const resolved = path.resolve(notesRoot, relativePath);
    if (!filePathWithin(notesRoot, resolved)) {
      return;
    }

    ensureDir(path.dirname(resolved));
    const baseReason = buildP2PSyncReason("p2p-sync-received", peerId);
    addSyncHistoryEntry({
      filePath: resolved,
      reason: baseReason,
      versionPath: `p2p://${event?.eventId || "unknown"}`,
      fileHash: String(event?.newHash || event?.baseHash || hashContent(baseReason))
    });

    if (op === "delete") {
      if (!fs.existsSync(resolved)) {
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-stale-ignored", peerId),
          versionPath: `p2p://${event?.eventId || "unknown"}`,
          fileHash: String(event?.baseHash || hashContent("delete-stale"))
        });
        return;
      }

      const localContent = fs.readFileSync(resolved, "utf8");
      const localHash = hashContent(localContent);
      if (event?.baseHash && event.baseHash !== localHash) {
        addSyncHistoryEntry({
          filePath: resolved,
          reason: buildP2PSyncReason("p2p-sync-delete-conflict", peerId),
          versionPath: `p2p://${event?.eventId || "unknown"}`,
          fileHash: localHash
        });
        pushSyncApplied({ op: "delete-conflict", relativePath, filePath: resolved, peerName: peerName || peerId });
        return;
      }

      const result = deleteDocumentFile(resolved);
      addSyncHistoryEntry({
        filePath: resolved,
        reason: buildP2PSyncReason("p2p-sync-delete-applied", peerId),
        versionPath: result?.movedPath || `p2p://${event?.eventId || "unknown"}`,
        fileHash: localHash
      });
      pushSyncApplied({ op: "delete", relativePath, filePath: resolved, peerName: peerName || peerId });
      return;
    }

    const incomingDelta = event?.payload?.delta && typeof event.payload.delta === "object"
      ? event.payload.delta
      : null;
    let incomingContent = typeof event?.payload?.content === "string"
      ? event.payload.content
      : null;

    if (!incomingContent && incomingDelta && fs.existsSync(resolved)) {
      const localForDelta = fs.readFileSync(resolved, "utf8");
      incomingContent = applyNoteDelta({
        filePath: resolved,
        baseContent: localForDelta,
        delta: incomingDelta
      });
    }

    if (!incomingContent) {
      return;
    }

    if (!fs.existsSync(resolved)) {
      fs.writeFileSync(resolved, incomingContent, "utf8");
      addSyncHistoryEntry({
        filePath: resolved,
        reason: buildP2PSyncReason("p2p-sync-applied", peerId),
        versionPath: `p2p://${event?.eventId || "unknown"}`,
        fileHash: hashContent(incomingContent)
      });
      pushSyncApplied({ op, relativePath, filePath: resolved, peerName: peerName || peerId });
      return;
    }

    const localContent = fs.readFileSync(resolved, "utf8");
    const localHash = hashContent(localContent);
    if (event?.newHash && localHash === event.newHash) {
      addSyncHistoryEntry({
        filePath: resolved,
        reason: buildP2PSyncReason("p2p-sync-duplicate-ignored", peerId),
        versionPath: `p2p://${event?.eventId || "unknown"}`,
        fileHash: localHash
      });
      return;
    }

    if (event?.baseHash && localHash === event.baseHash) {
      const backupPath = createVersionSnapshot(resolved, localContent, "before-p2p-sync");
      fs.writeFileSync(resolved, incomingContent, "utf8");
      addSyncHistoryEntry({
        filePath: resolved,
        reason: buildP2PSyncReason("p2p-sync-applied", peerId),
        versionPath: backupPath,
        fileHash: localHash
      });
      pushSyncApplied({ op, relativePath, filePath: resolved, peerName: peerName || peerId });
      return;
    }

    const mergedContent = tryMergeDocumentContent({
      filePath: resolved,
      baseContent: event?.payload?.baseContent,
      localContent,
      remoteContent: incomingContent
    });

    if (typeof mergedContent === "string" && mergedContent !== localContent) {
      const backupPath = createVersionSnapshot(resolved, localContent, "before-p2p-merge");
      fs.writeFileSync(resolved, mergedContent, "utf8");
      addSyncHistoryEntry({
        filePath: resolved,
        reason: buildP2PSyncReason("p2p-sync-merged", peerId),
        versionPath: backupPath,
        fileHash: localHash
      });
      pushSyncApplied({ op: "merge", relativePath, filePath: resolved, peerName: peerName || peerId });
      return;
    }

    if (typeof mergedContent === "string" && mergedContent === localContent) {
      addSyncHistoryEntry({
        filePath: resolved,
        reason: buildP2PSyncReason("p2p-sync-duplicate-ignored", peerId),
        versionPath: `p2p://${event?.eventId || "unknown"}`,
        fileHash: localHash
      });
      return;
    }

    const conflictPath = createSyncConflictCopy(resolved, peerId, incomingContent);
    addSyncHistoryEntry({
      filePath: resolved,
      reason: buildP2PSyncReason("p2p-sync-conflict", peerId),
      versionPath: conflictPath,
      fileHash: hashContent(incomingContent)
    });
    pushSyncApplied({ op: "conflict", relativePath, filePath: resolved, peerName: peerName || peerId });
  } catch (error) {
    console.error("P2P sync apply failed:", error?.message || error);
  }
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

function normalizeToPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePathForUrl(relPath) {
  return normalizeToPosix(relPath)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeUrlPath(pathname, prefix) {
  const sliced = pathname.slice(prefix.length).replace(/^\/+/, "");
  return safeDecode(sliced);
}

function getWebPreviewScopeRoot() {
  const activeProject = getActiveProject();
  if (activeProject?.rootPath) {
    return path.resolve(activeProject.rootPath);
  }
  return path.resolve(notesRoot);
}

function getWebPreviewScopeLabel() {
  const activeProject = getActiveProject();
  if (!activeProject) return "Project";
  return activeProject.isRoot ? "Root" : activeProject.name;
}

const WALK_EXCLUDE_DIRS = new Set([
  ".notes-app", ".versions", "node_modules", ".git", ".svn", ".hg",
  "dist", "build", ".artifacts", ".cache", "__pycache__", "removed",
  ".venv", "venv", ".next", ".nuxt", "coverage"
]);

function listMarkdownRelativePaths() {
  const scopeRoot = webPreviewScopeRoot || getWebPreviewScopeRoot();
  return walkFiles(scopeRoot, { excludeDirs: Array.from(WALK_EXCLUDE_DIRS) })
    .filter((item) => path.extname(item).toLowerCase() === ".md")
    .map((item) => normalizeToPosix(path.relative(scopeRoot, item)))
    .sort((a, b) => a.localeCompare(b));
}

function resolveRelativeToNotesRoot(relPath) {
  const scopeRoot = webPreviewScopeRoot || getWebPreviewScopeRoot();
  const normalized = normalizeToPosix(String(relPath || "")).replace(/^\/+/, "");
  const resolved = path.resolve(scopeRoot, normalized);
  if (!filePathWithin(scopeRoot, resolved)) {
    return null;
  }
  // Block access inside excluded directories
  const relNorm = normalizeToPosix(path.relative(scopeRoot, resolved));
  if (relNorm.split("/").some((part) => WALK_EXCLUDE_DIRS.has(part))) {
    return null;
  }
  return {
    normalized,
    resolved
  };
}

function buildWebsiteMarkdownRenderer() {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true
  });

  const headingSlugCounts = new Map();

  markdown.core.ruler.push("notely-heading-ids", (state) => {
    headingSlugCounts.clear();
    for (let i = 0; i < state.tokens.length; i += 1) {
      const token = state.tokens[i];
      if (token.type !== "heading_open") continue;

      const inlineToken = state.tokens[i + 1];
      const headingText = (inlineToken?.content || "").trim().toLowerCase();
      const baseSlug = (headingText
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")) || "section";

      const count = headingSlugCounts.get(baseSlug) || 0;
      headingSlugCounts.set(baseSlug, count + 1);
      const finalSlug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
      token.attrSet("id", finalSlug);
    }
  });

  const defaultLinkOpen = markdown.renderer.rules.link_open
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  const rewriteAssetPath = (rawPath, env) => {
    const fromRelMd = env?.relMdPath || "";
    const normalizedPath = safeDecode(String(rawPath || "").replace(/\\/g, "/"));
    const resolved = normalizedPath.startsWith("/")
      ? path.posix.normalize(normalizedPath.slice(1))
      : path.posix.normalize(path.posix.join(path.posix.dirname(fromRelMd), normalizedPath));
    return `/raw/${encodePathForUrl(resolved)}`;
  };

  markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const hrefIndex = tokens[idx].attrIndex("href");
    if (hrefIndex >= 0) {
      const rawHref = String(tokens[idx].attrs[hrefIndex][1] || "").trim();
      if (rawHref && !/^(https?:|mailto:|tel:|#|javascript:|data:|blob:)/i.test(rawHref)) {
        const [pathAndQuery, hashPart = ""] = rawHref.split("#");
        const [pathPart, queryPart = ""] = pathAndQuery.split("?");
        const normalizedLinkPath = safeDecode(pathPart.replace(/\\/g, "/"));
        const isMarkdownTarget = /\.md$/i.test(normalizedLinkPath);
        const suffix = `${queryPart ? `?${queryPart}` : ""}${hashPart ? `#${hashPart}` : ""}`;

        if (isMarkdownTarget) {
          const fromRelMd = env?.relMdPath || "";
          const resolvedTargetMd = normalizedLinkPath.startsWith("/")
            ? path.posix.normalize(normalizedLinkPath.slice(1))
            : path.posix.normalize(path.posix.join(path.posix.dirname(fromRelMd), normalizedLinkPath));
          tokens[idx].attrs[hrefIndex][1] = `/view/${encodePathForUrl(resolvedTargetMd)}${suffix}`;
        } else if (normalizedLinkPath) {
          tokens[idx].attrs[hrefIndex][1] = `${rewriteAssetPath(normalizedLinkPath, env)}${suffix}`;
        }
      }
    }

    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  const defaultImage = markdown.renderer.rules.image
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
    const srcIndex = tokens[idx].attrIndex("src");
    let annotation = null;
    if (srcIndex >= 0) {
      const src = String(tokens[idx].attrs[srcIndex][1] || "").trim();
      if (src && !/^(https?:|data:|blob:)/i.test(src)) {
        const [pathPart, queryPart = ""] = src.split("?");
        annotation = getImageAnnotationForMarkdownAsset(path.resolve(notesRoot, env?.relMdPath || "__notely__.md"), pathPart);
        const rewritten = rewriteAssetPath(pathPart, env);
        tokens[idx].attrs[srcIndex][1] = queryPart ? `${rewritten}?${queryPart}` : rewritten;
      }
    }

    return renderImageHtmlWithAnnotation(defaultImage(tokens, idx, options, env, self), annotation);
  };

  return markdown;
}

function buildWebsiteHtml({ title, bodyHtml, navigationHtml = "" }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
      :root {
        --font-sans: "Inter", "Segoe UI", system-ui, sans-serif;
        --font-mono: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
        --bg: #f6f8f9;
        --surface: #ffffff;
        --surface2: #f0f4f6;
        --border: #dde5ea;
        --border-strong: #c8d5dc;
        --accent: #0a6b8a;
        --accent-hover: #075a75;
        --accent-soft: #e3f3f8;
        --ink: #0d1f26;
        --ink-2: #2c4a54;
        --ink-3: #4e6a75;
        --ink-4: #7a9aaa;
        --sidebar-w: 272px;
        --toc-w: 220px;
        --radius: 10px;
      }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      html { scroll-behavior: smooth; }

      body {
        font-family: var(--font-sans);
        font-size: 14.5px;
        line-height: 1.7;
        color: var(--ink);
        background: var(--bg);
        min-height: 100vh;
      }

      /* ── Shell ─────────────────────────────────────────────── */
      .shell {
        display: grid;
        grid-template-columns: var(--sidebar-w) 1fr;
        grid-template-rows: 52px 1fr;
        min-height: 100vh;
      }

      /* ── Top bar ───────────────────────────────────────────── */
      .topbar {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 20px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
        position: sticky;
        top: 0;
        z-index: 100;
      }

      .topbar-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: calc(var(--sidebar-w) - 20px);
        text-decoration: none;
        color: inherit;
      }

      .topbar-logo {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        background: linear-gradient(135deg, #0a6b8a 0%, #0d9ec2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: -0.5px;
        flex-shrink: 0;
      }

      .topbar-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--ink);
        white-space: nowrap;
      }

      .topbar-scope {
        font-size: 12px;
        color: var(--ink-4);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .topbar-search {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface2);
        color: var(--ink-3);
        font-size: 13px;
        font-weight: 500;
        text-decoration: none;
        transition: background 0.14s, color 0.14s, border-color 0.14s;
      }

      .topbar-search:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--border-strong); }

      .topbar-search kbd {
        padding: 1px 5px;
        border: 1px solid var(--border-strong);
        border-radius: 4px;
        font-family: var(--font-sans);
        font-size: 11px;
        color: var(--ink-4);
        background: var(--surface);
      }

      .topbar-divider {
        color: var(--border-strong);
      }

      /* ── Left sidebar ──────────────────────────────────────── */
      .nav-sidebar {
        border-right: 1px solid var(--border);
        background: var(--surface);
        padding: 14px 10px;
        overflow-y: auto;
        position: sticky;
        top: 52px;
        height: calc(100vh - 52px);
      }

      .nav-group-label {
        padding: 4px 8px 6px;
        font-size: 11px;
        font-weight: 600;
        color: var(--ink-4);
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }

      .nav-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .nav-list a {
        display: block;
        padding: 7px 8px;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 450;
        color: var(--ink-2);
        text-decoration: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: background 0.14s, color 0.14s;
      }

      .nav-list a:hover { background: var(--surface2); color: var(--ink); }
      .nav-list a.active {
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 600;
      }

      .nav-search-link {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 9px;
        margin-bottom: 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface2);
        font-size: 13px;
        font-weight: 500;
        color: var(--ink-3);
        text-decoration: none;
        transition: background 0.14s, color 0.14s, border-color 0.14s;
      }

      .nav-search-link:hover {
        background: var(--accent-soft);
        color: var(--accent);
        border-color: var(--border-strong);
      }

      .nav-home {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 8px;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-2);
        text-decoration: none;
        margin-bottom: 8px;
        background: var(--surface2);
      }

      .nav-home:hover { background: var(--accent-soft); color: var(--accent); }

      /* ── Content area ──────────────────────────────────────── */
      .content-area {
        display: grid;
        grid-template-columns: 1fr var(--toc-w);
        gap: 0;
        min-width: 0;
        align-items: start;
      }

      .doc-main {
        min-width: 0;
        padding: 28px 28px 48px;
      }

      /* ── Right TOC ─────────────────────────────────────────── */
      .toc-panel {
        padding: 28px 14px 24px 0;
        position: sticky;
        top: 52px;
        max-height: calc(100vh - 52px);
        overflow-y: auto;
      }

      .toc-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--ink-4);
        text-transform: uppercase;
        letter-spacing: 0.07em;
        padding: 0 0 8px 2px;
      }

      .toc-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .toc-list a {
        display: block;
        font-size: 12px;
        color: var(--ink-3);
        text-decoration: none;
        padding: 4px 6px;
        border-radius: 5px;
        border-left: 2px solid transparent;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: color 0.13s, border-color 0.13s, background 0.13s;
      }

      .toc-list a:hover { color: var(--accent); background: var(--accent-soft); }
      .toc-list a.toc-active {
        color: var(--accent);
        border-left-color: var(--accent);
        background: var(--accent-soft);
        font-weight: 500;
      }

      .toc-list li[data-level="3"] a { padding-left: 16px; font-size: 11.5px; }
      .toc-list li[data-level="4"] a { padding-left: 24px; font-size: 11px; }

      /* ── Document card ─────────────────────────────────────── */
      .doc-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: 0 2px 12px rgba(10, 30, 40, 0.07);
        overflow: hidden;
      }

      .doc-hero {
        padding: 24px 28px 18px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(120deg, #f4f9fb 0%, #ffffff 100%);
      }

      .doc-hero h1 {
        font-size: 26px;
        font-weight: 700;
        color: var(--ink);
        line-height: 1.2;
      }

      .doc-breadcrumb {
        margin-top: 6px;
        font-size: 12px;
        color: var(--ink-4);
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .doc-body {
        padding: 24px 28px 28px;
      }

      /* ── Meta block ────────────────────────────────────────── */
      .doc-meta {
        margin-bottom: 20px;
        padding: 12px 16px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface2);
        font-size: 13px;
        color: var(--ink-2);
      }

      .doc-meta p { margin: 0 0 4px; }
      .doc-meta p:last-child { margin: 0; }

      /* ── Section tabs ──────────────────────────────────────── */
      .section-tabs {
        display: flex;
        gap: 2px;
        border-bottom: 2px solid var(--border);
        margin-bottom: 20px;
        padding: 0;
      }

      .tab-btn {
        padding: 8px 16px;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        background: transparent;
        color: var(--ink-3);
        font-family: var(--font-sans);
        font-size: 13.5px;
        font-weight: 500;
        cursor: pointer;
        border-radius: 6px 6px 0 0;
        transition: color 0.15s, border-color 0.15s, background 0.15s;
      }

      .tab-btn:hover { color: var(--ink); background: var(--surface2); }

      .tab-btn.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
        font-weight: 600;
        background: transparent;
      }

      .tab-panel { display: none; }
      .tab-panel.active { display: block; }
      .tab-empty { color: var(--ink-4); font-style: italic; padding: 12px 0; }

      /* ── Markdown content ──────────────────────────────────── */
      .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
        color: var(--ink);
        scroll-margin-top: 72px;
        line-height: 1.3;
        font-weight: 650;
      }

      .prose h1 { font-size: 22px; margin: 28px 0 10px; }
      .prose h2 { font-size: 18px; margin: 24px 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
      .prose h3 { font-size: 15.5px; margin: 20px 0 6px; }
      .prose h4 { font-size: 13.5px; margin: 16px 0 4px; color: var(--ink-2); }
      .prose h1:first-child, .prose h2:first-child, .prose h3:first-child { margin-top: 0; }

      .prose p { margin: 0 0 14px; }
      .prose p:last-child { margin-bottom: 0; }

      .prose ul, .prose ol { margin: 0 0 14px 20px; }
      .prose li { margin: 4px 0; }

      .prose a { color: var(--accent); text-decoration: none; }
      .prose a:hover { text-decoration: underline; }

      .prose code {
        font-family: var(--font-mono);
        font-size: 12.5px;
        background: #eef4f7;
        border: 1px solid #d5e2e8;
        border-radius: 4px;
        padding: 1px 5px;
        color: #0a4a5f;
      }

      .prose pre {
        background: #0d2029;
        color: #d6eaf0;
        border-radius: 8px;
        padding: 16px 18px;
        overflow-x: auto;
        margin: 0 0 16px;
        font-size: 13px;
        line-height: 1.55;
      }

      .prose pre code {
        background: transparent;
        border: 0;
        padding: 0;
        color: inherit;
        font-size: inherit;
      }

      .prose blockquote {
        border-left: 3px solid var(--accent);
        padding-left: 14px;
        margin: 14px 0;
        color: var(--ink-2);
        font-style: italic;
      }

      .prose img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        display: block;
        margin: 12px 0;
        border: 1px solid var(--border);
      }

      .notely-image-frame {
        position: relative;
        display: inline-block;
        max-width: 100%;
        vertical-align: top;
      }

      .notely-image-frame img {
        margin: 12px 0;
      }

      .notely-image-annotation {
        position: absolute;
        z-index: 2;
        max-width: min(60%, 420px);
        padding: 6px 9px;
        border-radius: 4px;
        background: rgba(10, 23, 27, 0.72);
        color: #ffffff;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .notely-image-annotation { left: 10px; top: 22px; }

      .prose table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 16px;
        font-size: 13.5px;
      }

      .prose th {
        background: var(--surface2);
        font-weight: 600;
        border: 1px solid var(--border);
        padding: 8px 12px;
        text-align: left;
      }

      .prose td {
        border: 1px solid var(--border);
        padding: 7px 12px;
      }

      .prose tr:nth-child(even) td { background: #fafcfd; }

      .prose hr {
        border: 0;
        border-top: 1px solid var(--border);
        margin: 24px 0;
      }

      /* ── Home page cards ───────────────────────────────────── */
      .home-hero {
        margin-bottom: 24px;
      }

      .home-hero h1 {
        font-size: 28px;
        font-weight: 700;
        color: var(--ink);
        margin-bottom: 6px;
      }

      .home-hero p { color: var(--ink-3); }

      .note-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .note-card {
        display: block;
        text-decoration: none;
        padding: 14px 16px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--ink);
        transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
      }

      .note-card:hover {
        border-color: var(--accent);
        box-shadow: 0 4px 16px rgba(10, 107, 138, 0.12);
        transform: translateY(-1px);
      }

      .note-card-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--ink);
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .note-card-path {
        font-size: 11px;
        color: var(--ink-4);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ── Responsive ────────────────────────────────────────── */
      @media (max-width: 1100px) {
        :root { --toc-w: 0px; }
        .toc-panel { display: none; }
        .content-area { grid-template-columns: 1fr; }
      }

      @media (max-width: 760px) {
        :root { --sidebar-w: 0px; }
        .nav-sidebar { display: none; }
        .shell { grid-template-columns: 1fr; }
        .doc-main { padding: 16px; }
        .doc-hero, .doc-body { padding: 16px; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <a href="/" class="topbar-brand">
          <span class="topbar-logo">N</span>
          <span class="topbar-title">Notely</span>
        </a>
        <span class="topbar-divider">/</span>
        <span class="topbar-scope">${escapeHtml(webPreviewScopeLabel)}</span>
        <a href="/search" class="topbar-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Search
          <kbd>Ctrl+K</kbd>
        </a>
      </header>

      <nav class="nav-sidebar" aria-label="Notes navigation">
        <a href="/" class="nav-home">&#8962; All Notes</a>
        <p class="nav-group-label">In This Project</p>
        ${navigationHtml}
      </nav>

      <div class="content-area">
        <main class="doc-main">
          <div class="doc-card">
            ${bodyHtml}
          </div>
        </main>
        <aside class="toc-panel" id="toc-panel" aria-label="On this page">
          <p class="toc-label">On This Page</p>
          <ul class="toc-list" id="toc-list"></ul>
        </aside>
      </div>
    </div>

    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base",
        themeVariables: { primaryColor: "#e6f3f8", primaryBorderColor: "#0a6b8a", primaryTextColor: "#0d1f26", lineColor: "#4e6a75" }
      });
      const blocks = Array.from(document.querySelectorAll("pre code.language-mermaid"));
      for (const block of blocks) {
        const source = block.textContent || "";
        const container = document.createElement("div");
        container.className = "mermaid";
        container.textContent = source;
        block.parentElement.replaceWith(container);
      }
      await mermaid.run({ querySelector: ".mermaid" });

      // ── Ctrl/Cmd+K → search ───────────────────────────────
      document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          const si = document.getElementById("search-input");
          if (si) si.focus();
          else location.href = "/search";
        }
      });

      // ── Section tabs ──────────────────────────────────────
      const tabGroups = Array.from(document.querySelectorAll("[data-tabs]"));
      for (const group of tabGroups) {
        const buttons = Array.from(group.querySelectorAll("[data-tab-target]"));
        const panels = Array.from(group.querySelectorAll("[data-tab-panel]"));
        const activate = (target) => {
          buttons.forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab-target") === target));
          panels.forEach((p) => p.classList.toggle("active", p.getAttribute("data-tab-panel") === target));
          buildToc();
        };
        buttons.forEach((b) => b.addEventListener("click", () => activate(b.getAttribute("data-tab-target"))));
        // honour URL hash for tab
        const hash = location.hash.slice(1);
        const hashMatch = buttons.find((b) => b.getAttribute("data-tab-target") === hash);
        if (hashMatch) activate(hash);
      }

      // ── Heading TOC ───────────────────────────────────────
      function buildToc() {
        const tocList = document.getElementById("toc-list");
        if (!tocList) return;
        const panel = document.querySelector(".tab-panel.active") || document.querySelector(".doc-body") || document.body;
        const headings = Array.from(panel.querySelectorAll("h1, h2, h3, h4"));
        tocList.innerHTML = "";
        if (headings.length < 2) {
          document.getElementById("toc-panel").style.visibility = "hidden";
          return;
        }
        document.getElementById("toc-panel").style.visibility = "visible";
        headings.forEach((h) => {
          if (!h.id) {
            h.id = (h.textContent || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
          }
          const li = document.createElement("li");
          li.setAttribute("data-level", h.tagName[1]);
          const a = document.createElement("a");
          a.href = "#" + h.id;
          a.textContent = h.textContent;
          li.appendChild(a);
          tocList.appendChild(li);
        });
      }

      buildToc();

      // ── Active TOC highlight on scroll ───────────────────
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.id;
          document.querySelectorAll("#toc-list a").forEach((a) => {
            a.classList.toggle("toc-active", a.getAttribute("href") === "#" + id);
          });
        }
      }, { rootMargin: "-20% 0px -75% 0px" });

      document.querySelectorAll("h1[id], h2[id], h3[id], h4[id]").forEach((h) => observer.observe(h));
    </script>
  </body>
</html>`;
}

function buildNavigationHtml(activeRelPath = "") {
  const docs = listMarkdownRelativePaths();
  const links = docs.map((docPath) => {
    const href = `/view/${encodePathForUrl(docPath)}`;
    const title = path.basename(docPath, ".md");
    const activeClass = docPath === activeRelPath ? " class=\"active\"" : "";
    return `<li><a${activeClass} href="${href}" title="${escapeHtml(docPath)}">${escapeHtml(title)}</a></li>`;
  }).join("");

  return `<a href="/search" class="nav-search-link">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      Search notes
    </a>
    <ul class="nav-list">${links}</ul>`;
}

function renderRootWebsitePage() {
  const docs = listMarkdownRelativePaths();
  const cards = docs
    .map((docPath) => {
      const title = path.basename(docPath, ".md");
      const href = `/view/${encodePathForUrl(docPath)}`;
      return `<a href="${href}" class="note-card"><div class="note-card-title">${escapeHtml(title)}</div><div class="note-card-path">${escapeHtml(docPath)}</div></a>`;
    })
    .join("");

  const body = `
    <div class="doc-hero">
      <div class="home-hero">
        <h1>${escapeHtml(webPreviewScopeLabel)}</h1>
        <p>${docs.length} note${docs.length !== 1 ? "s" : ""} in this project</p>
      </div>
    </div>
    <div class="doc-body">
      ${docs.length ? `<div class="note-grid">${cards}</div>` : "<p class=\"tab-empty\">No markdown files were found in this project folder.</p>"}
    </div>`;

  return buildWebsiteHtml({
    title: `${webPreviewScopeLabel} \u2014 Notely`,
    bodyHtml: body,
    navigationHtml: buildNavigationHtml("")
  });
}

function renderMarkdownWebsitePage(relMdPath, rawContent, options = {}) {
  const markdown = buildWebsiteMarkdownRenderer();
  const parsed = parseDocument(rawContent, relMdPath);
  const hasTabbedSections = parsed.hasRawNotes || parsed.hasCleansed;
  const requestedSection = options.section === "raw" ? "raw" : "cleansed";

  let activeSection = requestedSection;
  if (activeSection === "cleansed" && !parsed.hasCleansed && parsed.hasRawNotes) {
    activeSection = "raw";
  } else if (activeSection === "raw" && !parsed.hasRawNotes && parsed.hasCleansed) {
    activeSection = "cleansed";
  }

  let bodyHtml = `<div class="doc-hero"><h1>${escapeHtml(parsed.title || path.basename(relMdPath, ".md"))}</h1><p class="doc-breadcrumb">${escapeHtml(relMdPath)}</p></div><div class="doc-body prose">${markdown.render(rawContent, { relMdPath })}</div>`;
  if (hasTabbedSections) {
    const headerHtml = parsed.header
      ? `<section class="doc-meta prose">${markdown.render(parsed.header, { relMdPath })}</section>`
      : "";
    const rawHtml = parsed.rawNotes
      ? markdown.render(parsed.rawNotes, { relMdPath })
      : `<p class="tab-empty">No raw notes captured yet.</p>`;
    const cleansedHtml = parsed.cleansed
      ? markdown.render(parsed.cleansed, { relMdPath })
      : `<p class="tab-empty">No cleansed notes captured yet.</p>`;

    bodyHtml = `
      <div class="doc-hero">
        <h1>${escapeHtml(parsed.title || path.basename(relMdPath, ".md"))}</h1>
        <p class="doc-breadcrumb"><span>&#8962; Home</span> <span>/</span> <span>${escapeHtml(relMdPath)}</span></p>
      </div>
      <div class="doc-body">
        ${headerHtml}
        <section data-tabs>
          <div class="section-tabs" role="tablist" aria-label="Note sections">
            <button class="tab-btn${activeSection === "cleansed" ? " active" : ""}" type="button" role="tab" data-tab-target="cleansed">Cleansed</button>
            <button class="tab-btn${activeSection === "raw" ? " active" : ""}" type="button" role="tab" data-tab-target="raw">Raw Notes</button>
          </div>
          <section class="tab-panel prose${activeSection === "cleansed" ? " active" : ""}" data-tab-panel="cleansed">
            ${cleansedHtml}
          </section>
          <section class="tab-panel prose${activeSection === "raw" ? " active" : ""}" data-tab-panel="raw">
            ${rawHtml}
          </section>
        </section>
      </div>
    `;
  }

  return buildWebsiteHtml({
    title: path.basename(relMdPath, ".md"),
    bodyHtml,
    navigationHtml: buildNavigationHtml(relMdPath)
  });
}

function renderPdfNotePage(relMdPath, markdownContent, options = {}) {
  const markdown = buildWebsiteMarkdownRenderer();
  const parsed = parseDocument(markdownContent || "", relMdPath);
  const hasStructuredSections = parsed.hasRawNotes || parsed.hasCleansed;
  const section = options.section === "raw" ? "raw" : "cleansed";

  let contentToRender = markdownContent || "";
  if (hasStructuredSections) {
    contentToRender = section === "raw" ? parsed.rawNotes : parsed.cleansed;
  }

  const title = path.basename(relMdPath, ".md") || "Note";
  const emptyMessage = section === "raw"
    ? "No raw notes captured yet."
    : "No cleansed notes captured yet.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
      :root {
        --font-sans: "Inter", "Segoe UI", system-ui, sans-serif;
        --font-mono: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
        --bg: #ffffff;
        --surface: #ffffff;
        --surface2: #f5f8fa;
        --border: #d7e0e6;
        --ink: #0d1f26;
        --ink-2: #334a53;
        --ink-3: #5b717a;
        --accent: #0a6b8a;
        --radius: 12px;
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink); }
      body { font-family: var(--font-sans); line-height: 1.7; }

      .page {
        padding: 0;
        margin: 0;
      }

      .content {
        max-width: 860px;
        margin: 0 auto;
        padding: 18mm 16mm 20mm;
        font-size: 14.5px;
      }

      .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
        line-height: 1.3;
        color: var(--ink);
        scroll-margin-top: 72px;
      }

      .content h1 { font-size: 22px; margin: 28px 0 10px; }
      .content h2 { font-size: 18px; margin: 22px 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
      .content h3 { font-size: 15.5px; margin: 18px 0 6px; }
      .content h4 { font-size: 13.5px; margin: 14px 0 4px; color: var(--ink-2); }
      .content p { margin: 0 0 14px; }
      .content ul, .content ol { margin: 0 0 14px 20px; }
      .content li { margin: 4px 0; }
      .content a { color: var(--accent); text-decoration: none; }
      .content a:hover { text-decoration: underline; }
      .content code { font-family: var(--font-mono); font-size: 12.5px; background: #eef4f7; border: 1px solid #d5e2e8; border-radius: 4px; padding: 1px 5px; color: #0a4a5f; }
      .content pre { background: #0d2029; color: #d6eaf0; border-radius: 8px; padding: 16px 18px; overflow-x: auto; margin: 0 0 16px; font-size: 13px; line-height: 1.55; }
      .content pre code { background: transparent; border: 0; padding: 0; color: inherit; font-size: inherit; }
      .content blockquote { border-left: 3px solid var(--accent); padding-left: 14px; margin: 14px 0; color: var(--ink-2); font-style: italic; }
      .content img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 12px 0; border: 1px solid var(--border); }
      .notely-image-frame { position: relative; display: inline-block; max-width: 100%; vertical-align: top; }
      .notely-image-frame img { margin: 12px 0; }
      .notely-image-annotation { position: absolute; z-index: 2; max-width: min(60%, 420px); padding: 6px 9px; border-radius: 4px; background: rgba(10, 23, 27, 0.72); color: #ffffff; font-size: 12px; font-weight: 700; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .notely-image-annotation { left: 10px; top: 22px; }
      .content table { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 13.5px; }
      .content th { background: var(--surface2); font-weight: 600; border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
      .content td { border: 1px solid var(--border); padding: 7px 12px; }
      .content tr:nth-child(even) td { background: #fafcfd; }
      .content hr { border: 0; border-top: 1px solid var(--border); margin: 24px 0; }
      .empty { color: var(--ink-3); font-style: italic; }

      @page { margin: 18mm 16mm; }
      @media print {
        .page { padding: 0; max-width: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <article class="content">
        ${contentToRender ? markdown.render(contentToRender, { relMdPath }) : `<p class="empty">${emptyMessage}</p>`}
      </article>
    </main>
  </body>
</html>`;
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".pdf": "application/pdf"
  };
  return map[ext] || "application/octet-stream";
}

function writeHtmlResponse(res, html, statusCode = 200) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function writeTextResponse(res, text, statusCode = 400) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function buildSearchIndex() {
  const scopeRoot = webPreviewScopeRoot || getWebPreviewScopeRoot();
  return listMarkdownRelativePaths().map((relMdPath) => {
    try {
      const resolved = path.resolve(scopeRoot, relMdPath);
      const raw = fs.readFileSync(resolved, "utf8");
      const parsed = parseDocument(raw, resolved);
      const text = [parsed.header || "", parsed.rawNotes || "", parsed.cleansed || ""]
        .join(" ").replace(/[#*_`>[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
      return { path: relMdPath, title: parsed.title || path.basename(relMdPath, ".md"), text };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function renderSearchPage() {
  const bodyHtml = `
    <div class="doc-hero">
      <h1>Search</h1>
      <p class="doc-breadcrumb">Full-text search across all notes in this project</p>
    </div>
    <div class="doc-body">
      <div class="search-box-wrap">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search-input" type="search" class="search-input" placeholder="Type to search notes\u2026" autofocus spellcheck="false" />
      </div>
      <div id="search-status" class="search-status"></div>
      <div id="search-results" class="search-results" aria-live="polite"></div>
    </div>`;

  // Build script as a plain string to avoid backtick/regex escaping conflicts
  const scriptContent = [
    "const resp = await fetch('/search-index.json');",
    "const index = await resp.json();",
    "const input = document.getElementById('search-input');",
    "const results = document.getElementById('search-results');",
    "const status = document.getElementById('search-status');",
    "document.addEventListener('keydown', function(e) {",
    "  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.focus(); }",
    "});",
    "function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }",
    "function escRe(s) { return s.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'); }",
    "function highlight(text, tokens) {",
    "  var out = esc(text);",
    "  for (var i = 0; i < tokens.length; i++) {",
    "    var re = new RegExp(escRe(tokens[i]), 'gi');",
    "    out = out.replace(re, function(m) { return '<mark>' + m + '</mark>'; });",
    "  }",
    "  return out;",
    "}",
    "function search(query) {",
    "  var q = query.trim().toLowerCase();",
    "  if (!q) { results.innerHTML = ''; status.textContent = ''; return; }",
    "  var tokens = q.split(/\\s+/).filter(Boolean);",
    "  var hits = index.map(function(doc) {",
    "    var haystack = (doc.title + ' ' + doc.text).toLowerCase();",
    "    var score = tokens.reduce(function(acc, t) {",
    "      var cnt = (haystack.match(new RegExp(escRe(t), 'g')) || []).length;",
    "      return acc + (doc.title.toLowerCase().indexOf(t) >= 0 ? cnt * 5 : cnt);",
    "    }, 0);",
    "    return Object.assign({}, doc, { score: score });",
    "  }).filter(function(d) { return d.score > 0; })",
    "   .sort(function(a, b) { return b.score - a.score; })",
    "   .slice(0, 25);",
    "  status.textContent = hits.length ? hits.length + ' result' + (hits.length !== 1 ? 's' : '') : '';",
    "  if (!hits.length) {",
    "    results.innerHTML = '<p class=\"search-empty\">No notes matched <strong>' + esc(query) + '</strong>.</p>';",
    "    return;",
    "  }",
    "  results.innerHTML = hits.map(function(doc) {",
    "    var lc = doc.text.toLowerCase();",
    "    var pos = tokens.reduce(function(best, t) { var i = lc.indexOf(t); return i >= 0 && (best < 0 || i < best) ? i : best; }, -1);",
    "    var start = Math.max(0, (pos >= 0 ? pos : 0) - 60);",
    "    var snippet = doc.text.slice(start, start + 220);",
    "    var href = '/view/' + encodeURIComponent(doc.path).replace(/%2F/gi, '/');",
    "    return '<a href=\"' + href + '\" class=\"search-hit\">'",
    "      + '<div class=\"search-hit-title\">' + highlight(doc.title, tokens) + '</div>'",
    "      + '<div class=\"search-hit-path\">' + esc(doc.path) + '</div>'",
    "      + '<div class=\"search-hit-snippet\">\u2026' + highlight(snippet, tokens) + '\u2026</div>'",
    "      + '</a>';",
    "  }).join('');",
    "}",
    "var timer;",
    "input.addEventListener('input', function(e) { clearTimeout(timer); timer = setTimeout(function() { search(e.target.value); }, 120); });"
  ].join("\n");

  const style = `<style>
      .search-box-wrap { position: relative; margin-bottom: 16px; display: flex; align-items: center; }
      .search-icon { position: absolute; left: 14px; color: var(--ink-4); pointer-events: none; }
      .search-input {
        width: 100%; min-height: 46px; padding: 0 16px 0 42px;
        border: 1.5px solid var(--border-strong); border-radius: 12px;
        font-family: var(--font-sans); font-size: 15px; color: var(--ink);
        background: var(--surface); outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
      .search-status { font-size: 12px; color: var(--ink-4); margin-bottom: 10px; min-height: 18px; }
      .search-results { display: flex; flex-direction: column; gap: 8px; }
      .search-hit {
        display: block; text-decoration: none; padding: 14px 16px;
        border: 1px solid var(--border); border-radius: var(--radius);
        background: var(--surface); color: var(--ink);
        transition: border-color 0.15s, box-shadow 0.15s, transform 0.12s;
      }
      .search-hit:hover { border-color: var(--accent); box-shadow: 0 4px 14px rgba(10,107,138,0.12); transform: translateY(-1px); }
      .search-hit-title { font-size: 14.5px; font-weight: 600; color: var(--ink); margin-bottom: 2px; }
      .search-hit-path { font-size: 11px; color: var(--ink-4); margin-bottom: 6px; font-family: var(--font-mono); }
      .search-hit-snippet { font-size: 13px; color: var(--ink-3); line-height: 1.55; }
      mark { background: #fff176; color: var(--ink); border-radius: 2px; padding: 0 1px; }
      .search-empty { color: var(--ink-3); font-style: italic; padding: 12px 0; }
    </style>`;

  const injection = style + "\n    <script type=\"module\">\n" + scriptContent + "\n    </script>";

  return buildWebsiteHtml({
    title: "Search \u2014 Notely",
    bodyHtml,
    navigationHtml: buildNavigationHtml("")
  }).replace("</body>", injection + "\n  </body>");
}

function handleWebPreviewRequest(req, res) {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname || "/";

  if (pathname === "/" || pathname === "/index.html") {
    const noteQuery = requestUrl.searchParams.get("note");
    if (noteQuery) {
      const redirectPath = `/view/${encodePathForUrl(noteQuery)}`;
      res.writeHead(302, { Location: redirectPath });
      res.end();
      return;
    }

    writeHtmlResponse(res, renderRootWebsitePage());
    return;
  }

  if (pathname === "/search") {
    writeHtmlResponse(res, renderSearchPage());
    return;
  }

  if (pathname === "/search-index.json") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(buildSearchIndex()));
    return;
  }

  if (pathname.startsWith("/view/")) {
    const relMdPath = normalizeToPosix(decodeUrlPath(pathname, "/view/"));
    const section = requestUrl.searchParams.get("section") === "raw" ? "raw" : "cleansed";
    const resolved = resolveRelativeToNotesRoot(relMdPath);
    if (!resolved || path.extname(resolved.resolved).toLowerCase() !== ".md" || !fs.existsSync(resolved.resolved)) {
      writeTextResponse(res, "Note not found.", 404);
      return;
    }

    const rawContent = webPreviewContentOverrides.get(resolved.resolved)
      || fs.readFileSync(resolved.resolved, "utf8");
    writeHtmlResponse(res, renderMarkdownWebsitePage(resolved.normalized, rawContent, { section }));
    return;
  }

  if (pathname.startsWith("/pdf/")) {
    const relMdPath = normalizeToPosix(decodeUrlPath(pathname, "/pdf/"));
    const resolved = resolveRelativeToNotesRoot(relMdPath);
    const section = requestUrl.searchParams.get("section") === "raw" ? "raw" : "cleansed";
    if (!resolved || path.extname(resolved.resolved).toLowerCase() !== ".md" || !fs.existsSync(resolved.resolved)) {
      writeTextResponse(res, "Note not found.", 404);
      return;
    }

    const markdownContent = webPreviewContentOverrides.get(resolved.resolved)
      || fs.readFileSync(resolved.resolved, "utf8");
    writeHtmlResponse(res, renderPdfNotePage(resolved.normalized, markdownContent, { section }));
    return;
  }

  if (pathname.startsWith("/raw/")) {
    const relPath = normalizeToPosix(decodeUrlPath(pathname, "/raw/"));
    const resolved = resolveRelativeToNotesRoot(relPath);
    if (!resolved || !fs.existsSync(resolved.resolved) || fs.statSync(resolved.resolved).isDirectory()) {
      writeTextResponse(res, "Asset not found.", 404);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypeForFile(resolved.resolved),
      "Cache-Control": "no-store"
    });
    fs.createReadStream(resolved.resolved).pipe(res);
    return;
  }

  writeTextResponse(res, "Not found.", 404);
}

async function ensureWebPreviewServer() {
  if (webPreviewServer && webPreviewPort) {
    return `http://127.0.0.1:${webPreviewPort}`;
  }

  await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        handleWebPreviewRequest(req, res);
      } catch {
        writeTextResponse(res, "Unable to render website preview.", 500);
      }
    });

    server.once("error", (error) => {
      reject(error);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to determine web preview port."));
        return;
      }
      webPreviewServer = server;
      webPreviewPort = address.port;
      resolve();
    });
  });

  return `http://127.0.0.1:${webPreviewPort}`;
}

function tryOpenInChrome(targetUrl) {

  if (process.platform !== "win32") {
    return false;
  }

  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
  ].filter(Boolean);

  for (const chromePath of candidates) {
    if (!chromePath || !fs.existsSync(chromePath)) {
      continue;
    }

    try {
      const child = spawn(chromePath, ["--new-window", targetUrl], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return true;
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

function buildPdfExportMarkdown(document, options = {}) {
  const includeRawNotes = Boolean(options.includeRawNotes);
  const includeCleansed = Boolean(options.includeCleansed);
  const title = String(document?.title || path.basename(document?.filePath || "note", ".md") || "Note").trim() || "Note";

  const sections = [];
  if (includeRawNotes) {
    sections.push([
      "## Raw Notes",
      (document?.rawNotes || "").trim() || "_No raw notes captured yet._"
    ].join("\n\n"));
  }

  if (includeCleansed) {
    sections.push([
      "## Formal Notes",
      (document?.cleansed || "").trim() || "_No formal notes captured yet._"
    ].join("\n\n"));
  }

  return [
    `# ${title}`,
    "",
    sections.join("\n\n")
  ].filter(Boolean).join("\n");
}

function buildPdfExportHtml({ title, markdownContent, baseHref, sourceDir, downsampleImages = false, pdfQualityPreset = "full" }) {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true
  });

  const defaultImage = markdown.renderer.rules.image
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
    const srcIndex = tokens[idx].attrIndex("src");
    let annotation = null;
    if (srcIndex >= 0) {
      const rawSrc = String(tokens[idx].attrs[srcIndex][1] || "").trim();
      if (rawSrc && !/^(https?:|data:|blob:)/i.test(rawSrc)) {
        const pathPart = rawSrc.split(/[?#]/)[0];
        annotation = getImageAnnotationForMarkdownAsset(path.join(sourceDir || notesRoot, "__notely_export__.md"), pathPart);

        if (downsampleImages && !/^file:/i.test(rawSrc)) {
          const normalizedSrc = safeDecode(pathPart.replace(/\\/g, "/"));
          const resolvedImagePath = path.isAbsolute(normalizedSrc)
            ? path.resolve(notesRoot, normalizedSrc.replace(/^[/\\]+/, ""))
            : path.resolve(sourceDir || notesRoot, normalizedSrc);

          if (filePathWithin(notesRoot, resolvedImagePath) && fs.existsSync(resolvedImagePath) && isRasterImagePath(resolvedImagePath)) {
            const thumbnailPath = ensureImageThumbnail(resolvedImagePath);
            if (thumbnailPath) {
              tokens[idx].attrs[srcIndex][1] = pathToFileURL(thumbnailPath).href;
            }
          }
        }
      }
    }

    return renderImageHtmlWithAnnotation(defaultImage(tokens, idx, options, env, self), annotation);
  };

  const bodyHtml = markdown.render(markdownContent || "");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="${baseHref}" />
    <title>${escapeHtml(title)}</title>
    <style>
  ${buildPdfStyles({ compact: pdfQualityPreset === "compact" })}
    </style>
  </head>
  <body>
    <main class="markdown-body">
      ${bodyHtml}
    </main>
  </body>
</html>`;
}

function buildPdfStyles({ compact = false } = {}) {
  const bodyFontSize = compact ? "13px" : "14px";
  const bodyLineHeight = compact ? "1.55" : "1.65";
  const paragraphMargin = compact ? "10px" : "14px";
  const h1Size = compact ? "22px" : "24px";
  const h2Size = compact ? "16px" : "17px";

  return `
    :root {
      color-scheme: light;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", "Inter", Arial, sans-serif;
      color: #0d1f26;
      background: #ffffff;
      line-height: ${bodyLineHeight};
      font-size: ${bodyFontSize};
    }

    .markdown-body {
      max-width: 100%;
    }

    h1 {
      font-size: ${h1Size};
      line-height: 1.2;
      margin: 0 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d7e0e6;
    }

    h2 {
      font-size: ${h2Size};
      line-height: 1.3;
      margin: 24px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #d7e0e6;
    }

    h3, h4, h5, h6 {
      line-height: 1.3;
      margin: 18px 0 8px;
    }

    p, ul, ol, blockquote, pre, table {
      margin: 0 0 ${paragraphMargin};
    }

    ul, ol {
      padding-left: 22px;
    }

    code {
      font-family: Consolas, "Cascadia Code", monospace;
      font-size: 12.5px;
      background: #eef4f7;
      border: 1px solid #d5e2e8;
      border-radius: 4px;
      padding: 1px 4px;
    }

    pre {
      background: #0d2029;
      color: #d6eaf0;
      border-radius: 8px;
      padding: 14px 16px;
      overflow-x: auto;
    }

    pre code {
      background: transparent;
      border: 0;
      padding: 0;
      color: inherit;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      border: 1px solid #d7e0e6;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #f5f8fa;
      font-weight: 600;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    .notely-image-frame {
      position: relative;
      display: inline-block;
      max-width: 100%;
      vertical-align: top;
    }

    .notely-image-annotation {
      position: absolute;
      z-index: 2;
      max-width: min(60%, 420px);
      padding: 6px 9px;
      border-radius: 4px;
      background: rgba(10, 23, 27, 0.72);
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .notely-image-annotation { left: 10px; top: 10px; }
  `;
}

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

async function prepareDocumentPreview(filePath, content) {
  const resolved = path.resolve(String(filePath || ""));
  const isValidMarkdownPath =
    filePathWithin(notesRoot, resolved)
    && path.extname(resolved).toLowerCase() === ".md"
    && fs.existsSync(resolved)
    && filePathWithin(getWebPreviewScopeRoot(), resolved);

  if (!isValidMarkdownPath) {
    throw new Error("Invalid document path.");
  }

  if (typeof content === "string") {
    webPreviewContentOverrides.set(resolved, content);
  } else if (content && typeof content === "object") {
    const header = typeof content.header === "string" ? content.header.trim() : "";
    const rawNotes = typeof content.rawNotes === "string" ? content.rawNotes.trim() : "";
    const cleansed = typeof content.cleansed === "string" ? content.cleansed.trim() : "";
    const overrideContent = [
      header,
      "# RawNotes",
      rawNotes,
      "# Cleansed",
      cleansed
    ].join("\n\n").trim();

    webPreviewContentOverrides.set(resolved, overrideContent);
  }

  webPreviewScopeRoot = getWebPreviewScopeRoot();
  webPreviewScopeLabel = getWebPreviewScopeLabel();

  const baseUrl = await ensureWebPreviewServer();
  return {
    resolved,
    previewUrl: `${baseUrl}/view/${encodePathForUrl(normalizeToPosix(path.relative(webPreviewScopeRoot, resolved)))}?section=cleansed`
  };
}

let metadataStore;

function sendMenuAction(win, action) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("app-menu:action", action);
}

function buildAppMenu(win, context = {}) {
  const screen = context?.screen === "document" ? "document" : "landing";
  const viewMode = context?.viewMode === "table" ? "table" : "tile";
  const dirty = Boolean(context?.dirty);

  const fileSubmenu = screen === "document"
    ? [
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction(win, "new-note")
        },
        {
          label: "Notes Folder",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendMenuAction(win, "open-notes-folder-settings")
        },
        { type: "separator" },
        {
          label: dirty ? "Save*" : "Save",
          accelerator: "CmdOrCtrl+S",
          enabled: dirty,
          click: () => sendMenuAction(win, "save-document")
        },
        {
          label: "Export PDF",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => sendMenuAction(win, "export-pdf")
        },
        {
          label: "Versions",
          accelerator: "CmdOrCtrl+Shift+H",
          click: () => sendMenuAction(win, "manage-versions")
        },
        {
          label: "Workspace Activity",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => sendMenuAction(win, "open-workspace-activity")
        },
        { type: "separator" },
        {
          label: "Open",
          submenu: [
            {
              label: "Open in VS Code",
              accelerator: "CmdOrCtrl+Shift+O",
              click: () => sendMenuAction(win, "open-in-editor")
            },
            {
              label: "Open Website View",
              accelerator: "CmdOrCtrl+Shift+W",
              click: () => sendMenuAction(win, "open-website")
            }
          ]
        },
        { type: "separator" },
        {
          label: "Rename Note",
          accelerator: "F2",
          click: () => sendMenuAction(win, "rename-note")
        },
        {
          label: "Reload from Disk",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => sendMenuAction(win, "reload-document")
        },
        {
          label: "Move Note to Removed",
          accelerator: "CmdOrCtrl+Delete",
          click: () => sendMenuAction(win, "remove-document")
        },
        { type: "separator" },
        {
          label: "Back to Notes",
          accelerator: "Esc",
          click: () => sendMenuAction(win, "back-to-notes")
        },
        { type: "separator" },
        { role: "quit" }
      ]
    : [
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction(win, "new-note")
        },
        {
          label: "Notes Folder",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendMenuAction(win, "open-notes-folder-settings")
        },
        { type: "separator" },
        {
          label: "Open Website View",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => sendMenuAction(win, "open-website")
        },
        {
          label: "Workspace Activity",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => sendMenuAction(win, "open-workspace-activity")
        },
        { type: "separator" },
        { role: "quit" }
      ];

  const editSubmenu = [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "selectAll" },
    ...(screen === "document"
      ? [
          { type: "separator" },
          {
            label: "Find or Replace",
            accelerator: "CmdOrCtrl+F",
            click: () => sendMenuAction(win, "find-replace")
          },
          {
            label: "Toggle Outline",
            accelerator: "CmdOrCtrl+Shift+L",
            click: () => sendMenuAction(win, "toggle-outline")
          },
          {
            label: "Toggle Split Preview",
            accelerator: "CmdOrCtrl+\\",
            click: () => sendMenuAction(win, "toggle-split-preview")
          },
          {
            label: "Toggle Focus Mode",
            accelerator: "CmdOrCtrl+Shift+F",
            click: () => sendMenuAction(win, "toggle-focus-mode")
          }
        ]
      : [])
  ];

  const viewSubmenu = screen === "document"
    ? [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" }
      ]
    : [
        {
          label: "Tile Notes",
          accelerator: "CmdOrCtrl+1",
          type: "radio",
          checked: viewMode === "tile",
          click: () => sendMenuAction(win, "view-tile")
        },
        {
          label: "Table Notes",
          accelerator: "CmdOrCtrl+2",
          type: "radio",
          checked: viewMode === "table",
          click: () => sendMenuAction(win, "view-table")
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" }
      ];

  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: fileSubmenu
    },
    {
      label: "Edit",
      submenu: editSubmenu
    },
    {
      label: "View",
      submenu: viewSubmenu
    },
    {
      label: "P2P",
      submenu: [
        {
          label: "P2P Status",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => sendMenuAction(win, "open-p2p-status")
        },
        { type: "separator" },
        {
          label: "Run Sync Self-Test",
          click: () => sendMenuAction(win, "run-p2p-sync-self-test")
        },
        {
          label: "Conflict Center",
          click: () => sendMenuAction(win, "open-p2p-conflicts")
        },
        { type: "separator" },
        {
          label: "Rotate Workspace Keys",
          click: () => sendMenuAction(win, "rotate-p2p-workspace-keys")
        },
        { type: "separator" },
        {
          label: "How Sync Works",
          click: () => sendMenuAction(win, "open-p2p-sync-help")
        }
      ]
    },
    {
      label: "AI",
      submenu: [
        ...(screen === "document"
          ? [
              {
                label: "Open AI Palette",
                accelerator: "CmdOrCtrl+K",
                click: () => sendMenuAction(win, "open-ai-palette")
              },
              { type: "separator" }
            ]
          : []),
        {
          label: "AI Settings",
          accelerator: "CmdOrCtrl+Shift+,",
          click: () => sendMenuAction(win, "open-ai-settings")
        },
        { type: "separator" },
        {
          label: "Generate Embeddings",
          click: () => sendMenuAction(win, "ai-generate-embeddings")
        },
        {
          label: "Build Relationship Graph",
          click: () => sendMenuAction(win, "ai-build-graph")
        },
        {
          label: "Detect Patterns",
          click: () => sendMenuAction(win, "ai-detect-patterns")
        },
        { type: "separator" },
        {
          label: "Clear Cache",
          click: () => sendMenuAction(win, "ai-clear-cache")
        }
      ]
    },
    {
      label: "Help",
      submenu: [
        { role: "toggleDevTools" }
      ]
    }
  ]);
}

function buildContentSecurityPolicy() {
  const isDev = Boolean(rendererUrl);

  // In dev, Vite + React Fast Refresh require inline/eval scripts and a
  // websocket connection for HMR. Production locks scripts down to 'self'.
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self'";

  const connectSrc = isDev
    ? "connect-src 'self' https://api.languagetool.org ws: http://127.0.0.1:* http://localhost:*"
    : "connect-src 'self' https://api.languagetool.org";

  return [
    "default-src 'self'",
    scriptSrc,
    // CodeMirror, Mermaid and inline positioning styles require inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Note images and media are resolved to data:/blob: URLs, plus local files
    // for PDF export rendering.
    "img-src 'self' data: blob: file:",
    "media-src 'self' data: blob: file:",
    "font-src 'self' data:",
    connectSrc,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-src 'none'"
  ].join("; ");
}

function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    // Strip any incoming CSP header to avoid duplicate/conflicting policies.
    for (const headerName of Object.keys(responseHeaders)) {
      if (headerName.toLowerCase() === "content-security-policy") {
        delete responseHeaders[headerName];
      }
    }
    responseHeaders["Content-Security-Policy"] = [buildContentSecurityPolicy()];
    callback({ responseHeaders });
  });
}

function isAppOriginUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (rendererUrl) {
      return parsed.origin === new URL(rendererUrl).origin;
    }
    return parsed.protocol === "file:";
  } catch {
    return false;
  }
}

function hardenWebContents(webContents) {
  // Deny in-app window creation; route external http(s) links to the OS browser.
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  // Block navigation away from the app origin (e.g. injected/clicked links).
  webContents.on("will-navigate", (event, url) => {
    if (isAppOriginUrl(url)) {
      return;
    }
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });

  // Refuse attachment of <webview> elements outright.
  webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
}

function createWindow() {
  const iconCandidates = [
    path.join(process.resourcesPath || "", "icon.ico"),
    path.join(process.resourcesPath || "", "icon.png"),
    path.join(process.cwd(), "build", "icon.ico"),
    path.join(process.cwd(), "build", "icon.png"),
    path.join(projectRoot, "build", "icon.ico"),
    path.join(projectRoot, "build", "icon.png")
  ];
  const windowIconPath = iconCandidates.find((candidate) => candidate && fs.existsSync(candidate));

  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#f5f3ef",
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });

  hardenWebContents(win.webContents);

  let hasShown = false;

  const showWindow = () => {
    if (win.isDestroyed()) return;
    if (!hasShown) {
      hasShown = true;
      win.center();
      win.show();
    }
    win.focus();
  };

  win.once("ready-to-show", () => {
    win.center();
    showWindow();
  });

  // Fallback for packaged/runtime load timing issues where ready-to-show may not fire.
  setTimeout(() => {
    if (!hasShown) {
      showWindow();
    }
  }, 3000);

  win.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error("Renderer failed to load:", { code, desc, url });
    showWindow();
  });

  if (rendererUrl) {
    win.loadURL(rendererUrl);
  } else {
    win.loadFile(path.join(projectRoot, "dist", "index.html"));
  }

  win.__menuContext = { screen: "landing", viewMode: "tile", dirty: false };
  Menu.setApplicationMenu(buildAppMenu(win, win.__menuContext));
  mainWindow = win;

  win.on("closed", () => {
    for (const [sessionId, session] of terminalSessions.entries()) {
      if (session.windowId === win.id) {
        disposeTerminalSession(sessionId);
      }
    }

    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(async () => {
  applyContentSecurityPolicy();
  applyNotesRoot(resolveInitialNotesRoot());
  await initializeAIForWorkspace();
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  shutdownAISystem();

  if (webPreviewServer) {
    webPreviewServer.close();
    webPreviewServer = null;
    webPreviewPort = 0;
  }

  for (const sessionId of terminalSessions.keys()) {
    disposeTerminalSession(sessionId);
  }

  webPreviewContentOverrides.clear();
  webPreviewScopeRoot = "";
  webPreviewScopeLabel = "Project";

  if (p2pService) {
    p2pService.shutdown();
    p2pService = null;
  }
});

app.on("browser-window-focus", (_event, win) => {
  const context = win?.__menuContext || { screen: "landing", viewMode: "tile", dirty: false };
  Menu.setApplicationMenu(buildAppMenu(win, context));
});

ipcMain.on("app-menu:update-context", (event, context) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  win.__menuContext = {
    screen: context?.screen === "document" ? "document" : "landing",
    viewMode: context?.viewMode === "table" ? "table" : "tile",
    dirty: Boolean(context?.dirty)
  };

  Menu.setApplicationMenu(buildAppMenu(win, win.__menuContext));
});

ipcMain.handle("settings:get-notes-root", () => ({
  notesRoot,
  notesRootSource: process.env.NOTES_ROOT ? "env" : "config"
}));

ipcMain.handle("settings:pick-folder", async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Select notes folder"
  });

  if (result.canceled || !result.filePaths?.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("settings:set-notes-root", (_event, payload) => {
  const nextPath = String(payload?.notesRoot || "").trim();
  if (!nextPath) {
    throw new Error("Notes folder path is required.");
  }

  const resolved = path.resolve(nextPath);
  ensureDir(resolved);

  const settings = readUserSettings();
  settings.notesRoot = resolved;
  writeUserSettings(settings);

  if (!process.env.NOTES_ROOT) {
    applyNotesRoot(resolved);
  }

  return {
    notesRoot: resolved,
    restartRequired: Boolean(process.env.NOTES_ROOT),
    ignoredByEnv: Boolean(process.env.NOTES_ROOT)
  };
});

function resolveTerminalCwd(rawCwd) {
  const requested = String(rawCwd || "").trim();
  const fallback = getActiveProject()?.rootPath || notesRoot;
  const resolved = path.resolve(requested || fallback);
  if (!filePathWithin(notesRoot, resolved)) {
    throw new Error("Invalid terminal path.");
  }
  ensureDir(resolved);
  return resolved;
}

function disposeTerminalSession(sessionId) {
  const session = terminalSessions.get(sessionId);
  if (!session) return;

  terminalSessions.delete(sessionId);
  try {
    session.onDataDisposable?.dispose?.();
    session.onExitDisposable?.dispose?.();
    session.process.kill();
  } catch {
    // Ignore cleanup errors.
  }
}

function getOwnedTerminalSession(event, sessionId) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    throw new Error("Terminal window is unavailable.");
  }

  const session = terminalSessions.get(sessionId);
  if (!session) {
    throw new Error("Terminal session not found.");
  }

  if (session.windowId !== win.id) {
    throw new Error("Terminal session ownership mismatch.");
  }

  return session;
}

ipcMain.handle("terminal:create", (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    throw new Error("Terminal window is unavailable.");
  }

  const cwd = resolveTerminalCwd(payload?.cwd);
  const sessionId = String(nextTerminalSessionId++);
  const shell = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : (process.env.SHELL || "bash");
  const shellArgs = process.platform === "win32" ? [] : ["-l"];
  const child = pty.spawn(shell, shellArgs, {
    cwd,
    env: { ...process.env, TERM: "xterm-256color" },
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    useConpty: process.platform === "win32"
  });

  const onDataDisposable = child.onData((chunk) => {
    if (win.isDestroyed()) return;
    win.webContents.send("terminal:data", { sessionId, data: String(chunk || "") });
  });

  const onExitDisposable = child.onExit(({ exitCode }) => {
    if (!win.isDestroyed()) {
      win.webContents.send("terminal:exit", { sessionId, code: Number.isInteger(exitCode) ? exitCode : null });
    }
    terminalSessions.delete(sessionId);
  });

  terminalSessions.set(sessionId, {
    process: child,
    windowId: win.id,
    onDataDisposable,
    onExitDisposable
  });

  return {
    sessionId,
    cwd
  };
});

ipcMain.handle("terminal:write", (event, payload) => {
  const sessionId = String(payload?.sessionId || "").trim();
  const data = String(payload?.data || "");
  const session = getOwnedTerminalSession(event, sessionId);
  session.process.write(data);
  return true;
});

ipcMain.handle("terminal:resize", (event, payload) => {
  const sessionId = String(payload?.sessionId || "").trim();
  const cols = Math.max(2, Number(payload?.cols || 0) | 0);
  const rows = Math.max(2, Number(payload?.rows || 0) | 0);
  if (!sessionId) return true;
  const session = getOwnedTerminalSession(event, sessionId);
  session.process.resize(cols, rows);
  return true;
});

ipcMain.handle("terminal:kill", (event, payload) => {
  const sessionId = String(payload?.sessionId || "").trim();
  if (!sessionId) return true;
  getOwnedTerminalSession(event, sessionId);
  disposeTerminalSession(sessionId);
  return true;
});

ipcMain.handle("projects:list", () => listProjectsState());

ipcMain.handle("projects:set-active", (_event, payload) => {
  const slug = String(payload?.slug || "").trim();
  const exists = listProjectsState().projects.some((item) => item.slug === slug);
  if (!exists) {
    throw new Error("Project not found.");
  }

  activeProjectSlug = slug;
  return listProjectsState();
});

ipcMain.handle("p2p:start-discovery", () => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  p2pService.startDiscovery();
  return p2pService.getStatus();
});

ipcMain.handle("p2p:stop-discovery", () => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  p2pService.stopDiscovery();
  return p2pService.getStatus();
});

ipcMain.handle("p2p:set-device-name", (_event, payload) => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  p2pService.setDeviceName(payload?.name);
  return p2pService.getStatus();
});

ipcMain.handle("p2p:create-invite", (_event, payload) => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  return p2pService.createInvite({ targetPeerId: payload?.peerId });
});

ipcMain.handle("p2p:pair-with-code", async (_event, payload) => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  return await p2pService.pairWithCode({
    peerId: payload?.peerId,
    code: payload?.code,
    reauth: Boolean(payload?.reauth)
  });
});

ipcMain.handle("p2p:set-key-policy", (_event, payload) => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  p2pService.setKeyPolicyDays(payload?.days);
  return p2pService.getStatus();
});

ipcMain.handle("p2p:manual-connect", async (_event, payload) => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  return await p2pService.manualConnect({
    address: payload?.address,
    listenPort: payload?.listenPort
  });
});

ipcMain.handle("p2p:remove-trusted-peer", (_event, payload) => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  p2pService.removeTrustedPeer(payload?.peerId);
  return p2pService.getStatus();
});

ipcMain.handle("p2p:rotate-workspace-keys", async (_event, payload) => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }

  return await p2pService.rotateWorkspaceKeys(payload?.peerId);
});

ipcMain.handle("p2p:run-sync-self-test", async () => {
  if (!p2pService) {
    throw new Error("P2P service unavailable.");
  }
  return await p2pService.runSyncSelfTest();
});

ipcMain.handle("p2p:get-status", () => {
  if (p2pService) {
    return p2pService.getStatus();
  }
  return readP2PStatusSnapshot();
});

ipcMain.handle("sync:list-conflicts", (_event, payload) => {
  const activeProject = getActiveProject();
  const workspaceRoot = path.resolve(activeProject?.rootPath || notesRoot);
  const rows = metadataStore.getWorkspaceActivity(workspaceRoot, payload?.limit || 200);

  const conflicts = rows
    .filter((entry) => String(entry.reason || "").startsWith("p2p-sync-conflict:"))
    .map((entry, index) => ({
      id: `${entry.createdAt || "unknown"}-${index}`,
      reason: String(entry.reason || ""),
      createdAt: entry.createdAt || null,
      filePath: entry.filePath || "",
      relativePath: normalizeToPosix(path.relative(workspaceRoot, entry.filePath || "")),
      conflictPath: entry.versionPath || ""
    }))
    .filter((entry) => entry.conflictPath && fs.existsSync(entry.conflictPath));

  return {
    workspaceRoot,
    total: conflicts.length,
    conflicts
  };
});

ipcMain.handle("sync:read-conflict-files", (_event, payload) => {
  const localPath = path.resolve(String(payload?.filePath || ""));
  const conflictPath = path.resolve(String(payload?.conflictPath || ""));

  if (!filePathWithin(notesRoot, localPath)) {
    throw new Error("Invalid file path.");
  }
  if (!fs.existsSync(localPath)) {
    throw new Error("Local note file not found.");
  }
  if (!fs.existsSync(conflictPath)) {
    throw new Error("Conflict file not found.");
  }

  const localContent = fs.readFileSync(localPath, "utf8");
  const conflictContent = fs.readFileSync(conflictPath, "utf8");
  const localDoc = parseDocument(localContent, localPath);
  const conflictDoc = parseDocument(conflictContent, conflictPath);

  return {
    local: {
      content: localContent,
      header: localDoc.header,
      rawNotes: localDoc.rawNotes,
      cleansed: localDoc.cleansed
    },
    conflict: {
      content: conflictContent,
      header: conflictDoc.header,
      rawNotes: conflictDoc.rawNotes,
      cleansed: conflictDoc.cleansed
    }
  };
});

ipcMain.handle("sync:resolve-conflict", (_event, payload) => {
  const localPath = path.resolve(String(payload?.filePath || ""));
  const conflictPath = path.resolve(String(payload?.conflictPath || ""));
  const resolution = String(payload?.resolution || "");
  const mergedContent = payload?.mergedContent;

  if (!filePathWithin(notesRoot, localPath)) {
    throw new Error("Invalid file path.");
  }
  if (!fs.existsSync(localPath)) {
    throw new Error("Local note file not found.");
  }
  if (!fs.existsSync(conflictPath)) {
    throw new Error("Conflict file not found.");
  }

  if (resolution === "remote") {
    const conflictContent = fs.readFileSync(conflictPath, "utf8");
    const previous = fs.readFileSync(localPath, "utf8");
    const backupPath = createVersionSnapshot(localPath, previous, "before-conflict-resolve");
    fs.writeFileSync(localPath, conflictContent, "utf8");
    metadataStore.addHistory({
      filePath: localPath,
      versionPath: backupPath,
      fileHash: hashContent(previous),
      reason: "conflict-resolved-remote",
      createdAt: new Date().toISOString()
    });
  } else if (resolution === "merged" && typeof mergedContent === "string") {
    const previous = fs.readFileSync(localPath, "utf8");
    const backupPath = createVersionSnapshot(localPath, previous, "before-conflict-merge");
    fs.writeFileSync(localPath, mergedContent, "utf8");
    metadataStore.addHistory({
      filePath: localPath,
      versionPath: backupPath,
      fileHash: hashContent(previous),
      reason: "conflict-resolved-merged",
      createdAt: new Date().toISOString()
    });
  }

  const movedPath = moveFileToRemoved(conflictPath, "conflicts");
  return { ok: true, movedPath };
});

ipcMain.handle("activity:get-workspace", (_event, payload) => {
  const activeProject = getActiveProject();
  const workspaceRoot = path.resolve(activeProject?.rootPath || notesRoot);
  const rows = metadataStore.getWorkspaceActivity(workspaceRoot, payload?.limit);

  const activity = rows.map((entry, index) => {
    const rawReason = String(entry.reason || "unknown");
    const syncReasonMatch = rawReason.match(/^(p2p-sync-[^:]+):(.+)$/);
    const normalizedReason = syncReasonMatch ? syncReasonMatch[1] : rawReason;
    const actor = syncReasonMatch ? `peer:${syncReasonMatch[2]}` : "local-user";

    return {
      id: `${entry.createdAt || "unknown"}-${index}`,
      filePath: entry.filePath,
      fileName: path.basename(entry.filePath || ""),
      relativePath: normalizeToPosix(path.relative(workspaceRoot, entry.filePath || "")),
      reason: normalizedReason,
      createdAt: entry.createdAt || null,
      versionPath: entry.versionPath || "",
      fileHash: entry.fileHash || "",
      actor
    };
  });

  return {
    workspaceRoot,
    workspaceLabel: activeProject?.isRoot ? "Root" : (activeProject?.name || "Workspace"),
    total: activity.length,
    activity
  };
});

ipcMain.handle("documents:list", (_event, payload) => {
  const activeProject = getActiveProject();
  const projectRoot = path.resolve(activeProject?.rootPath || notesRoot);
  const requestedFolderPath = String(payload?.folderPath || "").trim();
  const targetDir = path.resolve(requestedFolderPath || projectRoot);

  if (!filePathWithin(projectRoot, targetDir)) {
    throw new Error("Invalid folder path.");
  }

  if (activeProject?.isRoot && targetDir.toLowerCase() === path.resolve(notesRoot).toLowerCase()) {
    return listRootEntries(notesRoot);
  }

  return listDirectoryEntries(targetDir, { includeProjectSlug: false });
});

ipcMain.handle("documents:create", (_event, payload) => {
  const activeProject = getActiveProject();
  const rootDir = activeProject.rootPath;
  const created = createDocumentInProject(rootDir, payload);
  const content = buildDocumentContent(created);
  emitLocalP2PSyncEvent({
    op: "create",
    filePath: created.filePath,
    baseHash: null,
    newHash: hashContent(content),
    content,
    baseContent: null,
    delta: {
      header: created.header || "",
      rawNotes: created.rawNotes || "",
      cleansed: created.cleansed || ""
    }
  });
  return created;
});

ipcMain.handle("folders:create", (_event, payload) => {
  const activeProject = getActiveProject();
  const rootDir = activeProject.rootPath;
  return createFolderInProject(rootDir, payload);
});

ipcMain.handle("documents:rename", (_event, payload) => {
  return renameDocumentFile(payload?.filePath, payload);
});

ipcMain.handle("documents:delete", (_event, payload) => {
  const resolved = path.resolve(String(payload?.filePath || ""));
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("Document file does not exist.");
  }

  const previous = fs.readFileSync(resolved, "utf8");
  const previousHash = hashContent(previous);
  const result = deleteDocumentFile(resolved);

  emitLocalP2PSyncEvent({
    op: "delete",
    filePath: resolved,
    baseHash: previousHash,
    newHash: null,
    content: null,
    baseContent: previous
  });

  return result;
});

ipcMain.handle("documents:read", (_event, filePath) => {
  const resolved = path.resolve(filePath);
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  return parseDocument(fs.readFileSync(resolved, "utf8"), resolved);
});

ipcMain.handle("documents:save", (_event, payload) => {
  const resolved = path.resolve(payload.filePath);
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }

  const saveReason = String(payload?.reason || "manual-save");
  const isAutoSave = saveReason === "autosave";

  const previous = fs.readFileSync(resolved, "utf8");

  const next = buildDocumentContent(payload);
  if (next === previous) {
    return parseDocument(next, resolved);
  }

  fs.writeFileSync(resolved, next, "utf8");

  emitLocalP2PSyncEvent({
    op: "update",
    filePath: resolved,
    baseHash: hashContent(previous),
    newHash: hashContent(next),
    content: next,
    baseContent: previous,
    delta: buildNoteDelta({
      filePath: resolved,
      previousContent: previous,
      nextContent: next
    })
  });

  if (!isAutoSave) {
    const previousHash = hashContent(previous);
    if (!hasMatchingFileBackedVersion(resolved, previousHash)) {
      const versionPath = createVersionSnapshot(resolved, previous, saveReason);

      metadataStore.addHistory({
        filePath: resolved,
        versionPath,
        fileHash: previousHash,
        reason: saveReason,
        createdAt: new Date().toISOString()
      });
    }
  }

  return parseDocument(next, resolved);
});

ipcMain.handle("documents:history", (_event, filePath) => {
  const resolved = path.resolve(filePath);
  return metadataStore.getHistory(resolved);
});

ipcMain.handle("documents:restore", (_event, payload) => {
  const resolved = path.resolve(payload.filePath);
  const versionPath = path.resolve(payload.versionPath);
  if (!filePathWithin(notesRoot, resolved) || !filePathWithin(versionsRoot, versionPath)) {
    throw new Error("Invalid restore path.");
  }

  const current = fs.readFileSync(resolved, "utf8");
  const rollbackDir = path.join(versionsRoot, slugify(path.basename(resolved)));
  ensureDir(rollbackDir);
  const rollbackPath = path.join(rollbackDir, `${nowStamp()}-before-restore.md`);
  fs.writeFileSync(rollbackPath, current, "utf8");

  const restored = fs.readFileSync(versionPath, "utf8");
  fs.writeFileSync(resolved, restored, "utf8");

  metadataStore.addHistory({
    filePath: resolved,
    versionPath: rollbackPath,
    fileHash: hashContent(current),
    reason: "before-restore",
    createdAt: new Date().toISOString()
  });

  return parseDocument(restored, resolved);
});

ipcMain.handle("documents:open-in-editor", async (_event, filePath) => {
  const resolved = path.resolve(filePath || "");
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("Document file does not exist.");
  }

  try {
    const vscodeUri = `vscode://file/${resolved.replace(/\\/g, "/")}`;
    await shell.openExternal(encodeURI(vscodeUri));
    return { openedWith: "vscode" };
  } catch {
    const fallbackResult = await shell.openPath(resolved);
    if (fallbackResult) {
      throw new Error(fallbackResult);
    }
    return { openedWith: "default" };
  }
});

ipcMain.handle("documents:open-web-view", async (_event, payload) => {
  let previewUrl = `${await ensureWebPreviewServer()}/`;
  if (payload?.filePath) {
    const prepared = await prepareDocumentPreview(payload.filePath, payload.content);
    previewUrl = prepared.previewUrl;
  }

  const openedWithChrome = tryOpenInChrome(previewUrl);

  if (!openedWithChrome) {
    await shell.openExternal(previewUrl);
  }

  return {
    openedWith: openedWithChrome ? "chrome" : "default",
    previewUrl
  };
});

ipcMain.handle("documents:download-pdf", async (_event, payload) => {
  const resolved = path.resolve(String(payload?.filePath || ""));
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }

  const includeRawNotes = Boolean(payload?.includeRawNotes);
  const includeCleansed = Boolean(payload?.includeCleansed);
  const pdfQualityPreset = ["full", "balanced", "compact"].includes(payload?.pdfQualityPreset)
    ? payload.pdfQualityPreset
    : "full";
  const downsampleImages = Boolean(payload?.downsampleImages) || pdfQualityPreset !== "full";
  if (!includeRawNotes && !includeCleansed) {
    throw new Error("Select at least one section to export.");
  }

  const focusedWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  const defaultName = `${path.basename(resolved, ".md") || "note"}.pdf`;
  const lastPdfExportPath = getLastPdfExportPath();
  const saveResult = await dialog.showSaveDialog(focusedWindow, {
    title: "Save note as PDF",
    defaultPath: lastPdfExportPath || path.join(path.dirname(resolved), defaultName),
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "notely-pdf-"));
  const tempMarkdownPath = path.join(tempDir, `${slugify(path.basename(resolved))}-export.md`);
  const tempHtmlPath = path.join(tempDir, `${slugify(path.basename(resolved))}-export.html`);
  const markdownContent = buildPdfExportMarkdown(payload, { includeRawNotes, includeCleansed });
  fs.writeFileSync(tempMarkdownPath, markdownContent, "utf8");

  try {
    const baseHref = pathToFileURL(`${path.dirname(resolved)}${path.sep}`).href;
    const html = buildPdfExportHtml({
      title: payload?.title || path.basename(resolved, ".md"),
      markdownContent,
      baseHref,
      sourceDir: path.dirname(resolved),
      downsampleImages,
      pdfQualityPreset
    });
    fs.writeFileSync(tempHtmlPath, html, "utf8");

    const pdfWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 1600,
      backgroundColor: "#ffffff",
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false
      }
    });

    try {
      await pdfWindow.loadFile(tempHtmlPath);
      await pdfWindow.webContents.executeJavaScript("document.fonts ? document.fonts.ready : Promise.resolve()");

      const pdfData = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true
      });

      fs.writeFileSync(saveResult.filePath, pdfData);
      rememberPdfExportPath(saveResult.filePath);
    } finally {
      if (!pdfWindow.isDestroyed()) {
        pdfWindow.close();
      }
    }

    return { canceled: false, filePath: saveResult.filePath };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures for temporary export files.
    }
  }
});

ipcMain.handle("documents:read-version", (_event, payload) => {
  const resolvedFilePath = path.resolve(payload?.filePath || "");
  const resolvedVersionPath = path.resolve(payload?.versionPath || "");

  if (!filePathWithin(notesRoot, resolvedFilePath) || path.extname(resolvedFilePath).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!filePathWithin(versionsRoot, resolvedVersionPath) || path.extname(resolvedVersionPath).toLowerCase() !== ".md") {
    throw new Error("Invalid version path.");
  }
  if (!fs.existsSync(resolvedVersionPath)) {
    throw new Error("Version file does not exist.");
  }

  return fs.readFileSync(resolvedVersionPath, "utf8");
});

ipcMain.handle("documents:delete-version", (_event, payload) => {
  const resolvedFilePath = path.resolve(payload?.filePath || "");
  const resolvedVersionPath = path.resolve(payload?.versionPath || "");

  if (!filePathWithin(notesRoot, resolvedFilePath) || path.extname(resolvedFilePath).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!filePathWithin(versionsRoot, resolvedVersionPath) || path.extname(resolvedVersionPath).toLowerCase() !== ".md") {
    throw new Error("Invalid version path.");
  }

  if (fs.existsSync(resolvedVersionPath)) {
    fs.unlinkSync(resolvedVersionPath);
  }
  metadataStore.deleteHistoryVersion(resolvedFilePath, resolvedVersionPath);
  return true;
});

ipcMain.handle("images:save", (_event, payload) => {
  const { fileName, base64Data, basePath, storageTarget } = payload || {};
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Invalid image filename.");
  }
  if (!base64Data || typeof base64Data !== "string" || !base64Data.includes(",")) {
    throw new Error("Invalid image payload.");
  }

  // Prefer saving next to the active note (per-note images/), with an explicit
  // workspace target for shared media library uploads.
  let imagesDir;
  const saveToWorkspace = storageTarget === "workspace";
  let savedToWorkspace = saveToWorkspace;
  if (!saveToWorkspace && basePath && typeof basePath === "string") {
    const resolvedBase = path.resolve(basePath);
    if (filePathWithin(notesRoot, resolvedBase)) {
      imagesDir = path.join(path.dirname(resolvedBase), "images");
    }
  }
  if (!imagesDir) {
    imagesDir = path.join(notesRoot, "images");
    savedToWorkspace = true;
  }
  ensureDir(imagesDir);

  // Generate unique filename if it already exists
  const safeFileName = path.basename(fileName).replace(/[<>:"/\\|?*]+/g, "-");
  const ext = path.extname(safeFileName);
  const baseName = path.basename(safeFileName, ext) || "image";
  const finalExt = ext || ".png";
  let finalName = `${baseName}${finalExt}`;
  let counter = 1;

  while (fs.existsSync(path.join(imagesDir, finalName))) {
    finalName = `${baseName}-${counter}${finalExt}`;
    counter++;
  }

  const imagePath = path.join(imagesDir, finalName);
  const buffer = Buffer.from(base64Data.split(",")[1], "base64");
  if (!buffer.length) {
    throw new Error("Image data is empty.");
  }
  fs.writeFileSync(imagePath, buffer);
  ensureImageThumbnail(imagePath);

  // Return relative path for markdown insertion
  return savedToWorkspace ? `/images/${finalName}` : `./images/${finalName}`;
});

ipcMain.handle("images:list", (_event, payload) => {
  const { basePath, includeAnnotations = false } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }

  const resolvedBasePath = path.resolve(basePath);
  if (!filePathWithin(notesRoot, resolvedBasePath)) {
    throw new Error("Invalid document path.");
  }

  const allowedExtensions = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
    ".mp4", ".webm", ".ogv", ".mov", ".avi", ".mkv", ".m4v",
    ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac",
    ".pdf"
  ]);
  const readImagesIn = (dir) => {
    if (!fs.existsSync(dir)) return [];
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => allowedExtensions.has(path.extname(name).toLowerCase()));
    } catch {
      return [];
    }
  };

  // Scan both the note's own sibling images/ folder and the workspace-level
  // notesRoot/images. Names from the note-local folder win when duplicated.
  const baseDir = path.dirname(path.resolve(basePath));
  const localImagesDir = path.join(baseDir, "images");
  const rootImagesDir = path.join(notesRoot, "images");

  const localNames = readImagesIn(localImagesDir);
  const seen = new Set(localNames.map((name) => name.toLowerCase()));
  const rootNames = readImagesIn(rootImagesDir).filter((name) => !seen.has(name.toLowerCase()));

  const paths = [
    ...localNames.map((name) => `./images/${name}`),
    ...rootNames.map((name) => `/images/${name}`),
  ];

  if (!includeAnnotations) return paths;

  const annotations = readImageAnnotations();
  return paths.map((assetPath) => {
    const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
    const annotation = resolvedAssetPath
      ? normalizeImageAnnotation(annotations[getImageAnnotationKey(resolvedAssetPath)])
      : null;
    return { path: assetPath, annotation };
  });
});

function collectImageUsage(basePath) {
  const resolvedBasePath = path.resolve(String(basePath || ""));
  if (!filePathWithin(notesRoot, resolvedBasePath)) {
    throw new Error("Invalid document path.");
  }

  const activeProject = getActiveProject();
  const scopeRoot = path.resolve(activeProject?.rootPath || notesRoot);
  const markdownFiles = walkFiles(scopeRoot, { excludeDirs: Array.from(WALK_EXCLUDE_DIRS) })
    .filter((item) => path.extname(item).toLowerCase() === ".md");
  const markdownImagePattern = /!\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g;
  const usageByAssetPath = {};

  for (const markdownFile of markdownFiles) {
    const content = fs.readFileSync(markdownFile, "utf8");
    const seenInDocument = new Set();
    let match;

    while ((match = markdownImagePattern.exec(content))) {
      const rawPath = String(match[1] || "").trim();
      const assetPath = rawPath.startsWith("<") && rawPath.endsWith(">")
        ? rawPath.slice(1, -1)
        : rawPath;
      const resolvedAssetPath = resolveImageAssetPath(markdownFile, assetPath);
      if (!resolvedAssetPath) continue;

      const rootImagesDir = path.resolve(notesRoot, "images").toLowerCase();
      const resolvedImageDir = path.dirname(path.resolve(resolvedAssetPath)).toLowerCase();
      const relativeAssetPath = resolvedImageDir === rootImagesDir
        ? `/images/${path.basename(resolvedAssetPath)}`
        : `./images/${path.basename(resolvedAssetPath)}`;
      if (seenInDocument.has(relativeAssetPath)) continue;
      seenInDocument.add(relativeAssetPath);

      const entry = usageByAssetPath[relativeAssetPath] || {
        referenceCount: 0,
        documents: [],
      };
      entry.referenceCount += 1;
      entry.documents.push({
        filePath: markdownFile,
        fileName: path.basename(markdownFile),
        title: path.basename(markdownFile, ".md"),
      });
      usageByAssetPath[relativeAssetPath] = entry;
    }
  }

  return usageByAssetPath;
}

function resolveImageAssetPath(basePath, assetPath) {
  const rawAsset = (assetPath || "").trim();
  if (!rawAsset) return null;

  let resolvedAssetPath = "";
  if (/^https?:/i.test(rawAsset)) {
    try {
      const url = new URL(rawAsset);
      let localPath = url.pathname || "";
      for (let i = 0; i < 5; i += 1) {
        try {
          const next = decodeURIComponent(localPath);
          if (next === localPath) break;
          localPath = next;
        } catch {
          break;
        }
      }
      if (/^\/images\//i.test(localPath)) {
        resolvedAssetPath = path.resolve(notesRoot, `.${localPath}`);
      } else {
        return null;
      }
    } catch {
      return null;
    }
  } else if (/^file:/i.test(rawAsset)) {
    try {
      const url = new URL(rawAsset);
      resolvedAssetPath = decodeURI(url.pathname);
      if (/^\/[A-Za-z]:\//.test(resolvedAssetPath)) {
        resolvedAssetPath = resolvedAssetPath.slice(1);
      }
    } catch {
      return null;
    }
  } else {
    let decodedAsset = rawAsset;
    for (let i = 0; i < 5; i += 1) {
      try {
        const next = decodeURIComponent(decodedAsset);
        if (next === decodedAsset) break;
        decodedAsset = next;
      } catch {
        break;
      }
    }
    const baseDir = path.dirname(path.resolve(basePath));
    const isWorkspaceImageLink = /^[/\\]+images[/\\]/i.test(decodedAsset);
    const normalizedAsset = decodedAsset
      .replace(/^\.\//, "")
      .replace(/^[/\\]+images[/\\]/i, "images/");

    // For asset paths like "./images/foo.jpg", try the markdown file's own
    // sibling folder first (most common case for per-note images/), then fall
    // back to the workspace-level notesRoot/images. For any other relative
    // path, resolve from the markdown file directory.
    const candidates = [];
    if (isWorkspaceImageLink) {
      candidates.push(path.resolve(notesRoot, normalizedAsset));
    } else if (/^images[\\/]/i.test(normalizedAsset)) {
      candidates.push(path.resolve(baseDir, normalizedAsset));
      candidates.push(path.resolve(notesRoot, normalizedAsset));
    } else {
      candidates.push(path.resolve(baseDir, normalizedAsset));
    }

    resolvedAssetPath = candidates.find((candidate) => {
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    }) || candidates[0];
  }

  if (!filePathWithin(notesRoot, resolvedAssetPath)) {
    return null;
  }

  return path.resolve(resolvedAssetPath);
}

function isRasterImagePath(filePath) {
  return RASTER_IMAGE_EXTENSIONS.has(path.extname(filePath || "").toLowerCase());
}

function getThumbnailPathForImage(imagePath) {
  const stat = fs.statSync(imagePath);
  const imageDir = path.dirname(imagePath);
  const thumbnailDir = path.join(imageDir, THUMBNAIL_DIR_NAME);
  const ext = path.extname(imagePath);
  const baseName = path.basename(imagePath, ext).replace(/[<>:"/\\|?*]+/g, "-") || "image";
  const cacheKey = crypto
    .createHash("sha1")
    .update(`${path.resolve(imagePath)}:${stat.size}:${Math.round(stat.mtimeMs)}`)
    .digest("hex")
    .slice(0, 12);
  return path.join(thumbnailDir, `${baseName}-${cacheKey}.jpg`);
}

function ensureImageThumbnail(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath) || !isRasterImagePath(imagePath)) {
    return null;
  }

  const thumbnailPath = getThumbnailPathForImage(imagePath);
  if (fs.existsSync(thumbnailPath)) {
    return thumbnailPath;
  }

  ensureDir(path.dirname(thumbnailPath));
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) {
    return null;
  }

  const size = image.getSize();
  const width = Math.min(THUMBNAIL_MAX_WIDTH, Math.max(1, size.width || THUMBNAIL_MAX_WIDTH));
  const resized = image.resize({ width, quality: "good" });
  fs.writeFileSync(thumbnailPath, resized.toJPEG(THUMBNAIL_JPEG_QUALITY));
  return thumbnailPath;
}

function clearThumbnailCacheForImage(imagePath) {
  if (!imagePath) return;
  const thumbnailDir = path.join(path.dirname(imagePath), THUMBNAIL_DIR_NAME);
  if (!fs.existsSync(thumbnailDir)) return;

  const ext = path.extname(imagePath);
  const baseName = path.basename(imagePath, ext).replace(/[<>:"/\\|?*]+/g, "-") || "image";
  for (const entry of fs.readdirSync(thumbnailDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith(`${baseName}-`) && entry.name.toLowerCase().endsWith(".jpg")) {
      try {
        fs.unlinkSync(path.join(thumbnailDir, entry.name));
      } catch {
        // Cache cleanup is best-effort.
      }
    }
  }
}

function getImageAnnotationsPath() {
  return path.join(appDataDir, "image-annotations.json");
}

function getImageAnnotationKey(resolvedAssetPath) {
  return normalizeToPosix(path.relative(notesRoot, path.resolve(resolvedAssetPath))).toLowerCase();
}

function readImageAnnotations() {
  const annotationsPath = getImageAnnotationsPath();
  if (!fs.existsSync(annotationsPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(annotationsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeImageAnnotations(annotations) {
  ensureDir(path.dirname(getImageAnnotationsPath()));
  fs.writeFileSync(getImageAnnotationsPath(), JSON.stringify(annotations || {}, null, 2), "utf8");
}

function normalizeImageAnnotation(annotation) {
  const text = String(annotation?.text || "").trim().slice(0, 80);
  return text ? { text, position: "top-left" } : null;
}

function getImageAnnotationForMarkdownAsset(basePath, assetPath) {
  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath) return null;
  const annotations = readImageAnnotations();
  return normalizeImageAnnotation(annotations[getImageAnnotationKey(resolvedAssetPath)]);
}

function renderImageHtmlWithAnnotation(imageHtml, annotation) {
  const normalized = normalizeImageAnnotation(annotation);
  if (!normalized) return imageHtml;
  return `<span class="notely-image-frame">${imageHtml}<span class="notely-image-annotation">${escapeHtml(normalized.text)}</span></span>`;
}

function removeImageReferencesForAsset(resolvedAssetPath, options = {}) {
  const normalizedTarget = path.resolve(resolvedAssetPath).toLowerCase();
  const normalizedBasePath = options.basePath
    ? path.resolve(options.basePath).toLowerCase()
    : "";
  const removeAllReferences = Boolean(options.removeAllReferences);
  const activeProject = getActiveProject();
  const scopeRoot = path.resolve(activeProject?.rootPath || notesRoot);
  const markdownFiles = walkFiles(scopeRoot, { excludeDirs: Array.from(WALK_EXCLUDE_DIRS) })
    .filter((item) => path.extname(item).toLowerCase() === ".md");
  const markdownImagePattern = /!\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g;
  let referencesFound = 0;
  let referencesRemoved = 0;
  let remainingReferences = 0;
  const documentsUpdated = [];

  for (const markdownFile of markdownFiles) {
    const content = fs.readFileSync(markdownFile, "utf8");
    let removedInDocument = 0;
    const normalizedMarkdownFile = path.resolve(markdownFile).toLowerCase();
    const nextContent = content.replace(markdownImagePattern, (match, rawPath) => {
      const assetPath = String(rawPath || "").trim();
      const unwrapped = assetPath.startsWith("<") && assetPath.endsWith(">")
        ? assetPath.slice(1, -1)
        : assetPath;
      const resolved = resolveImageAssetPath(markdownFile, unwrapped);
      if (!resolved || path.resolve(resolved).toLowerCase() !== normalizedTarget) {
        return match;
      }

      referencesFound += 1;
      const shouldRemoveReference = removeAllReferences || normalizedMarkdownFile === normalizedBasePath;
      if (!shouldRemoveReference) {
        remainingReferences += 1;
        return match;
      }

      removedInDocument += 1;
      referencesRemoved += 1;
      return "";
    });

    if (removedInDocument > 0 && nextContent !== content) {
      fs.writeFileSync(markdownFile, nextContent, "utf8");
      documentsUpdated.push({
        filePath: markdownFile,
        fileName: path.basename(markdownFile),
        title: path.basename(markdownFile, ".md"),
        removed: removedInDocument,
      });
    }
  }

  return { referencesFound, referencesRemoved, remainingReferences, documentsUpdated };
}

ipcMain.handle("images:usage", (_event, payload) => {
  const { basePath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }

  return collectImageUsage(basePath);
});

ipcMain.handle("images:get-annotation", (_event, payload) => {
  const { basePath, assetPath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath) return null;
  const annotations = readImageAnnotations();
  return normalizeImageAnnotation(annotations[getImageAnnotationKey(resolvedAssetPath)]);
});

ipcMain.handle("images:set-annotation", (_event, payload) => {
  const { basePath, assetPath, annotation } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath) {
    throw new Error("Image file not found.");
  }

  const annotations = readImageAnnotations();
  const key = getImageAnnotationKey(resolvedAssetPath);
  const normalized = normalizeImageAnnotation(annotation);
  if (normalized) {
    annotations[key] = normalized;
  } else {
    delete annotations[key];
  }
  writeImageAnnotations(annotations);
  return normalized;
});

ipcMain.handle("images:delete", (_event, payload) => {
  const { basePath, assetPath, removeAllReferences } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    return { deletedFile: false, referencesRemoved: 0, documentsUpdated: [] };
  }

  const referenceResult = removeImageReferencesForAsset(resolvedAssetPath, {
    basePath,
    removeAllReferences,
  });
  const shouldDeleteFile = referenceResult.remainingReferences === 0;
  let movedPath = null;
  if (shouldDeleteFile) {
    clearThumbnailCacheForImage(resolvedAssetPath);
    const annotations = readImageAnnotations();
    delete annotations[getImageAnnotationKey(resolvedAssetPath)];
    writeImageAnnotations(annotations);
    movedPath = moveFileToRemoved(resolvedAssetPath, "images");
  }

  return {
    deletedFile: Boolean(movedPath),
    movedPath,
    referencesFound: referenceResult.referencesFound,
    referencesRemoved: referenceResult.referencesRemoved,
    remainingReferences: referenceResult.remainingReferences,
    documentsUpdated: referenceResult.documentsUpdated,
    keptFileBecauseReferencedElsewhere: !shouldDeleteFile,
  };
});

ipcMain.handle("images:replace", (_event, payload) => {
  const { basePath, assetPath, base64Data } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }
  if (!base64Data || typeof base64Data !== "string" || !base64Data.includes(",")) {
    throw new Error("Invalid image payload.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    throw new Error("Image file not found.");
  }

  const buffer = Buffer.from(base64Data.split(",")[1], "base64");
  if (!buffer.length) {
    throw new Error("Image data is empty.");
  }

  clearThumbnailCacheForImage(resolvedAssetPath);
  fs.writeFileSync(resolvedAssetPath, buffer);
  ensureImageThumbnail(resolvedAssetPath);
  return true;
});

ipcMain.handle("images:rename", (_event, payload) => {
  const { basePath, assetPath, nextFileName } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }
  if (!nextFileName || typeof nextFileName !== "string") {
    throw new Error("Invalid image filename.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    throw new Error("Image file not found.");
  }

  const imagesDir = path.resolve(path.join(notesRoot, "images"));
  if (!filePathWithin(imagesDir, resolvedAssetPath)) {
    throw new Error("Image path must be inside notes/images.");
  }

  const currentExt = path.extname(resolvedAssetPath);
  const rawName = path.basename(String(nextFileName || "").trim()).replace(/[<>:"/\\|?*]+/g, "-");
  const desiredExt = path.extname(rawName) || currentExt || ".png";
  const desiredBase = path.basename(rawName, path.extname(rawName)) || "image";
  const candidatePath = path.join(path.dirname(resolvedAssetPath), `${desiredBase}${desiredExt}`);

  const normalizedCurrent = path.resolve(resolvedAssetPath);
  const normalizedCandidate = path.resolve(candidatePath);
  let finalPath = normalizedCandidate;
  if (normalizedCandidate.toLowerCase() !== normalizedCurrent.toLowerCase()) {
    finalPath = getUniquePath(normalizedCandidate);
    fs.renameSync(normalizedCurrent, finalPath);
  }

  const annotations = readImageAnnotations();
  const oldAnnotationKey = getImageAnnotationKey(normalizedCurrent);
  const nextAnnotation = annotations[oldAnnotationKey];
  if (nextAnnotation) {
    delete annotations[oldAnnotationKey];
    annotations[getImageAnnotationKey(finalPath)] = nextAnnotation;
    writeImageAnnotations(annotations);
  }

  return `./images/${path.basename(finalPath)}`;
});

ipcMain.handle("images:read", (_event, payload) => {
  const { basePath, assetPath, thumbnail } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const rawAsset = assetPath.trim();
  if (/^(data:|blob:)/i.test(rawAsset)) {
    return assetPath;
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, rawAsset);
  if (!resolvedAssetPath) {
    return rawAsset;
  }
  if (!fs.existsSync(resolvedAssetPath)) {
    return rawAsset;
  }

  const fileToRead = thumbnail ? (ensureImageThumbnail(resolvedAssetPath) || resolvedAssetPath) : resolvedAssetPath;
  const ext = path.extname(fileToRead).toLowerCase();
  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogv": "video/ogg",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf"
  };
  const mimeType = mimeMap[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(fileToRead);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
});
