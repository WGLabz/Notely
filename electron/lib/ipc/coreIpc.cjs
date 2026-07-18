const { assertTrustedIpcSender } = require("./ipcSecurity.cjs");
const https = require("https");

function registerCoreIpcHandlers(ipcMain, deps) {
  const {
    BrowserWindow,
    app,
    dialog,
    clipboard,
    fs,
    process,
    path,
    shell,
    filePathWithin,
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
    createReferenceWindow,
    getWorkspaceMetadataStore,
  } = deps;

  const RECENT_WORKSPACES_LIMIT = 8;

  function normalizeWorkspacePathValue(rawPath) {
    if (typeof rawPath !== "string") return "";
    const trimmed = rawPath.trim();
    if (!trimmed) return "";

    const cleaned = trimmed
      .split(/[\\/]+/)
      .filter((segment) => segment && segment !== "[object Object]")
      .join(path.sep);
    if (!cleaned) return "";

    try {
      return path.resolve(cleaned);
    } catch {
      return "";
    }
  }

  function normalizeRecentWorkspaces(settings) {
    const rawEntries = Array.isArray(settings?.recentWorkspaces)
      ? settings.recentWorkspaces
      : [];
    const seen = new Set();
    const normalized = [];

    for (const entry of rawEntries) {
      const resolved = normalizeWorkspacePathValue(entry);
      if (!resolved) continue;

      const key = resolved.toLowerCase();
      if (seen.has(key) || !fs.existsSync(resolved)) continue;
      seen.add(key);
      normalized.push(resolved);
      if (normalized.length >= RECENT_WORKSPACES_LIMIT) break;
    }

    return normalized;
  }

  function registerTrustedHandler(channel, handler) {
    ipcMain.handle(channel, (event, payload) => {
      assertTrustedIpcSender(BrowserWindow, event, channel);
      return handler(event, payload);
    });
  }

  function normalizeThemePreference(value) {
    return value === "light" || value === "dark" ? value : "auto";
  }

  function resolveEffectiveTheme(themePreference) {
    const preference = normalizeThemePreference(themePreference);
    if (preference === "light" || preference === "dark") return preference;
    const shouldUseDark = Boolean(deps?.nativeTheme?.shouldUseDarkColors);
    return shouldUseDark ? "dark" : "light";
  }

  function normalizeZoomFactor(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0.8;
    return Math.max(0.75, Math.min(2, Number(numeric.toFixed(2))));
  }

  function resolveWorkspaceFolderPath(rawFolderPath) {
    const requestedPath = normalizeWorkspacePathValue(rawFolderPath);
    const notesRoot = normalizeWorkspacePathValue(getNotesRoot());
    const resolved = requestedPath || notesRoot;

    if (!resolved) {
      throw new Error("Workspace path is unavailable.");
    }

    const isSameAsRoot = notesRoot && resolved.toLowerCase() === notesRoot.toLowerCase();
    if (!isSameAsRoot && !filePathWithin(notesRoot, resolved)) {
      throw new Error("Invalid workspace path.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error("Workspace folder does not exist.");
    }

    return resolved;
  }

  function broadcastThemeChange(themePreference) {
    const effectiveTheme = resolveEffectiveTheme(themePreference);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win || win.isDestroyed()) continue;
      win.webContents.send("appearance:theme-changed", { themePreference, effectiveTheme });
    }
  }

  registerTrustedHandler("settings:get-notes-root", () => ({
    notesRoot: getNotesRoot(),
    notesRootSource: process.env.NOTES_ROOT ? "env" : "config",
    recentWorkspaces: [
      getNotesRoot(),
      ...normalizeRecentWorkspaces(readUserSettings()),
    ].filter((entry, index, list) => {
      const normalized = String(entry || "").trim().toLowerCase();
      return normalized && list.findIndex((candidate) => String(candidate || "").trim().toLowerCase() === normalized) === index;
    }).slice(0, RECENT_WORKSPACES_LIMIT)
  }));


  registerTrustedHandler("settings:get-app-info", () => {
    const fallbackName = String(app?.getName?.() || "Notely");
    const fallbackVersion = String(app?.getVersion?.() || "0.0.0");
    const computed = typeof getAppInfo === "function" ? getAppInfo() : null;
    return {
      appName: String(computed?.appName || fallbackName),
      version: String(computed?.version || fallbackVersion),
      versionCore: String(computed?.versionCore || fallbackVersion),
      commitHash: String(computed?.commitHash || ""),
      isPackaged: Boolean(app?.isPackaged),
    };
  });

  registerTrustedHandler("settings:get-appearance", () => {
    const settings = readUserSettings();
    const themePreference = normalizeThemePreference(settings?.themePreference);
    const zoomFactor = normalizeZoomFactor(settings?.zoomFactor);
    return {
      themePreference,
      effectiveTheme: resolveEffectiveTheme(themePreference),
      zoomFactor,
    };
  });

  registerTrustedHandler("settings:set-theme-preference", (_event, payload) => {
    const settings = readUserSettings();
    const themePreference = normalizeThemePreference(payload?.themePreference);
    settings.themePreference = themePreference;
    writeUserSettings(settings);

    if (deps?.nativeTheme) {
      deps.nativeTheme.themeSource = themePreference === "auto" ? "system" : themePreference;
    }

    broadcastThemeChange(themePreference);

    return {
      themePreference,
      effectiveTheme: resolveEffectiveTheme(themePreference),
    };
  });

  registerTrustedHandler("settings:set-zoom-factor", (event, payload) => {
    const nextZoom = normalizeZoomFactor(payload?.zoomFactor);
    const settings = readUserSettings();
    settings.zoomFactor = nextZoom;
    writeUserSettings(settings);

    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.webContents.setZoomFactor(nextZoom);
    }

    return { zoomFactor: nextZoom };
  });

  registerTrustedHandler("settings:pick-folder", async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select workspace"
    });

    if (result.canceled || !result.filePaths?.length) {
      return null;
    }

    return result.filePaths[0];
  });

  registerTrustedHandler("workspace:open-in-editor", async (_event, payload) => {
    const resolved = resolveWorkspaceFolderPath(payload?.folderPath);

    try {
      const vscodeUri = `vscode://file/${resolved.replace(/\\/g, "/")}`;
      await shell.openExternal(encodeURI(vscodeUri));
      return { openedWith: "vscode", folderPath: resolved };
    } catch {
      const fallbackResult = await shell.openPath(resolved);
      if (fallbackResult) {
        throw new Error(fallbackResult);
      }
      return { openedWith: "default", folderPath: resolved };
    }
  });

  registerTrustedHandler("workspace:reveal-in-explorer", (_event, payload) => {
    const resolved = resolveWorkspaceFolderPath(payload?.folderPath);

    shell.showItemInFolder(resolved);
    return { revealed: true, folderPath: resolved };
  });

  registerTrustedHandler("window:open-reference-note", (_event, payload) => {
    const nextFilePath = String(payload?.filePath || "").trim();
    if (!nextFilePath) {
      throw new Error("Reference note path is required.");
    }

    const resolved = path.resolve(nextFilePath);
    if (!filePathWithin(getNotesRoot(), resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid reference note path.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error("Reference note does not exist.");
    }

    createReferenceWindow(resolved);
    return { opened: true, filePath: resolved };
  });

  registerTrustedHandler("settings:set-notes-root", (_event, payload) => {
    const nextPath = normalizeWorkspacePathValue(payload?.notesRoot);
    if (!nextPath) {
      throw new Error("Workspace path is required.");
    }

    const resolved = nextPath;
    ensureDir(resolved);

    const settings = readUserSettings();
    settings.notesRoot = resolved;
    settings.recentWorkspaces = [
      resolved,
      ...normalizeRecentWorkspaces(settings).filter((entry) => entry.toLowerCase() !== resolved.toLowerCase()),
    ].slice(0, RECENT_WORKSPACES_LIMIT);
    writeUserSettings(settings);

    if (!process.env.NOTES_ROOT) {
      applyNotesRoot(resolved);
    }

    return {
      notesRoot: resolved,
      recentWorkspaces: settings.recentWorkspaces,
      restartRequired: Boolean(process.env.NOTES_ROOT),
      ignoredByEnv: Boolean(process.env.NOTES_ROOT)
    };
  });

  registerTrustedHandler("settings:get-onboarding-complete", () => {
    const settings = readUserSettings();
    return {
      onboardingComplete: Boolean(settings?.onboardingComplete)
    };
  });

  registerTrustedHandler("settings:set-onboarding-complete", (_event, payload) => {
    const settings = readUserSettings();
    settings.onboardingComplete = payload?.onboardingComplete !== false;
    writeUserSettings(settings);
    return {
      onboardingComplete: settings.onboardingComplete
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

  registerTrustedHandler("screen:capture-current-display", async (event) => {
    if (process.platform !== "win32") {
      throw new Error("Area snip is currently supported on Windows only.");
    }

    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const beforeImage = clipboard.readImage();
    const beforePngBase64 = beforeImage.isEmpty() ? "" : beforeImage.toPNG().toString("base64");

    if (senderWindow && !senderWindow.isDestroyed()) {
      try {
        senderWindow.minimize();
        senderWindow.blur();
      } catch {
        // Continue even if minimize fails.
      }
    }

    try {
      await shell.openExternal("ms-screenclip:");

      const startedAt = Date.now();
      const timeoutMs = 25000;
      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const clipped = clipboard.readImage();
        if (clipped.isEmpty()) continue;

        const pngBase64 = clipped.toPNG().toString("base64");
        if (!pngBase64 || pngBase64 === beforePngBase64) continue;

        return {
          dataUrl: `data:image/png;base64,${pngBase64}`,
          displayName: "Snipped area",
          canceled: false,
        };
      }

      return {
        dataUrl: "",
        displayName: "",
        canceled: true,
      };
    } finally {
      if (senderWindow && !senderWindow.isDestroyed()) {
        try {
          senderWindow.restore();
          senderWindow.focus();
        } catch {
          // Best effort window restoration.
        }
      }
    }
  });

  function fetchLatestGitHubRelease(targetUrl) {
    return new Promise((resolve, reject) => {
      const urlStr = targetUrl || "https://api.github.com/repos/oksbwn/Notely/releases/latest";

      const req = https.get(
        urlStr,
        {
          headers: {
            "User-Agent": "Notely-App",
          },
        },
        (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode)) {
            const redirectUrl = res.headers.location;
            if (redirectUrl) {
              resolve(fetchLatestGitHubRelease(redirectUrl));
            } else {
              reject(new Error("Redirect location header missing"));
            }
            return;
          }

          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(data);
                resolve(parsed);
              } catch {
                reject(new Error("Failed to parse release data"));
              }
            } else {
              reject(new Error(`Failed to fetch release: ${res.statusCode}`));
            }
          });
        }
      );

      req.on("error", (err) => {
        reject(err);
      });
    });
  }

  function isNewerVersion(current, latest) {
    const cleanCurr = String(current || "0.0.0").replace(/^v/, "").split("-")[0].split("+")[0];
    const cleanLat = String(latest || "0.0.0").replace(/^v/, "").split("-")[0].split("+")[0];

    const currParts = cleanCurr.split(".").map(Number);
    const latParts = cleanLat.split(".").map(Number);

    for (let i = 0; i < Math.max(currParts.length, latParts.length); i++) {
      const currPart = currParts[i] || 0;
      const latPart = latParts[i] || 0;
      if (Number.isNaN(currPart) || Number.isNaN(latPart)) continue;
      if (latPart > currPart) return true;
      if (currPart > latPart) return false;
    }
    return false;
  }

  registerTrustedHandler("app:check-for-updates", async () => {
    try {
      const release = await fetchLatestGitHubRelease();
      const latestVersion = release.tag_name;
      const currentVersion = getAppInfo().version;
      const updateAvailable = isNewerVersion(currentVersion, latestVersion);

      return {
        success: true,
        updateAvailable,
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url,
        releaseNotes: release.body,
      };
    } catch (err) {
      console.error("Failed to check for updates:", err);
      return {
        success: false,
        error: err.message,
      };
    }
  });

  registerTrustedHandler("system:is-directory", async (_event, payload) => {
    const { folderPath, relativeTo } = payload || {};
    if (typeof folderPath !== "string") return false;
    try {
      let decodedPath = decodeURIComponent(folderPath);
      // Clean up file:// prefix
      if (decodedPath.startsWith("file:///")) {
        decodedPath = decodedPath.substring(8);
      } else if (decodedPath.startsWith("file://")) {
        decodedPath = decodedPath.substring(7);
      }

      // Replace slashes for normalization
      decodedPath = decodedPath.replace(/\\/g, "/");

      let targetPath;
      if (relativeTo && typeof relativeTo === "string" && !path.isAbsolute(decodedPath)) {
        // Decode relativeTo just in case it contains spaces/encoded characters
        let decodedRelativeTo = decodeURIComponent(relativeTo);
        if (decodedRelativeTo.startsWith("file:///")) {
          decodedRelativeTo = decodedRelativeTo.substring(8);
        } else if (decodedRelativeTo.startsWith("file://")) {
          decodedRelativeTo = decodedRelativeTo.substring(7);
        }
        const parentDir = path.dirname(decodedRelativeTo);
        targetPath = path.resolve(parentDir, decodedPath);
      } else {
        targetPath = path.resolve(decodedPath);
      }

      // Ensure platform-specific path formatting (especially backslashes on Windows)
      targetPath = path.normalize(targetPath);

      const stats = fs.statSync(targetPath);
      return stats.isDirectory() ? targetPath : false;
    } catch {
      return false;
    }
  });

  registerTrustedHandler("shell:open-folder", async (_event, payload) => {
    const { folderPath } = payload || {};
    if (typeof folderPath !== "string") {
      throw new Error("Invalid folderPath payload");
    }
    const resolved = path.normalize(path.resolve(folderPath));
    const openResult = await shell.openPath(resolved);
    if (openResult) {
      throw new Error(openResult);
    }
    return { success: true };
  });

  registerTrustedHandler("workspace-metadata:get-all", () => {
    if (typeof getWorkspaceMetadataStore === "function") {
      const store = getWorkspaceMetadataStore();
      if (store) return store.getAllMetadata();
    }
    return {};
  });

  registerTrustedHandler("workspace-metadata:update", (_event, payload) => {
    const { absolutePath, icon, color } = payload || {};
    if (!absolutePath) throw new Error("absolutePath is required");
    
    if (typeof getWorkspaceMetadataStore === "function") {
      const store = getWorkspaceMetadataStore();
      if (store) {
        store.updateMetadata(absolutePath, { icon, color });
        // Broadcast the update to all windows
        const allMeta = store.getAllMetadata();
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win || win.isDestroyed()) continue;
          win.webContents.send("workspace-metadata:changed", allMeta);
        }
        return { success: true };
      }
    }
    return { success: false };
  });

  registerTrustedHandler("shell:open-external", async (_event, payload) => {
    if (typeof payload?.url === "string" && /^https?:\/\//i.test(payload.url)) {
      await shell.openExternal(payload.url);
      return { success: true };
    }
    return { success: false };
  });

  return {
    getActiveProjectSlug,
  };
}

module.exports = { registerCoreIpcHandlers };
