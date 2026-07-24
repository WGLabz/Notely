import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X, Trash2, Pencil, Check, History, RotateCcw } from "lucide-react";
import AppButton from "./AppButton";
import AppTextarea from "./AppTextarea";
import { renderMarkdown } from "../utils/renderUtils";
import { aiListPersonas } from "../services/electronService";
import { useWorkspaceScopedStorage } from "../hooks/useWorkspaceScopedStorage";
import { useConfirm } from "../hooks/useConfirm";

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
  if (!contextSummary?.hasActiveDocument) return "";
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
  if (scope === "document") return "Uses the full current note.";
  return contextSummary?.hasSelection
    ? "Auto uses the current selection first, otherwise the full note."
    : "Auto uses the full note unless a selection is active.";
}

export default function AIChatPanel({
  onHide,
  onClear,
  onSend,
  onAbort,
  activeQueryId,
  onApply,
  onOpenDocument,
  isLoading = false,
  error = null,
  contextSummary = null,
  intent = null,
  messages = [],
  _noteTitle = "Current Note",
  _activeProvider = "",
  activePersona = null,
  setActivePersona,
  workspaceStorageScope = "default",
  conversations = [],
  onLoadConversations,
  onLoadConversation,
  onDeleteConversation,
}) {
  const [previewTarget, setPreviewTarget] = useState(null);
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState("auto");
  const [personas, setPersonas] = useState([]);
  const [isEditingPersona, setIsEditingPersona] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState("default");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const inputRef = useRef(null);
  const lastAutoRunRequestIdRef = useRef("");
  const messagesEndRef = useRef(null);

  const handlePreviewLink = async (rawPath, lineNum = null) => {
    setPreviewTarget({ path: rawPath, lineNum, content: null, isLoading: true });
    try {
      if (window.electronAPI?.readNote) {
        const res = await window.electronAPI.readNote(rawPath);
        const text = typeof res === "string" ? res : res?.content || "";
        setPreviewTarget({ path: rawPath, lineNum, content: text, isLoading: false });
      } else {
        const fs = require("fs");
        if (fs.existsSync(rawPath)) {
          const text = fs.readFileSync(rawPath, "utf8");
          setPreviewTarget({ path: rawPath, lineNum, content: text, isLoading: false });
        } else {
          setPreviewTarget({ path: rawPath, lineNum, content: `Note preview unavailable for: "${rawPath}"`, isLoading: false });
        }
      }
    } catch (err) {
      setPreviewTarget({ path: rawPath, lineNum, content: `Unable to load preview: ${err.message}`, isLoading: false });
    }
  };

  const { confirm } = useConfirm();

  const [persistedPersonaId, setPersistedPersonaId] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "activePersonaId",
    defaultValue: "default",
  });

  const starterPrompts = useMemo(() => buildStarterPrompts(contextSummary), [contextSummary]);

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i];
    }
    return null;
  }, [messages]);

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

  useEffect(() => {
    async function load() {
      const res = await aiListPersonas();
      if (res?.success && res.data) {
        setPersonas(res.data);
        const targetId = persistedPersonaId || "default";
        const matched = res.data.find(p => p.id === targetId) || res.data.find(p => p.id === "default") || res.data[0];
        if (matched && (!activePersona || activePersona.id !== matched.id)) {
          setActivePersona(matched);
        }
      }
    }
    load();
  }, [persistedPersonaId, activePersona, setActivePersona]);

  useEffect(() => {
    if (!intent?.autoRun || !intent?.query) return;
    if (lastAutoRunRequestIdRef.current === intent.requestId) return;
    lastAutoRunRequestIdRef.current = intent.requestId;
    onSend?.({ message: intent.query, target: intent.target || scope });
    setDraft("");
  }, [intent, onSend, scope]);

  useEffect(() => {
    if (isDrawerOpen) {
      onLoadConversations?.();
    }
  }, [isDrawerOpen, onLoadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleClearWithConfirm = async () => {
    const confirmed = await confirm({
      title: "Clear Chat History",
      message: "Are you sure you want to clear all messages in this conversation? This cannot be undone.",
      confirmLabel: "Clear History",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (confirmed) {
      onClear?.();
    }
  };

  return (
    <aside className="ai-chat-panel" aria-label="AI chat" style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>

      {/* Slide-out History Drawer overlay */}
      {isDrawerOpen && (
        <div className="ai-chat-drawer" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "var(--surface-bg)", zIndex: 100, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border-soft)" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-soft)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-subtle)" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Chat History</span>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {conversations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "11px" }}>No past chats</div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 4px",
                    borderBottom: "1px solid var(--border-soft)",
                    cursor: "pointer",
                    fontSize: "11px"
                  }}
                  onClick={() => {
                    onLoadConversation?.(conv.id);
                    setIsDrawerOpen(false);
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: "2px" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, color: "var(--text-strong)" }}>
                      💬 {conv.title || "Untitled Chat"}
                    </span>
                    <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>
                      {new Date(conv.updated_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation?.(conv.id);
                    }}
                    style={{ background: "transparent", border: "none", color: "var(--text-subtle)", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Header — CSS class provides dark gradient background */}
      <div className="ai-chat-header" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px" }}>

        {/* Row 1: Persona selector + Close button */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", flexShrink: 0 }}>
              Persona
            </span>

            {!isEditingPersona ? (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ flexShrink: 0 }}>{activePersona?.avatar || "👤"}</span>
                  {activePersona?.name || "Default"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPersonaId(activePersona?.id || "default");
                    setIsEditingPersona(true);
                  }}
                  style={{ background: "transparent", border: "none", padding: "4px", cursor: "pointer", color: "rgba(255,255,255,0.65)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 1, borderRadius: "3px" }}
                  className="icon-button-hover-accent"
                  title="Change persona"
                >
                  <Pencil size={12} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                <select
                  value={selectedPersonaId}
                  onChange={(e) => setSelectedPersonaId(e.target.value)}
                  style={{ flex: 1, fontSize: "11px", height: "22px", boxSizing: "border-box", padding: "0 6px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.35)", color: "#fff", outline: "none", verticalAlign: "middle" }}
                >
                  {personas.map(p => (
                    <option key={p.id} value={p.id} style={{ background: "#1e3a40", color: "#fff" }}>
                      {p.avatar || "👤"} {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const matched = personas.find(p => p.id === selectedPersonaId);
                    if (matched) {
                      setActivePersona(matched);
                      setPersistedPersonaId(matched.id);
                    }
                    setIsEditingPersona(false);
                  }}
                  style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "4px", height: "22px", boxSizing: "border-box", padding: "0 8px", cursor: "pointer", fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  title="Save persona"
                >
                  <Check size={12} />
                </button>
              </div>
            )}
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              title="Chat History"
              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", borderRadius: "4px", flexShrink: 0 }}
            >
              <History size={14} />
            </button>
            <button
              type="button"
              onClick={onHide}
              title="Close panel"
              aria-label="Close AI panel"
              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", borderRadius: "4px", flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Row 2: Description */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <p style={{ margin: 0, fontSize: "10.5px", color: "rgba(255,255,255,0.55)", lineHeight: "1.3", flex: 1, minWidth: 0 }}>
            {activePersona?.description || "Grounded assistant."}
          </p>
        </div>
      </div>

      {/* Scope chips — only when a note is open */}
      {contextSummary?.hasActiveDocument && (
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
            {contextSummary?.label || "Use the current note as AI context."}
          </div>
          <div className="ai-chat-scope-help">{getScopeHelp(scope, contextSummary)}</div>
        </div>
      )}

      {/* Message list — scrollable */}
      <div className="ai-chat-messages">
        {messages.length ? (
          <>
            {messages.map((message) => {
              const cleanText = String(message.text || message.content || "")
                .replace(/\r\n/g, "\n")
                .replace(/[ \t]+\n/g, "\n")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
              return (
                <div key={message.id} className={`ai-chat-message ${message.role}`}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "4px" }}>
                    <div
                      className="ai-chat-message-body markdown-body"
                      style={{ flex: 1, minWidth: 0 }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanText) }}
                      onClick={(event) => {
                        const link = event.target.closest('a');
                        if (link && link.href && link.href.startsWith('file://')) {
                          event.preventDefault();
                          let rawPath = decodeURIComponent(link.href.replace('file:///', ''));
                          rawPath = rawPath.replace(/\//g, '\\');
                          
                          let lineNum = null;
                          const hashMatch = rawPath.match(/#L(\d+)/i);
                          if (hashMatch) {
                            lineNum = parseInt(hashMatch[1], 10);
                            rawPath = rawPath.replace(/#L\d+/i, '');
                          }
                          handlePreviewLink(rawPath, lineNum);
                        }
                      }}
                    />
                    {message.role === "user" && message.id === lastUserMessage?.id && (
                      <button
                        type="button"
                        className="ai-chat-resend-btn"
                        disabled={isLoading || !!activeQueryId}
                        onClick={() => {
                          onSend?.({
                            message: message.text || message.content,
                            target: message.scope || scope,
                            personaPrompt: activePersona?.prompt,
                            isResend: true,
                          });
                        }}
                        title="Resend this message"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>

                  {message.role === "assistant" && message.references && message.references.length > 0 && (
                    <div className="ai-chat-message-references" style={{ marginTop: "6px", paddingTop: "5px", borderTop: "1px solid var(--border-soft)", fontSize: "10px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-muted)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sources:</div>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {message.references.map((ref, idx) => {
                          const name = ref.path.split(/[\\/]/).pop();
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handlePreviewLink(ref.path)}
                              title={`${ref.path} (${(ref.relevance * 100).toFixed(0)}% relevance)`}
                              style={{ background: "var(--surface-accent)", color: "var(--accent-solid)", padding: "1px 5px", borderRadius: "3px", border: "1px solid var(--border-soft)", fontFamily: "monospace", fontSize: "10px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px" }}
                            >
                              📄 {name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {message.role === "assistant" && message.text && contextSummary?.hasActiveDocument ? (
                    <div className="ai-chat-apply-row" style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "6px" }}>
                      <AppButton variant="small" onClick={() => onApply?.({ text: message.text, mode: "insert" })} style={{ flex: 1, justifyContent: "center", minWidth: 0 }}>Insert</AppButton>
                      <AppButton
                        variant="small"
                        disabled={!contextSummary?.hasSelection}
                        onClick={() => onApply?.({ text: message.text, mode: "replace-selection" })}
                        style={{ flex: 1, justifyContent: "center", minWidth: 0 }}
                      >
                        Replace Sel.
                      </AppButton>
                      <AppButton
                        variant="small"
                        disabled={!contextSummary?.hasCurrentBlock}
                        onClick={() => onApply?.({ text: message.text, mode: "replace-block" })}
                        style={{ flex: 1, justifyContent: "center", minWidth: 0 }}
                      >
                        Replace Block
                      </AppButton>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="ai-chat-empty">
            <strong>Ask naturally.</strong>
            <span>
              {contextSummary?.hasActiveDocument
                ? "Ask about this note, your selection, or expand context to the workspace."
                : "Ask anything — your entire workspace is the context."}
            </span>
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

      {/* Composer — fixed at bottom */}
      <div className="ai-chat-composer" style={{ flexShrink: 0, padding: "6px 10px 4px 10px", gap: "3px" }}>
        <AppTextarea
          ref={inputRef}
          className="ai-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask anything…"
          rows={3}
          style={{ fontSize: "11.5px" }}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* Shortcut hint on its own line */}
          <div className="ai-chat-hint" style={{ fontSize: "9px", color: "var(--text-muted)", opacity: 0.8 }}>
            Enter to send · Shift+Enter for new line
          </div>
          
          {/* Actions on one line */}
          <div className="ai-chat-composer-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <AppButton
              variant="small"
              onClick={handleClearWithConfirm}
              disabled={messages.length === 0 || activeQueryId}
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0 8px", minHeight: "24px", height: "24px", fontSize: "10.5px" }}
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </AppButton>

            {activeQueryId ? (
              <AppButton
                variant="danger"
                onClick={onAbort}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 10px", minHeight: "24px", height: "24px", fontSize: "10.5px", background: "var(--accent-danger)", color: "#fff" }}
              >
                <X size={12} />
                <span>Stop</span>
              </AppButton>
            ) : (
              <AppButton
                variant="primary"
                disabled={isLoading || !draft.trim()}
                onClick={() => {
                  if (!draft.trim()) return;
                  onSend?.({ message: draft, target: scope, personaPrompt: activePersona?.prompt });
                  setDraft("");
                }}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 10px", minHeight: "24px", height: "24px", fontSize: "10.5px" }}
              >
                {isLoading ? "Thinking…" : (
                  <>
                    <Send size={12} />
                    <span>Send</span>
                  </>
                )}
              </AppButton>
            )}
          </div>
        </div>
      </div>
      {/* Floating Note Preview Overlay */}
      {previewTarget ? (
        <div
          className="ai-chat-preview-modal-overlay"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(3px)",
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
            padding: "12px",
          }}
        >
          <div
            className="ai-chat-preview-card"
            style={{
              background: "var(--surface-primary, #1e1e1e)",
              border: "1px solid var(--border-soft, #333)",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justify: "space-between",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-soft, #333)",
                background: "var(--surface-secondary, #252526)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary, #eee)", display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                📄 <span>{previewTarget.path.split(/[\\/]/).pop()}</span>
                {previewTarget.lineNum ? (
                  <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "var(--accent-muted, rgba(99,102,241,0.25))", color: "var(--accent-solid, #818cf8)", fontFamily: "monospace" }}>
                    L{previewTarget.lineNum}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setPreviewTarget(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted, #999)", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, padding: "12px", overflowY: "auto", fontSize: "12px", lineHeight: "1.5" }}>
              {previewTarget.isLoading ? (
                <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "30px", fontSize: "12px" }}>Loading note preview…</div>
              ) : (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(previewTarget.content || "") }}
                />
              )}
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderTop: "1px solid var(--border-soft, #333)",
                background: "var(--surface-secondary, #252526)",
                display: "flex",
                justify: "flex-end",
                gap: "6px",
              }}
            >
              <AppButton variant="secondary" onClick={() => setPreviewTarget(null)} style={{ fontSize: "11px", height: "24px" }}>
                Close
              </AppButton>
              <AppButton
                variant="primary"
                onClick={() => {
                  onOpenDocument?.(previewTarget.path, previewTarget.lineNum);
                  setPreviewTarget(null);
                }}
                style={{ fontSize: "11px", height: "24px" }}
              >
                Open in Editor
              </AppButton>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
