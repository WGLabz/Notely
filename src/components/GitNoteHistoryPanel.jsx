import { useState, useEffect, useCallback } from "react";
import { GitBranch, GitCommit, X, GitCompare } from "lucide-react";
import OverlayDialog from "./OverlayDialog";
import AppButton from "./AppButton";
import { GitCommitTimeline } from "./GitCommitTimeline";
import { GitDiffViewer } from "./GitDiffViewer";
import {
  gitGetLog,
  gitGetFileAtCommit,
  gitRestoreFileAtCommit,
  gitGetCommitFiles,
} from "../services/electronService";

/**
 * GitNoteHistoryPanel — replaces the legacy version history popover in DocumentDetail.
 * Shows the git commit history for the current note (filtered by filePath).
 *
 * Props:
 *  open            — bool
 *  onClose         — () => void
 *  filePath        — string: absolute path to the current note
 *  workspacePath   — string: workspace root (or repo root)
 *  branch          — string: current branch name
 *  onNotify        — (message, type) => void
 *  onRestored      — () => void: called after successful restore (to reload the document)
 */
export function GitNoteHistoryPanel({
  open,
  onClose,
  filePath,
  workspacePath,
  branch = "",
  onNotify,
  onRestored,
}) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Diff / compare state
  const [diffOpen, setDiffOpen] = useState(false);
  const [compareA, setCompareA] = useState(null); // older commit
  const [compareB, setCompareB] = useState(null); // newer commit
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState(null);
  const [contentA, setContentA] = useState("");
  const [contentB, setContentB] = useState("");

  // Restore state
  const [restoring, setRestoring] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!filePath || !workspacePath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await gitGetLog({ workspacePath, filePath, limit: 200 });
      if (result?.ok) {
        // Enrich commits with their changed files
        const enriched = await Promise.all(
          (result.data || []).map(async (c) => {
            try {
              const fileResult = await gitGetCommitFiles({ workspacePath, commitHash: c.hash });
              return { ...c, files: fileResult?.ok ? fileResult.data : [] };
            } catch {
              return c;
            }
          })
        );
        setCommits(enriched);
      } else {
        setError(result?.error || "Failed to load history.");
      }
    } catch (err) {
      setError(err?.message || "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, [filePath, workspacePath]);

  useEffect(() => {
    if (open) {
      loadHistory();
      setDiffOpen(false);
      setCompareA(null);
      setCompareB(null);
    }
  }, [open, loadHistory]);

  async function handleCompare(commit) {
    // If compareA not set, set it; otherwise set compareB and open diff
    if (!compareA) {
      setCompareA(commit);
      onNotify?.("Select another commit to compare with.", "info");
      return;
    }

    if (compareA.hash === commit.hash) {
      setCompareA(null);
      return;
    }

    // Determine older/newer by index in commits array
    const idxA = commits.findIndex((c) => c.hash === compareA.hash);
    const idxB = commits.findIndex((c) => c.hash === commit.hash);

    const older = idxA > idxB ? compareA : commit; // higher index = older
    const newer = idxA > idxB ? commit : compareA;

    setCompareA(older);
    setCompareB(newer);
    setDiffOpen(true);
    setDiffLoading(true);
    setDiffError(null);
    setContentA("");
    setContentB("");

    try {
      const [resultA, resultB] = await Promise.all([
        gitGetFileAtCommit({ workspacePath, commitHash: older.hash, filePath }),
        gitGetFileAtCommit({ workspacePath, commitHash: newer.hash, filePath }),
      ]);

      if (!resultA?.ok) throw new Error(resultA?.error || "Failed to load version.");
      if (!resultB?.ok) throw new Error(resultB?.error || "Failed to load version.");

      setContentA(resultA.data);
      setContentB(resultB.data);
    } catch (err) {
      setDiffError(err?.message || "Failed to load diff.");
    } finally {
      setDiffLoading(false);
    }
  }

  async function handleRestore(commit) {
    if (!filePath || !workspacePath) return;
    setRestoring(true);

    try {
      const result = await gitRestoreFileAtCommit({
        workspacePath,
        commitHash: commit.hash,
        filePath,
      });

      if (!result?.ok) {
        onNotify?.(result?.error || "Restore failed.", "error");
        return;
      }

      onNotify?.(`Restored to ${commit.shortHash}: "${commit.message}"`, "success");
      onRestored?.();
      onClose?.();
    } catch (err) {
      onNotify?.(err?.message || "Restore failed.", "error");
    } finally {
      setRestoring(false);
    }
  }

  function closeDiff() {
    setDiffOpen(false);
    setCompareA(null);
    setCompareB(null);
    setContentA("");
    setContentB("");
  }

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : "Note";
  const commitCount = commits.length;

  return (
    <OverlayDialog
      open={open}
      onClose={onClose}
      ariaLabel={`Version history for ${fileName}`}
      overlayClassName="git-history-overlay"
      cardClassName="git-history-panel"
    >
      <div className="git-history-panel__header">
        <div className="git-history-panel__title-row">
          <GitCommit size={16} aria-hidden="true" />
          <h2 className="git-history-panel__title">
            History
            <span className="git-history-panel__filename">{fileName}</span>
          </h2>
        </div>

        <div className="git-history-panel__header-meta">
          {branch && (
            <span className="git-history-panel__branch" aria-label={`Current branch: ${branch}`}>
              <GitBranch size={12} aria-hidden="true" />
              {branch}
            </span>
          )}
          {!loading && commitCount > 0 && (
            <span className="git-history-panel__count" aria-label={`${commitCount} commits`}>
              {commitCount} commit{commitCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <button
          type="button"
          className="icon-button git-history-panel__close"
          onClick={onClose}
          aria-label="Close history panel"
          disabled={restoring}
        >
          <X size={16} />
        </button>
      </div>

      {compareA && !diffOpen && (
        <div className="git-history-panel__compare-hint" role="status">
          <GitCompare size={14} aria-hidden="true" />
          <span>
            <strong>{compareA.shortHash}</strong> selected — click another commit to compare.
          </span>
          <button
            type="button"
            className="small-button"
            onClick={() => setCompareA(null)}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="git-history-panel__body">
        {diffOpen ? (
          <div className="git-history-panel__diff-view">
            <div className="git-history-panel__diff-toolbar">
              <AppButton variant="small" onClick={closeDiff}>
                ← Back to History
              </AppButton>
            </div>
            <GitDiffViewer
              latestContent={contentB}
              previousContent={contentA}
              fromLabel={compareA ? `${compareA.shortHash} · ${compareA.message?.slice(0, 40)}` : "Previous"}
              toLabel={compareB ? `${compareB.shortHash} · ${compareB.message?.slice(0, 40)}` : "Newer"}
              loading={diffLoading}
              error={diffError}
            />
          </div>
        ) : (
          <GitCommitTimeline
            commits={commits}
            loading={loading}
            error={error}
            onCompare={handleCompare}
            onRestore={handleRestore}
            compareA={compareA?.hash}
            emptyMessage="No commits for this note yet. Make your first commit using Version Control."
            searchable={commits.length > 10}
          />
        )}
      </div>

      {restoring && (
        <div className="git-history-panel__restoring" role="status" aria-live="polite">
          Restoring…
        </div>
      )}
    </OverlayDialog>
  );
}

export default GitNoteHistoryPanel;
