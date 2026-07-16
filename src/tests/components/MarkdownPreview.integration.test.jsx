// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "../../components/MarkdownPreview";

vi.mock("../../components/MermaidBlock", () => ({
  MermaidBlock: () => null,
}));

vi.mock("../../components/ExcalidrawEditor", () => ({
  default: () => null,
}));

const readImageMock = vi.fn();
const replaceImageMock = vi.fn();
const deleteImageMock = vi.fn();
const renameImageMock = vi.fn();
const readMarkdownSourceMock = vi.fn();

vi.mock("../../services/electronService", () => ({
  readImage: (...args) => readImageMock(...args),
  replaceImage: (...args) => replaceImageMock(...args),
  deleteImage: (...args) => deleteImageMock(...args),
  renameImage: (...args) => renameImageMock(...args),
  readMarkdownSource: (...args) => readMarkdownSourceMock(...args),
  checkIsDirectory: vi.fn().mockResolvedValue(false),
  openFolder: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function waitFor(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function renderPreview(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<MarkdownPreview {...props} />);
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

beforeEach(() => {
  readImageMock.mockReset();
  replaceImageMock.mockReset();
  deleteImageMock.mockReset();
  renameImageMock.mockReset();
  readMarkdownSourceMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("MarkdownPreview image behaviors", () => {
  it("hydrates markdown image src and wires external ref", async () => {
    const externalRef = { current: null };
    readImageMock.mockResolvedValue("data:image/png;base64,TEST123");

    const view = renderPreview({
      content: "![Preview](./images/photo.png)",
      basePath: "C:/notes/doc.md",
      externalRef,
      onNotify: vi.fn(),
      onContentChange: vi.fn(),
    });

    await act(async () => {
      await waitFor(80);
    });

    const image = view.host.querySelector("img");
    expect(image).toBeTruthy();
    expect(image.getAttribute("src")).toContain("data:image/png;base64,TEST123");
    expect(image.getAttribute("data-asset-path")).toBe("./images/photo.png");
    expect(externalRef.current).toBeTruthy();
    expect(readImageMock).toHaveBeenCalledWith("C:/notes/doc.md", "./images/photo.png", { thumbnail: true });

    view.unmount();
  });

  it("opens image menu from keyboard and renames image with content update", async () => {
    readImageMock.mockResolvedValue("data:image/png;base64,OLD");
    renameImageMock.mockResolvedValue("./images/renamed-photo.png");
    const onContentChange = vi.fn();
    const onNotify = vi.fn();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("renamed-photo.png");

    const view = renderPreview({
      content: "Before ![Preview](./images/photo.png) After",
      basePath: "C:/notes/doc.md",
      onNotify,
      onContentChange,
    });

    await act(async () => {
      await waitFor(80);
    });

    const image = view.host.querySelector("img");
    expect(image).toBeTruthy();

    act(() => {
      image.focus();
      image.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
    });

    const menu = view.host.querySelector('[aria-label="Image context menu"]');
    expect(menu).toBeTruthy();

    const renameButton = Array.from(menu.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Rename image")
    );
    expect(renameButton).toBeTruthy();

    await act(async () => {
      renameButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await waitFor(0);
    });

    expect(promptSpy).toHaveBeenCalled();
    expect(renameImageMock).toHaveBeenCalledWith("C:/notes/doc.md", "./images/photo.png", "renamed-photo.png");
    expect(onContentChange).toHaveBeenCalled();
    const updatedContent = String(onContentChange.mock.calls.at(-1)?.[0] || "");
    expect(updatedContent).toContain("./images/renamed-photo.png");
    expect(onNotify).toHaveBeenCalledWith("Image renamed and markdown updated.", "success");

    view.unmount();
  });

  it("renders linked markdown inline when toggle is enabled", async () => {
    readMarkdownSourceMock.mockResolvedValue("# Nested Note\n\nInline linked content.");

    const view = renderPreview({
      content: "See [details](./nested.md)",
      basePath: "C:/notes/doc.md",
      inlineLinkedMarkdown: true,
      onNotify: vi.fn(),
      onContentChange: vi.fn(),
    });

    const link = view.host.querySelector("a[href='./nested.md']");
    expect(link).toBeTruthy();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await waitFor(0);
      await waitFor(0);
    });

    expect(readMarkdownSourceMock).toHaveBeenCalledWith("C:\\notes\\nested.md");
    const inlineBlock = view.host.querySelector(".inline-linked-note");
    expect(inlineBlock).toBeTruthy();
    expect(inlineBlock.textContent).toContain("Linked Note");
    expect(inlineBlock.textContent).toContain("Inline linked content.");

    view.unmount();
  });

  it("resolves encoded markdown link paths for inline rendering", async () => {
    readMarkdownSourceMock.mockResolvedValue("# Encoded Note\n\nWorks with encoded paths.");

    const view = renderPreview({
      content: "See [encoded](./Team%20Notes/Nested%20Note.md)",
      basePath: "C:/notes/doc.md",
      inlineLinkedMarkdown: true,
      onNotify: vi.fn(),
      onContentChange: vi.fn(),
    });

    const link = view.host.querySelector("a[href='./Team%20Notes/Nested%20Note.md']");
    expect(link).toBeTruthy();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await waitFor(0);
      await waitFor(0);
    });

    expect(readMarkdownSourceMock).toHaveBeenCalledWith("C:\\notes\\Team Notes\\Nested Note.md");
    const inlineBlock = view.host.querySelector(".inline-linked-note");
    expect(inlineBlock).toBeTruthy();
    expect(inlineBlock.textContent).toContain("Works with encoded paths.");

    view.unmount();
  });

  it("renders inline markdown for extensionless local note links", async () => {
    readMarkdownSourceMock.mockResolvedValue("# Architecture\n\nRendered from extensionless link.");

    const view = renderPreview({
      content: "See [Architecture](./Architecture)",
      basePath: "C:/notes/doc.md",
      inlineLinkedMarkdown: true,
      onNotify: vi.fn(),
      onContentChange: vi.fn(),
    });

    const link = view.host.querySelector("a[href='./Architecture']");
    expect(link).toBeTruthy();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await waitFor(0);
      await waitFor(0);
    });

    expect(readMarkdownSourceMock).toHaveBeenCalledWith("C:\\notes\\Architecture.md");
    const inlineBlock = view.host.querySelector(".inline-linked-note");
    expect(inlineBlock).toBeTruthy();
    expect(inlineBlock.textContent).toContain("Rendered from extensionless link.");

    view.unmount();
  });

  it("resolves ../../ style links correctly from deep nested notes", async () => {
    readMarkdownSourceMock.mockResolvedValue("# System Design\n\nResolved from parent traversal.");

    const view = renderPreview({
      content: "See [System Design](../../Architecture/System%20Design)",
      basePath: "C:/notes/Team/2026/doc.md",
      inlineLinkedMarkdown: true,
      onNotify: vi.fn(),
      onContentChange: vi.fn(),
    });

    const link = view.host.querySelector("a");
    expect(link).toBeTruthy();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await waitFor(0);
      await waitFor(0);
    });

    expect(readMarkdownSourceMock).toHaveBeenCalledWith("C:\\notes\\Architecture\\System Design.md");
    const inlineBlock = view.host.querySelector(".inline-linked-note");
    expect(inlineBlock).toBeTruthy();
    expect(inlineBlock.textContent).toContain("Resolved from parent traversal.");

    view.unmount();
  });

  it("blocks directory-style markdown links like ./ with a helpful notice", async () => {
    const onNotify = vi.fn();

    const view = renderPreview({
      content: "See [Architecture](./)",
      basePath: "C:/notes/doc.md",
      inlineLinkedMarkdown: true,
      onNotify,
      onContentChange: vi.fn(),
    });

    const link = view.host.querySelector("a[href='./']");
    expect(link).toBeTruthy();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await waitFor(0);
    });

    expect(readMarkdownSourceMock).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith(
      "Directory links like ./ are not supported here. Link a specific .md file.",
      "info"
    );

    view.unmount();
  });
});
