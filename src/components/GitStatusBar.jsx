import { GitBranch } from "lucide-react";

/**
 * GitStatusBar — shown in the bottom terminal-status-bar right section.
 * Replaces the three legacy git pills (branch span, gitignore span, toggle button).
 * Clicking opens the Version Control page.
 */
export function GitStatusBar({ gitState, onClick }) {
  const { gitAvailable, isRepo, branch, pendingCount, loading } = gitState || {};

  if (loading) {
    return (
      <button
        type="button"
        className="terminal-meta-pill git-status-bar git-status-bar--loading"
        disabled
        aria-label="Git loading"
      >
        <GitBranch size={12} />
        <span>Git…</span>
      </button>
    );
  }

  if (!gitAvailable) {
    return (
      <button
        type="button"
        className="terminal-meta-pill git-status-bar git-status-bar--warn"
        onClick={onClick}
        data-tooltip="Git not detected — click to install"
        aria-label="Git not detected"
      >
        <GitBranch size={12} />
        <span>Git not found</span>
      </button>
    );
  }

  if (!isRepo) {
    return (
      <button
        type="button"
        className="terminal-meta-pill git-status-bar git-status-bar--warn"
        onClick={onClick}
        data-tooltip="Workspace is not a Git repository — click to initialize"
        aria-label="Not a Git repository"
      >
        <GitBranch size={12} />
        <span>No repo</span>
      </button>
    );
  }

  const hasChanges = Number(pendingCount) > 0;

  return (
    <button
      type="button"
      className={`terminal-meta-pill git-status-bar${hasChanges ? " git-status-bar--pending" : " git-status-bar--clean"}`}
      onClick={onClick}
      data-tooltip={
        hasChanges
          ? `${pendingCount} uncommitted change${pendingCount === 1 ? "" : "s"} — click to open Version Control`
          : `Branch: ${branch || "unknown"} — click to open Version Control`
      }
      aria-label={`Git: ${branch || "unknown"}${hasChanges ? `, ${pendingCount} changes` : ""}`}
    >
      <GitBranch size={12} />
      <span className="git-status-bar__branch">{branch || "unknown"}</span>
      {hasChanges && (
        <span className="git-status-bar__badge" aria-hidden="true">
          {pendingCount}
        </span>
      )}
    </button>
  );
}

export default GitStatusBar;
