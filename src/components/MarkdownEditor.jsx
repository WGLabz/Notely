import { useMemo, useRef } from "react";
import { createImageMarkdown, insertTextAtCursor } from "../utils/markdownUtils";
import { insertImagesFromFiles } from "../services/imageService";

export function MarkdownEditor({ value, onChange, textareaRef, onNotify }) {
  const gutterRef = useRef(null);
  const lineNumbers = useMemo(() => {
    const count = (value.match(/\n/g) || []).length + 1;
    return Array.from({ length: count }, (_value, index) => index + 1);
  }, [value]);

  const handleDragOver = (event) => {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
    }
  };

  const handleDrop = async (event) => {
    const files = event.dataTransfer?.files || [];
    if (!files.length) return;

    event.preventDefault();

    try {
      const results = await insertImagesFromFiles(files);
      const markdownImages = results.map((result) =>
        createImageMarkdown(result.altText, result.imagePath)
      );
      insertTextAtCursor(value, onChange, `${markdownImages.join("\n\n")}\n`, textareaRef);
      onNotify?.(`Inserted ${results.length} image${results.length > 1 ? "s" : ""}.`, "success");
    } catch (error) {
      console.error("Image drop insertion failed:", error);
      onNotify?.(error?.message || "Failed to insert dropped images.", "error");
    }
  };

  const handleEditorScroll = (event) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.target.scrollTop;
    }
  };

  return (
    <div className="markdown-editor">
      <div className="markdown-editor-shell">
        <div className="markdown-gutter" ref={gutterRef} aria-hidden="true">
          {lineNumbers.map((line) => (
            <div className="markdown-line-number" key={line}>{line}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="markdown-textarea with-line-numbers"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onScroll={handleEditorScroll}
          spellCheck
        />
      </div>
    </div>
  );
}
