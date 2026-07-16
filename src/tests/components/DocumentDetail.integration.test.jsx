// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DocumentDetail } from "../../components/DocumentDetail";

vi.mock("../../components/ExcalidrawEditor", () => ({
  default: () => null,
}));

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

function renderDetail(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<DocumentDetail {...props} />);
  });

  return {
    host,
    rerender(nextProps) {
      act(() => {
        root.render(<DocumentDetail {...nextProps} />);
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

function setTextInputValue(input, value) {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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
    onSave: vi.fn(),
    onRenameTitle: vi.fn().mockResolvedValue(true),
    onRefreshHistory: vi.fn(),
    saving: false,
    dirty: false,
    onNotify: vi.fn(),
    menuAction: null,
  };

  it("opens versions popup from menu action", () => {
    const view = renderDetail(baseProps);
    act(() => {
      view.rerender({
        ...baseProps,
        menuAction: { action: "manage-versions", nonce: Date.now() },
      });
    });

    const closeBtn = view.host.querySelector('[aria-label="Close history panel"]');
    expect(closeBtn).toBeTruthy();

    view.unmount();
  });

  it("requests outline toggle from menu action", () => {
    const view = renderDetail(baseProps);
    const onOutlineEnabledChange = vi.fn();

    expect(onOutlineEnabledChange).not.toHaveBeenCalled();

    act(() => {
      view.rerender({
        ...baseProps,
        menuAction: { action: "toggle-outline-enabled", nonce: Date.now() },
        outlineEnabled: true,
        onOutlineEnabledChange,
      });
    });

    expect(onOutlineEnabledChange).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it("does not process the same menu nonce twice", () => {
    const view = renderDetail(baseProps);
    const onOutlineEnabledChange = vi.fn();
    const nonce = Date.now();

    act(() => {
      view.rerender({
        ...baseProps,
        menuAction: { action: "toggle-outline-enabled", nonce },
        onOutlineEnabledChange,
      });
    });

    act(() => {
      view.rerender({
        ...baseProps,
        menuAction: { action: "toggle-outline-enabled", nonce },
        onOutlineEnabledChange,
      });
    });

    expect(onOutlineEnabledChange).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it("opens find panel from menu action", () => {
    const view = renderDetail(baseProps);

    act(() => {
      view.rerender({
        ...baseProps,
        menuAction: { action: "find-replace", nonce: Date.now() },
      });
    });

    expect(view.host.querySelector('[aria-label="Find and replace"]')).toBeTruthy();

    view.unmount();
  });

  it("closes Export PDF content dropdown after selecting an option", () => {
    const view = renderDetail({
      ...baseProps,
      menuAction: { action: "export-pdf", nonce: Date.now() },
    });

    const contentSelectTrigger = view.host.querySelector("#pdf-export-content-mode");
    expect(contentSelectTrigger).toBeTruthy();

    act(() => {
      contentSelectTrigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector(".app-select-panel")).toBeTruthy();

    const rawNotesOption = Array.from(view.host.querySelectorAll(".app-select-option")).find((button) =>
      button.textContent?.includes("Raw Notes")
    );
    expect(rawNotesOption).toBeTruthy();

    act(() => {
      rawNotesOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector(".app-select-panel")).toBeFalsy();

    view.unmount();
  });

  it("opens find-only panel from find action", () => {
    const view = renderDetail({
      ...baseProps,
      menuAction: { action: "find-in-note", nonce: Date.now() },
    });

    expect(view.host.querySelector('[aria-label="Find in note"]')).toBeTruthy();
    expect(view.host.querySelector('input[placeholder="Replace"]')).toBeFalsy();
    expect(Array.from(view.host.querySelectorAll("button")).some((button) => button.textContent === "Replace")).toBe(false);

    view.unmount();
  });

  it("switches preview mode back to edit when opening find", () => {
    const setMode = vi.fn();
    const view = renderDetail({
      ...baseProps,
      mode: "preview",
      setMode,
      menuAction: { action: "find-replace", nonce: Date.now() },
    });

    expect(setMode).toHaveBeenCalledWith("edit");
    expect(view.host.querySelector('[aria-label="Find and replace"]')).toBeTruthy();

    view.unmount();
  });

  it("shows active find count when query matches note content", () => {
    const view = renderDetail({
      ...baseProps,
      document: {
        ...baseProps.document,
        rawNotes: "alpha beta\nalpha gamma",
      },
      menuAction: { action: "find-replace", nonce: Date.now() },
    });

    const input = view.host.querySelector('input[placeholder="Find"]');
    expect(input).toBeTruthy();
    setTextInputValue(input, "alpha");

    expect(view.host.querySelector('.find-count')?.textContent).toBe("1/2");
    expect(view.host.querySelectorAll('.cm-find-match').length + view.host.querySelectorAll('.cm-find-match-active').length).toBe(2);
    expect(view.host.querySelectorAll('.cm-find-match-active').length).toBe(1);

    view.unmount();
  });

  it("supports regex matching in the find panel", () => {
    const view = renderDetail({
      ...baseProps,
      document: {
        ...baseProps.document,
        rawNotes: "alpha1 beta\nalpha2 gamma",
      },
      menuAction: { action: "find-replace", nonce: Date.now() },
    });

    const findInput = view.host.querySelector('input[placeholder="Find"]');
    expect(findInput).toBeTruthy();
    setTextInputValue(findInput, "alpha\\d");

    const regexButton = Array.from(view.host.querySelectorAll("button")).find((button) => button.textContent === "Regex");
    expect(regexButton).toBeTruthy();

    act(() => {
      regexButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector('.find-count')?.textContent).toBe("1/2");

    view.unmount();
  });

  it("replaces all regex matches in replace mode", () => {
    const onChange = vi.fn();
    const view = renderDetail({
      ...baseProps,
      onChange,
      document: {
        ...baseProps.document,
        rawNotes: "alpha1 beta alpha2",
      },
      menuAction: { action: "find-replace", nonce: Date.now() },
    });

    const findInput = view.host.querySelector('input[placeholder="Find"]');
    const replaceInput = view.host.querySelector('input[placeholder="Replace"]');
    setTextInputValue(findInput, "alpha\\d");
    setTextInputValue(replaceInput, "omega");

    const regexButton = Array.from(view.host.querySelectorAll("button")).find((button) => button.textContent === "Regex");
    act(() => {
      regexButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const replaceAllButton = Array.from(view.host.querySelectorAll("button")).find((button) => button.textContent === "Replace All");
    expect(replaceAllButton).toBeTruthy();

    act(() => {
      replaceAllButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rawNotes: "omega beta omega" }));

    view.unmount();
  });

  it("shows an invalid regex state in the find panel", () => {
    const view = renderDetail({
      ...baseProps,
      menuAction: { action: "find-replace", nonce: Date.now() },
    });

    const findInput = view.host.querySelector('input[placeholder="Find"]');
    setTextInputValue(findInput, "[");

    const regexButton = Array.from(view.host.querySelectorAll("button")).find((button) => button.textContent === "Regex");
    act(() => {
      regexButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector('.find-error')?.textContent).toBe("Invalid regex");

    view.unmount();
  });

  it("closes the find panel from the close button", () => {
    const view = renderDetail({
      ...baseProps,
      menuAction: { action: "find-replace", nonce: Date.now() },
    });

    const closeButton = view.host.querySelector('[aria-label="Close find and replace"]');
    expect(closeButton).toBeTruthy();

    act(() => {
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(view.host.querySelector('[aria-label="Find and replace"]')).toBeFalsy();

    view.unmount();
  });

  it("uses a distinct close label for find-only mode", () => {
    const view = renderDetail({
      ...baseProps,
      menuAction: { action: "find-in-note", nonce: Date.now() },
    });

    const closeButton = view.host.querySelector('[aria-label="Close find"]');
    expect(closeButton).toBeTruthy();

    view.unmount();
  });

  it("closes the find panel on Escape from panel actions", () => {
    const view = renderDetail({
      ...baseProps,
      menuAction: { action: "find-replace", nonce: Date.now() },
    });

    const nextButton = Array.from(view.host.querySelectorAll("button")).find((button) => button.textContent === "Next");
    expect(nextButton).toBeTruthy();

    act(() => {
      nextButton.focus();
      nextButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(view.host.querySelector('[aria-label="Find and replace"]')).toBeFalsy();

    view.unmount();
  });

  it("replaces the first active match without requiring manual navigation", () => {
    const onChange = vi.fn();
    const view = renderDetail({
      ...baseProps,
      onChange,
      document: {
        ...baseProps.document,
        rawNotes: "alpha beta alpha",
      },
      menuAction: { action: "find-replace", nonce: Date.now() },
    });

    const inputs = view.host.querySelectorAll("input");
    setTextInputValue(inputs[0], "alpha");
    setTextInputValue(inputs[1], "omega");

    const replaceButton = Array.from(view.host.querySelectorAll("button")).find((button) => button.textContent === "Replace");
    expect(replaceButton).toBeTruthy();

    act(() => {
      replaceButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rawNotes: "omega beta alpha" }));

    view.unmount();
  });

  it("toggles split mode from menu action", () => {
    const setMode = vi.fn();
    const view = renderDetail({
      ...baseProps,
      setMode,
      menuAction: { action: "toggle-split-preview", nonce: Date.now() },
    });

    expect(setMode).toHaveBeenCalled();

    view.unmount();
  });

  it("supports keyboard resize on the split pane separator", () => {
    const view = renderDetail({
      ...baseProps,
      mode: "split",
    });

    const separator = view.host.querySelector('.split-resizer');
    expect(separator?.getAttribute("aria-valuenow")).toBe("50");

    act(() => {
      separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    expect(separator?.getAttribute("aria-valuenow")).toBe("55");

    act(() => {
      separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });

    expect(separator?.getAttribute("aria-valuenow")).toBe("30");

    view.unmount();
  });

  it("renders source-line anchors for fenced code lines in split mode", () => {
    const view = renderDetail({
      ...baseProps,
      mode: "split",
      document: {
        ...baseProps.document,
        rawNotes: "Intro\n\n```js\nconst alpha = 1;\nconst beta = alpha + 1;\n```\n\nOutro",
      },
    });

    const codeLines = Array.from(view.host.querySelectorAll('.preview .markdown-code-line'));
    expect(codeLines.length).toBeGreaterThanOrEqual(2);
    codeLines.forEach((line) => {
      expect(Number(line.getAttribute("data-source-line") || "0")).toBeGreaterThan(0);
    });

    view.unmount();
  });

  it("shows open and closed tasks in the task summary popover", () => {
    const view = renderDetail({
      ...baseProps,
      document: {
        ...baseProps.document,
        rawNotes: "- [ ] Draft intro\n- [x] Review notes\n- [ ] Ship update",
      },
    });

    const summary = view.host.querySelector(".detail-task-summary");
    expect(summary?.textContent).toContain("2");
    expect(summary?.textContent).toContain("1");

    const popover = view.host.querySelector(".detail-task-popover");
    expect(popover?.textContent).toContain("Open");
    expect(popover?.textContent).toContain("Draft intro");
    expect(popover?.textContent).toContain("Ship update");
    expect(popover?.textContent).toContain("Closed");
    expect(popover?.textContent).toContain("Review notes");

    view.unmount();
  });

  it("keeps remove action out of document topbar", () => {
    const view = renderDetail(baseProps);
    const removeButton = view.host.querySelector('button[data-tooltip="Move note to removed folder"]');

    expect(removeButton).toBeFalsy();

    view.unmount();
  });

  it("hides outline panel when outline is disabled", () => {
    const view = renderDetail({
      ...baseProps,
      outlineEnabled: false,
      onOutlineEnabledChange: vi.fn(),
    });

    const workspace = view.host.querySelector(".workspace");
    expect(workspace?.className).toContain("outline-panel-disabled");
    expect(view.host.querySelector("aside.outline-panel")).toBeFalsy();

    view.unmount();
  });

  it("keeps AI sidebar while outline is disabled", () => {
    const view = renderDetail({
      ...baseProps,
      outlineEnabled: false,
      onOutlineEnabledChange: vi.fn(),
      aiSidebar: <section data-testid="ai-sidebar">AI</section>,
    });

    const workspace = view.host.querySelector(".workspace");
    expect(workspace?.className).toContain("outline-panel-disabled");
    expect(workspace?.className).toContain("with-ai-chat");
    expect(view.host.querySelector("aside.outline-panel")).toBeFalsy();
    expect(view.host.querySelector('[data-testid="ai-sidebar"]')).toBeTruthy();

    view.unmount();
  });

  it("shows focus mode contract banner with an exit action", () => {
    const view = renderDetail({
      ...baseProps,
      focusModeEnabled: true,
      onFocusModeChange: vi.fn(),
    });

    const banner = view.host.querySelector(".mode-contract-banner");
    expect(banner?.textContent).toContain("Focus mode is active");
    expect(view.host.querySelector('button[data-tooltip="Exit focus mode"]')).toBeTruthy();

    view.unmount();
  });

  it("does not show an outline restore banner when outline is disabled", () => {
    const view = renderDetail({
      ...baseProps,
      outlineEnabled: false,
      onOutlineEnabledChange: vi.fn(),
      focusModeEnabled: false,
    });

    const banner = view.host.querySelector(".mode-contract-banner");
    expect(banner).toBeFalsy();
    expect(view.host.querySelector('button[data-tooltip="Show outline panel"]')).toBeFalsy();

    view.unmount();
  });

  it("supports Ctrl+S save shortcut with notification", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onNotify = vi.fn();
    const view = renderDetail({
      ...baseProps,
      onSave,
      onNotify,
      dirty: true,
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
    });

    expect(onSave).toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith("Note saved.", "success");

    view.unmount();
  });

  it("preserves editor scroll position after Ctrl+S save", async () => {
    vi.useFakeTimers();

    let view;
    let props = {
      ...baseProps,
      dirty: true,
      onNotify: vi.fn(),
    };

    const onSave = vi.fn().mockImplementation(async () => {
      props = {
        ...props,
        document: {
          ...props.document,
          rawNotes: `${props.document.rawNotes}\nSaved`,
        },
      };
      act(() => {
        view.rerender(props);
      });
    });

    props = {
      ...props,
      onSave,
    };

    view = renderDetail(props);

    const initialScroller = view.host.querySelector('.cm-scroller');
    expect(initialScroller).toBeTruthy();

    act(() => {
      initialScroller.scrollTop = 140;
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
      await vi.runAllTimersAsync();
    });

    const scrollerAfterSave = view.host.querySelector('.cm-scroller');
    expect(scrollerAfterSave).toBeTruthy();
    expect(scrollerAfterSave.scrollTop).toBe(140);
    expect(onSave).toHaveBeenCalledTimes(1);

    view.unmount();
    vi.useRealTimers();
  });

  it("toggles find panel with Ctrl+F", async () => {
    const view = renderDetail(baseProps);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
    });

    expect(view.host.querySelector('[aria-label="Find in note"]')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
    });

    expect(view.host.querySelector('[aria-label="Find in note"]')).toBeFalsy();

    view.unmount();
  });

  it("commits title rename on Enter", async () => {
    const onRenameTitle = vi.fn().mockResolvedValue(true);
    const view = renderDetail({
      ...baseProps,
      onRenameTitle,
    });

    const toggleDetails = view.host.querySelector('button[data-tooltip="Toggle note metadata"]');
    expect(toggleDetails).toBeTruthy();
    act(() => {
      toggleDetails.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = view.host.querySelector('input[aria-label="Note title"]');
    expect(input).toBeTruthy();

    act(() => {
      setTextInputValue(input, "Renamed Note");
    });

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onRenameTitle).toHaveBeenCalledTimes(1);
    expect(onRenameTitle).toHaveBeenCalledWith("Renamed Note");

    view.unmount();
  });

  it("commits title rename on blur only after confirmation", async () => {
    const onRenameTitle = vi.fn().mockResolvedValue(true);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = renderDetail({
      ...baseProps,
      onRenameTitle,
    });

    const toggleDetails = view.host.querySelector('button[data-tooltip="Toggle note metadata"]');
    act(() => {
      toggleDetails.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = view.host.querySelector('input[aria-label="Note title"]');
    act(() => {
      setTextInputValue(input, "Blur Rename");
      input.focus();
    });

    await act(async () => {
      input.blur();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onRenameTitle).toHaveBeenCalledTimes(1);
    expect(onRenameTitle).toHaveBeenCalledWith("Blur Rename");

    confirmSpy.mockRestore();
    view.unmount();
  });

  it("cancels title rename on Escape", async () => {
    const onRenameTitle = vi.fn().mockResolvedValue(true);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = renderDetail({
      ...baseProps,
      onRenameTitle,
    });

    const toggleDetails = view.host.querySelector('button[data-tooltip="Toggle note metadata"]');
    act(() => {
      toggleDetails.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = view.host.querySelector('input[aria-label="Note title"]');
    act(() => {
      setTextInputValue(input, "Will Cancel");
    });

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onRenameTitle).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
    view.unmount();
  });

  it("prevents duplicate rename submissions from Enter then blur", async () => {
    const onRenameTitle = vi.fn().mockImplementation(() => new Promise(() => {}));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = renderDetail({
      ...baseProps,
      onRenameTitle,
    });

    const toggleDetails = view.host.querySelector('button[data-tooltip="Toggle note metadata"]');
    act(() => {
      toggleDetails.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = view.host.querySelector('input[aria-label="Note title"]');
    act(() => {
      setTextInputValue(input, "One Request Only");
    });

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
    });

    expect(onRenameTitle).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
    view.unmount();
  });
});