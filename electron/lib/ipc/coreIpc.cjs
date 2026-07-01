const { assertTrustedIpcSender } = require("./ipcSecurity.cjs");

function registerCoreIpcHandlers(ipcMain, deps) {
  const {
    BrowserWindow,
    app,
    dialog,
    fs,
    process,
    path,
    projectRoot,
    ensureDir,
    readUserSettings,
    writeUserSettings,
    applyNotesRoot,
    getGitWorkspaceMetadata,
    setAutoIgnoreMetadataInGit,
    getAppInfo,
    getNotesRoot,
    listProjectsState,
    getActiveProjectSlug,
    setActiveProjectSlug,
  } = deps;

  function registerTrustedHandler(channel, handler) {
    ipcMain.handle(channel, (event, payload) => {
      assertTrustedIpcSender(BrowserWindow, event, channel);
      return handler(event, payload);
    });
  }

  registerTrustedHandler("settings:get-notes-root", () => ({
    notesRoot: getNotesRoot(),
    notesRootSource: process.env.NOTES_ROOT ? "env" : "config"
  }));

  registerTrustedHandler("help:get-documents", () => {
    const docsRoot = path.join(projectRoot, "docs");
    const entries = [
      {
        slug: "overview",
        title: "Start Here",
        fileName: "index.md",
        summary: "Quick orientation for first-time users and a map to the most important guides.",
        highlights: [
          "First-use checklist",
          "Keyboard shortcuts for core tasks",
          "Guide map by user goal",
        ],
      },
      {
        slug: "user-guide",
        title: "User Guide",
        fileName: "user-guide.md",
        summary: "Step-by-step daily workflows: setup, writing, search, media, and version recovery.",
        highlights: [
          "Create and organize notes",
          "Edit with preview and validation",
          "Work with diagrams and images",
        ],
      },
      {
        slug: "feature-reference",
        title: "Feature Reference",
        fileName: "feature-reference.md",
        summary: "Complete explanation of all major user-facing features in Notely.",
        highlights: [
          "Editor, search, and versioning",
          "Media, Mermaid, and Excalidraw",
          "AI assistance and P2P sync",
        ],
      },
      {
        slug: "top-tasks",
        title: "Top 15 Common Tasks",
        fileName: "top-tasks.md",
        summary: "Fast click-by-click steps for the actions users perform most often.",
        highlights: [
          "Create notes and folders",
          "Search, edit, and preview",
          "History, diagrams, and help",
        ],
      },
      {
        slug: "feature-availability",
        title: "Feature Availability",
        fileName: "feature-availability.md",
        summary: "See what works offline and what requires optional setup or internet access.",
        highlights: [
          "Offline vs online features",
          "AI setup dependencies",
          "P2P sync prerequisites",
        ],
      },
      {
        slug: "data-sync-security",
        title: "Data & Sync",
        fileName: "data-sync-security.md",
        summary: "How your data is stored, how sync works, and the privacy basics to know.",
        highlights: [
          "Where app data is stored",
          "P2P pairing and conflict basics",
          "Daily safety checklist",
        ],
      },
      {
        slug: "troubleshooting",
        title: "Troubleshooting",
        fileName: "troubleshooting.md",
        summary: "Quick fixes for common issues with notes, preview, links, sync, and AI setup.",
        highlights: [
          "Notes not showing",
          "Preview or link issues",
          "Sync and AI troubleshooting",
        ],
      },
    ];

    return entries
      .map((entry) => {
        const fullPath = path.join(docsRoot, entry.fileName);
        if (!fs.existsSync(fullPath)) return null;
        const markdown = String(fs.readFileSync(fullPath, "utf8") || "");
        return {
          slug: entry.slug,
          title: entry.title,
          fileName: entry.fileName,
          summary: entry.summary,
          highlights: Array.isArray(entry.highlights) ? entry.highlights : [],
          markdown,
        };
      })
      .filter(Boolean);
  });

  registerTrustedHandler("settings:get-app-info", () => {
    const fallbackName = String(app?.getName?.() || "Notely");
    const fallbackVersion = String(app?.getVersion?.() || "0.0.0");
    const computed = typeof getAppInfo === "function" ? getAppInfo() : null;
    return {
      appName: String(computed?.appName || fallbackName),
      version: String(computed?.version || fallbackVersion),
      versionCore: String(computed?.versionCore || fallbackVersion),
      commitHash: String(computed?.commitHash || ""),
    };
  });

  registerTrustedHandler("settings:pick-folder", async () => {
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

  registerTrustedHandler("settings:set-notes-root", (_event, payload) => {
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

  registerTrustedHandler("projects:list", () => listProjectsState());

  registerTrustedHandler("projects:set-active", (_event, payload) => {
    const slug = String(payload?.slug || "").trim();
    const exists = listProjectsState().projects.some((item) => item.slug === slug);
    if (!exists) {
      throw new Error("Project not found.");
    }

    setActiveProjectSlug(slug);
    return listProjectsState();
  });

  registerTrustedHandler("settings:get-git-workspace-meta", () => getGitWorkspaceMetadata());

  registerTrustedHandler("settings:set-auto-ignore-git-metadata", (_event, payload) => {
    return setAutoIgnoreMetadataInGit(payload?.enabled !== false);
  });

  return {
    getActiveProjectSlug,
  };
}

module.exports = { registerCoreIpcHandlers };
