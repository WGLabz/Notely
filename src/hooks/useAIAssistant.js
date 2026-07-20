import { useEffect, useRef, useState, useCallback } from "react";
import {
  aiGetApiKey,
  aiQuery,
  aiQueryStream,
  aiQueryAbort,
  onChatStreamChunk,
  aiBuildGraph,
  aiClearData,
  aiGenerateEmbeddings,
  aiGetHealth,
  aiCreateConversation,
  aiAddMessage,
  aiListConversations,
  aiGetMessages,
  aiDeleteConversation,
} from "../services/electronService";
import {
  buildAIContextSummary,
  extractEditableAIText,
  normalizePaletteIntent,
  resolveAITarget,
} from "../utils/aiContext";

function extractReferences(trace) {
  if (!Array.isArray(trace)) return [];
  const refs = [];
  const seenPaths = new Set();
  
  for (const t of trace) {
    if (!t || !t.output) continue;
    
    if (t.name === 'searchNotes') {
      const regex = /\[\d+\]\s+([^\n(]+?)\s*\(score:\s*([\d.]+)\)/g;
      let match;
      while ((match = regex.exec(t.output)) !== null) {
        const filePath = match[1].trim();
        const score = parseFloat(match[2]) || 1.0;
        if (!seenPaths.has(filePath)) {
          seenPaths.add(filePath);
          refs.push({ path: filePath, relevance: score });
        }
      }
    } else if (t.name === 'search_notes') {
      try {
        const list = JSON.parse(t.output);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.path && !seenPaths.has(item.path)) {
              seenPaths.add(item.path);
              refs.push({ path: item.path, relevance: 1.0 });
            }
          }
        }
      } catch (err) {
        console.warn("Failed to parse search_notes output:", err);
      }
    }
  }
  return refs;
}

/**
 * Owns all AI-assistant state, handlers, and side effects (provider
 * configuration, palette/chat/inline-ghost flows, and AI maintenance actions).
 * Editor/document context flows in via params; the editor API is registered
 * through the returned `aiEditorRef`.
 */
export function useAIAssistant({
  current,
  activeTab,
  mode,
  activeProject,
  landingFolderPath,
  notesFolderPath,
  notify,
}) {
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [_aiLoading, setAiLoading] = useState(false);
  const [aiQueryLoading, setAiQueryLoading] = useState(false);
  const [aiQueryError, setAiQueryError] = useState("");
  const [aiContextSummary, setAiContextSummary] = useState({
    label: "Open a note to use AI.",
    hasSelection: false,
    hasCurrentBlock: false,
  });
  const [aiPaletteIntent, setAiPaletteIntent] = useState(() => normalizePaletteIntent());
  const [aiChatMessages, setAiChatMessages] = useState([]);
  const currentConversationIdRef = useRef(null);
  const [conversations, setConversations] = useState([]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await aiListConversations();
      if (res?.success) {
        setConversations(res.data || []);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }, []);

  const loadConversation = useCallback(async (id) => {
    try {
      const res = await aiGetMessages(id);
      if (res?.success) {
        const mapped = (res.data || []).map((m) => ({
          id: m.id,
          role: m.role,
          text: m.content,
          references: extractReferences(m.metadata?.trace),
        }));
        setAiChatMessages(mapped);
        currentConversationIdRef.current = id;
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }, []);

  const deleteConversation = useCallback(async (id) => {
    try {
      const res = await aiDeleteConversation(id);
      if (res?.success) {
        if (currentConversationIdRef.current === id) {
          handleClearAIChat();
        }
        await loadConversations();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }, [loadConversations]);

  const [isAIConfigured, setIsAIConfigured] = useState(false);
  const [activeProvider, setActiveProvider] = useState("");
  const [aiPanelVisible, setAiPanelVisible] = useState(() => {
    try {
      const stored = window.localStorage.getItem("notely:ai-panel-visible");
      return stored !== "false";
    } catch {
      return true;
    }
  });
  const [inlineGhostSuggestion, setInlineGhostSuggestion] = useState(null);
  const aiEditorRef = useRef(null);

  async function refreshAIConfiguration() {
    try {
      // 1. Check if any key is configured on disk (independent of backend initialization state)
      const providers = ["gemini", "groq", "openai", "local"];
      const checks = await Promise.all(
        providers.map(async (provider) => {
          try {
            const result = await aiGetApiKey(provider);
            return Boolean(result?.success && (result?.data?.configured || result?.data?.maskedKey));
          } catch {
            return false;
          }
        })
      );
      const hasKeys = checks.some(Boolean);
      setIsAIConfigured(hasKeys);

      // 2. Fetch backend status to display active provider name if available
      const healthRes = await aiGetHealth();
      if (healthRes?.success && healthRes?.data) {
        setActiveProvider(healthRes.data.activeProvider || "");
      }
    } catch {
      setIsAIConfigured(false);
    }
  }

  async function handleAIEmbeddings() {
    setAiLoading(true);
    notify("Generating embeddings...", "info");
    try {
      const result = await aiGenerateEmbeddings(true);
      if (result?.success) {
        notify("Embeddings generated successfully!", "success");
      } else {
        notify(result?.error || "Failed to generate embeddings", "error");
      }
    } catch (err) {
      notify(err?.message || "Failed to generate embeddings", "error");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAIGraph() {
    setAiLoading(true);
    notify("Building relationship graph...", "info");
    try {
      const result = await aiBuildGraph();
      if (result?.success) {
        notify("Relationship graph built successfully!", "success");
      } else {
        notify(result?.error || "Failed to build graph", "error");
      }
    } catch (err) {
      notify(err?.message || "Failed to build graph", "error");
    } finally {
      setAiLoading(false);
    }
  }


  async function handleAIClearCache() {
    setAiLoading(true);
    notify("Clearing AI cache...", "info");
    try {
      const result = await aiClearData();
      if (result?.success) {
        notify("AI cache cleared successfully!", "success");
      } else {
        notify(result?.error || "Failed to clear cache", "error");
      }
    } catch (err) {
      notify(err?.message || "Failed to clear cache", "error");
    } finally {
      setAiLoading(false);
    }
  }

  function handleOpenAIPalette(options = {}) {
    if (!current?.filePath) {
      notify("Open a note to use AI.", "warning");
      return;
    }

    if (!isAIConfigured) {
      notify("Configure an AI provider key in AI Settings to use AI chat.", "warning");
      setAiPanelVisible(false);
      setAiSettingsOpen(true);
      return;
    }

    const editorContext = aiEditorRef.current?.getContext?.() || null;
    const summary = buildAIContextSummary(editorContext, current);
    setAiQueryError("");
    setAiContextSummary(summary);
    setAiPaletteIntent(normalizePaletteIntent(options, summary));
    setAiPanelVisible(true);
  }

  async function handleInlineAIRequest(options = {}) {
    if (!current?.filePath) {
      notify("Open a note to use AI.", "warning");
      return;
    }

    if (!isAIConfigured) {
      notify("Configure an AI provider key in AI Settings to use AI actions.", "warning");
      setAiPanelVisible(false);
      setAiSettingsOpen(true);
      return;
    }

    const query = String(options?.initialQuery || "").trim();
    if (!query) return;

    setAiQueryLoading(true);
    setAiQueryError("");

    try {
      const editorContext = aiEditorRef.current?.getContext?.() || {};
      const resolvedTarget = resolveAITarget(editorContext, options?.target || "block", current, activeTab);

      const response = await aiQuery(query, {
        currentFile: current.filePath,
        workspaceRoot: activeProject?.rootPath || landingFolderPath || notesFolderPath || null,
        activeTab,
        editorMode: mode,
        documentTitle: current.title,
        selectedText: editorContext.selectedText || null,
        currentBlock: editorContext.currentBlock?.text || null,
        selectionStart: editorContext.selectionStart ?? null,
        selectionEnd: editorContext.selectionEnd ?? null,
        cursorOffset: editorContext.cursorOffset ?? null,
        requestedTarget: resolvedTarget.requestedTarget,
        resolvedTarget: resolvedTarget.effectiveTarget,
        workspaceContext: resolvedTarget.requestedTarget === "workspace",
        targetText: resolvedTarget.targetText || null,
        activeNoteContent: editorContext.value || null,
      });

      if (!response?.success) {
        throw new Error(response?.error || "AI query failed.");
      }

      const resultText = extractEditableAIText(
        response?.data?.result?.result ||
        response?.data?.result ||
        ""
      );

      if (!resultText) {
        notify("AI did not return an inline suggestion.", "warning");
        return;
      }

      setInlineGhostSuggestion({
        text: resultText,
        insertAt: editorContext.cursorOffset ?? 0,
        source: String(options?.source || "inline"),
      });
      notify("Inline AI suggestion ready.", "success");
    } catch (err) {
      const message = err?.message || "AI query failed.";
      setAiQueryError(message);
      notify(message, "error");
    } finally {
      setAiQueryLoading(false);
    }
  }

  const [activePersona, setActivePersona] = useState(null);



  async function handleApplyAIResult({ text, mode, previewOnly = false, insertAt = null }) {
    const outcome = aiEditorRef.current?.applyResult?.({ text, mode, previewOnly, insertAt });
    if (!outcome?.applied) {
      if (outcome?.preview) {
        return outcome;
      }
      notify(outcome?.reason || "Unable to apply AI result.", "warning");
      return outcome;
    }

    const message =
      mode === "insert"
        ? "AI content inserted into the editor."
        : mode === "replace-selection"
          ? "Selection replaced with AI content."
          : "Current block replaced with AI content.";
    notify(message, "success");
    return outcome;
  }

  const [activeQueryId, setActiveQueryId] = useState(null);

  // Subscribe to stream chunks globally
  useEffect(() => {
    const unsubscribe = onChatStreamChunk((payload) => {
      const { queryId, chunk } = payload;
      if (chunk?.content) {
        setAiChatMessages((currentMessages) =>
          currentMessages.map((msg) =>
            msg.queryId === queryId
              ? { ...msg, text: msg.text + chunk.content }
              : msg
          )
        );
      }
    });
    return () => unsubscribe();
  }, []);

  async function handleAIChatAbort() {
    if (activeQueryId) {
      try {
        await aiQueryAbort(activeQueryId);
      } catch (err) {
        console.error('Failed to abort query:', err);
      }
      setActiveQueryId(null);
      setAiQueryLoading(false);
    }
  }

  async function handleAIChatSend({ message, target, personaPrompt }) {
    const scope = target || "auto";
    const userEntry = {
      id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: "user",
      text: message,
      scope,
      scopeLabel: scope,
    };

    setAiChatMessages((currentMessages) => [...currentMessages, userEntry]);

    // Lazily create a conversation session on first message
    if (!currentConversationIdRef.current) {
      try {
        const firstLine = message.trim().split('\n')[0];
        const draftTitle = firstLine.slice(0, 30) + (firstLine.length > 30 ? "..." : "");
        const convResp = await aiCreateConversation(
          draftTitle,
          activePersona?.id || "default"
        );
        if (convResp?.success) {
          currentConversationIdRef.current = convResp.data?.id;
        }
      } catch {
        // Non-fatal — chat still works, just not persisted
      }
    }

    // Persist user message
    if (currentConversationIdRef.current) {
      aiAddMessage(currentConversationIdRef.current, "user", message).catch(() => {});
    }

    const queryId = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setActiveQueryId(queryId);
    setAiQueryLoading(true);
    setAiQueryError("");

    const assistantEntry = {
      id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      queryId,
      role: "assistant",
      text: "",
      scope,
      scopeLabel: scope,
      avatar: activePersona?.avatar || "🤖",
      references: [],
    };

    setAiChatMessages((currentMessages) => [...currentMessages, assistantEntry]);

    try {
      const editorContext = aiEditorRef.current?.getContext?.() || {};
      const resolvedTarget = current?.filePath
        ? resolveAITarget(editorContext, target || "auto", current, activeTab)
        : {
            requestedTarget: "workspace",
            effectiveTarget: "document",
            targetText: "",
            scopeLabel: "workspace",
          };

      const response = await aiQueryStream(
        message,
        {
          currentFile: current?.filePath || null,
          workspaceRoot: activeProject?.rootPath || landingFolderPath || notesFolderPath || null,
          activeTab: current ? activeTab : "preview",
          editorMode: current ? mode : "preview",
          documentTitle: current?.title || "Global Context",
          selectedText: editorContext.selectedText || null,
          currentBlock: editorContext.currentBlock?.text || null,
          selectionStart: editorContext.selectionStart ?? null,
          selectionEnd: editorContext.selectionEnd ?? null,
          cursorOffset: editorContext.cursorOffset ?? null,
          requestedTarget: resolvedTarget.requestedTarget,
          resolvedTarget: resolvedTarget.effectiveTarget,
          workspaceContext: !current || resolvedTarget.requestedTarget === "workspace",
          targetText: resolvedTarget.targetText || null,
          systemPrompt: personaPrompt || activePersona?.prompt || null,
          conversationId: currentConversationIdRef.current || 'default',
          activeNoteContent: editorContext.value || null,
        },
        queryId
      );

      if (!response?.success) {
        throw new Error(response?.error || "AI query failed.");
      }

      const finalResult = response.data;
      
      // Update assistant entry with final references / metadata
      setAiChatMessages((currentMessages) =>
        currentMessages.map((msg) =>
          msg.queryId === queryId
            ? {
                ...msg,
                text: finalResult?.result || msg.text || "AI query completed.",
                references: extractReferences(finalResult?.trace),
              }
            : msg
        )
      );

      // Persist assistant message with trace metadata
      if (currentConversationIdRef.current) {
        const trace = finalResult?.trace || [];
        aiAddMessage(
          currentConversationIdRef.current,
          "assistant",
          finalResult?.result || "",
          trace.length > 0 ? { trace } : null
        ).catch(() => {});
      }
    } catch (err) {
      const message = err?.message || "AI query failed.";
      setAiQueryError(message);
      notify(message, "error");
    } finally {
      setActiveQueryId(null);
      setAiQueryLoading(false);
    }
  }

  function handleClearAIChat() {
    setAiChatMessages([]);
    setAiQueryError("");
    currentConversationIdRef.current = null;
  }

  function handleRejectInlineGhost() {
    setInlineGhostSuggestion(null);
  }

  async function handleAcceptInlineGhost() {
    if (!inlineGhostSuggestion?.text) return;
    const outcome = await handleApplyAIResult({
      text: inlineGhostSuggestion.text,
      mode: "insert",
      previewOnly: false,
      insertAt: inlineGhostSuggestion.insertAt,
    });
    if (outcome?.applied) {
      setInlineGhostSuggestion(null);
    }
  }

  useEffect(() => {
    refreshAIConfiguration();
  }, []);

  useEffect(() => {
    if (!isAIConfigured && aiPanelVisible) {
      setAiPanelVisible(false);
    }
  }, [isAIConfigured, aiPanelVisible]);

  useEffect(() => {
    if (!aiSettingsOpen) {
      refreshAIConfiguration();
    }
  }, [aiSettingsOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem("notely:ai-panel-visible", aiPanelVisible ? "true" : "false");
    } catch {
      // Ignore storage failures.
    }
  }, [aiPanelVisible]);

  useEffect(() => {
    setInlineGhostSuggestion(null);
    // Clearing the chat messages array on document or tab switch guarantees
    // the main workspace chat remains separate from note-specific chats.
    setAiChatMessages([]);
    currentConversationIdRef.current = null;
    const editorContext = aiEditorRef.current?.getContext?.() || null;
    const summary = buildAIContextSummary(editorContext, current);
    setAiContextSummary(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.filePath, activeTab]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!current?.filePath) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "j") return;

      event.preventDefault();
      handleOpenAIPalette({ forceOpen: true });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.filePath]);

  return {
    aiSettingsOpen,
    setAiSettingsOpen,
    aiQueryLoading,
    aiQueryError,
    aiContextSummary,
    aiPaletteIntent,
    aiChatMessages,
    isAIConfigured,
    aiPanelVisible,
    setAiPanelVisible,
    inlineGhostSuggestion,
    aiEditorRef,
    refreshAIConfiguration,
    handleAIEmbeddings,
    handleAIGraph,
    handleAIClearCache,
    handleOpenAIPalette,
    handleInlineAIRequest,
    handleApplyAIResult,
    handleAIChatSend,
    handleAIChatAbort,
    handleClearAIChat,
    handleRejectInlineGhost,
    handleAcceptInlineGhost,
    activeProvider,
    activePersona,
    setActivePersona,
    activeQueryId,
    conversations,
    loadConversations,
    loadConversation,
    deleteConversation,
  };
}
