import { useEffect, useMemo, useRef, useState } from "react";
import AppButton from "./AppButton";
import AppTextarea from "./AppTextarea";

const SCOPE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "selection", label: "Selection" },
  { id: "block", label: "Block" },
  { id: "document", label: "Note" },
  { id: "workspace", label: "Workspace" },
];

function buildStarterPrompts(contextSummary) {
  if (contextSummary?.hasSelection) {
    return [
      "Make this clearer without changing the meaning.",
      "Turn this into concise action items.",
      "Challenge the assumptions in this selection.",
    ];
  }

  if (contextSummary?.hasCurrentBlock) {
    return [
      "Continue this section in the same tone.",
      "Summarize this block more cleanly.",
      "Extract next steps from this block.",
    ];
  }

  return [
    "Summarize this note into key takeaways.",
    "Find gaps or unclear areas in this note.",
    "Use full workspace context to find related ideas.",
  ];
}

function getScopeHelp(scope, contextSummary) {
  if (scope === "workspace") {
    return contextSummary?.hasSelection
      ? "Uses the selected text as the focal point, then widens to the whole workspace."
      : "Uses this note as the focal point, then widens to the whole workspace.";
  }

  if (scope === "selection") {
    return contextSummary?.hasSelection
      ? "Uses only the selected text."
      : "No selection is active, so this will fall back to the full note.";
  }

  if (scope === "block") {
    return contextSummary?.hasCurrentBlock
      ? "Uses the current paragraph or block around the cursor."
      : "No current block is available, so this will fall back to the full note.";
  }

  if (scope === "document") {
    return "Uses the full current note.";
  }

  return contextSummary?.hasSelection
    ? "Auto uses the current selection first, otherwise the full note."
    : "Auto uses the full note unless a selection is active.";
}

export default function AIChatPanel({
  onHide,
  onClear,
  onSend,
  onApply,
  isLoading = false,
  error = null,
  contextSummary = null,
  intent = null,
  messages = [],
  noteTitle = "Current Note",
}) {
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState("auto");
  const inputRef = useRef(null);
  const lastAutoRunRequestIdRef = useRef("");

  const starterPrompts = useMemo(() => buildStarterPrompts(contextSummary), [contextSummary]);

  useEffect(() => {
    setDraft(intent?.query || "");
    setScope(intent?.target || "auto");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [intent]);

  useEffect(() => {
    if (!intent?.autoRun || !intent?.query) return;
    if (lastAutoRunRequestIdRef.current === intent.requestId) return;
    lastAutoRunRequestIdRef.current = intent.requestId;
    onSend?.({ message: intent.query, target: intent.target || scope });
    setDraft("");
  }, [intent, onSend, scope]);

  return (
    <aside className="ai-chat-panel" aria-label="AI chat">
      <div className="ai-chat-header">
        <div>
          <div className="ai-chat-title">AI Chat</div>
          <div className="ai-chat-subtitle">Grounded in {noteTitle}</div>
        </div>
        <div className="ai-chat-header-actions">
          <AppButton variant="small" onClick={onClear}>Clear</AppButton>
          <AppButton variant="small" onClick={onHide}>Hide</AppButton>
        </div>
      </div>

      <div className="ai-chat-context-bar">
        <div className="ai-chat-scope-row" role="group" aria-label="AI context scope">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`ai-chat-scope-chip ${scope === option.id ? "active" : ""}`}
              onClick={() => setScope(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="ai-chat-context-copy">{contextSummary?.label || "Use the current note as AI context."}</div>
        <div className="ai-chat-scope-help">{getScopeHelp(scope, contextSummary)}</div>
      </div>

      <div className="ai-chat-messages">
        {messages.length ? messages.map((message) => (
          <div key={message.id} className={`ai-chat-message ${message.role}`}>
            <div className="ai-chat-message-head">
              <strong>{message.role === "user" ? "You" : "AI"}</strong>
              <span>{message.scopeLabel || message.scope || "auto"}</span>
            </div>
            <div className="ai-chat-message-body">{message.text}</div>
            {message.role === "assistant" && message.text ? (
              <div className="ai-chat-apply-row">
                <AppButton variant="small" onClick={() => onApply?.({ text: message.text, mode: "insert" })}>Insert</AppButton>
                <AppButton
                  variant="small"
                  disabled={!contextSummary?.hasSelection}
                  onClick={() => onApply?.({ text: message.text, mode: "replace-selection" })}
                >
                  Replace Selection
                </AppButton>
                <AppButton
                  variant="small"
                  disabled={!contextSummary?.hasCurrentBlock}
                  onClick={() => onApply?.({ text: message.text, mode: "replace-block" })}
                >
                  Replace Block
                </AppButton>
              </div>
            ) : null}
          </div>
        )) : (
          <div className="ai-chat-empty">
            <strong>Ask naturally.</strong>
            <span>Use selection-aware help, note-wide help, or widen to the workspace when needed.</span>
            <div className="ai-chat-starters">
              {starterPrompts.map((prompt) => (
                <button key={prompt} type="button" className="ai-chat-starter" onClick={() => setDraft(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error ? <div className="ai-chat-error">{error}</div> : null}

      <div className="ai-chat-composer">
        <AppTextarea
          ref={inputRef}
          className="ai-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask AI to rewrite, explain, continue, compare, or search related notes..."
          rows={4}
          disabled={isLoading}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              if (!draft.trim() || isLoading) return;
              onSend?.({ message: draft, target: scope });
              setDraft("");
            }
          }}
        />
        <div className="ai-chat-composer-actions">
          <span className="ai-chat-hint">Ctrl/Cmd+Enter to send</span>
          <AppButton
            variant="primary"
            disabled={isLoading || !draft.trim()}
            onClick={() => {
              if (!draft.trim()) return;
              onSend?.({ message: draft, target: scope });
              setDraft("");
            }}
          >
            {isLoading ? "Thinking..." : "Send"}
          </AppButton>
        </div>
      </div>
    </aside>
  );
}