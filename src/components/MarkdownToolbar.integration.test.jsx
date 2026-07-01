// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownToolbar } from "./MarkdownToolbar";

const listImagesMock = vi.fn();
const listDocumentsMock = vi.fn();

vi.mock("../services/electronService", async () => {
  const actual = await vi.importActual("../services/electronService");
  return {
    ...actual,
    listImages: (...args) => listImagesMock(...args),
    listDocuments: (...args) => listDocumentsMock(...args),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderToolbar(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<MarkdownToolbar {...props} />);
  });

  return {
    host,
    rerender(nextProps) {
      act(() => {
        root.render(<MarkdownToolbar {...nextProps} />);
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

afterEach(() => {
  listImagesMock.mockReset();
  listDocumentsMock.mockReset();
  document.body.innerHTML = "";
});

describe("MarkdownToolbar validation panel interactions", () => {
  it("opens validation panel and handles go-to-line + quick-fix actions", () => {
    const onChange = vi.fn();
    const onNotify = vi.fn();
    const onJumpToLine = vi.fn();

    const validationIssues = [
      {
        line: 2,
        column: 1,
        message: "Malformed table separator row.",
        ruleId: "table-separator",
      },
    ];

    const view = renderToolbar({
      value: "| A | B |\n| --- |\n| 1 | 2 |",
      onChange,
      textareaRef: { current: null },
      basePath: "",
      onNotify,
      validationStatus: "ready",
      validationIssues,
      onJumpToLine,
    });

    const validateButton = view.host.querySelector('button[title="Validate markdown syntax"]');
    expect(validateButton).toBeTruthy();

    act(() => {
      validateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const panel = view.host.querySelector('.validation-panel[aria-label="Markdown validation"]');
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain("Malformed table separator row.");

    const goToLineButton = Array.from(panel.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Go to line")
    );
    expect(goToLineButton).toBeTruthy();

    act(() => {
      goToLineButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onJumpToLine).toHaveBeenCalledWith(2);

    const quickFixButton = Array.from(panel.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Quick fix")
    );
    expect(quickFixButton).toBeTruthy();

    act(() => {
      quickFixButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith("Fixed table separator.", "success");

    view.unmount();
  });

  it("wires undo/redo toolbar buttons", () => {
    const onChange = vi.fn();
    const onUndo = vi.fn();
    const onRedo = vi.fn();

    const view = renderToolbar({
      value: "Example",
      onChange,
      onUndo,
      onRedo,
      canUndo: true,
      canRedo: false,
      textareaRef: { current: null },
      basePath: "",
      onNotify: vi.fn(),
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const undoButton = view.host.querySelector('button[title="Undo (Ctrl/Cmd+Z)"]');
    const redoButton = view.host.querySelector('button[title="Redo (Ctrl/Cmd+Y)"]');

    expect(undoButton).toBeTruthy();
    expect(redoButton).toBeTruthy();
    expect(undoButton.disabled).toBe(false);
    expect(redoButton.disabled).toBe(true);

    act(() => {
      undoButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();

    view.unmount();
  });

  it("encodes spaces when inserting linked note paths", async () => {
    listImagesMock.mockResolvedValue([]);
    listDocumentsMock.mockResolvedValue([
      {
        title: "My Linked Note",
        fileName: "My Linked Note.md",
        filePath: "C:/notes/Team Notes/My Linked Note.md",
      },
    ]);

    const onChange = vi.fn();
    const onNotify = vi.fn();
    const textareaRef = {
      current: {
        selectionStart: 0,
        selectionEnd: 0,
        scrollTop: 0,
        scrollLeft: 0,
        focus: () => {},
      },
    };

    const view = renderToolbar({
      value: "",
      onChange,
      textareaRef,
      basePath: "C:/notes/Current.md",
      onNotify,
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const openWorkspaceInsert = view.host.querySelector('button[title="Insert from workspace"]');
    expect(openWorkspaceInsert).toBeTruthy();

    await act(async () => {
      openWorkspaceInsert.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const noteButton = Array.from(view.host.querySelectorAll(".image-linker-list button")).find((button) =>
      button.textContent?.includes("My Linked Note")
    );
    expect(noteButton).toBeTruthy();

    act(() => {
      noteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalled();
    const inserted = String(onChange.mock.calls.at(-1)?.[0] || "");
    expect(inserted).toContain("./Team%20Notes/My%20Linked%20Note.md");
    expect(onNotify).toHaveBeenCalledWith("Document link inserted.", "success");

    view.unmount();
  });

  it("encodes nested relative note paths with spaces", async () => {
    listImagesMock.mockResolvedValue([]);
    listDocumentsMock.mockResolvedValue([
      {
        title: "Nested Ops Runbook",
        fileName: "Nested Ops Runbook.md",
        filePath: "C:/notes/Team Notes/Sub Folder/Nested Ops Runbook.md",
      },
    ]);

    const onChange = vi.fn();
    const onNotify = vi.fn();
    const textareaRef = {
      current: {
        selectionStart: 0,
        selectionEnd: 0,
        scrollTop: 0,
        scrollLeft: 0,
        focus: () => {},
      },
    };

    const view = renderToolbar({
      value: "",
      onChange,
      textareaRef,
      basePath: "C:/notes/Current.md",
      onNotify,
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const openWorkspaceInsert = view.host.querySelector('button[title="Insert from workspace"]');
    expect(openWorkspaceInsert).toBeTruthy();

    await act(async () => {
      openWorkspaceInsert.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const noteButton = Array.from(view.host.querySelectorAll(".image-linker-list button")).find((button) =>
      button.textContent?.includes("Nested Ops Runbook")
    );
    expect(noteButton).toBeTruthy();

    act(() => {
      noteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalled();
    const inserted = String(onChange.mock.calls.at(-1)?.[0] || "");
    expect(inserted).toContain("./Team%20Notes/Sub%20Folder/Nested%20Ops%20Runbook.md");
    expect(onNotify).toHaveBeenCalledWith("Document link inserted.", "success");

    view.unmount();
  });

  it("uses absolute encoded path when target note is on a different drive", async () => {
    listImagesMock.mockResolvedValue([]);
    listDocumentsMock.mockResolvedValue([
      {
        title: "Remote Drive Note",
        fileName: "Remote Drive Note.md",
        filePath: "D:/Shared Notes/Remote Drive Note.md",
      },
    ]);

    const onChange = vi.fn();
    const onNotify = vi.fn();
    const textareaRef = {
      current: {
        selectionStart: 0,
        selectionEnd: 0,
        scrollTop: 0,
        scrollLeft: 0,
        focus: () => {},
      },
    };

    const view = renderToolbar({
      value: "",
      onChange,
      textareaRef,
      basePath: "C:/notes/Current.md",
      onNotify,
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const openWorkspaceInsert = view.host.querySelector('button[title="Insert from workspace"]');
    expect(openWorkspaceInsert).toBeTruthy();

    await act(async () => {
      openWorkspaceInsert.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const noteButton = Array.from(view.host.querySelectorAll(".image-linker-list button")).find((button) =>
      button.textContent?.includes("Remote Drive Note")
    );
    expect(noteButton).toBeTruthy();

    act(() => {
      noteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const inserted = String(onChange.mock.calls.at(-1)?.[0] || "");
    expect(inserted).toContain("D:/Shared%20Notes/Remote%20Drive%20Note.md");
    expect(onNotify).toHaveBeenCalledWith("Document link inserted.", "success");

    view.unmount();
  });

  it("excludes the current note from workspace insert list with normalized path matching", async () => {
    listImagesMock.mockResolvedValue([]);
    listDocumentsMock.mockResolvedValue([
      {
        title: "Architecture",
        fileName: "Architecture.md",
        filePath: "c:/notes/Architecture.md",
      },
    ]);

    const view = renderToolbar({
      value: "",
      onChange: vi.fn(),
      textareaRef: { current: null },
      basePath: "C:\\notes\\Architecture.md",
      onNotify: vi.fn(),
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const openWorkspaceInsert = view.host.querySelector('button[title="Insert from workspace"]');
    expect(openWorkspaceInsert).toBeTruthy();

    await act(async () => {
      openWorkspaceInsert.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const buttons = Array.from(view.host.querySelectorAll(".image-linker-list button"));
    expect(buttons.some((button) => button.textContent?.includes("Architecture"))).toBe(false);

    view.unmount();
  });

  it("does not show folder entries as linkable markdown notes", async () => {
    listImagesMock.mockResolvedValue([]);
    listDocumentsMock.mockResolvedValue([
      {
        entryType: "folder",
        title: "Architecture",
        filePath: "C:/notes/Architecture",
      },
      {
        entryType: "file",
        title: "Architecture",
        fileName: "Architecture.md",
        filePath: "C:/notes/Architecture.md",
      },
    ]);

    const view = renderToolbar({
      value: "",
      onChange: vi.fn(),
      textareaRef: { current: null },
      basePath: "C:/notes/Current.md",
      onNotify: vi.fn(),
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const openWorkspaceInsert = view.host.querySelector('button[title="Insert from workspace"]');
    expect(openWorkspaceInsert).toBeTruthy();

    await act(async () => {
      openWorkspaceInsert.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const buttons = Array.from(view.host.querySelectorAll(".image-linker-list button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent || "").toContain("Architecture");

    view.unmount();
  });

  it("loads linkable markdown notes from subfolders", async () => {
    listImagesMock.mockResolvedValue([]);
    listDocumentsMock.mockImplementation(async (folderPath) => {
      if (!folderPath) {
        return [
          {
            entryType: "folder",
            title: "Architecture",
            filePath: "C:/notes/Architecture",
          },
        ];
      }

      if (folderPath === "C:/notes/Architecture") {
        return [
          {
            entryType: "file",
            title: "System Design",
            fileName: "System Design.md",
            filePath: "C:/notes/Architecture/System Design.md",
          },
        ];
      }

      return [];
    });

    const view = renderToolbar({
      value: "",
      onChange: vi.fn(),
      textareaRef: { current: null },
      basePath: "C:/notes/Current.md",
      onNotify: vi.fn(),
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const openWorkspaceInsert = view.host.querySelector('button[title="Insert from workspace"]');
    expect(openWorkspaceInsert).toBeTruthy();

    await act(async () => {
      openWorkspaceInsert.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const buttons = Array.from(view.host.querySelectorAll(".image-linker-list button"));
    expect(buttons.some((button) => button.textContent?.includes("System Design"))).toBe(true);
    expect(listDocumentsMock).toHaveBeenCalledWith(undefined);
    expect(listDocumentsMock).toHaveBeenCalledWith("C:/notes/Architecture");

    view.unmount();
  });

  it("filters workspace insert list by selected asset type", async () => {
    listImagesMock.mockResolvedValue([
      "./images/photo.png",
      "./images/spec.pdf",
    ]);
    listDocumentsMock.mockResolvedValue([
      {
        title: "Ops Guide",
        fileName: "Ops Guide.md",
        filePath: "C:/notes/Ops Guide.md",
      },
    ]);

    const view = renderToolbar({
      value: "",
      onChange: vi.fn(),
      textareaRef: { current: null },
      basePath: "C:/notes/Current.md",
      onNotify: vi.fn(),
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const openWorkspaceInsert = view.host.querySelector('button[title="Insert from workspace"]');
    expect(openWorkspaceInsert).toBeTruthy();

    await act(async () => {
      openWorkspaceInsert.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const allButtons = () => Array.from(view.host.querySelectorAll(".image-linker-list button"));
    expect(allButtons().some((button) => button.textContent?.includes("Ops Guide"))).toBe(true);
    expect(allButtons().some((button) => button.textContent?.includes("photo.png"))).toBe(true);
    expect(allButtons().some((button) => button.textContent?.includes("spec.pdf"))).toBe(true);

    const filterSelect = view.host.querySelector('.image-linker select');
    expect(filterSelect).toBeTruthy();

    await act(async () => {
      filterSelect.value = "notes";
      filterSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(allButtons().some((button) => button.textContent?.includes("Ops Guide"))).toBe(true);
    expect(allButtons().some((button) => button.textContent?.includes("photo.png"))).toBe(false);

    await act(async () => {
      filterSelect.value = "pdf";
      filterSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(allButtons().some((button) => button.textContent?.includes("spec.pdf"))).toBe(true);
    expect(allButtons().some((button) => button.textContent?.includes("Ops Guide"))).toBe(false);
    expect(allButtons().some((button) => button.textContent?.includes("photo.png"))).toBe(false);

    view.unmount();
  });

  it("inserts an Excalidraw reference from the diagram picker", async () => {
    const onChange = vi.fn();
    const onNotify = vi.fn();
    const textareaRef = {
      current: {
        selectionStart: 0,
        selectionEnd: 0,
        scrollTop: 0,
        scrollLeft: 0,
        focus: () => {},
      },
    };

    const view = renderToolbar({
      value: "",
      onChange,
      textareaRef,
      basePath: "C:/notes/Architecture Note.md",
      onNotify,
      validationStatus: "ready",
      validationIssues: [],
      onJumpToLine: vi.fn(),
    });

    const openDiagramButton = view.host.querySelector('button[title="Insert diagram"]');
    expect(openDiagramButton).toBeTruthy();

    act(() => {
      openDiagramButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const excalidrawButton = Array.from(view.host.querySelectorAll(".mermaid-builder .mermaid-type-switch button")).find((button) =>
      button.textContent?.includes("Excalidraw")
    );
    expect(excalidrawButton).toBeTruthy();

    act(() => {
      excalidrawButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalled();
    const inserted = String(onChange.mock.calls.at(-1)?.[0] || "");
    expect(inserted).toContain("![Excalidraw Diagram](excali-diagrams/");
    expect(inserted).not.toContain("excali-diagrams/architecture-note/");
    expect(inserted).toContain('/diagram.png){data-diagram-id="');
    expect(inserted).toContain('data-diagram-type="excalidraw"}');
    expect(onNotify).toHaveBeenCalledWith("Excalidraw reference inserted.", "success");

    view.unmount();
  });
});
