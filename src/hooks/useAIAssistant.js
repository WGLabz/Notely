import { useEffect, useRef, useState } from "react";
import {
  aiGetApiKey,
  aiQuery,
  aiBuildGraph,
  aiClearData,
  aiDetectPatterns,
  aiGenerateEmbeddings,
} from "../services/electronService";
import {
  buildAIContextSummary,
  extractEditableAIText,
  normalizePaletteIntent,
  resolveAITarget,
} from "../utils/aiContext";

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
  const [isAIConfigured, setIsAIConfigured] = useState(false);
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
      const providers = ["gemini", "openai", "local"];
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
      setIsAIConfigured(checks.some(Boolean));
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

  async function handleAIPatterns() {
    setAiLoading(true);
    notify("Detecting patterns...", "info");
    try {
      const result = await aiDetectPatterns();
      if (result?.success) {
        notify("Patterns detected successfully!", "success");
      } else {
        notify(result?.error || "Failed to detect patterns", "error");
      }
    } catch (err) {
      notify(err?.message || "Failed to detect patterns", "error");
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

  async function handleAIQuery({ query, target }) {
    if (!current?.filePath) {
      throw new Error("Open a note to use AI.");
    }

    if (!isAIConfigured) {
      notify("Configure an AI provider key in AI Settings to use AI chat.", "warning");
      setAiPanelVisible(false);
      setAiSettingsOpen(true);
      throw new Error("AI provider not configured.");
    }

    setAiQueryLoading(true);
    setAiQueryError("");

    try {
      const editorContext = aiEditorRef.current?.getContext?.() || {};
      const resolvedTarget = resolveAITarget(editorContext, target || "auto", current, activeTab);

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
      });

      if (!response?.success) {
        throw new Error(response?.error || "AI query failed.");
      }

      const resultText = extractEditableAIText(
        response?.data?.result?.result ||
        response?.data?.result ||
        "AI query completed."
      );

      notify(resultText.length > 180 ? `${resultText.slice(0, 177)}...` : resultText, "success");
      return {
        response,
        text: resultText,
        scopeLabel: resolvedTarget.scopeLabel,
      };
    } catch (err) {
      const message = err?.message || "AI query failed.";
      setAiQueryError(message);
      notify(message, "error");
      throw err;
    } finally {
      setAiQueryLoading(false);
    }
  }

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

  async function handleAIChatSend({ message, target }) {
    const scope = target || "auto";
    const userEntry = {
      id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: "user",
      text: message,
      scope,
      scopeLabel: scope,
    };

    setAiChatMessages((currentMessages) => [...currentMessages, userEntry]);

    try {
      const result = await handleAIQuery({
        query: message,
        target: scope,
      });
      setAiChatMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: "assistant",
          text: result?.text || "",
          scope,
          scopeLabel: result?.scopeLabel || scope,
        },
      ]);
      return result;
    } catch {
      return null;
    }
  }

  function handleClearAIChat() {
    setAiChatMessages([]);
    setAiQueryError("");
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
    setAiChatMessages([]);
  }, [current?.filePath, activeTab]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!current?.filePath) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "k") return;

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
    handleAIPatterns,
    handleAIClearCache,
    handleOpenAIPalette,
    handleInlineAIRequest,
    handleApplyAIResult,
    handleAIChatSend,
    handleClearAIChat,
    handleRejectInlineGhost,
    handleAcceptInlineGhost,
  };
}
