function createWindowLifecycle(deps) {
  const {
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
  } = deps;

  let mainWindow = null;
  let splashWindow = null;
  let mainLoadReady = false;
  let splashReady = false;
  let pendingSplashPayload = null;

  function resolveWindowIconPath() {
    const iconCandidates = [
      path.join(process.resourcesPath || "", "icon.ico"),
      path.join(process.resourcesPath || "", "icon.png"),
      path.join(process.cwd(), "build", "icon.ico"),
      path.join(process.cwd(), "build", "icon.png"),
      path.join(projectRoot, "build", "icon.ico"),
      path.join(projectRoot, "build", "icon.png")
    ];
    return iconCandidates.find((candidate) => candidate && fs.existsSync(candidate));
  }

  function resolveSplashBrandDataUri() {
    // Keep splash rendering path I/O-free to maximize click-to-splash responsiveness.
    return "";
  }

  function closeSplashWindow() {
    if (!splashWindow || splashWindow.isDestroyed()) {
      splashWindow = null;
      return;
    }
    splashWindow.close();
    splashWindow = null;
  }

  function applySplashProgress(payload = {}) {
    if (!splashWindow || splashWindow.isDestroyed() || !splashReady) {
      pendingSplashPayload = payload;
      return;
    }

    const percentValue = Math.max(0, Math.min(100, Number(payload.percent) || 0));
    const phaseValue = String(payload.phase || "Loading workspace");
    const escapedPhase = phaseValue.replace(/[\\]/g, "\\\\").replace(/"/g, '\\"');
    const escapedPercent = `${percentValue}%`.replace(/[\\]/g, "\\\\").replace(/"/g, '\\"');

    splashWindow.webContents.executeJavaScript(`
      (() => {
        const phase = document.getElementById("splash-phase");
        const percentText = document.getElementById("splash-percent");
        const fill = document.getElementById("splash-progress-fill");
        if (phase) phase.textContent = "${escapedPhase}";
        if (percentText) percentText.textContent = "${escapedPercent}";
        if (fill) fill.style.width = "${percentValue}%";
      })();
    `).catch(() => {});
  }

  function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.__bootShown) {
      mainWindow.__bootShown = true;
      mainWindow.center();
      mainWindow.show();
    }
    mainWindow.focus();
    closeSplashWindow();
  }

  function normalizeMenuText(value, fallback = "") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || fallback;
    }

    if (value && typeof value === "object") {
      for (const key of ["path", "label", "name", "title"]) {
        if (typeof value[key] === "string" && value[key].trim()) {
          return value[key].trim();
        }
      }
    }

    return fallback;
  }

  function normalizeRecentWorkspacePaths(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map((entry) => normalizeMenuText(entry, "")).filter(Boolean);
  }

  function createSplashWindow(windowIconPath) {
    splashWindow = new BrowserWindow({
      width: 560,
      height: 420,
      frame: false,
      movable: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      show: true,
      backgroundColor: "#dcece7",
      ...(windowIconPath ? { icon: windowIconPath } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      }
    });

    const splashTitle = String(app.getName() || "Notely");
    const splashBrandUri = resolveSplashBrandDataUri();
    const markNode = splashBrandUri
      ? `<img class="mark-image" src="${splashBrandUri}" alt="${splashTitle} logo" />`
      : `<div class="mark" aria-hidden="true"></div>`;
    const splashHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:" />
    <title>${splashTitle}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Segoe UI", "Inter", system-ui, sans-serif;
        background: radial-gradient(circle at 20% 20%, #eef7f4 0%, #d6e8e3 55%, #c5ded7 100%);
        color: #26424a;
      }
      .card {
        width: min(420px, calc(100vw - 32px));
        border: 1px solid #b8d2cb;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.86);
        box-shadow: 0 20px 45px rgba(18, 48, 53, 0.2);
        padding: 26px 22px;
        text-align: center;
      }
      .mark {
        width: 84px;
        height: 84px;
        margin: 0 auto 12px;
        border-radius: 16px;
        background: linear-gradient(135deg, #4f8f89 0%, #7ab3ac 100%);
        box-shadow: 0 10px 24px rgba(24, 60, 65, 0.23);
      }
      .mark-image {
        width: 92px;
        height: 92px;
        margin: 0 auto 10px;
        border-radius: 16px;
        object-fit: cover;
        box-shadow: 0 10px 24px rgba(24, 60, 65, 0.23);
      }
      h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
      }
      p {
        margin: 10px 0 0;
        color: #4a6870;
        font-size: 14px;
      }
      .progress {
        margin: 12px auto 0;
        width: min(280px, 100%);
        height: 10px;
        border-radius: 999px;
        border: 1px solid #b7d1ca;
        background: #eaf4f1;
        overflow: hidden;
      }
      .progress > span {
        display: block;
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #4f8f89 0%, #73ada6 100%);
        border-radius: 999px;
        transition: width 220ms ease;
      }
    </style>
  </head>
  <body>
    <div class="card">
      ${markNode}
      <h1>${splashTitle}</h1>
      <p id="splash-phase">Loading workspace...</p>
      <div class="progress" aria-hidden="true"><span id="splash-progress-fill"></span></div>
      <p id="splash-percent">0%</p>
    </div>
  </body>
</html>`;

    // Show immediately on app start so users get instant feedback after clicking .exe.
    splashWindow.center();
    splashWindow.show();
    splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
    splashWindow.webContents.once("did-finish-load", () => {
      splashReady = true;
      if (pendingSplashPayload) {
        applySplashProgress(pendingSplashPayload);
        pendingSplashPayload = null;
      }
    });

    splashWindow.on("closed", () => {
      splashReady = false;
      pendingSplashPayload = null;
      splashWindow = null;
    });
  }

  function buildContentSecurityPolicy() {
    const isDev = Boolean(rendererUrl);

    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self'";

    const connectSrc = isDev
      ? "connect-src 'self' https://api.languagetool.org ws: http://127.0.0.1:* http://localhost:*"
      : "connect-src 'self' https://api.languagetool.org";

    return [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
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
    webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch(() => {});
      }
      return { action: "deny" };
    });

    webContents.on("will-navigate", (event, url) => {
      if (isAppOriginUrl(url)) {
        return;
      }
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch(() => {});
      }
    });

    webContents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
  }

  function createWindow() {
    const isDevMode = Boolean(rendererUrl) || !app.isPackaged;
    const windowIconPath = resolveWindowIconPath();

    mainLoadReady = false;
    splashReady = false;
    pendingSplashPayload = null;

    createSplashWindow(windowIconPath);

    const win = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 980,
      minHeight: 640,
      show: false,
      backgroundColor: "#f5f3ef",
      ...(windowIconPath ? { icon: windowIconPath } : {}),
      webPreferences: {
        preload: path.join(__dirname, "..", "..", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false
      }
    });

    hardenWebContents(win.webContents);
    win.__bootShown = false;

    win.once("ready-to-show", () => {
      mainLoadReady = true;
      showMainWindow();
    });

    // Fail-safe: ensure app can still open if renderer boot handshake never arrives.
    setTimeout(() => {
      if (!win.__bootShown) {
        showMainWindow();
      }
    }, 20000);

    win.webContents.on("did-fail-load", (_event, code, desc, url) => {
      console.error("Renderer failed to load:", { code, desc, url });
      showMainWindow();
    });

    if (rendererUrl) {
      win.loadURL(rendererUrl);
    } else {
      win.loadFile(path.join(projectRoot, "dist", "index.html"));
    }

    win.__menuContext = {
      screen: "landing",
      viewMode: "tile",
      densityMode: "comfortable",
      typoCheckEnabled: true,
      screenCaptureMode: "auto",
      outlineEnabled: true,
      splitPreviewEnabled: false,
      focusModeEnabled: false,
      terminalOpen: false,
      terminalShell: "auto",
      isDevMode,
      dirty: false,
      canRemoveFolder: false,
      currentFolderLabel: "",
    };
    Menu.setApplicationMenu(buildAppMenu(win, win.__menuContext));
    mainWindow = win;

    win.on("closed", () => {
      terminalIpc.disposeForWindow(win.id);

      if (mainWindow === win) {
        mainWindow = null;
      }
    });
  }

  function createReferenceWindow(filePath) {
    const windowIconPath = resolveWindowIconPath();
    const query = new URLSearchParams({ filePath: String(filePath || "") }).toString();
    const win = new BrowserWindow({
      width: 980,
      height: 760,
      minWidth: 720,
      minHeight: 520,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: "#f5f3ef",
      title: "Reference Note",
      ...(windowIconPath ? { icon: windowIconPath } : {}),
      webPreferences: {
        preload: path.join(__dirname, "..", "..", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      }
    });

    hardenWebContents(win.webContents);

    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });

    win.webContents.on("did-fail-load", (_event, code, desc, url) => {
      console.error("Reference window failed to load:", { code, desc, url });
      win.show();
    });

    if (rendererUrl) {
      const referenceUrl = new URL("reference.html", rendererUrl.endsWith("/") ? rendererUrl : `${rendererUrl}/`);
      referenceUrl.search = query;
      win.loadURL(referenceUrl.toString());
    } else {
      win.loadFile(path.join(projectRoot, "dist", "reference.html"), {
        search: `?${query}`,
      });
    }

    return win;
  }

  function focusOrCreateWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (mainWindow.__bootShown) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.focus();
    }
  }

  function markRendererBootReady(webContents) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!webContents || webContents.id !== mainWindow.webContents.id) return;
    if (mainLoadReady) {
      showMainWindow();
    }
  }

  function updateRendererBootProgress(webContents, payload) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!webContents || webContents.id !== mainWindow.webContents.id) return;
    applySplashProgress(payload || {});
  }

  function handleBrowserWindowFocus(_event, win) {
    const context = win?.__menuContext || {
      screen: "landing",
      viewMode: "tile",
      densityMode: "comfortable",
      typoCheckEnabled: true,
      screenCaptureMode: "auto",
      outlineEnabled: true,
      splitPreviewEnabled: false,
      focusModeEnabled: false,
      terminalOpen: false,
      terminalShell: "auto",
      isDevMode: Boolean(rendererUrl) || !app.isPackaged,
      dirty: false,
      canRemoveFolder: false,
      currentFolderLabel: "",
      recentWorkspacePaths: [],
    };
    Menu.setApplicationMenu(buildAppMenu(win, context));
  }

  function handleMenuContextUpdate(event, context) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;

    win.__menuContext = {
      screen: context?.screen === "document" ? "document" : "landing",
      viewMode: context?.viewMode === "table" ? "table" : "tile",
      densityMode: context?.densityMode === "compact" ? "compact" : "comfortable",
      typoCheckEnabled: context?.typoCheckEnabled !== false,
      screenCaptureMode: context?.screenCaptureMode === "review" ? "review" : "auto",
      outlineEnabled: context?.outlineEnabled !== false,
      splitPreviewEnabled: context?.splitPreviewEnabled === true,
      focusModeEnabled: context?.focusModeEnabled === true,
      terminalOpen: context?.terminalOpen === true,
      terminalShell: context?.terminalShell === "bash" || context?.terminalShell === "cmd"
        ? context.terminalShell
        : "auto",
      isDevMode: Boolean(rendererUrl) || !app.isPackaged,
      dirty: Boolean(context?.dirty),
      canRemoveFolder: Boolean(context?.canRemoveFolder),
      currentFolderLabel: normalizeMenuText(context?.currentFolderLabel, ""),
      recentWorkspacePaths: normalizeRecentWorkspacePaths(context?.recentWorkspacePaths),
    };

    Menu.setApplicationMenu(buildAppMenu(win, win.__menuContext));
  }

  function registerAppWindowEvents() {
    const gotSingleInstanceLock = app.requestSingleInstanceLock();

    if (!gotSingleInstanceLock) {
      app.quit();
      return false;
    }

    app.on("second-instance", () => {
      focusOrCreateWindow();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    app.on("browser-window-focus", handleBrowserWindowFocus);

    return true;
  }

  return {
    applyContentSecurityPolicy,
    createWindow,
    createReferenceWindow,
    focusOrCreateWindow,
    registerAppWindowEvents,
    handleMenuContextUpdate,
    markRendererBootReady,
    updateRendererBootProgress,
    getMainWindow: () => mainWindow,
  };
}

module.exports = { createWindowLifecycle };
