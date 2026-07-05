import React, { useEffect, useMemo, useRef, useState } from "react";
import "./AIPalette.css";
import AppButton from "./AppButton";
import AppChipButton from "./AppChipButton";
import OverlayDialog from "./OverlayDialog";

const TARGET_OPTIONS = [
  { id: "selection", label: "Selection" },
  { id: "block", label: "Current Block" },
  { id: "document", label: "Whole Note" },
];

const APPLY_OPTIONS = [
  { id: "insert", label: "Insert at Cursor" },
  { id: "replace-selection", label: "Replace Selection" },
  { id: "replace-block", label: "Replace Block" },
];

const NOTE_PRESETS = [
  { id: "meeting", label: "Meeting Notes" },
  { id: "research", label: "Research Notes" },
  { id: "action-plan", label: "Action Plan" },
];

function getPresetStorageKey(scope, value) {
  if (!value) return "";
  return `ai:preset:${scope}:${value}`;
}

function buildPreviewRows(currentText, nextText) {
  const currentLines = String(currentText || "").split(/\r?\n/);
  const nextLines = String(nextText || "").split(/\r?\n/);
  const max = Math.max(currentLines.length, nextLines.length);
  const rows = [];

  for (let index = 0; index < max; index += 1) {
    const previous = currentLines[index] ?? "";
    const latest = nextLines[index] ?? "";
    let status = "same";
    if (index >= currentLines.length) status = "added";
    else if (index >= nextLines.length) status = "removed";
    else if (previous !== latest) status = "changed";
    rows.push({
      id: `${index}-${status}`,
      line: index + 1,
      previous,
      latest,
      status,
    });
  }

  return rows;
}

function mergePreviewRows(rows, selectedRows) {
  const merged = [];

  rows.forEach((row) => {
    const chosen = selectedRows[row.id] !== false;
    if (row.status === "same") {
      merged.push(row.previous);
      return;
    }

    if (row.status === "added") {
      if (chosen) merged.push(row.latest);
      return;
    }

    if (row.status === "removed") {
      if (!chosen) merged.push(row.previous);
      return;
    }

    merged.push(chosen ? row.latest : row.previous);
  });

  return merged.join("\n");
}

const AI_COMMANDS = [
  { id: "summarize", label: "Summarize Document", description: "Generate a concise summary of the current note", icon: "Sum" },
  { id: "analyze", label: "Analyze Content", description: "Analyze the note and surface key insights", icon: "Ana" },
  { id: "format", label: "Format Markdown", description: "Improve markdown structure and consistency", icon: "Fmt" },
  { id: "search", label: "Search Workspace", description: "Find related notes and concepts", icon: "Sea" },
  { id: "generate", label: "Generate Content", description: "Draft new markdown to add into the note", icon: "Gen" },
  { id: "refactor", label: "Organize Content", description: "Rewrite or reorganize the current section", icon: "Org" },
  { id: "find-related", label: "Find Related Docs", description: "Find semantically similar documents", icon: "Rel" },
];

function buildQuickActions(contextSummary, noteTitle, preset) {
  if (preset === "meeting") {
    return [
      {
        id: "meeting-decisions",
        label: "Extract Decisions",
        description: "Pull out decisions and owners from this note.",
        query: "Extract decisions, owners, and follow-up actions from this meeting note as markdown bullets.",
        target: contextSummary?.hasSelection ? "selection" : contextSummary?.hasCurrentBlock ? "block" : "document",
      },
      {
        id: "meeting-minutes",
        label: "Polish Minutes",
        description: "Turn rough notes into cleaner meeting minutes.",
        query: "Rewrite these meeting notes into crisp meeting minutes with sections for discussion, decisions, and next steps.",
        target: contextSummary?.hasSelection ? "selection" : contextSummary?.hasCurrentBlock ? "block" : "document",
      },
      {
        id: "meeting-followup",
        label: "Create Follow-Ups",
        description: "Generate a follow-up checklist after the meeting.",
        query: "Create a follow-up checklist from this meeting note with owners and due-date placeholders.",
        target: contextSummary?.hasSelection ? "selection" : contextSummary?.hasCurrentBlock ? "block" : "document",
      },
    ];
  }

  if (preset === "action-plan") {
    return [
      {
        id: "plan-steps",
        label: "Structure Plan",
        description: "Turn ideas into sequenced implementation steps.",
        query: "Turn this into a structured action plan with phases, tasks, and dependencies.",
        target: contextSummary?.hasSelection ? "selection" : contextSummary?.hasCurrentBlock ? "block" : "document",
      },
      {
        id: "plan-risks",
        label: "Find Risks",
        description: "Surface blockers, risks, and missing prerequisites.",
        query: "Identify risks, blockers, and missing prerequisites in this action plan.",
        target: contextSummary?.hasSelection ? "selection" : contextSummary?.hasCurrentBlock ? "block" : "document",
      },
      {
        id: "plan-checklist",
        label: "Make Execution Checklist",
        description: "Convert this plan into a tighter execution checklist.",
        query: "Convert this into a practical markdown execution checklist with milestones.",
        target: contextSummary?.hasSelection ? "selection" : contextSummary?.hasCurrentBlock ? "block" : "document",
      },
    ];
  }

  if (contextSummary?.hasSelection) {
    return [
      {
        id: "rewrite-selection",
        label: "Rewrite Cleanly",
        description: "Polish the selected text while preserving the point.",
        query: "Rewrite this selection to be clearer, tighter, and more polished while preserving meaning.",
        target: "selection",
      },
      {
        id: "expand-selection",
        label: "Add Detail",
        description: "Expand the selection with more useful specifics.",
        query: "Expand this selection with more concrete detail and helpful context in markdown.",
        target: "selection",
      },
      {
        id: "checklist-selection",
        label: "Make Checklist",
        description: "Turn the selection into an actionable markdown checklist.",
        query: "Convert this selection into an actionable markdown checklist.",
        target: "selection",
      },
    ];
  }

  if (contextSummary?.hasCurrentBlock) {
    return [
      {
        id: "continue-block",
        label: "Continue Section",
        description: "Keep writing from the current block in the same tone.",
        query: "Continue this section in the same tone and structure with useful next details.",
        target: "block",
      },
      {
        id: "compress-block",
        label: "Tighten Block",
        description: "Make the current block shorter and easier to scan.",
        query: "Rewrite the current block to be shorter, clearer, and easier to scan.",
        target: "block",
      },
      {
        id: "extract-actions",
        label: "Extract Next Steps",
        description: "Pull out action items and decisions from the current block.",
        query: "Extract the action items, decisions, and follow-ups from this block as markdown bullets.",
        target: "block",
      },
    ];
  }

  return [
    {
      id: "summarize-note",
      label: "Summarize Note",
      description: `Create a concise executive summary of ${noteTitle}.`,
      query: "Summarize this note into a concise executive overview with key takeaways.",
      target: "document",
    },
    {
      id: "find-gaps",
      label: "Find Gaps",
      description: "Identify what is missing or unclear in the note.",
      query: "Review this note and identify missing details, unclear sections, and suggested improvements.",
      target: "document",
    },
    {
      id: "create-plan",
      label: "Create Plan",
      description: "Turn the note into a clearer next-step plan.",
      query: "Turn this note into a structured next-step plan with markdown headings and bullets.",
      target: "document",
    },
  ];
}

export default function AIPalette({
  isOpen,
  onClose,
  onQuery,
  onApply,
  isLoading = false,
  error = null,
  contextSummary = null,
  intent = null,
  noteTitle = "Current Note",
  noteKey = "",
  workspaceKey = "",
}) {
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentQueries, setRecentQueries] = useState([]);
  const [responseText, setResponseText] = useState("");
  const [target, setTarget] = useState("selection");
  const [notePreset, setNotePreset] = useState("research");
  const [pendingApply, setPendingApply] = useState(null);
  const [selectedDiffRows, setSelectedDiffRows] = useState({});
  const inputRef = useRef(null);
  const lastAutoRunRequestIdRef = useRef("");

  const availableApplyOptions = useMemo(
    () => APPLY_OPTIONS.map((option) => ({
      ...option,
      disabled:
        option.id === "replace-selection"
          ? !contextSummary?.hasSelection
          : option.id === "replace-block"
            ? !contextSummary?.hasCurrentBlock
            : false,
    })),
    [contextSummary]
  );

  const quickActions = useMemo(
    () => buildQuickActions(contextSummary, noteTitle, notePreset),
    [contextSummary, noteTitle, notePreset]
  );

  const diffPreview = useMemo(() => {
    if (!pendingApply?.rows) return [];
    return pendingApply.rows.filter((row) => row.status !== "same");
  }, [pendingApply]);

  useEffect(() => {
    const recent = localStorage.getItem("ai-recent-queries");
    if (recent) {
      setRecentQueries(JSON.parse(recent));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    setSearchInput(intent?.query || "");
    setResponseText("");
    setPendingApply(null);
    setSelectedDiffRows({});
    setSelectedIndex(0);
    setTarget(intent?.target || (contextSummary?.hasSelection ? "selection" : contextSummary?.hasCurrentBlock ? "block" : "document"));
    const notePresetKey = getPresetStorageKey("note", noteKey);
    const workspacePresetKey = getPresetStorageKey("workspace", workspaceKey);
    const savedPreset =
      (notePresetKey ? window.localStorage.getItem(notePresetKey) : "")
      || (workspacePresetKey ? window.localStorage.getItem(workspacePresetKey) : "");
    setNotePreset(savedPreset || contextSummary?.suggestedPreset || "research");
    setSuggestions(AI_COMMANDS);
  }, [contextSummary, intent, isOpen, noteKey, workspaceKey]);

  useEffect(() => {
    if (!isOpen || !notePreset) return;
    const notePresetKey = getPresetStorageKey("note", noteKey);
    const workspacePresetKey = getPresetStorageKey("workspace", workspaceKey);
    if (notePresetKey) {
      window.localStorage.setItem(notePresetKey, notePreset);
    }
    if (workspacePresetKey) {
      window.localStorage.setItem(workspacePresetKey, notePreset);
    }
  }, [isOpen, noteKey, notePreset, workspaceKey]);

  useEffect(() => {
    if (!isOpen || !intent?.autoRun || !intent?.query) return;
    if (lastAutoRunRequestIdRef.current === intent.requestId) return;
    lastAutoRunRequestIdRef.current = intent.requestId;
    handleCustomQuery(intent.query, intent.target || target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, intent, target]);

  const updateSuggestions = (query) => {
    if (!query.trim()) {
      setSuggestions(AI_COMMANDS);
      return;
    }

    const lowered = query.toLowerCase();
    const filtered = AI_COMMANDS.filter(
      (command) => command.label.toLowerCase().includes(lowered)
        || command.description.toLowerCase().includes(lowered)
    );
    setSuggestions(filtered);
    setSelectedIndex(0);
  };

  const handleInputChange = (event) => {
    const value = event.target.value;
    setSearchInput(value);
    updateSuggestions(value);
  };

  const handleKeyDown = (event) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (suggestions.length) {
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (suggestions.length) {
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        }
        break;
      case "Enter":
        event.preventDefault();
        if (suggestions.length > 0) {
          handleSelectCommand(suggestions[selectedIndex]);
        } else if (searchInput.trim()) {
          handleCustomQuery(searchInput);
        }
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  const handleSelectCommand = (command) => {
    setSearchInput(command.label);
    handleCustomQuery(command.label);
  };

  const handleCustomQuery = async (query, overrideTarget = null) => {
    if (!query.trim() || isLoading) return;
    const effectiveTarget = overrideTarget || target;

    const updated = [query, ...recentQueries.filter((item) => item !== query)].slice(0, 10);
    setRecentQueries(updated);
    localStorage.setItem("ai-recent-queries", JSON.stringify(updated));

    const result = await onQuery({ query, target: effectiveTarget });
    setResponseText(result?.text || "");
  };

  const handleApply = async (mode) => {
    if (!responseText || typeof onApply !== "function") return;
    const preview = await onApply({ text: responseText, mode, previewOnly: mode !== "insert" });
    if (mode === "insert") {
      return;
    }
    if (!preview?.applied && preview?.currentText && preview?.nextText) {
      const rows = buildPreviewRows(preview.currentText, preview.nextText);
      setPendingApply({
        mode,
        text: responseText,
        currentText: preview.currentText,
        nextText: preview.nextText,
        rows,
      });
      setSelectedDiffRows(
        rows.reduce((acc, row) => {
          if (row.status !== "same") acc[row.id] = true;
          return acc;
        }, {})
      );
    }
  };

  const handleConfirmApply = async () => {
    if (!pendingApply) return;
    const nextText = pendingApply.mode === "replace-selection"
      ? mergePreviewRows(pendingApply.rows, selectedDiffRows)
      : pendingApply.text;
    await onApply({ text: nextText, mode: pendingApply.mode, previewOnly: false });
    setPendingApply(null);
    setSelectedDiffRows({});
  };

  return (
    <OverlayDialog
      open={isOpen}
      onClose={onClose}
      ariaLabel={`AI Assistant for ${noteTitle}`}
      overlayClassName="ai-palette-overlay"
      cardClassName="ai-palette"
      useDefaultCardClass={false}
      initialFocusRef={inputRef}
    >
        <div className="ai-palette-header">
          <div>
            <div className="ai-palette-title">AI Assistant</div>
            <div className="ai-palette-subtitle">Working inside {noteTitle}</div>
          </div>
          <button className="ai-palette-close" onClick={onClose} type="button">×</button>
        </div>

        <div className="ai-palette-context-bar">
          <div className="ai-palette-preset-row" role="group" aria-label="Note type preset">
            {NOTE_PRESETS.map((preset) => (
              <AppChipButton
                key={preset.id}
                className="ai-preset-chip"
                active={notePreset === preset.id}
                onClick={() => setNotePreset(preset.id)}
              >
                {preset.label}
              </AppChipButton>
            ))}
          </div>
          <div className="ai-palette-targets" role="group" aria-label="AI target scope">
            {TARGET_OPTIONS.map((option) => (
              <AppChipButton
                key={option.id}
                className="ai-target-chip"
                active={target === option.id}
                onClick={() => setTarget(option.id)}
              >
                {option.label}
              </AppChipButton>
            ))}
          </div>
          <div className="ai-palette-context-copy">
            {contextSummary?.label || "Using the current note as context."}
          </div>
        </div>

        <div className="ai-palette-input-group">
          <input
            ref={inputRef}
            type="text"
            className="ai-palette-input"
            placeholder="Ask AI to write, rewrite, analyze, or extend this note..."
            value={searchInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          {isLoading ? <div className="ai-palette-spinner" /> : null}
        </div>

        {quickActions.length ? (
          <div className="ai-palette-quick-actions">
            <div className="ai-palette-section-label">Quick actions</div>
            <div className="ai-palette-quick-grid">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  className="ai-quick-card"
                  type="button"
                  onClick={() => {
                    setTarget(action.target);
                    setSearchInput(action.query);
                    handleCustomQuery(action.query, action.target);
                  }}
                >
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="ai-palette-error">
            <span className="error-icon">!</span>
            <span>{error}</span>
          </div>
        ) : null}

        <div className="ai-palette-suggestions">
          <div className="ai-palette-section-label">Commands</div>
          {suggestions.length > 0 ? (
            suggestions.map((command, index) => (
              <button
                key={command.id}
                className={`ai-palette-suggestion ${index === selectedIndex ? "selected" : ""}`}
                onClick={() => handleSelectCommand(command)}
                type="button"
              >
                <div className="suggestion-icon">{command.icon}</div>
                <div className="suggestion-content">
                  <div className="suggestion-label">{command.label}</div>
                  <div className="suggestion-description">{command.description}</div>
                </div>
              </button>
            ))
          ) : searchInput.trim() ? (
            <div className="ai-palette-custom-query">
              <div className="custom-query-label">Ask custom question:</div>
              <button
                className="ai-palette-suggestion selected"
                onClick={() => handleCustomQuery(searchInput)}
                type="button"
              >
                <div className="suggestion-icon">Ask</div>
                <div className="suggestion-content">
                  <div className="suggestion-label">{searchInput}</div>
                  <div className="suggestion-description">Send your custom query</div>
                </div>
              </button>
            </div>
          ) : (
            <div className="ai-palette-empty">No suggestions</div>
          )}
        </div>

        {recentQueries.length > 0 && !searchInput ? (
          <div className="ai-palette-recent">
            <div className="recent-label">Recent:</div>
            <div className="recent-items">
              {recentQueries.slice(0, 3).map((query, index) => (
                <button
                  key={`${query}-${index}`}
                  className="recent-item"
                  onClick={() => handleCustomQuery(query)}
                  type="button"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {responseText ? (
          <div className="ai-palette-result">
            <div className="ai-palette-result-header">
              <strong>AI Draft</strong>
              <span>{responseText.length} chars</span>
            </div>
            <pre className="ai-palette-result-body">{responseText}</pre>
            <div className="ai-palette-apply-row">
              {availableApplyOptions.map((option) => (
                <button
                  key={option.id}
                  className="ai-apply-button"
                  onClick={() => handleApply(option.id)}
                  disabled={option.disabled}
                  type="button"
                  data-tooltip={option.disabled ? "Target unavailable for the current cursor state." : option.label}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {pendingApply ? (
              <div className="ai-diff-preview">
                <div className="ai-diff-preview-head">
                  <strong>Preview replacement</strong>
                  <AppButton variant="small" onClick={() => setPendingApply(null)}>Cancel</AppButton>
                </div>
                <div className="ai-diff-preview-body">
                  {diffPreview.map((row) => (
                    <div key={`${row.line}-${row.status}`} className={`ai-diff-row ${row.status}`}>
                      {pendingApply.mode === "replace-selection" ? (
                        <label className="ai-diff-toggle">
                          <input
                            type="checkbox"
                            checked={selectedDiffRows[row.id] !== false}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelectedDiffRows((currentRows) => ({
                                ...currentRows,
                                [row.id]: checked,
                              }));
                            }}
                          />
                        </label>
                      ) : null}
                      <span className="ai-diff-line">{row.line}</span>
                      <pre className="ai-diff-cell previous">{row.previous}</pre>
                      <pre className="ai-diff-cell latest">{row.latest}</pre>
                    </div>
                  ))}
                </div>
                <div className="ai-diff-preview-actions">
                  <AppButton variant="primary" onClick={handleConfirmApply}>Apply Replacement</AppButton>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="ai-palette-footer">
          <span className="footer-hint">Ctrl/Cmd+Shift+I opens the AI palette. Run a prompt, then insert or replace directly in the editor.</span>
        </div>
    </OverlayDialog>
  );
}
