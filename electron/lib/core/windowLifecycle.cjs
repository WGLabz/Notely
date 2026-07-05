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
    getInitialZoomFactor,
  } = deps;

  let mainWindow = null;
  let splashWindow = null;
  let mainLoadReady = false;
  let rendererBootReady = false;
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
    try {
      const iconCandidates = [
        path.join(process.resourcesPath || "", "icon.png"),
        path.join(process.cwd(), "build", "icon.png"),
        path.join(projectRoot, "build", "icon.png")
      ];
      const iconPath = iconCandidates.find(p => p && fs.existsSync(p));
      if (iconPath) {
        const buffer = fs.readFileSync(iconPath);
        return `data:image/png;base64,${buffer.toString("base64")}`;
      }
    } catch (_e) {
      // fallback to empty if read fails
    }
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

    const rawName = String(app.getName() || "Notely");
    const splashTitle = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const splashBrandUri = resolveSplashBrandDataUri();
    const markNode = splashBrandUri
      ? `<img class="mark-image" src="${splashBrandUri}" alt="${splashTitle} logo" />`
      : `<div class="mark" aria-hidden="true"></div>`;
    const splashHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:" />
    <title>\${splashTitle}</title>
    <style>
      * { box-sizing: border-box; }
      :root {
        --bg-color: #f8fafc;
        --card-bg: rgba(255, 255, 255, 0.6);
        --card-border: rgba(255, 255, 255, 0.8);
        --card-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
        --text-main: #0f172a;
        --text-muted: #64748b;
        --accent: #0ea5e9;
        --accent-glow: rgba(14, 165, 233, 0.3);
        --progress-bg: #e2e8f0;
        --progress-fill: linear-gradient(90deg, #38bdf8, #0284c7);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg-color: #0f172a;
          --card-bg: rgba(30, 41, 59, 0.6);
          --card-border: rgba(255, 255, 255, 0.08);
          --card-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
          --accent: #38bdf8;
          --accent-glow: rgba(56, 189, 248, 0.2);
          --progress-bg: #334155;
          --progress-fill: linear-gradient(90deg, #0ea5e9, #38bdf8);
        }
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: var(--bg-color);
        color: var(--text-main);
        overflow: hidden;
      }
      
      .bg-effects {
        position: absolute;
        inset: 0;
        z-index: 0;
        overflow: hidden;
      }
      
      .bg-glow {
        position: absolute;
        width: 60vh;
        height: 60vh;
        background: var(--accent);
        filter: blur(120px);
        opacity: 0.15;
        border-radius: 50%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        animation: pulse 6s infinite alternate ease-in-out;
      }

      @keyframes pulse {
        0% { transform: translate(-50%, -50%) scale(0.85); opacity: 0.1; }
        100% { transform: translate(-50%, -50%) scale(1.15); opacity: 0.2; }
      }

      .card {
        position: relative;
        z-index: 1;
        width: min(420px, calc(100vw - 32px));
        border: 1px solid var(--card-border);
        border-radius: 24px;
        background: var(--card-bg);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        box-shadow: var(--card-shadow);
        padding: 48px 40px;
        text-align: center;
        animation: floatIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes floatIn {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .mark {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        border-radius: 20px;
        background: var(--progress-fill);
        box-shadow: 0 12px 32px var(--accent-glow);
      }
      
      .mark-image {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        border-radius: 20px;
        object-fit: cover;
        box-shadow: 0 12px 32px var(--accent-glow);
      }
      
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.5px;
      }
      
      p {
        margin: 0;
        color: var(--text-muted);
        font-size: 14px;
        font-weight: 500;
      }
      
      .progress-container {
        margin-top: 40px;
      }
      
      .progress {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background: var(--progress-bg);
        overflow: hidden;
        margin-bottom: 12px;
      }
      
      .progress > span {
        display: block;
        height: 100%;
        width: 0%;
        background: var(--progress-fill);
        border-radius: 999px;
        transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      #splash-percent {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.5px;
        color: var(--text-muted);
      }
    </style>
  </head>
  <body>
    <div class="bg-effects"><div class="bg-glow"></div></div>
    <div class="card">
      ${markNode}
      <h1>${splashTitle}</h1>
      <p id="splash-phase">Waking up...</p>
      
      <div class="progress-container">
        <div class="progress" aria-hidden="true"><span id="splash-progress-fill"></span></div>
        <p id="splash-percent">0%</p>
      </div>
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
    rendererBootReady = false;
    splashReady = false;
    pendingSplashPayload = null;

    createSplashWindow(windowIconPath);

    const win = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 860,
      minHeight: 560,
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

    const initialZoom = Number.isFinite(getInitialZoomFactor?.()) ? getInitialZoomFactor() : 1;
    win.webContents.setZoomFactor(Math.max(0.75, Math.min(2, initialZoom)));

    hardenWebContents(win.webContents);
    win.__bootShown = false;

    win.once("ready-to-show", () => {
      mainLoadReady = true;
      if (rendererBootReady) {
        showMainWindow();
      }
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
      previewImageMode: "thumbnail",
      embeddedMarkdownMode: "open",
      screenCaptureMode: "auto",
      themePreference: "auto",
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
      minWidth: 640,
      minHeight: 460,
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

    const initialZoom = Number.isFinite(getInitialZoomFactor?.()) ? getInitialZoomFactor() : 1;
    win.webContents.setZoomFactor(Math.max(0.75, Math.min(2, initialZoom)));

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
    rendererBootReady = true;
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
      previewImageMode: "thumbnail",
      embeddedMarkdownMode: "open",
      screenCaptureMode: "auto",
      themePreference: "auto",
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
      previewImageMode: context?.previewImageMode === "original" ? "original" : "thumbnail",
      embeddedMarkdownMode: context?.embeddedMarkdownMode === "inline" ? "inline" : "open",
      screenCaptureMode: context?.screenCaptureMode === "review" ? "review" : "auto",
      themePreference: ["auto", "light", "dark"].includes(context?.themePreference)
        ? context.themePreference
        : "auto",
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
