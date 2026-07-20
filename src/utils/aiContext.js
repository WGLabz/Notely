// Pure helpers for deriving AI context, palette intent, and target resolution.
// Extracted from App.jsx to keep the root component focused on orchestration.

export function buildAIContextSummary(editorContext, current) {
  if (!current?.filePath) {
    return {
      label: "No active note. AI will search the full workspace context.",
      hasActiveDocument: false,
      hasSelection: false,
      hasCurrentBlock: false,
    };
  }

  const selectedPreview = String(editorContext?.selectedText || "").trim();
  const blockPreview = String(editorContext?.currentBlock?.text || "").trim();

  if (selectedPreview) {
    const compact = selectedPreview.replace(/\s+/g, " ");
    return {
      label: `Selection in ${editorContext?.tab || "note"}: ${compact.slice(0, 120)}${compact.length > 120 ? "..." : ""}`,
      hasActiveDocument: true,
      hasSelection: true,
      hasCurrentBlock: Boolean(blockPreview),
      suggestedPreset: "research",
    };
  }

  if (blockPreview) {
    const compact = blockPreview.replace(/\s+/g, " ");
    return {
      label: `Current block in ${editorContext?.tab || "note"}: ${compact.slice(0, 120)}${compact.length > 120 ? "..." : ""}`,
      hasActiveDocument: true,
      hasSelection: false,
      hasCurrentBlock: true,
      suggestedPreset: /meeting|agenda|decision|attendee|follow-up/i.test(compact) ? "meeting" : "research",
    };
  }

  return {
    label: `Whole ${editorContext?.tab || "note"} note will be used for context in ${current.title}.`,
    hasActiveDocument: true,
    hasSelection: false,
    hasCurrentBlock: false,
    suggestedPreset: /meeting|standup|sync|minutes/i.test(current.title || "") ? "meeting" : /plan|roadmap|tasks|action/i.test(current.title || "") ? "action-plan" : "research",
  };
}

export function extractEditableAIText(value) {
  const text = String(value || "").trim();
  const fenceMatch = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

export function normalizePaletteIntent(options = {}, _contextSummary = null) {
  const requestedTarget = options?.target || null;
  const defaultTarget = "auto";

  return {
    query: String(options?.initialQuery || ""),
    target: requestedTarget || defaultTarget,
    autoRun: Boolean(options?.autoRun),
    source: String(options?.source || "manual"),
    requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

export function resolveAITarget(editorContext, requestedTarget, current, activeTab) {
  const selectionText = String(editorContext?.selectedText || "");
  const blockText = String(editorContext?.currentBlock?.text || "");
  const documentText = activeTab === "raw"
    ? current?.rawNotes || ""
    : current?.cleansed || "";

  if (requestedTarget === "workspace") {
    return {
      requestedTarget,
      effectiveTarget: selectionText ? "selection" : blockText ? "block" : "document",
      targetText: selectionText || blockText || documentText,
      scopeLabel: "workspace",
    };
  }

  if (requestedTarget === "selection") {
    return {
      requestedTarget,
      effectiveTarget: selectionText ? "selection" : "document",
      targetText: selectionText || documentText,
      scopeLabel: selectionText ? "selection" : "note",
    };
  }

  if (requestedTarget === "block") {
    return {
      requestedTarget,
      effectiveTarget: blockText ? "block" : "document",
      targetText: blockText || documentText,
      scopeLabel: blockText ? "block" : "note",
    };
  }

  if (requestedTarget === "document") {
    return {
      requestedTarget,
      effectiveTarget: "document",
      targetText: documentText,
      scopeLabel: "note",
    };
  }

  return {
    requestedTarget: "auto",
    effectiveTarget: selectionText ? "selection" : "document",
    targetText: selectionText || documentText,
    scopeLabel: selectionText ? "selection" : "note",
  };
}
