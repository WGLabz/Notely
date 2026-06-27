function createMainHelpers(deps) {
  const {
    fs,
    path,
    process,
    app,
    projectRoot,
    userConfigPath,
    ensureDir,
    hashContent,
    rootProjectSlug,
    getNotesRoot,
    getActiveProjectSlug,
    setActiveProjectSlug,
  } = deps;

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

  function listProjectsState() {
    const notesRoot = getNotesRoot();
    ensureDir(notesRoot);
    const projects = [
      {
        slug: rootProjectSlug,
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

    const activeProjectSlug = getActiveProjectSlug();
    if (!projects.some((item) => item.slug === activeProjectSlug)) {
      setActiveProjectSlug(rootProjectSlug);
    }

    const finalActiveProjectSlug = projects.some((item) => item.slug === activeProjectSlug)
      ? activeProjectSlug
      : rootProjectSlug;

    const activeProject = projects.find((item) => item.slug === finalActiveProjectSlug)
      || projects[0]
      || {
        slug: rootProjectSlug,
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

  return {
    readUserSettings,
    writeUserSettings,
    getLastPdfExportPath,
    rememberPdfExportPath,
    resolveInitialNotesRoot,
    readP2PStatusSnapshot,
    listProjectsState,
    getActiveProject,
    parseDocument,
    buildDocumentContent,
  };
}

module.exports = { createMainHelpers };
