import { useState } from "react";
import {
  GitCommit,
  GitBranch,
  Tag,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
  GitCompare,
  GitBranchPlus,
} from "lucide-react";
import AppButton from "./AppButton";

function formatRelativeDate(isoDate) {
  if (!isoDate) return "";
  try {
    const date = new Date(isoDate);
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  } catch {
    return "";
  }
}

function formatAbsoluteDate(isoDate) {
  if (!isoDate) return "";
  try {
    return new Date(isoDate).toLocaleString();
  } catch {
    return "";
  }
}

function CommitItem({
  commit,
  onCompare,
  onRestore,
  onCreateBranch,
  onCreateTag,
  selected,
  onSelect,
  compareMode,
  compareA,
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCompareA = compareA === commit.hash;

  function handleCopy() {
    try {
      navigator.clipboard.writeText(commit.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore
    }
  }

  return (
    <div
      className={`git-commit-item${selected ? " git-commit-item--selected" : ""}${isCompareA ? " git-commit-item--compare-a" : ""}`}
      role={compareMode ? "button" : undefined}
      tabIndex={compareMode ? 0 : undefined}
      onClick={compareMode ? () => onSelect?.(commit.hash) : undefined}
      onKeyDown={compareMode ? (e) => { if (e.key === "Enter" || e.key === " ") onSelect?.(commit.hash); } : undefined}
      aria-pressed={compareMode ? selected : undefined}
    >
      <div className="git-commit-item__row">
        <span className="git-commit-item__icon" aria-hidden="true">
          <GitCommit size={14} />
        </span>

        <span
          className="git-commit-item__hash"
          title={commit.hash}
          aria-label={`Commit ${commit.shortHash}`}
        >
          {commit.shortHash || commit.hash?.slice(0, 7)}
        </span>

        <time
          className="git-commit-item__date"
          dateTime={commit.date}
          title={formatAbsoluteDate(commit.date)}
        >
          {formatRelativeDate(commit.date)}
        </time>

        <span className="git-commit-item__separator">·</span>

        <span className="git-commit-item__message" title={commit.message}>
          {commit.message}
        </span>

        <span className="git-commit-item__separator">·</span>

        <span className="git-commit-item__author">
          {commit.author}
        </span>

        {commit.branches?.length > 0 && commit.branches.map((b) => (
          <span key={b} className="git-commit-item__ref git-commit-item__ref--branch">
            <GitBranch size={12} />
            {b}
          </span>
        ))}

        {commit.tags?.length > 0 && commit.tags.map((t) => (
          <span key={t} className="git-commit-item__ref git-commit-item__ref--tag">
            <Tag size={12} />
            {t}
          </span>
        ))}

        {!compareMode && (
          <div className="git-commit-item__actions">
            {onCompare && (
              <AppButton
                variant="small"
                onClick={(e) => { e.stopPropagation(); onCompare(commit); }}
                data-tooltip="Compare with another commit"
                aria-label="Compare"
              >
                <GitCompare size={12} />
                Compare
              </AppButton>
            )}
            {onRestore && (
              <AppButton
                variant="small"
                onClick={(e) => { e.stopPropagation(); onRestore(commit); }}
                data-tooltip="Restore this version (creates a new commit)"
                aria-label="Restore"
              >
                <RotateCcw size={12} />
                Restore
              </AppButton>
            )}
            {onCreateBranch && (
              <AppButton
                variant="small"
                onClick={(e) => { e.stopPropagation(); onCreateBranch(commit); }}
                data-tooltip="Create a branch from this commit"
                aria-label="Branch from here"
              >
                <GitBranchPlus size={12} />
                Branch
              </AppButton>
            )}
            {onCreateTag && (
              <AppButton
                variant="small"
                onClick={(e) => { e.stopPropagation(); onCreateTag(commit); }}
                data-tooltip="Tag this commit"
                aria-label="Tag"
              >
                <Tag size={12} />
                Tag
              </AppButton>
            )}
            <AppButton
              variant="small"
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              data-tooltip={copied ? "Copied!" : "Copy hash"}
              aria-label="Copy hash"
            >
              <Copy size={12} />
              {copied ? "Copied" : "Hash"}
            </AppButton>
          </div>
        )}
      </div>

      {commit.files?.length > 0 && (
        <button
          type="button"
          className="git-commit-item__files-toggle"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{commit.files.length} file{commit.files.length === 1 ? "" : "s"} changed</span>
        </button>
      )}

      {expanded && commit.files?.length > 0 && (
        <ul className="git-commit-item__files-list" aria-label="Changed files">
          {commit.files.map((f) => (
            <li key={f.path} className={`git-commit-file git-commit-file--${(f.status || "M").toLowerCase()}`}>
              <span className="git-commit-file__status">{f.status || "M"}</span>
              <span className="git-commit-file__path">{f.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * GitCommitTimeline — reusable commit list with optional search, compare mode, and loading/empty states.
 *
 * Props:
 *  commits         — array of commit objects
 *  loading         — bool
 *  error           — string|null
 *  onCompare       — (commit) => void  — called when Compare clicked
 *  onRestore       — (commit) => void  — called when Restore clicked
 *  onCreateBranch  — (commit) => void
 *  onCreateTag     — (commit) => void
 *  compareMode     — bool — if true, items are selectable for diff comparison
 *  compareA        — hash string — the first selected commit (highlighted differently)
 *  onSelectCommit  — (hash) => void — called in compareMode on click
 *  emptyMessage    — string — custom message when no commits
 */
export function GitCommitTimeline({
  commits = [],
  loading = false,
  error = null,
  onCompare,
  onRestore,
  onCreateBranch,
  onCreateTag,
  compareMode = false,
  compareA = null,
  onSelectCommit,
  emptyMessage = "No commits yet.",
  searchable = false,
}) {
  const [query, setQuery] = useState("");
  const [selectedHash, setSelectedHash] = useState(null);

  const filtered = searchable && query.trim()
    ? commits.filter((c) =>
        c.message?.toLowerCase().includes(query.toLowerCase()) ||
        c.author?.toLowerCase().includes(query.toLowerCase()) ||
        c.shortHash?.includes(query) ||
        c.hash?.includes(query)
      )
    : commits;

  if (loading) {
    return (
      <div className="git-timeline-empty" aria-live="polite">
        <span className="git-timeline-spinner" aria-label="Loading commits" />
        <span>Loading history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="git-timeline-empty git-timeline-empty--error" role="alert">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="git-commit-timeline">
      {searchable && (
        <div className="git-timeline-search">
          <input
            type="search"
            className="git-timeline-search__input"
            placeholder="Search commits, authors, hashes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search commits"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="git-timeline-empty">
          <GitCommit size={20} className="git-timeline-empty__icon" aria-hidden="true" />
          <p className="git-timeline-empty__text">
            {query ? `No commits matching "${query}".` : emptyMessage}
          </p>
        </div>
      ) : (
        <div className="git-timeline-list" role={compareMode ? "listbox" : "list"} aria-label="Commit history">
          {filtered.map((commit) => (
            <CommitItem
              key={commit.hash}
              commit={commit}
              onCompare={onCompare}
              onRestore={onRestore}
              onCreateBranch={onCreateBranch}
              onCreateTag={onCreateTag}
              compareMode={compareMode}
              compareA={compareA}
              selected={compareMode && selectedHash === commit.hash}
              onSelect={(hash) => {
                setSelectedHash(hash);
                onSelectCommit?.(hash);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default GitCommitTimeline;
