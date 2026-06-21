// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

vi.mock("./MermaidBlock", () => ({
  MermaidBlock: () => null,
}));

const readImageMock = vi.fn();
const replaceImageMock = vi.fn();
const deleteImageMock = vi.fn();
const renameImageMock = vi.fn();

vi.mock("../services/electronService", () => ({
  readImage: (...args) => readImageMock(...args),
  replaceImage: (...args) => replaceImageMock(...args),
  deleteImage: (...args) => deleteImageMock(...args),
  renameImage: (...args) => renameImageMock(...args),
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
    expect(readImageMock).toHaveBeenCalledWith("C:/notes/doc.md", "./images/photo.png");

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
});
