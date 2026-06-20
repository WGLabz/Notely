import { useMemo } from "react";
import {
  renderMarkdown,
  parseMermaidBlocks,
  normalizeMarkdownImagePaths,
} from "../utils/renderUtils";
import { MermaidBlock } from "./MermaidBlock";

export function WebViewPreview({ content }) {
  const parts = useMemo(() => parseMermaidBlocks(content), [content]);

  return (
    <div className="webview-shell">
      <div className="webview-browser-bar">
        <span className="dot red" />
        <span className="dot amber" />
        <span className="dot green" />
        <div className="address-pill">https://notely.local/note</div>
      </div>
      <article className="webview-page">
        {parts.map((part, index) =>
          part.type === "mermaid" ? (
            <MermaidBlock code={part.value} index={index} key={`${part.type}-${index}`} />
          ) : (
            <div
              key={`${part.type}-${index}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(normalizeMarkdownImagePaths(part.value)) }}
            />
          )
        )}
      </article>
    </div>
  );
}
