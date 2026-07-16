// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebViewPreview } from "../../components/WebViewPreview";

vi.mock("../../components/MermaidBlock", () => ({
  MermaidBlock: () => null,
}));

vi.mock("../../components/ExcalidrawBlock", () => ({
  ExcalidrawBlock: ({ imagePath, diagramId }) => (
    <div data-testid="excalidraw-block" data-image-path={imagePath} data-diagram-id={diagramId} />
  ),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderWebView(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<WebViewPreview {...props} />);
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

describe("WebViewPreview rendering", () => {
  it("renders Excalidraw blocks without showing metadata suffix text", () => {
    const content = [
      "![Excalidraw Diagram](.notes-app/excali-diagrams/0c499b57/diagram.png)",
      "  {data-diagram-id=\"0c499b57\" data-diagram-type=\"excalidraw\"}",
    ].join("\n");

    const view = renderWebView({
      content,
      basePath: "C:/notes/example.md",
    });

    expect(view.host.querySelector('[data-testid="excalidraw-block"]')).toBeTruthy();
    expect(view.host.textContent || "").not.toContain("data-diagram-id");

    view.unmount();
  });

  it("renders highlighted code markup in web view markdown", () => {
    const content = "```js\nconst value = 42;\n```";

    const view = renderWebView({
      content,
      basePath: "C:/notes/example.md",
    });

    const code = view.host.querySelector(".webview-page .markdown-code-pre code.hljs");
    expect(code).toBeTruthy();
    expect(view.host.querySelectorAll(".webview-page .markdown-code-line").length).toBe(1);
    expect(view.host.querySelector(".webview-page .hljs-keyword")).toBeTruthy();

    view.unmount();
  });
});
