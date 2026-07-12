import { useEffect, useRef } from "react";

function isTextInputLike(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function useDocumentEditorActions({
  menuAction,
  isFocusMode,
  showMediaManager,
  textareaRef,
  setFindQuery,
  toggleFindInNotePanel,
  openFindInNotePanel,
  openFindReplacePanel,
  toggleOutlineEnabled,
  toggleSplitPreview,
  toggleFocusMode,
  openPdfOptions,
  openHistoryVersions,
  setEditorMode,
  handleManualSave,
  handleUndo,
  handleRedo,
  onNotify,
}) {
  const lastProcessedMenuNonceRef = useRef(null);

  useEffect(() => {
    if (!menuAction?.action) return;
    if (menuAction?.nonce && lastProcessedMenuNonceRef.current === menuAction.nonce) return;
    if (menuAction?.nonce) {
      lastProcessedMenuNonceRef.current = menuAction.nonce;
    }

    if (menuAction.action === "find-in-note" || menuAction.action === "find-replace") {
      if (typeof menuAction.query === "string" && menuAction.query.trim()) {
        setFindQuery(menuAction.query.trim());
      }
      if (menuAction.action === "find-replace") {
        openFindReplacePanel();
      } else {
        openFindInNotePanel();
      }
      return;
    }

    if (menuAction.action === "toggle-outline" || menuAction.action === "toggle-outline-enabled") {
      if (isFocusMode) {
        onNotify?.("Outline cannot be toggled while Focus mode is active.", "info");
        return;
      }
      toggleOutlineEnabled();
      return;
    }

    if (menuAction.action === "toggle-split-preview") {
      toggleSplitPreview();
      return;
    }

    if (menuAction.action === "toggle-focus-mode") {
      toggleFocusMode();
      return;
    }

    if (menuAction.action === "export-pdf") {
      openPdfOptions();
      return;
    }

    if (
      menuAction.action === "manage-versions" ||
      menuAction.action === "git-history" ||
      menuAction.action === "git-diff-current"
    ) {
      openHistoryVersions();
    }
  }, [
    menuAction,
    isFocusMode,
    setFindQuery,
    openFindInNotePanel,
    openFindReplacePanel,
    toggleOutlineEnabled,
    toggleSplitPreview,
    toggleFocusMode,
    openPdfOptions,
    openHistoryVersions,
    onNotify,
  ]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;

      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;
      const inInput = isTextInputLike(event.target);

      if (!hasPrimaryModifier) return;

      if (event.altKey && key === "f") {
        if (showMediaManager) return;
        event.preventDefault();
        toggleFocusMode();
        return;
      }

      if (key === "s") {
        event.preventDefault();
        handleManualSave();
        return;
      }

      if (key === "f") {
        event.preventDefault();
        toggleFindInNotePanel();
        return;
      }

      if (key === "z") {
        if (inInput && event.target !== textareaRef.current) return;
        event.preventDefault();
        const changed = event.shiftKey ? handleRedo() : handleUndo();
        if (changed) {
          onNotify?.(event.shiftKey ? "Redo applied." : "Undo applied.", "info");
        } else {
          onNotify?.(event.shiftKey ? "Nothing to redo." : "Nothing to undo.", "info");
        }
        return;
      }

      if (key === "1") {
        event.preventDefault();
        setEditorMode("edit");
        return;
      }

      if (key === "2") {
        event.preventDefault();
        setEditorMode("split");
        return;
      }

      if (key === "3") {
        event.preventDefault();
        setEditorMode("preview");
        return;
      }

      if (key === "\\") {
        if (showMediaManager) return;
        event.preventDefault();
        toggleSplitPreview();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    showMediaManager,
    textareaRef,
    toggleFindInNotePanel,
    openFindInNotePanel,
    toggleSplitPreview,
    toggleFocusMode,
    setEditorMode,
    handleManualSave,
    handleUndo,
    handleRedo,
    onNotify,
  ]);
}
