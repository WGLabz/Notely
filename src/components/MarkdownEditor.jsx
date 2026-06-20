import { useEffect, useMemo, useRef, useState } from "react";
import { createImageMarkdown, insertTextAtCursor } from "../utils/markdownUtils";
import { insertImagesFromFiles } from "../services/imageService";
import { applyMarkdownQuickFix, applyValidationSuggestion, getIssueFixType } from "../utils/markdownQuickFix";

function getLineStartIndex(text, lineNumber) {
  const targetLine = Math.max(lineNumber, 1);
  let currentLine = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (currentLine === targetLine) return index;
    if (text[index] === "\n") currentLine += 1;
  }
  return text.length;
}

export function MarkdownEditor({
  value,
  onChange,
  textareaRef,
  onNotify,
  validationIssues = [],
  onJumpToLine,
  focusedLine = 1,
  onUndo,
  onRedo,
  onOpenFind,
}) {
  const gutterRef = useRef(null);
  const issueLayerRef = useRef(null);
  const issueLayerInnerRef = useRef(null);
  const menuRef = useRef(null);
  const [activeLine, setActiveLine] = useState(1);
  const [contextMenu, setContextMenu] = useState(null);
  const lineNumbers = useMemo(() => {
    const count = (value.match(/\n/g) || []).length + 1;
    return Array.from({ length: count }, (_value, index) => index + 1);
  }, [value]);
  const issueLineSet = useMemo(() => {
    return new Set((validationIssues || []).map((issue) => issue.line));
  }, [validationIssues]);
  const issueLineMap = useMemo(() => {
    const map = new Map();
    (validationIssues || []).forEach((issue) => {
      const line = issue?.line;
      if (!Number.isFinite(line)) return;

      const bucket = map.get(line) || { hasSpelling: false, hasGrammar: false, hasOther: false };
      if (issue.ruleId === "spelling") bucket.hasSpelling = true;
      else if (issue.ruleId === "grammar" || String(issue.ruleId || "").includes("grammar")) bucket.hasGrammar = true;
      else bucket.hasOther = true;
      map.set(line, bucket);
    });
    return map;
  }, [validationIssues]);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (Number.isFinite(focusedLine) && focusedLine > 0) {
      setActiveLine(focusedLine);
    }
  }, [focusedLine]);

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
    if (issueLayerInnerRef.current) {
      issueLayerInnerRef.current.style.transform = `translateY(${-event.target.scrollTop}px)`;
    }
  };

  const updateActiveLineFromSelection = (event) => {
    const beforeCursor = event.target.value.slice(0, event.target.selectionStart);
    const line = beforeCursor.split("\n").length;
    setActiveLine(line);
  };

  const setCursorLineFromPosition = (selectionStart) => {
    const beforeCursor = (value || "").slice(0, selectionStart);
    const line = beforeCursor.split("\n").length;
    setActiveLine(line);
    return line;
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    const editor = textareaRef?.current;
    if (!editor) return;

    const line = setCursorLineFromPosition(editor.selectionStart ?? 0);
    const targetIssues = (validationIssues || []).filter((issue) => issue.line === line);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      line,
      issues: targetIssues,
    });
  };

  const handleKeyDown = (event) => {
    const isModifierPressed = event.ctrlKey || event.metaKey;
    if (!isModifierPressed) return;

    const key = String(event.key || "").toLowerCase();
    const wantsRedoWithY = key === "y";
    const wantsRedoWithShiftZ = key === "z" && event.shiftKey;
    const wantsUndo = key === "z" && !event.shiftKey;
    const wantsFind = key === "f";

    if (wantsFind) {
      event.preventDefault();
      onOpenFind?.();
      return;
    }

    if (wantsUndo) {
      event.preventDefault();
      onUndo?.();
      return;
    }

    if (wantsRedoWithY || wantsRedoWithShiftZ) {
      event.preventDefault();
      onRedo?.();
    }
  };

  const applyIssueAction = (issue) => {
    if (!issue) return;

    const quickFixResult = applyMarkdownQuickFix(value, issue);
    if (quickFixResult.changed) {
      onChange(quickFixResult.nextValue);
      onNotify?.(quickFixResult.message, "success");
      setContextMenu(null);
      return;
    }

    const suggestionResult = applyValidationSuggestion(value, issue);
    if (suggestionResult.changed) {
      onChange(suggestionResult.nextValue);
      onNotify?.(suggestionResult.message, "success");
      setContextMenu(null);
      return;
    }

    onNotify?.("No automatic fix available for this issue.", "warning");
  };

  const handleLineClick = async (line) => {
    const editor = textareaRef?.current;
    if (!editor) return;

    const startIndex = getLineStartIndex(value || "", line);
    editor.focus();
    editor.selectionStart = startIndex;
    editor.selectionEnd = startIndex;
    setActiveLine(line);

    try {
      await navigator.clipboard.writeText(`#L${line}`);
      onNotify?.(`Line ${line} copied as #L${line}.`, "info");
    } catch {
      // Clipboard may be blocked; ignore silently.
    }
  };

  return (
    <div className="markdown-editor">
      <div className="markdown-editor-shell">
        <div className="markdown-gutter" ref={gutterRef} aria-hidden="true">
          {lineNumbers.map((line) => (
            <button
              type="button"
              className={`markdown-line-number ${activeLine === line ? "active" : ""} ${issueLineSet.has(line) ? "has-issue" : ""}`}
              key={line}
              onClick={() => handleLineClick(line)}
              title={`Go to line ${line}`}
            >
              <span>{line}</span>
              {issueLineSet.has(line) ? <em className="line-issue-marker">!</em> : null}
            </button>
          ))}
        </div>
        <div className="markdown-textarea-stack">
          <div className="markdown-issue-layer" aria-hidden="true" ref={issueLayerRef}>
            <div className="markdown-issue-layer-inner" ref={issueLayerInnerRef}>
              {lineNumbers.map((line) => {
                const lineIssues = issueLineMap.get(line);
                const classes = ["markdown-issue-line"];
                if (activeLine === line) classes.push("active-line");
                if (lineIssues?.hasSpelling) classes.push("spelling-line");
                if (lineIssues?.hasGrammar) classes.push("grammar-line");
                if (lineIssues?.hasOther) classes.push("other-line");
                return <div key={`issue-${line}`} className={classes.join(" ")} />;
              })}
            </div>
          </div>
          <textarea
            ref={textareaRef}
            className="markdown-textarea with-line-numbers"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onScroll={handleEditorScroll}
            onClick={updateActiveLineFromSelection}
            onKeyUp={updateActiveLineFromSelection}
            onContextMenu={handleContextMenu}
            spellCheck={false}
          />
        </div>
      </div>
      {contextMenu ? (
        <div
          ref={menuRef}
          className="editor-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label="Editor context menu"
        >
          <button type="button" role="menuitem" onClick={() => onJumpToLine?.(contextMenu.line)}>
            Go to line {contextMenu.line}
          </button>
          {contextMenu.issues.length ? (
            <div className="editor-context-menu-group">
              {contextMenu.issues.map((issue, index) => {
                const label = getIssueFixType(issue)
                  ? "Quick fix"
                  : issue.suggestion
                    ? `Apply suggestion${issue.suggestion ? `: ${issue.suggestion}` : ""}`
                    : "Review issue";
                return (
                  <button key={`${issue.line}-${issue.column}-${index}`} type="button" role="menuitem" onClick={() => applyIssueAction(issue)}>
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <button type="button" role="menuitem" onClick={() => onNotify?.("No validation issues on this line.", "info")}>
              No issues on this line
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
