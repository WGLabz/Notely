import { useDeferredValue, useCallback, useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MarkdownValidationBanner } from "./MarkdownValidationBanner";
import { WebViewPreview } from "./WebViewPreview";
import { MediaPreviewPane } from "./MediaPreviewPane";
import OverlayDialog from "./OverlayDialog";
import { useMarkdownValidation } from "../hooks/useMarkdownValidation";
import { Link2, Unlink } from "lucide-react";


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
  onToggleFind,
  aiEnabled = true,
  onOpenAIRequest,
  onOpenAISettings,
  onInlineAIContinue,
  ghostSuggestion,
  onAcceptInlineGhost,
  onRejectInlineGhost,
  findMatches = [],
  activeFindMatchIndex = -1,
  showOriginalImages = false,
  inlineLinkedMarkdown = false,
  outlineEnabled = true,
  onOutlineEnabledChange,
  typoCheckEnabled = true,
  screenCaptureMode = "auto",
  ignoredSpellingWords = [],
  onIgnoreSpellingWord,
  onForceSaveDocument,
  initialLine = null,
  onLineJumped,
}) {
  const previewRef = useRef(null);
  const splitPaneRef = useRef(null);
  const [focusedLine, setFocusedLine] = useState(1);
  const [splitRatio, setSplitRatio] = useState(50);
  const [editorReadyTick, setEditorReadyTick] = useState(0);
  const [selectedMediaPreview, setSelectedMediaPreview] = useState(null);
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
  const [tableEditorEnabled, setTableEditorEnabled] = useState(() => {
    return localStorage.getItem("notes:table-editor-enabled") !== "false";
  });

  const handleTableEditorToggle = useCallback((nextValue) => {
    const value = Boolean(nextValue);
    setTableEditorEnabled(value);
    localStorage.setItem("notes:table-editor-enabled", String(value));
  }, []);

  const jumpToLine = useCallback((line) => {
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
  }, [textareaRef, value]);

  useEffect(() => {
    if (initialLine && editorReadyTick) {
      jumpToLine(initialLine);
      onLineJumped?.();
    }
  }, [initialLine, editorReadyTick, jumpToLine, onLineJumped]);

  useEffect(() => {
    if (textareaRef?.current) return undefined;
    const interval = setInterval(() => {
      if (textareaRef?.current) {
        setEditorReadyTick((prev) => prev + 1);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [textareaRef]);
  const deferredValue = useDeferredValue(value);
  const isSplitMode = mode === "split";
  const { issues: validationIssues, status: validationStatus } = useMarkdownValidation(value, {
    spellCheck: typoCheckEnabled,
    ignoredWords: ignoredSpellingWords,
    strategy: "debounce",
    debounceMs: isSplitMode ? 1200 : 500,
  });
  const previewContent = isSplitMode ? deferredValue : value;

  const clampSplitRatio = (nextRatio) => Math.min(Math.max(Number(nextRatio) || 50, 30), 70);

  useEffect(() => {
    if (mode !== "split" || !scrollSyncEnabled) return undefined;

    const editorElement = textareaRef?.current;
    const previewElement = previewRef.current;
    if (!editorElement || !previewElement) return undefined;

    // Use a generation counter instead of a named source string.
    // Any sync triggered in generation N ignores scroll events that arrive in the same N.
    let lockGen = 0;
    let editorRaf = 0;
    let previewRaf = 0;
    let resizeRaf = 0;
    let unlockTimer = 0;
    let resizeObserver = null;
    let mutationObserver = null;
    let cachedAnchors = null;

    const lock = () => {
      lockGen++;
      clearTimeout(unlockTimer);
      // Give the browser two frames to settle programmatic scrollTop changes
      // before allowing the opposite panel's scroll event to re-trigger a sync
      unlockTimer = setTimeout(() => { lockGen = 0; }, 80);
    };


    const getScrollRatio = (element) => {
      const scrollable = Math.max(0, element.scrollHeight - element.clientHeight);
      return scrollable > 0 ? element.scrollTop / scrollable : 0;
    };

    const setScrollRatio = (element, ratio) => {
      const scrollable = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.max(0, Math.min(Number(ratio) || 0, 1)) * scrollable;
    };

    const getEditorLineTop = (lineNumber) => {
      if (typeof editorElement.getLineTop === "function") {
        return editorElement.getLineTop(lineNumber);
      }
      const lineHeight = typeof editorElement.getLineHeight === "function"
        ? editorElement.getLineHeight()
        : 20;
      return Math.max(0, (Math.max(Number(lineNumber) || 1, 1) - 1) * lineHeight);
    };

    const updateAnchors = () => {
      if (!previewElement || !editorElement) return;
      const elements = Array.from(previewElement.querySelectorAll("[data-source-line]"));
      const map = new Map();
      const containerTop = previewElement.getBoundingClientRect().top;
      const currentScroll = previewElement.scrollTop;

      for (const element of elements) {
        const line = Number(element.getAttribute("data-source-line")) || 0;
        if (line > 0 && !map.has(line)) {
          const previewTop = element.getBoundingClientRect().top - containerTop + currentScroll;
          map.set(line, { element, line, previewTop });
        }
      }
      cachedAnchors = Array.from(map.values()).sort((a, b) => a.line - b.line);
    };

    const getPreviewAnchors = () => {
      if (!cachedAnchors) updateAnchors();
      return cachedAnchors;
    };

    const syncPreviewFromEditor = () => {
      const anchors = getPreviewAnchors();
      if (!anchors.length) {
        setScrollRatio(previewElement, getScrollRatio(editorElement));
        return;
      }

      const editorScroll = editorElement.scrollTop;

      let prevAnchor = null;
      let nextAnchor = null;
      for (const anchor of anchors) {
        const lineTop = getEditorLineTop(anchor.line);
        if (lineTop <= editorScroll) {
          prevAnchor = { ...anchor, editorTop: lineTop };
        } else {
          nextAnchor = { ...anchor, editorTop: lineTop };
          break;
        }
      }

      if (!prevAnchor && nextAnchor) {
        const ratio = nextAnchor.editorTop > 0 ? editorScroll / nextAnchor.editorTop : 0;
        previewElement.scrollTop = Math.max(0, ratio * nextAnchor.previewTop);
      } else if (prevAnchor && !nextAnchor) {
        const editorMaxScroll = Math.max(0, editorElement.scrollHeight - editorElement.clientHeight);
        const previewMaxScroll = Math.max(0, previewElement.scrollHeight - previewElement.clientHeight);
        const remainingEditorScroll = Math.max(0, editorMaxScroll - prevAnchor.editorTop);
        const remainingPreviewScroll = Math.max(0, previewMaxScroll - prevAnchor.previewTop);
        const ratio = remainingEditorScroll > 0 ? Math.min(1, Math.max(0, editorScroll - prevAnchor.editorTop) / remainingEditorScroll) : (editorScroll >= editorMaxScroll ? 1 : 0);
        previewElement.scrollTop = prevAnchor.previewTop + ratio * remainingPreviewScroll;
      } else if (prevAnchor && nextAnchor) {
        let ratio = 0;
        const editorDiff = nextAnchor.editorTop - prevAnchor.editorTop;
        if (editorDiff > 0) {
          ratio = (editorScroll - prevAnchor.editorTop) / editorDiff;
        }
        previewElement.scrollTop = prevAnchor.previewTop + ratio * (nextAnchor.previewTop - prevAnchor.previewTop);
      }
    };

    const syncEditorFromPreview = () => {
      const anchors = getPreviewAnchors();
      if (!anchors.length) {
        setScrollRatio(editorElement, getScrollRatio(previewElement));
        return;
      }

      const previewScroll = previewElement.scrollTop;

      let prevAnchor = null;
      let nextAnchor = null;
      for (const anchor of anchors) {
        if (anchor.previewTop <= previewScroll) {
          prevAnchor = anchor;
        } else {
          nextAnchor = anchor;
          break;
        }
      }

      if (!prevAnchor && nextAnchor) {
        const ratio = nextAnchor.previewTop > 0 ? previewScroll / nextAnchor.previewTop : 0;
        const nextEditorTop = getEditorLineTop(nextAnchor.line);
        editorElement.scrollTop = Math.max(0, ratio * nextEditorTop);
      } else if (prevAnchor && !nextAnchor) {
        const prevEditorTop = getEditorLineTop(prevAnchor.line);
        const editorMaxScroll = Math.max(0, editorElement.scrollHeight - editorElement.clientHeight);
        const previewMaxScroll = Math.max(0, previewElement.scrollHeight - previewElement.clientHeight);
        const remainingPreviewScroll = Math.max(0, previewMaxScroll - prevAnchor.previewTop);
        const remainingEditorScroll = Math.max(0, editorMaxScroll - prevEditorTop);
        const ratio = remainingPreviewScroll > 0 ? Math.min(1, Math.max(0, previewScroll - prevAnchor.previewTop) / remainingPreviewScroll) : (previewScroll >= previewMaxScroll ? 1 : 0);
        editorElement.scrollTop = prevEditorTop + ratio * remainingEditorScroll;
      } else if (prevAnchor && nextAnchor) {
        let ratio = 0;
        const previewDiff = nextAnchor.previewTop - prevAnchor.previewTop;
        if (previewDiff > 0) {
          ratio = (previewScroll - prevAnchor.previewTop) / previewDiff;
        }
        const prevEditorTop = getEditorLineTop(prevAnchor.line);
        const nextEditorTop = getEditorLineTop(nextAnchor.line);
        editorElement.scrollTop = prevEditorTop + ratio * (nextEditorTop - prevEditorTop);
      }
    };

    const handleEditorScroll = () => {
      if (lockGen !== 0) return;          // still in a sync cycle — ignore
      cancelAnimationFrame(editorRaf);
      editorRaf = requestAnimationFrame(() => {
        lock();
        syncPreviewFromEditor();
      });
    };

    const handlePreviewScroll = () => {
      if (lockGen !== 0) return;          // still in a sync cycle — ignore
      cancelAnimationFrame(previewRaf);
      previewRaf = requestAnimationFrame(() => {
        lock();
        syncEditorFromPreview();
      });
    };

    const syncAfterPreviewResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        cachedAnchors = null;
        if (lockGen === 0) syncPreviewFromEditor();
      });
    };

    const observePreviewContent = () => {
      if (!resizeObserver || !previewElement) return;
      resizeObserver.disconnect();
      resizeObserver.observe(previewElement);
      previewElement.querySelectorAll("img, video, iframe, table, pre, .markdown-image-frame").forEach((node) => {
        resizeObserver.observe(node);
      });
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(syncAfterPreviewResize);
      observePreviewContent();
    }

    mutationObserver = new MutationObserver(() => {
      observePreviewContent();
      syncAfterPreviewResize();
    });
    mutationObserver.observe(previewElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style", "class"] });

    previewElement.addEventListener("load", syncAfterPreviewResize, true);

    editorElement.addEventListener("scroll", handleEditorScroll, { passive: true });
    previewElement.addEventListener("scroll", handlePreviewScroll, { passive: true });

    syncPreviewFromEditor();

    return () => {
      cancelAnimationFrame(editorRaf);
      cancelAnimationFrame(previewRaf);
      cancelAnimationFrame(resizeRaf);
      clearTimeout(unlockTimer);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      previewElement.removeEventListener("load", syncAfterPreviewResize, true);
      editorElement.removeEventListener("scroll", handleEditorScroll);
      previewElement.removeEventListener("scroll", handlePreviewScroll);
    };
  }, [mode, textareaRef, editorReadyTick, scrollSyncEnabled]);

  const startSplitResize = (event) => {
    const pane = splitPaneRef.current;
    if (!pane) return;

    event.preventDefault();

    const updateSplitRatio = (clientX) => {
      const bounds = pane.getBoundingClientRect();
      const nextRatio = ((clientX - bounds.left) / bounds.width) * 100;
      setSplitRatio(clampSplitRatio(nextRatio));
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

  const handleSplitResizerKeyDown = (event) => {
    const STEP = event.shiftKey ? 10 : 5;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplitRatio((current) => clampSplitRatio(current - STEP));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplitRatio((current) => clampSplitRatio(current + STEP));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setSplitRatio(30);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setSplitRatio(70);
    }
  };

  const markdownEditor = (
    <MarkdownEditor
      value={value}
      onChange={onChange}
      basePath={basePath}
      textareaRef={textareaRef}
      onNotify={onNotify}
      validationIssues={validationIssues}
      onIgnoreSpellingWord={onIgnoreSpellingWord}
      onJumpToLine={jumpToLine}
      focusedLine={focusedLine}
      onUndo={onUndo}
      onRedo={onRedo}
      onOpenFind={onOpenFind}
      onToggleFind={onToggleFind}
      aiEnabled={aiEnabled}
      onOpenAIRequest={onOpenAIRequest}
      onOpenAISettings={onOpenAISettings}
      onInlineAIContinue={onInlineAIContinue}
      ghostSuggestion={ghostSuggestion}
      onAcceptInlineGhost={onAcceptInlineGhost}
      onRejectInlineGhost={onRejectInlineGhost}
      findMatches={findMatches}
      activeFindMatchIndex={activeFindMatchIndex}
      tableEditorEnabled={tableEditorEnabled}
      onEditorReady={() => setEditorReadyTick((value) => value + 1)}
      onSearchRequest={(query) => {
        window.dispatchEvent(new CustomEvent("open-global-search-query", { detail: { query } }));
      }}
    />
  );

  const toolbarProps = {
    value,
    onChange,
    textareaRef,
    basePath,
    onNotify,
    validationIssues,
    validationStatus,
    onJumpToLine: jumpToLine,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    ignoredSpellingWords,
    onIgnoreSpellingWord: onIgnoreSpellingWord,
    screenCaptureMode,
    tableEditorEnabled,
    onTableEditorToggle: handleTableEditorToggle,
    outlineEnabled,
    onOutlineEnabledChange,
  };

  const renderToolbar = () => (
    <div className="pane-toolbar-row">
      <MarkdownToolbar {...toolbarProps} />
    </div>
  );

  if (mode === "preview") {
    return (
      <>
        <div
          className="preview-with-media"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minHeight: 0,
          }}
        >
          <MarkdownPreview
            content={previewContent}
            basePath={basePath}
            onNotify={onNotify}
            onContentChange={onChange}
            onMediaClick={setSelectedMediaPreview}
            showOriginalImages={showOriginalImages}
            inlineLinkedMarkdown={inlineLinkedMarkdown}
            onForceSaveDocument={onForceSaveDocument}
            onSearchRequest={(query) => {
              window.dispatchEvent(new CustomEvent("open-global-search-query", { detail: { query } }));
            }}
          />
        </div>
        {selectedMediaPreview ? (
          <OverlayDialog
            onClose={() => setSelectedMediaPreview(null)}
            ariaLabel="Media preview"
            overlayClassName="media-full-preview-overlay"
            cardClassName="media-full-preview-content"
            useDefaultCardClass={false}
          >
              <MediaPreviewPane
                mediaPath={selectedMediaPreview.path}
                mediaType={selectedMediaPreview.type}
                basePath={basePath}
                showOriginalImages={showOriginalImages}
                onClose={() => setSelectedMediaPreview(null)}
              />
          </OverlayDialog>
        ) : null}
      </>
    );
  }

  if (mode === "web") {
    return <WebViewPreview content={value} basePath={basePath} />;
  }

  if (mode === "split") {
    return (
      <>
        <div
          className="split-pane-with-media"
          ref={splitPaneRef}
          style={{
            display: "grid",
            gridTemplateColumns: `minmax(0, ${splitRatio}%) 8px minmax(0, ${100 - splitRatio}%)`,
            height: "100%",
          }}
        >
          <section className="pane-block">
            <div className="pane-title toolbar-label-row">
              <span className="pane-title-label">Editor</span>
            </div>
            {showToolbar ? renderToolbar() : null}

            <div className="markdown-editor">{markdownEditor}</div>
          </section>
          <div
            className="split-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor and preview"
            aria-valuemin={30}
            aria-valuemax={70}
            aria-valuenow={Math.round(splitRatio)}
            aria-valuetext={`${Math.round(splitRatio)} percent editor width`}
            tabIndex={0}
            onPointerDown={startSplitResize}
            onKeyDown={handleSplitResizerKeyDown}
          />
          <section className="pane-block">
            <div className="pane-title">
              <span className="pane-title-label">Preview</span>
              <button
                className={`split-sync-toggle ${scrollSyncEnabled ? "active" : ""}`}
                type="button"
                onClick={() => setScrollSyncEnabled((enabled) => !enabled)}
                data-tooltip={scrollSyncEnabled ? "Scroll sync is on" : "Scroll sync is off"}
                aria-pressed={scrollSyncEnabled}
              >
                {scrollSyncEnabled ? <Link2 size={14} /> : <Unlink size={14} />}
                <span>{scrollSyncEnabled ? "Sync scroll" : "Independent scroll"}</span>
              </button>
            </div>
            {showToolbar ? <div className="pane-toolbar-spacer" aria-hidden="true" /> : null}
            <MarkdownPreview
              content={previewContent}
              basePath={basePath}
              externalRef={previewRef}
              onNotify={onNotify}
              onContentChange={onChange}
              onMediaClick={setSelectedMediaPreview}
              showOriginalImages={showOriginalImages}
              inlineLinkedMarkdown={inlineLinkedMarkdown}
              onForceSaveDocument={onForceSaveDocument}
              onSearchRequest={(query) => {
                window.dispatchEvent(new CustomEvent("open-global-search-query", { detail: { query } }));
              }}
            />
          </section>
        </div>
        {selectedMediaPreview ? (
          <OverlayDialog
            onClose={() => setSelectedMediaPreview(null)}
            ariaLabel="Media preview"
            overlayClassName="media-full-preview-overlay"
            cardClassName="media-full-preview-content"
            useDefaultCardClass={false}
          >
              <MediaPreviewPane
                mediaPath={selectedMediaPreview.path}
                mediaType={selectedMediaPreview.type}
                basePath={basePath}
                showOriginalImages={showOriginalImages}
                onClose={() => setSelectedMediaPreview(null)}
              />
          </OverlayDialog>
        ) : null}
      </>
    );
  }

  return (
    <section className="pane-block">
      <div className="pane-title toolbar-label-row">
        <span className="pane-title-label">Markdown Editor</span>
      </div>
      {showToolbar ? renderToolbar() : null}
      {showToolbar ? <MarkdownValidationBanner issues={validationIssues} status={validationStatus} /> : null}
      <div className="markdown-editor">{markdownEditor}</div>
    </section>
  );
}
