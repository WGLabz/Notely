import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MarkdownValidationBanner } from "./MarkdownValidationBanner";
import { WebViewPreview } from "./WebViewPreview";
import { useMarkdownValidation } from "../hooks/useMarkdownValidation";

export function EditorPane({
  value,
  onChange,
  mode,
  textareaRef,
  basePath,
  showToolbar = true,
  onNotify,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onOpenFind,
  aiEnabled = true,
  onOpenAIRequest,
  onOpenAISettings,
  onInlineAIContinue,
  ghostSuggestion,
  onAcceptInlineGhost,
  onRejectInlineGhost,
}) {
  const previewRef = useRef(null);
  const splitPaneRef = useRef(null);
  const [focusedLine, setFocusedLine] = useState(1);
  const [splitRatio, setSplitRatio] = useState(50);
  const [editorReadyTick, setEditorReadyTick] = useState(0);
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const { issues: validationIssues, status: validationStatus } = useMarkdownValidation(value, { spellCheck: spellCheckEnabled });

  const jumpToLine = (line) => {
    const editor = textareaRef?.current;
    if (!editor) return;

    const safeLine = Math.max(Number(line) || 1, 1);
    const lines = (value || "").split(/\r?\n/);
    let startIndex = 0;
    for (let index = 0; index < Math.min(safeLine - 1, lines.length); index += 1) {
      startIndex += lines[index].length + 1;
    }

    editor.focus();
    editor.selectionStart = startIndex;
    editor.selectionEnd = startIndex;

    const lineHeight = typeof editor.getLineHeight === "function"
      ? editor.getLineHeight()
      : parseFloat(window.getComputedStyle(editor).lineHeight) || 20;
    const viewportHeight = Number(editor.clientHeight) || lineHeight * 20;
    const targetTop = (safeLine - 1) * lineHeight - viewportHeight * 0.66;
    const maxScroll = Math.max(0, (Number(editor.scrollHeight) || 0) - viewportHeight);
    editor.scrollTop = Math.max(0, Math.min(targetTop, maxScroll));
    setFocusedLine(safeLine);
  };

  useEffect(() => {
    if (mode !== "split") return undefined;

    const editorElement = textareaRef?.current;
    const previewElement = previewRef.current;
    if (!editorElement || !previewElement) return undefined;
    let syncingSource = null;

    const headingLines = [];
    const lines = (value || "").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/^#{1,6}\s+/.test(line.trim())) {
        headingLines.push(index + 1);
      }
    });

    const previewHeadings = Array.from(previewElement.querySelectorAll("h1, h2, h3, h4, h5, h6"));

    const syncPreviewFromEditor = () => {
      const lineHeight = typeof editorElement.getLineHeight === "function"
        ? editorElement.getLineHeight()
        : parseFloat(window.getComputedStyle(editorElement).lineHeight) || 20;
      const currentLine = Math.floor(editorElement.scrollTop / lineHeight) + 1;

      if (headingLines.length && previewHeadings.length) {
        let headingIndex = -1;
        for (let index = 0; index < headingLines.length; index += 1) {
          if (headingLines[index] <= currentLine) {
            headingIndex = index;
          } else {
            break;
          }
        }

        if (headingIndex >= 0 && previewHeadings[headingIndex]) {
          const currentHeadingLine = headingLines[headingIndex];
          const nextHeadingLine = headingLines[headingIndex + 1] || lines.length + 1;
          const sectionRatio =
            (currentLine - currentHeadingLine) / Math.max(nextHeadingLine - currentHeadingLine, 1);

          const currentHeadingTop = previewHeadings[headingIndex].offsetTop;
          const nextHeadingTop = previewHeadings[headingIndex + 1]
            ? previewHeadings[headingIndex + 1].offsetTop
            : previewElement.scrollHeight - previewElement.clientHeight;

          const targetTop =
            currentHeadingTop +
            Math.max(Math.min(sectionRatio, 1), 0) * Math.max(nextHeadingTop - currentHeadingTop, 0);
          syncingSource = "editor";
          previewElement.scrollTop = targetTop;
          return;
        }
      }

      const sourceScrollable = editorElement.scrollHeight - editorElement.clientHeight;
      const targetScrollable = previewElement.scrollHeight - previewElement.clientHeight;
      const ratio = sourceScrollable > 0 ? editorElement.scrollTop / sourceScrollable : 0;
      syncingSource = "editor";
      previewElement.scrollTop = ratio * Math.max(targetScrollable, 0);
    };

    const syncEditorFromPreview = () => {
      const sourceScrollable = previewElement.scrollHeight - previewElement.clientHeight;
      const targetScrollable = editorElement.scrollHeight - editorElement.clientHeight;
      const ratio = sourceScrollable > 0 ? previewElement.scrollTop / sourceScrollable : 0;
      syncingSource = "preview";
      editorElement.scrollTop = ratio * Math.max(targetScrollable, 0);
    };

    const handleEditorScroll = () => {
      if (syncingSource === "preview") {
        syncingSource = null;
        return;
      }
      syncPreviewFromEditor();
    };

    const handlePreviewScroll = () => {
      if (syncingSource === "editor") {
        syncingSource = null;
        return;
      }
      syncEditorFromPreview();
    };

    editorElement.addEventListener("scroll", handleEditorScroll, { passive: true });
    previewElement.addEventListener("scroll", handlePreviewScroll, { passive: true });
    syncPreviewFromEditor();

    return () => {
      editorElement.removeEventListener("scroll", handleEditorScroll);
      previewElement.removeEventListener("scroll", handlePreviewScroll);
    };
  }, [mode, textareaRef, value, editorReadyTick]);

  const startSplitResize = (event) => {
    const pane = splitPaneRef.current;
    if (!pane) return;

    event.preventDefault();

    const updateSplitRatio = (clientX) => {
      const bounds = pane.getBoundingClientRect();
      const nextRatio = ((clientX - bounds.left) / bounds.width) * 100;
      setSplitRatio(Math.min(Math.max(nextRatio, 30), 70));
    };

    const handlePointerMove = (moveEvent) => {
      updateSplitRatio(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };

    updateSplitRatio(event.clientX);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  const markdownEditor = (
    <MarkdownEditor
      value={value}
      onChange={onChange}
      textareaRef={textareaRef}
      onNotify={onNotify}
      validationIssues={validationIssues}
      onJumpToLine={jumpToLine}
      focusedLine={focusedLine}
      onUndo={onUndo}
      onRedo={onRedo}
      onOpenFind={onOpenFind}
      aiEnabled={aiEnabled}
      onOpenAIRequest={onOpenAIRequest}
      onOpenAISettings={onOpenAISettings}
      onInlineAIContinue={onInlineAIContinue}
      ghostSuggestion={ghostSuggestion}
      onAcceptInlineGhost={onAcceptInlineGhost}
      onRejectInlineGhost={onRejectInlineGhost}
      onEditorReady={() => setEditorReadyTick((value) => value + 1)}
    />
  );

  if (mode === "preview") {
    return <MarkdownPreview content={value} basePath={basePath} />;
  }

  if (mode === "web") {
    return <WebViewPreview content={value} />;
  }

  if (mode === "split") {
    return (
      <div
        className="split-pane"
        ref={splitPaneRef}
        style={{ gridTemplateColumns: `minmax(0, ${splitRatio}%) 8px minmax(0, ${100 - splitRatio}%)` }}
      >
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
                validationIssues={validationIssues}
                validationStatus={validationStatus}
                onJumpToLine={jumpToLine}
                onUndo={onUndo}
                onRedo={onRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                spellCheckEnabled={spellCheckEnabled}
                onToggleSpellCheck={() => setSpellCheckEnabled((prev) => !prev)}
              />
            </div>
          ) : null}
          {showToolbar ? <MarkdownValidationBanner issues={validationIssues} status={validationStatus} /> : null}
          <div className="markdown-editor">{markdownEditor}</div>
        </section>
        <div
          className="split-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor and preview"
          onPointerDown={startSplitResize}
        />
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
            validationIssues={validationIssues}
            validationStatus={validationStatus}
            onJumpToLine={jumpToLine}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            spellCheckEnabled={spellCheckEnabled}
            onToggleSpellCheck={() => setSpellCheckEnabled((prev) => !prev)}
          />
        </div>
      ) : null}
      {showToolbar ? <MarkdownValidationBanner issues={validationIssues} status={validationStatus} /> : null}
      <div className="markdown-editor">{markdownEditor}</div>
    </section>
  );
}
