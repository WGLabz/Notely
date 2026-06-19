import { useEffect, useRef } from "react";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MarkdownValidationBanner } from "./MarkdownValidationBanner";

export function EditorPane({
  value,
  onChange,
  mode,
  textareaRef,
  basePath,
  showToolbar = true,
  onNotify,
}) {
  const previewRef = useRef(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (mode !== "split") return undefined;

    const editorElement = textareaRef?.current;
    const previewElement = previewRef.current;
    if (!editorElement || !previewElement) return undefined;

    const syncByRatio = (sourceElement, targetElement) => {
      if (!sourceElement || !targetElement) return;
      if (isSyncingRef.current) return;

      const sourceScrollable = sourceElement.scrollHeight - sourceElement.clientHeight;
      const targetScrollable = targetElement.scrollHeight - targetElement.clientHeight;
      const ratio = sourceScrollable > 0 ? sourceElement.scrollTop / sourceScrollable : 0;

      isSyncingRef.current = true;
      targetElement.scrollTop = ratio * Math.max(targetScrollable, 0);
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    };

    const handleEditorScroll = () => syncByRatio(editorElement, previewElement);
    const handlePreviewScroll = () => syncByRatio(previewElement, editorElement);

    editorElement.addEventListener("scroll", handleEditorScroll, { passive: true });
    previewElement.addEventListener("scroll", handlePreviewScroll, { passive: true });

    return () => {
      editorElement.removeEventListener("scroll", handleEditorScroll);
      previewElement.removeEventListener("scroll", handlePreviewScroll);
    };
  }, [mode, textareaRef]);

  const markdownEditor = (
    <MarkdownEditor value={value} onChange={onChange} textareaRef={textareaRef} onNotify={onNotify} />
  );

  if (mode === "preview") {
    return <MarkdownPreview content={value} basePath={basePath} />;
  }

  if (mode === "split") {
    return (
      <div className="split-pane">
        <section className="pane-block">
          <div className="pane-title toolbar-label-row">
            <span className="pane-title-label">Editor</span>
          </div>
          {showToolbar ? (
            <div className="pane-toolbar-row">
              <MarkdownToolbar
                value={value}
                onChange={onChange}
                textareaRef={textareaRef}
                basePath={basePath}
                onNotify={onNotify}
              />
            </div>
          ) : null}
          {showToolbar ? <MarkdownValidationBanner value={value} /> : null}
          <div className="markdown-editor">{markdownEditor}</div>
        </section>
        <section className="pane-block">
          <div className="pane-title">
            <span className="pane-title-label">Preview</span>
          </div>
          {showToolbar ? <div className="pane-toolbar-spacer" aria-hidden="true" /> : null}
          <MarkdownPreview content={value} basePath={basePath} externalRef={previewRef} />
        </section>
      </div>
    );
  }

  return (
    <section className="pane-block">
      <div className="pane-title toolbar-label-row">
        <span className="pane-title-label">Markdown Editor</span>
      </div>
      {showToolbar ? (
        <div className="pane-toolbar-row">
          <MarkdownToolbar
            value={value}
            onChange={onChange}
            textareaRef={textareaRef}
            basePath={basePath}
            onNotify={onNotify}
          />
        </div>
      ) : null}
      {showToolbar ? <MarkdownValidationBanner value={value} /> : null}
      <div className="markdown-editor">{markdownEditor}</div>
    </section>
  );
}
