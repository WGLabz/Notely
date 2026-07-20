import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { Search, Copy, Sparkles, MessageSquare, RefreshCcw, FileSearch, List, Wand2, Settings, BookPlus } from "lucide-react";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view";
import { createMediaMarkdown, insertTextAtCursor } from "../utils/markdownUtils";
import { syntaxTree } from "@codemirror/language";
import { MarkdownTableEditor } from "./MarkdownTableEditor";
import { insertMediaFromFiles } from "../services/imageService";
import { applyMarkdownQuickFix, applyValidationSuggestion, getIssueFixType } from "../utils/markdownQuickFix";
import { editorTheme } from "../utils/editorTheme";
import { generateDiagramId } from "../utils/diagramFileUtils";

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

function buildFindMatchDecorations(matches, activeMatchIndex) {
  const builder = new RangeSetBuilder();

  (matches || []).forEach((match, index) => {
    const from = Number(match?.start);
    const to = Number(match?.end);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;

    builder.add(
      from,
      to,
      Decoration.mark({ class: index === activeMatchIndex ? "cm-find-match-active" : "cm-find-match" })
    );
  });

  return builder.finish();
}


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
    setSelectionRange(start, end = start) {
      setSelection(start, end);
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
    getLineTop(lineNumber) {
      const safeLine = Math.max(1, Math.min(Number(lineNumber) || 1, view.state.doc.lines));
      const line = view.state.doc.line(safeLine);
      const block = view.lineBlockAt(line.from);
      return block.top;
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
  onIgnoreSpellingWord,
  onJumpToLine,
  focusedLine = 1,
  onUndo,
  onRedo,
  onOpenFind,
  onToggleFind,
  aiEnabled = true,
  onOpenAIRequest,
  onOpenAISettings,
  onSearchRequest,
  ghostSuggestion,
  onAcceptInlineGhost,
  onRejectInlineGhost,
  findMatches = [],
  activeFindMatchIndex = -1,
  onEditorReady,
  onInlineAIContinue,
}) {
  const viewRef = useRef(null);
  const menuRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [slashMenu, setSlashMenu] = useState(null);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [_activeLine, setActiveLine] = useState(1);
  const [docLength, setDocLength] = useState(String(value || "").length);
  const [activeTableInfo, setActiveTableInfo] = useState(null);

  const SLASH_COMMANDS = useMemo(() => [
    { id: "summarize", name: "Summarize Block", desc: "Summarize this block briefly", prompt: "Summarize the following text briefly. Return only the summary text without introduction: " },
    { id: "grammar", name: "Fix Grammar", desc: "Fix spelling and grammar errors", prompt: "Fix grammar, spelling, and punctuation errors in the following text, keeping the meaning identical. Return only the corrected text: " },
    { id: "tasks", name: "Extract Tasks", desc: "Convert text to checklist tasks", prompt: "Extract any action items or tasks from the following text and format them as a markdown task list (- [ ] task). Return only the tasks: " },
    { id: "professional", name: "Make Professional", desc: "Change tone to professional", prompt: "Rewrite the following text in a professional, clear, and business-appropriate tone. Return only the rewritten text: " },
    { id: "casual", name: "Make Casual", desc: "Change tone to casual", prompt: "Rewrite the following text in a casual, friendly, and conversational tone. Return only the rewritten text: " }
  ], []);

  const triggerSlashCommand = async (index) => {
    if (!slashMenu || !viewRef.current) return;
    const command = SLASH_COMMANDS[index];
    const view = viewRef.current;
    
    const lineText = view.state.doc.line(slashMenu.line).text;
    const blockText = lineText.replace(/^\s*\//, '').trim();
    
    setSlashMenu(null);
    
    if (!blockText) {
      onNotify?.("Block is empty. Type some text before running a command.", "warning");
      return;
    }

    onNotify?.("AI is working...", "info");
    
    try {
      const response = await window.notesApi.aiQuery({
        query: command.prompt + blockText,
        context: {
          scope: "block",
          currentBlock: blockText,
          systemPrompt: "You are a text editing helper. Rewrite the text based on the user instructions and return ONLY the direct output. Do not explain, do not preface."
        }
      });
      
      if (response?.success && response.data?.result) {
        let result = response.data.result;
        result = result.replace(/^["']|["']$/g, "").trim();
        
        view.dispatch({
          changes: { from: slashMenu.from, to: slashMenu.to, insert: result }
        });
        onNotify?.("Block updated by AI.", "success");
      } else {
        throw new Error(response?.error || "AI returned empty result");
      }
    } catch (err) {
      console.error("Slash command failed:", err.message);
      onNotify?.("AI action failed: " + err.message, "error");
    }
  };

  const [themeMode, setThemeMode] = useState(() => {
    return document.documentElement.getAttribute("data-theme") || "light";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      setThemeMode(currentTheme);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const valueLength = String(value || "").length;
  const decorationsSynced = docLength === valueLength;

  // Auto-trigger inline AI completion on typing pause
  useEffect(() => {
    if (!aiEnabled || !onInlineAIContinue || ghostSuggestion || !viewRef.current) return;
    
    const view = viewRef.current;
    if (!view.hasFocus) return;
    
    const state = view.state;
    if (!state.selection.main.empty) return; // Don't trigger if selection active
    
    const cursor = state.selection.main.head;
    const textBefore = state.doc.sliceString(0, cursor);
    if (!textBefore.trim()) return;

    // Trigger after 1200ms of inactivity
    const timer = setTimeout(() => {
      onInlineAIContinue();
    }, 1200);

    return () => clearTimeout(timer);
  }, [value, aiEnabled, onInlineAIContinue, ghostSuggestion]);

  const positionSuggestionFlyout = (containerElement) => {
    if (!containerElement) return;

    const submenu = containerElement.querySelector(".editor-fix-submenu-list");
    const trigger = containerElement.querySelector(".editor-fix-submenu-trigger");
    if (!submenu || !trigger) return;

    const previousDisplay = submenu.style.display;
    const previousVisibility = submenu.style.visibility;
    submenu.style.display = "grid";
    submenu.style.visibility = "hidden";

    const submenuBounds = submenu.getBoundingClientRect();
    const triggerBounds = trigger.getBoundingClientRect();

    submenu.style.display = previousDisplay;
    submenu.style.visibility = previousVisibility;

    const viewportPadding = 8;
    const flyoutGap = 6;
    const minRightSpace = 148;
    const minBottomSpace = 120;
    const rightSpace = window.innerWidth - triggerBounds.right;
    const bottomSpace = window.innerHeight - triggerBounds.top;
    const wouldOverflowRight = triggerBounds.right + flyoutGap + submenuBounds.width > window.innerWidth - viewportPadding;
    const wouldOverflowBottom = triggerBounds.top - 4 + submenuBounds.height > window.innerHeight - viewportPadding;
    const shouldPreferLeft = rightSpace < minRightSpace;
    const shouldPreferUp = bottomSpace < minBottomSpace;

    containerElement.classList.toggle("open-left", wouldOverflowRight || shouldPreferLeft);
    containerElement.classList.toggle("open-up", wouldOverflowBottom || shouldPreferUp);
  };

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
  const findMatchDecorations = useMemo(
    () => {
      if (!decorationsSynced) return Decoration.none;
      return buildFindMatchDecorations(findMatches, activeFindMatchIndex);
    },
    [activeFindMatchIndex, decorationsSynced, findMatches]
  );

  useEffect(() => {
    if (Number.isFinite(focusedLine) && focusedLine > 0) {
      setActiveLine(focusedLine);
    }
  }, [focusedLine]);

  useEffect(() => () => {
    viewRef.current = null;
    if (textareaRef) {
      textareaRef.current = null;
    }
  }, [textareaRef]);

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
    if (!contextMenu || !menuRef.current) return;

    const VIEWPORT_PADDING = 8;
    const bounds = menuRef.current.getBoundingClientRect();
    const maxX = Math.max(VIEWPORT_PADDING, window.innerWidth - bounds.width - VIEWPORT_PADDING);
    const maxY = Math.max(VIEWPORT_PADDING, window.innerHeight - bounds.height - VIEWPORT_PADDING);

    let nextX = contextMenu.x;
    let nextY = contextMenu.y;

    if (bounds.bottom > window.innerHeight - VIEWPORT_PADDING) {
      nextY = contextMenu.anchorY - bounds.height;
    }

    nextX = Math.min(maxX, Math.max(VIEWPORT_PADDING, nextX));
    nextY = Math.min(maxY, Math.max(VIEWPORT_PADDING, nextY));

    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu((current) => {
        if (!current) return current;
        if (current.x === nextX && current.y === nextY) return current;
        return {
          ...current,
          x: nextX,
          y: nextY,
        };
      });
    }
  }, [contextMenu]);

  const withViewportRestore = useCallback((applyChange) => {
    const previousView = viewRef.current;
    const previousScrollTop = viewRef.current?.scrollDOM?.scrollTop;
    const previousScrollLeft = viewRef.current?.scrollDOM?.scrollLeft;
    const previousTopLine = (() => {
      if (!previousView || !Number.isFinite(previousScrollTop)) return null;
      const block = previousView.lineBlockAtHeight(previousScrollTop);
      return previousView.state.doc.lineAt(block.from).number;
    })();
    const restoreViewport = () => {
      const view = viewRef.current;
      if (!view || !Number.isFinite(previousScrollTop)) return;

      if (Number.isFinite(previousTopLine)) {
        const safeLine = Math.max(1, Math.min(previousTopLine, view.state.doc.lines));
        const line = view.state.doc.line(safeLine);
        const block = view.lineBlockAt(line.from);
        view.scrollDOM.scrollTop = block.top;
      } else {
        view.scrollDOM.scrollTop = previousScrollTop;
      }
      view.scrollDOM.scrollLeft = Number.isFinite(previousScrollLeft) ? previousScrollLeft : 0;
    };
    const scheduleViewportRestore = () => {
      requestAnimationFrame(restoreViewport);
      window.setTimeout(restoreViewport, 80);
      window.setTimeout(restoreViewport, 220);
    };

    applyChange(scheduleViewportRestore);
  }, []);

  const applyIssueSuggestion = useCallback((issue, selectedSuggestion = null) => {
    withViewportRestore((scheduleViewportRestore) => {
      const suggestionResult = applyValidationSuggestion(value, issue, selectedSuggestion);
      if (!suggestionResult.changed) {
        onNotify?.(suggestionResult.message, "warning");
        return;
      }

      onChange(suggestionResult.nextValue);
      scheduleViewportRestore();
      onNotify?.(suggestionResult.message, "success");
      setContextMenu(null);
    });
  }, [value, onChange, onNotify, withViewportRestore]);

  const applyIssueAction = useCallback((issue) => {
    if (!issue) return;

    withViewportRestore((scheduleViewportRestore) => {
      const quickFixResult = applyMarkdownQuickFix(value, issue);
      if (quickFixResult.changed) {
        const previousValue = value;
        const nextValue = quickFixResult.nextValue;
        onChange(nextValue);
        scheduleViewportRestore();

        const showUndoToast = (currVal, prevVal, isUndo) => {
          onNotify?.(
            isUndo ? "Reverted change." : quickFixResult.message,
            "success",
            {
              label: isUndo ? "Redo" : "Undo",
              onClick: () => {
                onChange(isUndo ? currVal : prevVal);
                showUndoToast(currVal, prevVal, !isUndo);
              }
            }
          );
        };
        showUndoToast(nextValue, previousValue, false);
        setContextMenu(null);
        return;
      }

      const suggestionResult = applyValidationSuggestion(value, issue);
      if (suggestionResult.changed) {
        const previousValue = value;
        const nextValue = suggestionResult.nextValue;
        onChange(nextValue);
        scheduleViewportRestore();

        const showUndoToast = (currVal, prevVal, isUndo) => {
          onNotify?.(
            isUndo ? "Reverted change." : suggestionResult.message,
            "success",
            {
              label: isUndo ? "Redo" : "Undo",
              onClick: () => {
                onChange(isUndo ? currVal : prevVal);
                showUndoToast(currVal, prevVal, !isUndo);
              }
            }
          );
        };
        showUndoToast(nextValue, previousValue, false);
        setContextMenu(null);
        return;
      }

      onNotify?.("No automatic fix available for this issue.", "warning");
    });
  }, [value, onChange, onNotify, withViewportRestore]);

  useEffect(() => {
    if (!window.notesApi?.onContextMenuAction) return undefined;
    const unsubscribe = window.notesApi.onContextMenuAction(({ action, payload }) => {
      if (action === "jump-to-line") {
        onJumpToLine?.(payload);
      } else if (action === "copy-selection") {
        if (viewRef.current) {
          const { from, to } = viewRef.current.state.selection.main;
          const text = viewRef.current.state.sliceDoc(from, to);
          navigator.clipboard.writeText(text).then(() => {
            onNotify?.("Copied to clipboard", "success");
          }).catch(() => {
            onNotify?.("Failed to copy text", "error");
          });
        }
      } else if (action === "find-in-document") {
        onSearchRequest?.(payload);
      } else if (action === "configure-ai-settings") {
        onOpenAISettings?.();
      } else if (action === "ask-ai-selection") {
        onOpenAIRequest?.({
          initialQuery: "Help me improve this selection while preserving its meaning and intent.",
          target: "selection",
          autoRun: false,
          source: "context-menu",
        });
      } else if (action === "rewrite-ai-selection") {
        onOpenAIRequest?.({
          initialQuery: "Rewrite this selection to be clearer and more polished while preserving meaning.",
          target: "selection",
          autoRun: true,
          source: "context-menu",
        });
      } else if (action === "find-related-workspace-selection") {
        onOpenAIRequest?.({
          initialQuery: "Use the selected text as the focal point and find related ideas, contradictions, or supporting notes from the workspace.",
          target: "workspace",
          autoRun: true,
          source: "context-menu",
        });
      } else if (action === "turn-selection-actions") {
        onOpenAIRequest?.({
          initialQuery: "Turn this selection into a concise action list with markdown bullets.",
          target: "selection",
          autoRun: true,
          source: "context-menu",
        });
      } else if (action === "ask-ai-block") {
        onOpenAIRequest?.({
          initialQuery: "Help me think through this section, point out gaps, and suggest the strongest next move.",
          target: "block",
          autoRun: false,
          source: "context-menu",
        });
      } else if (action === "continue-ai-block") {
        onOpenAIRequest?.({
          initialQuery: "Continue writing this section in the same tone and structure.",
          target: "block",
          autoRun: true,
          source: "context-menu",
        });
      } else if (action === "explore-related-workspace-block") {
        onOpenAIRequest?.({
          initialQuery: "Use this note as the focal point and search the workspace for related notes, missing context, and useful connections.",
          target: "workspace",
          autoRun: true,
          source: "context-menu",
        });
      } else if (action === "summarize-ai-block") {
        onOpenAIRequest?.({
          initialQuery: "Summarize the current block into a shorter, cleaner version.",
          target: "block",
          autoRun: true,
          source: "context-menu",
        });
      } else if (action === "apply-issue-action") {
        if (payload) {
          applyIssueAction(payload);
        }
      } else if (action === "apply-suggestion") {
        if (payload) {
          applyIssueSuggestion(payload.issue, payload.suggestion);
        }
      } else if (action === "ignore-spelling") {
        if (payload) {
          onIgnoreSpellingWord?.(payload);
        }
      }
    });
    return unsubscribe;
  }, [
    onJumpToLine,
    onSearchRequest,
    onOpenAIRequest,
    onOpenAISettings,
    onNotify,
    onIgnoreSpellingWord,
    value,
    onChange,
    aiEnabled,
    applyIssueAction,
    applyIssueSuggestion,
  ]);

  const editorExtensions = useMemo(() => [
    markdown({ base: markdownLanguage }),
    editorTheme,
    EditorView.decorations.of(findMatchDecorations),
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

        if (window.notesApi?.showContextMenu) {
          const menuTemplate = [];

          if (Number.isFinite(lineColumn.line) && lineColumn.line !== _activeLine) {
            menuTemplate.push({
              label: `Go to line ${lineColumn.line}`,
              action: "jump-to-line",
              payload: lineColumn.line,
            });
            menuTemplate.push({ type: "separator" });
          }

          if (!activeSelection.empty) {
            const selectedText = docValue.slice(activeSelection.from, activeSelection.to);
            menuTemplate.push({
              label: "Copy selection",
              action: "copy-selection",
            });
            menuTemplate.push({
              label: "Find in document",
              action: "find-in-document",
              payload: selectedText,
            });
            menuTemplate.push({ type: "separator" });

            if (aiEnabled) {
              menuTemplate.push({
                label: "Ask AI about selection",
                action: "ask-ai-selection",
              });
              menuTemplate.push({
                label: "Rewrite selection with AI",
                action: "rewrite-ai-selection",
              });
              menuTemplate.push({
                label: "Find related notes in workspace",
                action: "find-related-workspace-selection",
              });
              menuTemplate.push({
                label: "Turn selection into action items",
                action: "turn-selection-actions",
              });
            }
          } else if (aiEnabled) {
            menuTemplate.push({
              label: "Ask AI about this section",
              action: "ask-ai-block",
            });
            menuTemplate.push({
              label: "Continue this section with AI",
              action: "continue-ai-block",
            });
            menuTemplate.push({
              label: "Explore related workspace notes",
              action: "explore-related-workspace-block",
            });
            menuTemplate.push({
              label: "Summarize current block",
              action: "summarize-ai-block",
            });
          } else {
            menuTemplate.push({
              label: "Configure AI settings",
              action: "configure-ai-settings",
            });
          }

          if (targetIssues.length) {
            menuTemplate.push({ type: "separator" });
            targetIssues.forEach((issue) => {
              const label = getIssueFixType(issue)
                ? "Quick fix"
                : issue.suggestion
                  ? `Apply suggestion${issue.suggestion ? `: ${issue.suggestion}` : ""}`
                  : "Review issue";
              const alternatives = Array.isArray(issue?.suggestions)
                ? issue.suggestions.filter((entry) => String(entry || "").trim())
                : [];
              
              if (alternatives.length > 1) {
                menuTemplate.push({
                  label: "Apply suggestion",
                  submenu: alternatives.map((entry) => ({
                    label: entry,
                    action: "apply-suggestion",
                    payload: { issue, suggestion: entry },
                  })),
                });
              } else {
                menuTemplate.push({
                  label: label,
                  action: "apply-issue-action",
                  payload: issue,
                });
              }

              if (issue.ruleId === "spelling" && issue.word) {
                menuTemplate.push({
                  label: `Add to dictionary: ${issue.word}`,
                  action: "ignore-spelling",
                  payload: issue.word,
                });
              }
            });
          }

          window.notesApi.showContextMenu(menuTemplate);
          return true;
        }

        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          anchorX: event.clientX,
          anchorY: event.clientY,
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

        onNotify?.("Uploading dropped files...", "info");

        void (async () => {
          try {
            const drawioFiles = Array.from(files).filter(
              (file) => file.name.endsWith(".drawio") || file.name.endsWith(".drawio.xml")
            );
            const otherFiles = Array.from(files).filter(
              (file) => !file.name.endsWith(".drawio") && !file.name.endsWith(".drawio.xml")
            );

            const insertedBlocks = [];

            // Process Draw.io files
            for (const file of drawioFiles) {
              const xmlContent = await file.text();
              const diagramId = generateDiagramId();
              if (window.notesApi?.drawioWriteSource) {
                await window.notesApi.drawioWriteSource({ diagramId, data: xmlContent });
                insertedBlocks.push(`![Draw.io Diagram](media/draw.io/${diagramId}.png){data-diagram-id="${diagramId}"}`);
              }
            }

            // Process other media files
            if (otherFiles.length > 0) {
              const results = await insertMediaFromFiles(otherFiles);
              const markdownImages = results.map((result) =>
                createMediaMarkdown(result.altText, result.mediaPath || result.imagePath)
              );
              insertedBlocks.push(...markdownImages);
            }

            if (insertedBlocks.length > 0) {
              const adapter = createEditorAdapter(view);
              insertTextAtCursor(
                view.state.doc.toString(),
                onChange,
                `\n\n${insertedBlocks.join("\n\n")}\n`,
                { current: adapter }
              );
              onNotify?.(`Inserted ${insertedBlocks.length} item(s).`, "success");
            }
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
          if (typeof onToggleFind === "function") {
            onToggleFind();
          } else {
            onOpenFind?.();
          }
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
        key: "Tab",
        run(view) {
          if (ghostSuggestion?.text) {
            onAcceptInlineGhost?.();
            return true;
          }
          return false;
        },
      },
      {
        key: "Escape",
        run(view) {
          if (ghostSuggestion?.text) {
            onRejectInlineGhost?.();
            return true;
          }
          if (slashMenu) {
            setSlashMenu(null);
            return true;
          }
          return false;
        },
      },
      {
        key: "ArrowDown",
        run(view) {
          if (slashMenu) {
            setActiveSlashIndex((idx) => (idx + 1) % SLASH_COMMANDS.length);
            return true;
          }
          return false;
        },
      },
      {
        key: "ArrowUp",
        run(view) {
          if (slashMenu) {
            setActiveSlashIndex((idx) => (idx - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length);
            return true;
          }
          return false;
        },
      },
      {
        key: "Enter",
        run(view) {
          if (slashMenu) {
            triggerSlashCommand(activeSlashIndex);
            return true;
          }
          return false;
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
  ], [findMatchDecorations, ghostSuggestionDecorations, onChange, onNotify, onOpenFind, onRedo, onToggleFind, onUndo, validationDecorations, validationIssues, _activeLine, aiEnabled, onInlineAIContinue, onAcceptInlineGhost, onRejectInlineGhost, ghostSuggestion, slashMenu, activeSlashIndex, SLASH_COMMANDS]);

  return (
    <div className="markdown-editor">
      <CodeMirror
        className="markdown-codemirror"
        value={value}
        height="100%"
        theme={themeMode === "dark" ? "dark" : "light"}
        basicSetup={{
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          dropCursor: false,
          searchKeymap: false,
          drawSelection: false,
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
          if (update.docChanged && ghostSuggestion?.text && onRejectInlineGhost) {
            onRejectInlineGhost();
          }
          const position = update.state.selection.main.head;
          const { line } = getLineColumnFromIndex(update.state.doc.toString(), position);
          setActiveLine(line);
          if (textareaRef && viewRef.current) {
            textareaRef.current = createEditorAdapter(viewRef.current);
          }

          if (update.docChanged) {
            const lineText = update.state.doc.line(line).text;
            const cursorCol = position - update.state.doc.line(line).from;
            if (lineText.trim() === "/" && cursorCol === lineText.indexOf("/") + 1) {
              const coords = viewRef.current.coordsAtPos(position);
              const editorCoords = viewRef.current.dom.getBoundingClientRect();
              setSlashMenu({
                x: coords.left - editorCoords.left,
                y: coords.bottom - editorCoords.top + 4,
                line,
                from: update.state.doc.line(line).from,
                to: update.state.doc.line(line).to,
              });
              setActiveSlashIndex(0);
            } else {
              setSlashMenu(null);
            }
          }

          if (update.selectionSet || update.docChanged || update.viewportChanged) {
            if (activeTableInfo && update.state.selection.main.from === update.state.selection.main.to) {
              // Allow overlay to handle itself, unless cursor completely moved away
            }
            const pos = update.state.selection.main.head;
            const tree = syntaxTree(update.state);
            let node = tree.resolveInner(pos, -1);
            let tableNode = null;
            while (node) {
              if (node.name === "Table") {
                tableNode = node;
                break;
              }
              node = node.parent;
            }

            if (tableNode) {
              const from = tableNode.from;
              const to = tableNode.to;
              const text = update.state.sliceDoc(from, to);
              const coordsAtStart = update.view.coordsAtPos(from) || update.view.coordsAtPos(pos);
              
              if (coordsAtStart) {
                setActiveTableInfo(current => {
                  if (current && current.from === from && current.text === text && Math.abs(current.style.top - coordsAtStart.top) < 10) {
                    return current;
                  }
                  return {
                    from,
                    to,
                    text,
                    style: {
                      position: 'fixed',
                      top: Math.max(0, coordsAtStart.top - 8),
                      left: Math.max(10, coordsAtStart.left - 20),
                      zIndex: 100
                    }
                  };
                });
              }
            } else {
              setActiveTableInfo(null);
            }
          }
        }}
        onChange={(nextValue) => {
          onChange(nextValue);
        }}
      />
      {activeTableInfo && (
        <MarkdownTableEditor
          initialMarkdown={activeTableInfo.text}
          style={activeTableInfo.style}
          onCommit={(newMarkdown) => {
            if (viewRef.current) {
              viewRef.current.dispatch({
                changes: { from: activeTableInfo.from, to: activeTableInfo.to, insert: newMarkdown }
              });
            }
            setActiveTableInfo(null);
            viewRef.current?.focus();
          }}
          onCancel={() => {
            setActiveTableInfo(null);
            viewRef.current?.focus();
          }}
        />
      )}
      {contextMenu ? (
        <div
          ref={menuRef}
          className="editor-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label="Editor context menu"
        >
          {Number.isFinite(contextMenu.line) && contextMenu.line !== _activeLine ? (
            <button type="button" role="menuitem" onClick={() => onJumpToLine?.(contextMenu.line)}>
              Go to line {contextMenu.line}
            </button>
          ) : null}
          {contextMenu.hasSelection ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (viewRef.current) {
                    const { from, to } = viewRef.current.state.selection.main;
                    const text = viewRef.current.state.sliceDoc(from, to);
                    navigator.clipboard.writeText(text).then(() => {
                      onNotify?.("Copied to clipboard", "success");
                    }).catch(() => {
                      onNotify?.("Failed to copy text", "error");
                    });
                  }
                  setContextMenu(null);
                }}
              >
                <Copy size={16} />
                Copy selection
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (viewRef.current) {
                    const { from, to } = viewRef.current.state.selection.main;
                    const text = viewRef.current.state.sliceDoc(from, to);
                    onSearchRequest?.(text);
                  }
                  setContextMenu(null);
                }}
              >
                <Search size={16} />
                Find in document
              </button>
            </>
          ) : null}
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
                    <MessageSquare size={16} />
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
                    <RefreshCcw size={16} />
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
                    <FileSearch size={16} />
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
                    <List size={16} />
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
                    <MessageSquare size={16} />
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
                    <Sparkles size={16} />
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
                    <FileSearch size={16} />
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
                    <Wand2 size={16} />
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
                <Settings size={16} />
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
                const alternatives = Array.isArray(issue?.suggestions)
                  ? issue.suggestions.filter((entry) => String(entry || "").trim())
                  : [];
                const hasSuggestionFlyout = alternatives.length > 1;
                return (
                  <div key={`${issue.line}-${issue.column}-${index}`}>
                    {hasSuggestionFlyout ? (
                      <div
                        className="editor-fix-submenu-flyout"
                        role="none"
                        onMouseEnter={(event) => positionSuggestionFlyout(event.currentTarget)}
                        onFocusCapture={(event) => positionSuggestionFlyout(event.currentTarget)}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          aria-haspopup="menu"
                          className="editor-fix-submenu-trigger"
                          onClick={(event) => {
                            event.preventDefault();
                          }}
                        >
                          Apply suggestion
                        </button>
                        <div className="editor-fix-submenu-list" role="menu">
                          {alternatives.map((entry) => (
                            <button
                              key={`${issue.line}-${issue.column}-${index}-${entry}`}
                              type="button"
                              role="menuitem"
                              onClick={() => applyIssueSuggestion(issue, entry)}
                            >
                              {entry}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => applyIssueAction(issue)}
                      >
                        <Wand2 size={16} />
                        {label}
                      </button>
                    )}
                    {issue.ruleId === "spelling" && issue.word ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onIgnoreSpellingWord?.(issue.word);
                          setContextMenu(null);
                        }}
                      >
                        <BookPlus size={16} />
                        Add to dictionary: {issue.word}
                      </button>
                    ) : null}
                  </div>
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
      {slashMenu ? (
        <div
          className="editor-context-menu"
          style={{
            position: "absolute",
            left: slashMenu.x,
            top: slashMenu.y,
            zIndex: 1000,
            minWidth: "180px",
            background: "var(--surface-bg)",
            border: "1px solid var(--border-soft)",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            padding: "4px",
          }}
          role="menu"
        >
          <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", padding: "6px 8px 4px 8px", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
            AI Block Actions
          </div>
          {SLASH_COMMANDS.map((cmd, i) => (
            <button
              key={cmd.id}
              type="button"
              role="menuitem"
              onClick={() => triggerSlashCommand(i)}
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                border: "none",
                borderRadius: "4px",
                background: i === activeSlashIndex ? "var(--surface-accent)" : "transparent",
                color: i === activeSlashIndex ? "var(--accent-solid)" : "var(--app-text)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "11px", fontWeight: 600 }}>{cmd.name}</span>
              <span style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>{cmd.desc}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
