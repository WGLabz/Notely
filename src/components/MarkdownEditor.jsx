import { useEffect, useMemo, useRef, useState, memo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view";
import { createMediaMarkdown, insertTextAtCursor } from "../utils/markdownUtils";
import { insertMediaFromFiles } from "../services/imageService";
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

function getLineColumnFromIndex(text, index) {
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, (text || "").length));
  const beforeCursor = (text || "").slice(0, safeIndex);
  const line = beforeCursor.split("\n").length;
  const lineStart = getLineStartIndex(text, line);
  return {
    line,
    column: safeIndex - lineStart + 1,
  };
}

function getTextIndexAtLineColumn(value, line, column) {
  const startIndex = getLineStartIndex(value || "", line);
  const safeColumn = Math.max(Number(column) || 1, 1);
  return Math.min(startIndex + safeColumn - 1, (value || "").length);
}

function getIssueLength(issue) {
  return Math.max(Number(issue?.sourceLength) || 0, Number(issue?.length) || 0, issue?.word?.length || 0, 1);
}

function buildDecorationSet(value, issues) {
  const builder = new RangeSetBuilder();
  const ranges = [];

  for (const issue of issues || []) {
    if (!Number.isFinite(issue?.line) || !Number.isFinite(issue?.column)) continue;
    const from = getTextIndexAtLineColumn(value || "", issue.line, issue.column);
    const to = Math.min(from + getIssueLength(issue), (value || "").length);
    if (to <= from) continue;

    let className = "cm-issue-other";
    if (issue.ruleId === "spelling") className = "cm-issue-spelling";

    ranges.push({ from, to, className });
  }

  ranges
    .sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      if (a.to !== b.to) return a.to - b.to;
      return a.className.localeCompare(b.className);
    })
    .forEach((range) => {
      builder.add(range.from, range.to, Decoration.mark({ class: range.className }));
    });

  if (!ranges.length) {
    // Return an empty set for a stable extension value when no issues are present.
    return builder.finish();
  }

  return builder.finish();
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: '"Cascadia Code", Consolas, ui-monospace, monospace',
    lineHeight: "1.55",
  },
  ".cm-content": {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontFamily: '"Cascadia Code", Consolas, ui-monospace, monospace',
    fontSize: "13px",
    padding: "14px 0",
    minHeight: "100%",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-gutters": {
    backgroundColor: "#f7f9f8",
    borderRight: "1px solid #e1e8e5",
    color: "#8aa0a7",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "rgba(26, 58, 62, 0.05)",
  },
  ".cm-issue-spelling": {
    backgroundColor: "rgba(184, 108, 0, 0.18)",
    boxShadow: "inset 0 -2px 0 rgba(184, 108, 0, 0.55)",
    borderRadius: "4px",
  },
  ".cm-issue-other": {
    backgroundColor: "rgba(142, 61, 90, 0.12)",
    boxShadow: "inset 0 -2px 0 rgba(142, 61, 90, 0.45)",
    borderRadius: "4px",
  },
  ".cm-ai-ghost-widget": {
    margin: "8px 16px 0",
    padding: "10px 12px",
    border: "1px dashed #a8c2b8",
    borderRadius: "10px",
    backgroundColor: "rgba(239, 246, 242, 0.95)",
    color: "#31535a",
    display: "grid",
    gap: "8px",
  },
  ".cm-ai-ghost-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  ".cm-ai-ghost-actions": {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  ".cm-ai-ghost-button": {
    minHeight: "28px",
    padding: "0 10px",
    border: "1px solid #c6d6d1",
    borderRadius: "999px",
    backgroundColor: "#ffffff",
    color: "#17343a",
    fontSize: "11px",
    fontWeight: "700",
    cursor: "pointer",
  },
  ".cm-ai-ghost-button.reject": {
    backgroundColor: "#fff6f1",
    color: "#8a3a1e",
  },
  ".cm-ai-ghost-body": {
    whiteSpace: "pre-wrap",
    fontSize: "12px",
    lineHeight: "1.5",
    color: "#45666b",
  },
});

class AIGhostSuggestionWidget extends WidgetType {
  constructor(text, onAccept, onReject) {
    super();
    this.text = text;
    this.onAccept = onAccept;
    this.onReject = onReject;
  }

  eq(other) {
    return other.text === this.text;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-ai-ghost-widget";

    const header = document.createElement("div");
    header.className = "cm-ai-ghost-header";
    const title = document.createElement("span");
    title.textContent = "AI suggestion";
    header.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "cm-ai-ghost-actions";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "cm-ai-ghost-button accept";
    accept.textContent = "Accept";
    accept.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onAccept?.();
    };
    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "cm-ai-ghost-button reject";
    reject.textContent = "Reject";
    reject.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onReject?.();
    };
    actions.appendChild(accept);
    actions.appendChild(reject);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "cm-ai-ghost-body";
    body.textContent = this.text;

    wrap.appendChild(header);
    wrap.appendChild(body);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

function buildGhostSuggestionDecorations(ghostSuggestion, onAccept, onReject, docLength) {
  const builder = new RangeSetBuilder();
  if (!ghostSuggestion?.text) {
    return builder.finish();
  }

  const anchor = Math.max(0, Math.min(Number(ghostSuggestion.insertAt) || 0, docLength));
  builder.add(
    anchor,
    anchor,
    Decoration.widget({
      widget: new AIGhostSuggestionWidget(ghostSuggestion.text, onAccept, onReject),
      side: 1,
      block: true,
    })
  );
  return builder.finish();
}

function createEditorAdapter(view) {
  const clamp = (value) => Math.max(0, Math.min(Number(value) || 0, view.state.doc.length));
  const setSelection = (anchor, head) => {
    view.dispatch({ selection: EditorSelection.single(clamp(anchor), clamp(head)) });
  };

  return {
    get value() {
      return view.state.doc.toString();
    },
    focus() {
      view.focus();
    },
    get selectionStart() {
      return view.state.selection.main.from;
    },
    set selectionStart(nextValue) {
      setSelection(nextValue, view.state.selection.main.to);
    },
    get selectionEnd() {
      return view.state.selection.main.to;
    },
    set selectionEnd(nextValue) {
      setSelection(view.state.selection.main.from, nextValue);
    },
    get scrollTop() {
      return view.scrollDOM.scrollTop;
    },
    set scrollTop(nextValue) {
      view.scrollDOM.scrollTop = Number(nextValue) || 0;
    },
    get scrollLeft() {
      return view.scrollDOM.scrollLeft;
    },
    set scrollLeft(nextValue) {
      view.scrollDOM.scrollLeft = Number(nextValue) || 0;
    },
    get scrollHeight() {
      return view.scrollDOM.scrollHeight;
    },
    get clientHeight() {
      return view.scrollDOM.clientHeight;
    },
    getLineHeight() {
      return parseFloat(window.getComputedStyle(view.contentDOM).lineHeight) || 20;
    },
    getTopLine() {
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      return view.state.doc.lineAt(block.from).number;
    },
    scrollToLine(lineNumber) {
      const safeLine = Math.max(1, Math.min(Number(lineNumber) || 1, view.state.doc.lines));
      const line = view.state.doc.line(safeLine);
      const block = view.lineBlockAt(line.from);
      view.scrollDOM.scrollTop = block.top;
    },
    addEventListener(type, listener, options) {
      view.scrollDOM.addEventListener(type, listener, options);
    },
    removeEventListener(type, listener, options) {
      view.scrollDOM.removeEventListener(type, listener, options);
    },
  };
}

export const MarkdownEditor = memo(function MarkdownEditorContent({
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
  aiEnabled = true,
  onOpenAIRequest,
  onOpenAISettings,
  ghostSuggestion,
  onAcceptInlineGhost,
  onRejectInlineGhost,
  onEditorReady,
}) {
  const viewRef = useRef(null);
  const menuRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [_activeLine, setActiveLine] = useState(1);
  const [docLength, setDocLength] = useState(String(value || "").length);

  const valueLength = String(value || "").length;
  const decorationsSynced = docLength === valueLength;

  const validationDecorations = useMemo(() => {
    if (!decorationsSynced) return Decoration.none;
    return buildDecorationSet(value, validationIssues);
  }, [decorationsSynced, value, validationIssues]);
  const ghostSuggestionDecorations = useMemo(
    () => {
      if (!decorationsSynced) return Decoration.none;
      return buildGhostSuggestionDecorations(ghostSuggestion, onAcceptInlineGhost, onRejectInlineGhost, valueLength);
    },
    [decorationsSynced, ghostSuggestion, onAcceptInlineGhost, onRejectInlineGhost, valueLength]
  );

  useEffect(() => {
    if (Number.isFinite(focusedLine) && focusedLine > 0) {
      setActiveLine(focusedLine);
    }
  }, [focusedLine]);

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

  const editorExtensions = useMemo(() => [
    markdown(),
    editorTheme,
    EditorView.decorations.of(validationDecorations),
    EditorView.decorations.of(ghostSuggestionDecorations),
    EditorView.lineWrapping,
    EditorView.domEventHandlers({
      contextmenu(event, view) {
        event.preventDefault();
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
        const currentSelection = view.state.selection.main;
        const keepSelection = !currentSelection.empty && position >= currentSelection.from && position <= currentSelection.to;
        if (!keepSelection) {
          view.dispatch({ selection: EditorSelection.single(position) });
        }

        const docValue = view.state.doc.toString();
        const activeSelection = keepSelection ? currentSelection : view.state.selection.main;
        const lineColumn = getLineColumnFromIndex(docValue, position);
        setActiveLine(lineColumn.line);

        const lineIssues = (validationIssues || []).filter((issue) => issue.line === lineColumn.line);
        const matchingIssues = lineIssues.filter((issue) => {
          const issueColumn = Math.max(Number(issue?.column) || 1, 1);
          const issueEndColumn = issueColumn + getIssueLength(issue) - 1;
          return lineColumn.column >= issueColumn && lineColumn.column <= issueEndColumn;
        });
        const targetIssues = matchingIssues.length ? matchingIssues : lineIssues;

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          line: lineColumn.line,
          issues: targetIssues,
          hasSelection: !activeSelection.empty,
          selectedText: !activeSelection.empty ? docValue.slice(activeSelection.from, activeSelection.to) : "",
        });
        return true;
      },
      dragover(event) {
        if (event.dataTransfer?.types?.includes("Files")) {
          event.preventDefault();
        }
        return false;
      },
      drop(event, view) {
        const files = event.dataTransfer?.files || [];
        if (!files.length) return false;

        event.preventDefault();
        const dropPosition = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (Number.isFinite(dropPosition)) {
          view.dispatch({ selection: EditorSelection.single(dropPosition) });
        }

        onNotify?.("Uploading dropped image...", "info");

        void (async () => {
          try {
            const results = await insertMediaFromFiles(files);
            const markdownImages = results.map((result) =>
              createMediaMarkdown(result.altText, result.mediaPath || result.imagePath)
            );
            const adapter = createEditorAdapter(view);
            insertTextAtCursor(
              view.state.doc.toString(),
              onChange,
              `${markdownImages.join("\n\n")}\n`,
              { current: adapter }
            );
            onNotify?.(`Inserted ${results.length} media item${results.length > 1 ? "s" : ""}.`, "success");
          } catch (error) {
            console.error("Media drop insertion failed:", error);
            onNotify?.(error?.message || "Failed to insert dropped media.", "error");
          }
        })();

        return true;
      },
    }),
    keymap.of([
      {
        key: "Mod-f",
        run() {
          onOpenFind?.();
          return true;
        },
      },
      {
        key: "Mod-z",
        run() {
          onUndo?.();
          return true;
        },
      },
      {
        key: "Mod-y",
        run() {
          onRedo?.();
          return true;
        },
      },
      {
        key: "Mod-Shift-z",
        run() {
          onRedo?.();
          return true;
        },
      },
    ]),
  ], [ghostSuggestionDecorations, onChange, onNotify, onOpenFind, onRedo, onUndo, textareaRef, validationDecorations, validationIssues]);

  return (
    <div className="markdown-editor">
      <CodeMirror
        className="markdown-codemirror"
        value={value}
        height="100%"
        basicSetup={{
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          dropCursor: false,
          searchKeymap: false,
        }}
        extensions={editorExtensions}
        onCreateEditor={(view) => {
          viewRef.current = view;
          setDocLength(view.state.doc.length);
          if (textareaRef) {
            textareaRef.current = createEditorAdapter(view);
          }
          onEditorReady?.();
        }}
        onUpdate={(update) => {
          setDocLength(update.state.doc.length);
          const position = update.state.selection.main.head;
          const { line } = getLineColumnFromIndex(update.state.doc.toString(), position);
          setActiveLine(line);
          if (textareaRef && viewRef.current) {
            textareaRef.current = createEditorAdapter(viewRef.current);
          }
        }}
        onChange={(nextValue) => {
          onChange(nextValue);
        }}
      />
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
          {aiEnabled ? (
            <div className="editor-context-menu-group">
              <div className="editor-context-menu-label">AI actions</div>
              {contextMenu.hasSelection ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenAIRequest?.({
                        initialQuery: "Help me improve this selection while preserving its meaning and intent.",
                        target: "selection",
                        autoRun: false,
                        source: "context-menu",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Ask AI about selection
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenAIRequest?.({
                        initialQuery: "Rewrite this selection to be clearer and more polished while preserving meaning.",
                        target: "selection",
                        autoRun: true,
                        source: "context-menu",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Rewrite selection with AI
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenAIRequest?.({
                        initialQuery: "Use the selected text as the focal point and find related ideas, contradictions, or supporting notes from the workspace.",
                        target: "workspace",
                        autoRun: true,
                        source: "context-menu",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Find related notes in workspace
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenAIRequest?.({
                        initialQuery: "Turn this selection into a concise action list with markdown bullets.",
                        target: "selection",
                        autoRun: true,
                        source: "context-menu",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Turn selection into action items
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenAIRequest?.({
                        initialQuery: "Help me think through this section, point out gaps, and suggest the strongest next move.",
                        target: "block",
                        autoRun: false,
                        source: "context-menu",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Ask AI about this section
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenAIRequest?.({
                        initialQuery: "Continue writing this section in the same tone and structure.",
                        target: "block",
                        autoRun: true,
                        source: "context-menu",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Continue this section with AI
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenAIRequest?.({
                        initialQuery: "Use this note as the focal point and search the workspace for related notes, missing context, and useful connections.",
                        target: "workspace",
                        autoRun: true,
                        source: "context-menu",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Explore related workspace notes
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenAIRequest?.({
                        initialQuery: "Summarize the current block into a shorter, cleaner version.",
                        target: "block",
                        autoRun: true,
                        source: "context-menu",
                      });
                      setContextMenu(null);
                    }}
                  >
                    Summarize current block
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="editor-context-menu-group">
              <div className="editor-context-menu-label">AI unavailable</div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenAISettings?.();
                  setContextMenu(null);
                }}
              >
                Configure AI settings
              </button>
            </div>
          )}
          {contextMenu.issues.length ? (
            <div className="editor-context-menu-group">
              <div className="editor-context-menu-label">Fixes</div>
              {contextMenu.issues.map((issue, index) => {
                const label = getIssueFixType(issue)
                  ? "Quick fix"
                  : issue.suggestion
                    ? `Apply suggestion${issue.suggestion ? `: ${issue.suggestion}` : ""}`
                    : "Review issue";
                return (
                  <button
                    key={`${issue.line}-${issue.column}-${index}`}
                    type="button"
                    role="menuitem"
                    onClick={() => applyIssueAction(issue)}
                  >
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
});
