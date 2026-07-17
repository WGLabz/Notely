import React, { useState } from "react";
import { BookPlus, X } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";
import AppButton from "./AppButton";
import AppInput from "./AppInput";
import AppIconButton from "./AppIconButton";
import { useConfirm } from "../hooks/useConfirm";
import "../styles/DictionaryModal.css";

export default function DictionaryModal({
  open,
  onClose,
  ignoredSpellingWords = [],
  onAddWord,
  onRemoveWord,
}) {
  const [newWord, setNewWord] = useState("");
  const { confirm } = useConfirm();

  const handleAdd = () => {
    const word = String(newWord || "").trim().toLowerCase();
    if (!word) return;
    onAddWord(word);
    setNewWord("");
  };

  const handleRemove = async (word) => {
    const confirmed = await confirm({
      title: "Remove Word?",
      message: `Are you sure you want to remove "${word}" from the spelling dictionary?`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (confirmed) {
      onRemoveWord(word);
    }
  };

  if (!open) return null;

  return (
    <OverlayDialog
      open={open}
      onClose={onClose}
      ariaLabel="Dictionary Manager"
      cardClassName="dictionary-dialog-card"
    >
      <div className="overlay-dialog-header dictionary-dialog-header">
        <div>
          <h2>Dictionary Manager</h2>
          <p>Manage spelling dictionary words for this workspace.</p>
        </div>
        <AppIconButton onClick={onClose} aria-label="Close dictionary">
          <X size={16} />
        </AppIconButton>
      </div>

      <div className="dictionary-dialog-body">
        <div className="dictionary-add-row" style={{ marginBottom: "20px" }}>
          <AppInput
            id="new-dictionary-word"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="Enter word (e.g. excalidraw)..."
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <AppButton variant="primary" onClick={handleAdd}>
            <BookPlus size={14} aria-hidden="true" />
            <span>Add Word</span>
          </AppButton>
        </div>

        {ignoredSpellingWords.length ? (
          <>
            <div className="dictionary-word-list-header">
              <span className="dictionary-word-count">
                {ignoredSpellingWords.length} Word{ignoredSpellingWords.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="dictionary-word-pills">
              {ignoredSpellingWords.map((word) => (
                <span key={word} className="dictionary-pill">
                  <span className="dictionary-pill-text">{word}</span>
                  <button
                    type="button"
                    className="dictionary-pill-close"
                    onClick={() => handleRemove(word)}
                    data-tooltip={`Remove "${word}" from dictionary`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="dictionary-empty">
            No custom words in spelling dictionary.
          </div>
        )}
      </div>
    </OverlayDialog>
  );
}
