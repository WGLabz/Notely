import { useState, useRef, useEffect } from "react";
import { GitCommit, X, FilePlus2, FileEdit, FileMinus2, FileQuestion } from "lucide-react";
import OverlayDialog from "./OverlayDialog";
import AppButton from "./AppButton";

const MAX_MESSAGE_LENGTH = 72;

/**
 * GitCommitDialog — compact commit dialog.
 * User writes a message and picks which files to stage.
 *
 * Props:
 *  open         — bool
 *  onClose      — () => void
 *  onCommit     — ({ message, filePaths }) => Promise<void>
 *  stagedFiles  — [{ path, status }] — pre-selected files from git status
 *  _workspacePath — string
 *  currentFilePath — string|null — pre-select the active note's file
 */
export function GitCommitDialog({
  open,
  onClose,
  onCommit,
  stagedFiles = [],
  _workspacePath,
  currentFilePath = null,
}) {
  const [message, setMessage] = useState("");
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState(null);
  const messageRef = useRef(null);

  // Pre-select current file first, then all modified, on open
  useEffect(() => {
    if (!open) return;
    setMessage("");
    setError(null);
    setCommitting(false);

    if (stagedFiles.length === 0) {
      setSelectedPaths([]);
      return;
    }

    // Pre-select: current file (if in list) first, then all
    const allPaths = stagedFiles.map((f) => f.path);
    setSelectedPaths(allPaths);
  }, [open, stagedFiles, currentFilePath]);

  function togglePath(filePath) {
    setSelectedPaths((prev) =>
      prev.includes(filePath) ? prev.filter((p) => p !== filePath) : [...prev, filePath]
    );
  }

  async function handleCommit() {
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Commit message is required.");
      return;
    }
    if (selectedPaths.length === 0) {
      setError("Select at least one file to commit.");
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      await onCommit({ message: trimmed, filePaths: selectedPaths });
      setMessage("");
      onClose?.();
    } catch (err) {
      setError(err?.message || "Commit failed.");
    } finally {
      setCommitting(false);
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleCommit();
    }
  }

  const charLeft = MAX_MESSAGE_LENGTH - message.length;
  const isOverLimit = charLeft < 0;
  const canCommit = message.trim().length > 0 && selectedPaths.length > 0 && !committing;

  return (
    <OverlayDialog
      open={open}
      onClose={onClose}
      ariaLabel="Commit changes"
      cardClassName="git-commit-dialog"
    >
      <div className="git-commit-dialog__header">
        <div className="git-commit-dialog__title-row">
          <GitCommit size={16} aria-hidden="true" />
          <h2 className="git-commit-dialog__title">Commit Changes</h2>
        </div>
        <button
          type="button"
          className="icon-button git-commit-dialog__close"
          onClick={onClose}
          aria-label="Close commit dialog"
        >
          <X size={16} />
        </button>
      </div>

      <div className="git-commit-dialog__body">
        {stagedFiles.length === 0 ? (
          <p className="git-commit-dialog__empty">
            No changed files to commit. Save your notes first.
          </p>
        ) : (
          <>
            <fieldset className="git-commit-dialog__files">
              <legend className="git-commit-dialog__files-label">Files to commit</legend>
              {stagedFiles.map((f) => (
                <label key={f.path} className="git-commit-dialog__file-row">
                  <input
                    type="checkbox"
                    className="git-commit-dialog__file-checkbox"
                    checked={selectedPaths.includes(f.path)}
                    onChange={() => togglePath(f.path)}
                    disabled={committing}
                  />
                  {(() => {
                    const status = f.status || "M";
                    if (status === "A") return <FilePlus2 size={14} className="git-file-status--a" title="Added" style={{ minWidth: "14px" }} />;
                    if (status === "D") return <FileMinus2 size={14} className="git-file-status--d" title="Deleted" style={{ minWidth: "14px" }} />;
                    if (status === "?" || status === "U") return <FileQuestion size={14} className="git-file-status--u" title="Untracked" style={{ minWidth: "14px" }} />;
                    return <FileEdit size={14} className="git-file-status--m" title="Modified" style={{ minWidth: "14px" }} />;
                  })()}
                  <span className="git-commit-dialog__file-path" title={f.path}>
                    {f.path}
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="git-commit-dialog__message-area">
              <label className="git-commit-dialog__message-label" htmlFor="git-commit-message">
                Commit message
                <span className={`git-commit-dialog__char-count${isOverLimit ? " error" : charLeft < 10 ? " warn" : ""}`}>
                  {isOverLimit ? `${Math.abs(charLeft)} over limit` : `${charLeft} remaining`}
                </span>
              </label>
              <textarea
                id="git-commit-message"
                ref={messageRef}
                className={`git-commit-dialog__message-input${isOverLimit ? " error" : ""}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your changes…"
                rows={3}
                disabled={committing}
                autoFocus
                aria-describedby={error ? "git-commit-error" : undefined}
              />
              <span className="git-commit-dialog__hint">Ctrl+Enter to commit</span>
            </div>

            {error && (
              <p id="git-commit-error" className="git-commit-dialog__error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>

      <div className="git-commit-dialog__footer">
        <AppButton variant="small" onClick={onClose} disabled={committing}>
          Cancel
        </AppButton>
        <AppButton
          variant="primary"
          onClick={handleCommit}
          disabled={!canCommit || stagedFiles.length === 0}
          aria-busy={committing}
        >
          <GitCommit size={14} />
          {committing ? "Committing…" : "Commit"}
        </AppButton>
      </div>
    </OverlayDialog>
  );
}

export default GitCommitDialog;
