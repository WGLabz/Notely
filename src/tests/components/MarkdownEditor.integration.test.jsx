// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../../components/MarkdownEditor";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let originalRangeGetClientRects;
let originalRangeGetBoundingClientRect;

beforeAll(() => {
  if (typeof window.Range === "undefined") return;

  originalRangeGetClientRects = window.Range.prototype.getClientRects;
  originalRangeGetBoundingClientRect = window.Range.prototype.getBoundingClientRect;

  window.Range.prototype.getClientRects = function getClientRectsPolyfill() {
    const rect = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
    return [rect];
  };

  window.Range.prototype.getBoundingClientRect = function getBoundingClientRectPolyfill() {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
});

afterAll(() => {
  if (typeof window.Range === "undefined") return;
  if (originalRangeGetClientRects) {
    window.Range.prototype.getClientRects = originalRangeGetClientRects;
  }
  if (originalRangeGetBoundingClientRect) {
    window.Range.prototype.getBoundingClientRect = originalRangeGetBoundingClientRect;
  }
});

function renderEditor(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<MarkdownEditor {...props} />);
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

function openContextMenu(host, coordinates = { x: 80, y: 80 }) {
  const editor = host.querySelector(".cm-content");
  expect(editor).toBeTruthy();

  act(() => {
    editor.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      clientX: coordinates.x,
      clientY: coordinates.y,
    }));
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("MarkdownEditor context menu suggestion UX", () => {
  const baseProps = {
    value: "liek text",
    onChange: vi.fn(),
    textareaRef: { current: null },
    onNotify: vi.fn(),
    onIgnoreSpellingWord: vi.fn(),
    onJumpToLine: vi.fn(),
    validationIssues: [
      {
        line: 1,
        column: 1,
        message: "Possible spelling: \"liek\"",
        ruleId: "spelling",
        severity: "warning",
        length: 4,
        sourceLength: 4,
        word: "liek",
        suggestion: "like",
        suggestions: ["like", "lake", "leak"],
      },
    ],
  };

  it("renders submenu suggestion labels without repeated apply prefix", () => {
    const view = renderEditor(baseProps);
    openContextMenu(view.host);

    const submenuButtons = Array.from(view.host.querySelectorAll(".editor-fix-submenu-list button"));
    expect(submenuButtons.length).toBeGreaterThan(1);

    const labels = submenuButtons.map((button) => button.textContent?.trim() || "");
    expect(labels).toContain("like");
    expect(labels).toContain("lake");
    expect(labels.some((label) => label.startsWith("Apply:"))).toBe(false);

    view.unmount();
  });

  it("flips suggestion flyout left and up when space is constrained", () => {
    const view = renderEditor(baseProps);
    openContextMenu(view.host, { x: 280, y: 190 });

    const flyout = view.host.querySelector(".editor-fix-submenu-flyout");
    const trigger = view.host.querySelector(".editor-fix-submenu-trigger");
    const submenu = view.host.querySelector(".editor-fix-submenu-list");

    expect(flyout).toBeTruthy();
    expect(trigger).toBeTruthy();
    expect(submenu).toBeTruthy();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 300 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 200 });

    trigger.getBoundingClientRect = () => ({
      x: 250,
      y: 170,
      width: 40,
      height: 24,
      top: 170,
      right: 290,
      bottom: 194,
      left: 250,
      toJSON() {
        return this;
      },
    });

    submenu.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 220,
      height: 150,
      top: 0,
      right: 220,
      bottom: 150,
      left: 0,
      toJSON() {
        return this;
      },
    });

    act(() => {
      flyout.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(flyout.classList.contains("open-left")).toBe(true);
    expect(flyout.classList.contains("open-up")).toBe(true);

    view.unmount();
  });
});
