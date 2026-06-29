const { assertTrustedIpcSender } = require("./ipcSecurity.cjs");

function registerCoreIpcHandlers(ipcMain, deps) {
  const {
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
