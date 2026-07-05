import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X } from "lucide-react";
import AppButton from "./AppButton";
import AppIconButton from "./AppIconButton";
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
  const [sessionShellLabel, setSessionShellLabel] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const activeShellButton = (() => {
    if (selectedShell === "bash" || selectedShell === "cmd") {
      return selectedShell;
    }
    const normalized = String(sessionShellLabel || "").trim().toLowerCase();
    return normalized === "bash" || normalized === "cmd" ? normalized : "";
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
        <div className="embedded-terminal-header-left">
          <strong>Terminal</strong>
          <div className="embedded-terminal-shell-switch" role="group" aria-label="Terminal shell selector">
            <AppButton
              variant="small"
              className={activeShellButton === "cmd" ? "active" : ""}
              onClick={() => onShellPreferenceChange?.("cmd")}
              data-tooltip="Use CMD shell"
            >
              CMD
            </AppButton>
            <AppButton
              variant="small"
              className={activeShellButton === "bash" ? "active" : ""}
              onClick={() => onShellPreferenceChange?.("bash")}
              data-tooltip="Use BASH shell"
            >
              BASH
            </AppButton>
          </div>
        </div>
        <div className="embedded-terminal-header-right">
          {sessionError ? (
            <span className="embedded-terminal-error" data-tooltip={sessionError}>{sessionError}</span>
          ) : null}
          {sessionError ? (
            <AppButton variant="small" onClick={() => setRetryTick((value) => value + 1)}>
              Retry
            </AppButton>
          ) : null}
          <AppIconButton className="embedded-terminal-close" onClick={onClose} aria-label="Close terminal" data-tooltip="Close terminal">
            <X size={14} />
          </AppIconButton>
        </div>
      </div>
      <div className="embedded-terminal-xterm" ref={mountRef} />
    </section>
  );
}
