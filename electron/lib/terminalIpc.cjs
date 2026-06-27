function createTerminalIpc(deps) {
  const {
    BrowserWindow,
    pty,
    filePathWithin,
    ensureDir,
    getNotesRoot,
    getActiveProject,
  } = deps;

  const terminalSessions = new Map();
  let nextTerminalSessionId = 1;

  function resolveTerminalCwd(rawCwd) {
    const requested = String(rawCwd || "").trim();
    const fallback = getActiveProject()?.rootPath || getNotesRoot();
    const resolved = require("node:path").resolve(requested || fallback);
    if (!filePathWithin(getNotesRoot(), resolved)) {
      throw new Error("Invalid terminal path.");
    }
    ensureDir(resolved);
    return resolved;
  }

  function disposeTerminalSession(sessionId) {
    const session = terminalSessions.get(sessionId);
    if (!session) return;

    terminalSessions.delete(sessionId);
    try {
      session.onDataDisposable?.dispose?.();
      session.onExitDisposable?.dispose?.();
      session.process.kill();
    } catch {
      // Ignore cleanup errors.
    }
  }

  function getOwnedTerminalSession(event, sessionId) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      throw new Error("Terminal window is unavailable.");
    }

    const session = terminalSessions.get(sessionId);
    if (!session) {
      throw new Error("Terminal session not found.");
    }

    if (session.windowId !== win.id) {
      throw new Error("Terminal session ownership mismatch.");
    }

    return session;
  }

  function registerHandlers(ipcMain) {
    ipcMain.handle("terminal:create", (event, payload) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) {
        throw new Error("Terminal window is unavailable.");
      }

      const cwd = resolveTerminalCwd(payload?.cwd);
      const sessionId = String(nextTerminalSessionId++);
      const shell = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : (process.env.SHELL || "bash");
      const shellArgs = process.platform === "win32" ? [] : ["-l"];
      const child = pty.spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env, TERM: "xterm-256color" },
        name: "xterm-256color",
        cols: 120,
        rows: 30,
        useConpty: process.platform === "win32"
      });

      const onDataDisposable = child.onData((chunk) => {
        if (win.isDestroyed()) return;
        win.webContents.send("terminal:data", { sessionId, data: String(chunk || "") });
      });

      const onExitDisposable = child.onExit(({ exitCode }) => {
        if (!win.isDestroyed()) {
          win.webContents.send("terminal:exit", { sessionId, code: Number.isInteger(exitCode) ? exitCode : null });
        }
        terminalSessions.delete(sessionId);
      });

      terminalSessions.set(sessionId, {
        process: child,
        windowId: win.id,
        onDataDisposable,
        onExitDisposable
      });

      return {
        sessionId,
        cwd
      };
    });

    ipcMain.handle("terminal:write", (event, payload) => {
      const sessionId = String(payload?.sessionId || "").trim();
      const data = String(payload?.data || "");
      const session = getOwnedTerminalSession(event, sessionId);
      session.process.write(data);
      return true;
    });

    ipcMain.handle("terminal:resize", (event, payload) => {
      const sessionId = String(payload?.sessionId || "").trim();
      const cols = Math.max(2, Number(payload?.cols || 0) | 0);
      const rows = Math.max(2, Number(payload?.rows || 0) | 0);
      if (!sessionId) return true;
      const session = getOwnedTerminalSession(event, sessionId);
      session.process.resize(cols, rows);
      return true;
    });

    ipcMain.handle("terminal:kill", (event, payload) => {
      const sessionId = String(payload?.sessionId || "").trim();
      if (!sessionId) return true;
      getOwnedTerminalSession(event, sessionId);
      disposeTerminalSession(sessionId);
      return true;
    });
  }

  function disposeForWindow(windowId) {
    for (const [sessionId, session] of terminalSessions.entries()) {
      if (session.windowId === windowId) {
        disposeTerminalSession(sessionId);
      }
    }
  }

  function disposeAll() {
    for (const sessionId of terminalSessions.keys()) {
      disposeTerminalSession(sessionId);
    }
  }

  return {
    registerHandlers,
    disposeForWindow,
    disposeAll,
  };
}

module.exports = { createTerminalIpc };
