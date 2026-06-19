import { useEffect, useMemo, useRef } from "react";
import {
  renderMarkdown,
  parseMermaidBlocks,
  normalizeMarkdownImagePaths,
} from "../utils/renderUtils";
import { readImage } from "../services/electronService";
import { MermaidBlock } from "./MermaidBlock";

export function MarkdownPreview({ content, basePath }) {
  const previewRef = useRef(null);
  const parts = useMemo(() => {
    return parseMermaidBlocks(content);
  }, [content]);

  useEffect(() => {
    let cancelled = false;

    async function resolvePreviewImages() {
      if (!previewRef.current || !basePath) return;
      const images = Array.from(previewRef.current.querySelectorAll("img"));

      await Promise.all(
        images.map(async (image) => {
          const src = image.getAttribute("src") || "";
          if (/^(data:|blob:)/i.test(src)) return;

          try {
            const resolved = await readImage(basePath, src);
            if (!cancelled && resolved) image.src = resolved;
          } catch {
            // Keep original src if resolution fails.
          }
        })
      );
    }

    resolvePreviewImages();

    return () => {
      cancelled = true;
    };
  }, [content, basePath]);

  return (
    <div className="preview" ref={previewRef}>
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
    </div>
  );
}
