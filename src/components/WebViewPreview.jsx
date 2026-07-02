import { useMemo } from "react";
import {
  renderMarkdown,
  parseDiagramBlocks,
  normalizeMarkdownImagePaths,
} from "../utils/renderUtils";
import { MermaidBlock } from "./MermaidBlock";
import { ExcalidrawBlock } from "./ExcalidrawBlock";

export function WebViewPreview({ content, basePath }) {
  const parts = useMemo(() => parseDiagramBlocks(content), [content]);

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
          ) : part.type === "excalidraw" ? (
            <ExcalidrawBlock 
              imagePath={part.imagePath}
              diagramId={part.diagramId}
              docSlug={basePath?.split(/[/\\]/).pop()?.replace('.md', '') || 'document'}
              documentPath={basePath?.split(/[/\\]/).slice(0, -1).join('/')}
              index={index}
              key={`${part.type}-${index}`}
              onUpdate={(newData) => {
                console.log("Diagram updated:", newData);
              }}
            />
          ) : (
            <div
              key={`${part.type}-${index}`}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(normalizeMarkdownImagePaths(part.value), {
                  sourceLineOffset: part.startLine || 0,
                }),
              }}
            />
          )
        )}
      </article>
    </div>
  );
}
