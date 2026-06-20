import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  createTerminalSession,
  killTerminalSession,
  onTerminalData,
  onTerminalExit,
  resizeTerminal,
  writeTerminalInput,
} from "../services/electronService";

export function EmbeddedTerminal({ cwd, onClose }) {
  const mountRef = useRef(null);
  const sessionIdRef = useRef("");
  const initialCwdRef = useRef(String(cwd || ""));
  const [sessionPath, setSessionPath] = useState("");

  useEffect(() => {
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

    createTerminalSession(initialCwdRef.current)
      .then((session) => {
        sessionIdRef.current = String(session?.sessionId || "");
        setSessionPath(String(session?.cwd || initialCwdRef.current || ""));
        handleResize();
      })
      .catch((error) => {
        terminal.writeln(`\x1b[31m${error?.message || "Unable to start terminal session."}\x1b[0m`);
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
  }, []);

  return (
    <section className="embedded-terminal" aria-label="Embedded terminal">
      <div className="embedded-terminal-header">
        <strong>Terminal</strong>
        <div className="embedded-terminal-header-right">
          <span title={sessionPath || initialCwdRef.current || ""}>{sessionPath || initialCwdRef.current || ""}</span>
          <button className="small-button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="embedded-terminal-xterm" ref={mountRef} />
    </section>
  );
}
