import { useCallback } from "react";
import { createMediaMarkdown } from "../utils/markdownUtils";
import { insertMediaFromFile } from "../services/imageService";
import { htmlTableToMarkdown } from "../utils/tableUtils";

export function useClipboardPaste({
  enabled = true,
  basePath,
  onInsertMarkdown,
  onNotify,
}) {
  const handlePaste = useCallback(
    async (event) => {
      if (!enabled) return;

      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      // 1. Check for image item
      const items = Array.from(clipboardData.items || []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));

      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          event.preventDefault();
          event.stopPropagation();
          onNotify?.("Saving pasted image...", "info");
          try {
            const mediaResult = await insertMediaFromFile(file, basePath);
            if (mediaResult?.mediaPath || mediaResult?.imagePath) {
              const md = createMediaMarkdown(
                mediaResult.altText || "Pasted image",
                mediaResult.mediaPath || mediaResult.imagePath
              );
              onInsertMarkdown?.(md);
              onNotify?.("Pasted image inserted.", "success");
            }
          } catch (err) {
            onNotify?.(err?.message || "Failed to save pasted image.", "error");
          }
          return;
        }
      }

      // 2. Check for pasted files (docx, xlsx, pptx, pdf, etc.)
      const files = Array.from(clipboardData.files || []);
      if (files.length > 0 && !imageItem) {
        event.preventDefault();
        event.stopPropagation();
        onNotify?.("Processing pasted file...", "info");
        try {
          const insertedBlocks = [];
          for (const file of files) {
            const mediaResult = await insertMediaFromFile(file, basePath);
            const path = mediaResult?.mediaPath || mediaResult?.imagePath;
            if (path) {
              const ext = file.name.split(".").pop()?.toLowerCase();
              if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
                insertedBlocks.push(createMediaMarkdown(file.name, path));
              } else {
                insertedBlocks.push(`[${file.name}](${path})`);
              }
            }
          }
          if (insertedBlocks.length) {
            onInsertMarkdown?.(insertedBlocks.join("\n\n"));
            onNotify?.("Pasted file inserted.", "success");
          }
        } catch (err) {
          onNotify?.(err?.message || "Failed to process pasted file.", "error");
        }
        return;
      }

      // 3. Check for HTML table (Excel or Web copied table)
      const htmlText = clipboardData.getData("text/html");
      if (htmlText && /<table/i.test(htmlText)) {
        const tableMarkdown = htmlTableToMarkdown(htmlText);
        if (tableMarkdown) {
          event.preventDefault();
          event.stopPropagation();
          onInsertMarkdown?.(tableMarkdown);
          onNotify?.("Pasted table inserted as Markdown.", "success");
          return;
        }
      }
    },
    [enabled, basePath, onInsertMarkdown, onNotify]
  );

  return { handlePaste };
}
