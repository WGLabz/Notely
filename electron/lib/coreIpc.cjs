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
    getNotesRoot,
    listProjectsState,
    getActiveProjectSlug,
    setActiveProjectSlug,
  } = deps;

  ipcMain.handle("settings:get-notes-root", () => ({
    notesRoot: getNotesRoot(),
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

  ipcMain.handle("projects:list", () => listProjectsState());

  ipcMain.handle("projects:set-active", (_event, payload) => {
    const slug = String(payload?.slug || "").trim();
    const exists = listProjectsState().projects.some((item) => item.slug === slug);
    if (!exists) {
      throw new Error("Project not found.");
    }

    setActiveProjectSlug(slug);
    return listProjectsState();
  });

  return {
    getActiveProjectSlug,
  };
}

module.exports = { registerCoreIpcHandlers };
