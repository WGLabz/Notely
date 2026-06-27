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
        preload: path.join(__dirname, "..", "preload.cjs"),
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

  function focusOrCreateWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }

  function handleBrowserWindowFocus(_event, win) {
    const context = win?.__menuContext || { screen: "landing", viewMode: "tile", dirty: false };
    Menu.setApplicationMenu(buildAppMenu(win, context));
  }

  function handleMenuContextUpdate(event, context) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;

    win.__menuContext = {
      screen: context?.screen === "document" ? "document" : "landing",
      viewMode: context?.viewMode === "table" ? "table" : "tile",
      dirty: Boolean(context?.dirty)
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
    focusOrCreateWindow,
    registerAppWindowEvents,
    handleMenuContextUpdate,
    getMainWindow: () => mainWindow,
  };
}

module.exports = { createWindowLifecycle };
