import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import AppButton from "./AppButton";
import AppTextarea from "./AppTextarea";
import { renderMarkdown } from "../utils/renderUtils";
import { aiListPersonas } from "../services/electronService";

const SCOPE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "selection", label: "Selection" },
  { id: "block", label: "Block" },
  { id: "document", label: "Note" },
  { id: "workspace", label: "Workspace" },
];

function buildStarterPrompts(contextSummary) {
  if (!contextSummary?.hasActiveDocument) {
    return [
      "Summarize key tasks across my workspace.",
      "List all active projects in this workspace.",
      "Find links or references related to design plans.",
    ];
  }

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
  if (!contextSummary?.hasActiveDocument) {
    return "Workspace scope searches and maps conceptual matches across all notes in the workspace.";
  }

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
  _noteTitle = "Current Note",
  _activeProvider = "",
  activePersona = null,
  setActivePersona,
}) {
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState("auto");
  const [personas, setPersonas] = useState([]);
  const inputRef = useRef(null);
  const lastAutoRunRequestIdRef = useRef("");

  const starterPrompts = useMemo(() => buildStarterPrompts(contextSummary), [contextSummary]);

  useEffect(() => {
    setDraft(intent?.query || "");
    setScope(intent?.target || (contextSummary?.hasActiveDocument ? "auto" : "workspace"));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [intent, contextSummary]);

  useEffect(() => {
    if (!contextSummary?.hasActiveDocument) {
      setScope("workspace");
    }
  }, [contextSummary]);

  // Load available personas for the dropdown selector
  useEffect(() => {
    async function load() {
      const res = await aiListPersonas();
      if (res?.success && res.data) {
        setPersonas(res.data);
        if (!activePersona && res.data.length > 0) {
          const def = res.data.find(p => p.id === "default") || res.data[0];
          setActivePersona(def);
        }
      }
    }
    load();
  }, [activePersona, setActivePersona]);

  useEffect(() => {
    if (!intent?.autoRun || !intent?.query) return;
    if (lastAutoRunRequestIdRef.current === intent.requestId) return;
    lastAutoRunRequestIdRef.current = intent.requestId;
    onSend?.({ message: intent.query, target: intent.target || scope });
    setDraft("");
  }, [intent, onSend, scope]);

  return (
    <aside className="ai-chat-panel" aria-label="AI chat" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="ai-chat-header" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px 16px", borderBottom: "1px solid var(--border-soft)", background: "var(--surface-subtle)" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="ai-chat-title" style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{activePersona?.avatar || "??"}</span>
              {activePersona?.name || "AI Assistant"}
            </div>
            <div className="ai-chat-subtitle" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              {activePersona?.description || "Grounded assistant instructions."}
            </div>
          </div>
          <div className="ai-chat-header-actions" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <AppButton variant="small" onClick={onClear}>Clear</AppButton>
            <button
              onClick={onHide}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transition: "background 0.2s"
              }}
              className="ai-chat-close-btn"
              title="Close panel"
              aria-label="Close AI panel"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Persona Dropdown Selector Row */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", borderTop: "1px solid var(--border-soft)", paddingTop: "8px" }}>
          <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.03em" }}>Persona:</label>
          <select
            value={activePersona?.id || ""}
            onChange={(e) => {
              const matched = personas.find(p => p.id === e.target.value);
              if (matched) setActivePersona(matched);
            }}
            style={{
              flex: 1,
              fontSize: "12px",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid var(--border-soft)",
              background: "var(--surface-bg)",
              color: "var(--text-strong)",
              outline: "none"
            }}
          >
            {personas.map(p => (
              <option key={p.id} value={p.id}>
                {p.avatar || "??"} {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="ai-chat-context-bar">
        <div className="ai-chat-scope-row" role="group" aria-label="AI context scope">
          {SCOPE_OPTIONS.filter(o => contextSummary?.hasActiveDocument || o.id === "workspace").map((option) => (
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
        <div className="ai-chat-context-copy">
          {contextSummary?.hasActiveDocument 
            ? (contextSummary?.label || "Use the current note as AI context.")
            : "No active note. AI queries full workspace context."}
        </div>
        <div className="ai-chat-scope-help">{getScopeHelp(scope, contextSummary)}</div>
      </div>

      <div className="ai-chat-messages">
        {messages.length ? messages.map((message) => (
          <div key={message.id} className={`ai-chat-message ${message.role}`}>
            <div className="ai-chat-message-head" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "14px" }}>
                {message.role === "user" ? "??" : (message.avatar || activePersona?.avatar || "??")}
              </span>
              <strong>{message.role === "user" ? "You" : (activePersona?.name || "AI")}</strong>
              <span style={{ marginLeft: "auto" }}>{message.scopeLabel || message.scope || "auto"}</span>
            </div>
            <div
              className="ai-chat-message-body markdown-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}
            />
            {message.role === "assistant" && message.references && message.references.length > 0 && (
              <div className="ai-chat-message-references" style={{ marginTop: "8px", paddingTop: "6px", borderTop: "1px solid var(--border-soft)", fontSize: "11px" }}>
                <div style={{ fontWeight: 600, color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Referred Notes:</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {message.references.map((ref, idx) => {
                    const name = ref.path.split(/[\\/]/).pop();
                    return (
                      <span
                        key={idx}
                        title={`${ref.path} (${(ref.relevance * 100).toFixed(0)}% relevance)`}
                        style={{
                          background: "var(--surface-accent)",
                          color: "var(--accent-solid)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid var(--border-soft)",
                          fontFamily: "monospace",
                          fontSize: "10.5px"
                        }}
                      >
                        📄 {name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
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
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!draft.trim() || isLoading) return;
              onSend?.({ message: draft, target: scope, personaPrompt: activePersona?.prompt });
              setDraft("");
            }
          }}
        />
        <div className="ai-chat-composer-actions">
          <span className="ai-chat-hint">Enter to send, Shift+Enter for new line</span>
          <AppButton
            variant="primary"
            disabled={isLoading || !draft.trim()}
            onClick={() => {
              if (!draft.trim()) return;
              onSend?.({ message: draft, target: scope, personaPrompt: activePersona?.prompt });
              setDraft("");
            }}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            {isLoading ? "Thinking..." : (
              <>
                <Send size={12} />
                <span>Send</span>
              </>
            )}
          </AppButton>
        </div>
      </div>
    </aside>
  );
}
