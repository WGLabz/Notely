// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateTerminalSession = vi.fn();
const mockKillTerminalSession = vi.fn();
const mockOnTerminalData = vi.fn(() => () => {});
const mockOnTerminalExit = vi.fn(() => () => {});
const mockResizeTerminal = vi.fn();
const mockWriteTerminalInput = vi.fn();

vi.mock("../../services/electronService", () => ({
  createTerminalSession: (...args) => mockCreateTerminalSession(...args),
  killTerminalSession: (...args) => mockKillTerminalSession(...args),
  onTerminalData: (...args) => mockOnTerminalData(...args),
  onTerminalExit: (...args) => mockOnTerminalExit(...args),
  resizeTerminal: (...args) => mockResizeTerminal(...args),
  writeTerminalInput: (...args) => mockWriteTerminalInput(...args),
}));

const mockTerminal = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  dispose: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  cols: 120,
  rows: 30,
};

const mockFitAddon = {
  fit: vi.fn(),
};

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn(() => mockTerminal),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(() => mockFitAddon),
}));

import { EmbeddedTerminal } from "../../components/EmbeddedTerminal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderTerminal(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  function Harness(harnessProps) {
    const [shell, setShell] = useState(harnessProps.shellPreference ?? "auto");
    return (
      <EmbeddedTerminal
        {...harnessProps}
        shellPreference={shell}
        onShellPreferenceChange={(next) => {
          harnessProps.onShellPreferenceChange?.(next);
          setShell(next);
        }}
      />
    );
  }

  act(() => {
    root.render(<Harness {...props} />);
  });

  return {
    host,
    rerender(nextProps) {
      act(() => {
        root.render(<Harness {...nextProps} />);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockCreateTerminalSession.mockReset();
  mockKillTerminalSession.mockReset();
  mockOnTerminalData.mockClear();
  mockOnTerminalExit.mockClear();
  mockResizeTerminal.mockReset();
  mockWriteTerminalInput.mockReset();
  mockTerminal.loadAddon.mockClear();
  mockTerminal.open.mockClear();
  mockTerminal.write.mockClear();
  mockTerminal.writeln.mockClear();
  mockTerminal.dispose.mockClear();
  mockTerminal.onData.mockClear();
  mockFitAddon.fit.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("EmbeddedTerminal shell behavior", () => {
  it("creates terminal session with required developer role", async () => {
    mockCreateTerminalSession.mockResolvedValueOnce({ sessionId: "1", cwd: "C:/notes", shellLabel: "cmd" });

    const view = renderTerminal({ cwd: "C:/notes", onClose: vi.fn() });
    await flushPromises();

    expect(mockCreateTerminalSession).toHaveBeenCalledWith("C:/notes", { role: "developer", shell: undefined });

    view.unmount();
  });

  it("falls back to CMD when Bash is unavailable", async () => {
    const onShellPreferenceChange = vi.fn();
    mockCreateTerminalSession
      .mockRejectedValueOnce(new Error("Bash is not installed or not available in PATH."))
      .mockResolvedValueOnce({ sessionId: "2", cwd: "C:/notes", shellLabel: "cmd" });

    const view = renderTerminal({ cwd: "C:/notes", shellPreference: "bash", onShellPreferenceChange, onClose: vi.fn() });
    await flushPromises();
    await flushPromises();

    expect(mockCreateTerminalSession).toHaveBeenNthCalledWith(1, "C:/notes", { role: "developer", shell: "bash" });
    expect(mockCreateTerminalSession).toHaveBeenNthCalledWith(2, "C:/notes", { role: "developer", shell: "cmd" });
    expect(onShellPreferenceChange).toHaveBeenCalledWith("cmd");

    view.unmount();
  });

  it("restarts terminal session when switching shell", async () => {
    mockCreateTerminalSession
      .mockResolvedValueOnce({ sessionId: "1", cwd: "C:/notes", shellLabel: "cmd" })
      .mockResolvedValueOnce({ sessionId: "2", cwd: "C:/notes", shellLabel: "bash" });

    const view = renderTerminal({ cwd: "C:/notes", shellPreference: "cmd", onClose: vi.fn() });
    await flushPromises();

    const bashButton = view.host.querySelector('button[data-tooltip="Use Bash shell"]');
    expect(bashButton).toBeTruthy();

    act(() => {
      bashButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(mockCreateTerminalSession).toHaveBeenNthCalledWith(2, "C:/notes", { role: "developer", shell: "bash" });

    view.unmount();
  });
});
