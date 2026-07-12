/**
 * helpWindow.cjs
 *
 * Implements Option B: Launches a native Electron window loaded with the pre-built
 * VitePress static site content, providing offline-first local search, theme sync,
 * and high-fidelity sidebar navigation directly inside the app shell.
 */

"use strict";

const { BrowserWindow, nativeTheme } = require("electron");

let helpWindowInstance = null;

function createHelpWindow(parentWindow) {
  if (helpWindowInstance && !helpWindowInstance.isDestroyed()) {
    helpWindowInstance.focus();
    return helpWindowInstance;
  }

  // Detect which theme is current in the parent context
  const systemIsDark = nativeTheme.shouldUseDarkColors;

  const fs = require("node:fs");
  const path = require("node:path");
  const { app } = require("electron");

  // Resolve branding icon path
  const projectRoot = app.getAppPath();
  const iconCandidates = [
    path.join(process.resourcesPath || "", "icon.ico"),
    path.join(process.resourcesPath || "", "icon.png"),
    path.join(projectRoot, "build", "icon.ico"),
    path.join(projectRoot, "build", "icon.png"),
    path.join(projectRoot, "assets", "icon.png"),
    path.join(projectRoot, "assets", "icon.ico")
  ];
  const windowIconPath = iconCandidates.find((candidate) => candidate && fs.existsSync(candidate));

  helpWindowInstance = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    parent: parentWindow || undefined,
    show: false,
    title: "Notely Documentation",
    autoHideMenuBar: true,
    backgroundColor: systemIsDark ? "#141b1d" : "#f2f4f3",
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load local VitePress static assets via the registered custom help-doc protocol
  helpWindowInstance.loadURL("help-doc://docs/index.html").catch((err) => {
    console.error("[HelpWindow] Failed to load local docs. Did you run `npm run docs:build`?", err);
  });

  helpWindowInstance.once("ready-to-show", () => {
    // Inject the theme preference to synchronize dark/light modes
    const themeKey = systemIsDark ? "dark" : "light";
    helpWindowInstance.webContents.executeJavaScript(`
      try {
        localStorage.setItem('vitepress-theme-appearance', '${themeKey}');
        document.documentElement.classList.toggle('dark', ${systemIsDark});
      } catch (e) {
        console.error(e);
      }
    `).finally(() => {
      helpWindowInstance.show();
    });
  });

  helpWindowInstance.on("closed", () => {
    helpWindowInstance = null;
  });

  // Handle external link clicks
  helpWindowInstance.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("help-doc:")) {
      return { action: "allow" };
    }
    // Open external URLs in default system browser
    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });

  return helpWindowInstance;
}

module.exports = {
  createHelpWindow,
};
