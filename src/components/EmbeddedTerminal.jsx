import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import AppButton from "./AppButton";
import {
  createTerminalSession,
  killTerminalSession,
  onTerminalData,
  onTerminalExit,
  resizeTerminal,
  writeTerminalInput,
} from "../services/electronService";

export function EmbeddedTerminal({
  cwd,
  shellPreference = "auto",
  onShellPreferenceChange,
  onClose,
}) {
  const mountRef = useRef(null);
  const sessionIdRef = useRef("");
  const initialCwdRef = useRef(String(cwd || ""));
  const selectedShell = shellPreference === "bash" || shellPreference === "cmd" ? shellPreference : "auto";
  const [sessionPath, setSessionPath] = useState("");
  const [sessionShellLabel, setSessionShellLabel] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [retryTick, setRetryTick] = useState(0);

  const shellHint = (() => {
    const normalized = String(sessionShellLabel || "").trim().toLowerCase();
    if (selectedShell === "auto") {
      if (normalized === "bash") return "Default: Bash (auto-detected)";
      if (normalized === "cmd") return "Default: CMD (fallback)";
      return "Default shell (auto)";
    }
    if (selectedShell === "bash") return "Manual: Bash";
    if (selectedShell === "cmd") return "Manual: CMD";
    return "";
  })();

  useEffect(() => {
    setSessionError("");

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"Cascadia Code", Consolas, ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: "#0f1719",
        foreground: "#d2e2da",
        cursor: "#9fd6bc",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    if (mountRef.current) {
      terminal.open(mountRef.current);
      fitAddon.fit();
    }

    const handleResize = () => {
      try {
        fitAddon.fit();
        if (sessionIdRef.current) {
          resizeTerminal(sessionIdRef.current, terminal.cols, terminal.rows);
        }
      } catch {
        // Ignore resize errors when detached.
      }
    };

    const unbindTerminalData = terminal.onData((data) => {
      if (!sessionIdRef.current) return;
      writeTerminalInput(sessionIdRef.current, data);
    });

    const removeDataListener = onTerminalData((payload) => {
      if (!payload || payload.sessionId !== sessionIdRef.current) return;
      terminal.write(String(payload.data || ""));
    });

    const removeExitListener = onTerminalExit((payload) => {
      if (!payload || payload.sessionId !== sessionIdRef.current) return;
      terminal.write(`\r\n\x1b[33m[process exited: ${payload.code ?? "unknown"}]\x1b[0m\r\n`);
    });

    window.addEventListener("resize", handleResize);

    createTerminalSession(initialCwdRef.current, {
      role: "developer",
      shell: selectedShell === "auto" ? undefined : selectedShell,
    })
      .then((session) => {
        sessionIdRef.current = String(session?.sessionId || "");
        setSessionPath(String(session?.cwd || initialCwdRef.current || ""));
        setSessionShellLabel(String(session?.shellLabel || selectedShell || ""));
        handleResize();
      })
      .catch((error) => {
        const message = error?.message || "Unable to start terminal session.";
        if (selectedShell === "bash" && /bash is not installed|bash.*not available/i.test(message)) {
          setSessionError("Bash unavailable, switched to CMD.");
          onShellPreferenceChange?.("cmd");
          terminal.writeln("\x1b[33mBash unavailable, switching to CMD...\x1b[0m");
          return;
        }
        setSessionError(message);
        terminal.writeln(`\x1b[31m${message}\x1b[0m`);
      });

    return () => {
      window.removeEventListener("resize", handleResize);
      removeDataListener?.();
      removeExitListener?.();
      unbindTerminalData?.dispose();

      if (sessionIdRef.current) {
        killTerminalSession(sessionIdRef.current);
      }

      terminal.dispose();
      sessionIdRef.current = "";
    };
  }, [retryTick, selectedShell, onShellPreferenceChange]);

  return (
    <section className="embedded-terminal" aria-label="Embedded terminal">
      <div className="embedded-terminal-header">
        <strong>Terminal</strong>
        <div className="embedded-terminal-header-right">
          <div className="embedded-terminal-shell-switch" role="group" aria-label="Terminal shell selector">
            <AppButton
              variant="small"
              className={selectedShell === "bash" ? "active" : ""}
              onClick={() => onShellPreferenceChange?.("bash")}
              title="Use Bash shell"
            >
              Bash
            </AppButton>
            <AppButton
              variant="small"
              className={selectedShell === "cmd" ? "active" : ""}
              onClick={() => onShellPreferenceChange?.("cmd")}
              title="Use CMD shell"
            >
              CMD
            </AppButton>
          </div>
          {sessionShellLabel ? <span className="embedded-terminal-shell-label">{sessionShellLabel.toUpperCase()}</span> : null}
          {shellHint ? <span className="embedded-terminal-shell-hint">{shellHint}</span> : null}
          {sessionError ? (
            <span className="embedded-terminal-error" title={sessionError}>{sessionError}</span>
          ) : null}
          {sessionError ? (
            <AppButton variant="small" onClick={() => setRetryTick((value) => value + 1)}>
              Retry
            </AppButton>
          ) : null}
          <span title={sessionPath || initialCwdRef.current || ""}>{sessionPath || initialCwdRef.current || ""}</span>
          <AppButton variant="small" onClick={onClose}>Close</AppButton>
        </div>
      </div>
      <div className="embedded-terminal-xterm" ref={mountRef} />
    </section>
  );
}
