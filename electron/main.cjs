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
let p2pService = null;
let aiAgent = null;
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

const {
  renderRootWebsitePage,
  renderMarkdownWebsitePage,
  renderPdfNotePage,
  buildSearchIndex,
  renderSearchPage
} = createWebsiteRenderer({
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
  getScopeRoot: () => webPreviewScopeRoot || getWebPreviewScopeRoot(),
  getScopeLabel: () => webPreviewScopeLabel,
  getNotesRoot: () => notesRoot
});

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
    terminalIpc.disposeForWindow(win.id);

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

  terminalIpc.disposeAll();

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
terminalIpc.registerHandlers(ipcMain);

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

imageMedia.registerIpcHandlers(ipcMain);
