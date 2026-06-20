// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentDetail } from "./DocumentDetail";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderDetail(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<DocumentDetail {...props} />);
  });

  return {
    host,
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DocumentDetail popup and panel toggles", () => {
  const baseProps = {
    document: {
      title: "Example Note",
      fileName: "example-note.md",
      filePath: "C:/notes/example-note.md",
      header: "Title: Example Note",
      rawNotes: "# Heading\nBody",
      cleansed: "Formal",
      metadata: {},
    },
    history: [
      {
        versionPath: "C:/notes/.notes-app/versions/example-note/2026-06-20_12-00-00.md",
        createdAt: "2026-06-20T12:00:00.000Z",
        reason: "manual-save",
      },
    ],
    activeTab: "raw",
    setActiveTab: vi.fn(),
    mode: "edit",
    setMode: vi.fn(),
    onChange: vi.fn(),
    onRenameDocument: vi.fn(async () => true),
    onSave: vi.fn(),
    onReloadFromDisk: vi.fn(),
    onRefreshHistory: vi.fn(),
    saving: false,
    dirty: false,
    onHome: vi.fn(),
    onNotify: vi.fn(),
  };

  it("opens versions popup from the top controls", () => {
    const view = renderDetail(baseProps);
    const versionsButton = view.host.querySelector('button[title="Toggle versions"]');

    expect(versionsButton).toBeTruthy();

    act(() => {
      versionsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const popup = view.host.querySelector('[aria-label="Versions"]');
    expect(popup).toBeTruthy();
    expect(popup.textContent).toContain("manual-save");

    view.unmount();
  });

  it("toggles outline collapsed state", () => {
    const view = renderDetail(baseProps);
    const workspace = view.host.querySelector('.workspace');
    const outlineToggle = view.host.querySelector('button[title="Toggle outline"]');

    expect(workspace.className).not.toContain("outline-panel-collapsed");
    expect(outlineToggle).toBeTruthy();

    act(() => {
      outlineToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(workspace.className).toContain("outline-panel-collapsed");

    view.unmount();
  });
});