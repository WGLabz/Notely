import { useState, useEffect, useCallback, useMemo } from "react";
import {
  GitBranch,
  GitCommit,
  GitCompare,
  Tag,
  Cloud,
  Settings,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
  Upload,
  Download,
  CornerDownLeft,
  Layers,
} from "lucide-react";
import AppButton from "./AppButton";
import AppInput from "./AppInput";
import { GitCommitTimeline } from "./GitCommitTimeline";
import { GitDiffViewer } from "./GitDiffViewer";
import { GitCommitDialog } from "./GitCommitDialog";
import OverlayDialog from "./OverlayDialog";
import {
  gitDetect,
  gitGetRepoInfo,
  gitInitRepo,
  gitGetStatus,
  gitGetLog,
  gitCommit,
  gitGetFileAtCommit,
  gitListBranches,
  gitCreateBranch,
  gitDeleteBranch,
  gitSwitchBranch,
  gitListTags,
  gitCreateTag,
  gitDeleteTag,
  gitStashList,
  gitStashPush,
  gitStashPop,
  gitStashDrop,
  gitListRemotes,
  gitAddRemote,
  gitRemoveRemote,
  gitPush,
  gitPull,
  gitFetch,
  gitGetCommitFiles,
} from "../services/electronService";

// ── Tab IDs ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "status", label: "Status", icon: Check },
  { id: "history", label: "History", icon: GitCommit },
  { id: "compare", label: "Compare", icon: GitCompare },
  { id: "branches", label: "Branches", icon: GitBranch },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "stashes", label: "Stashes", icon: Layers },
  { id: "remotes", label: "Remotes", icon: Cloud },
  { id: "settings", label: "Settings", icon: Settings },
];

// ── Empty states ──────────────────────────────────────────────────────────────

function NoGitState({ _onInstallLink }) {
  return (
    <div className="git-vc-empty">
      <AlertTriangle size={20} className="git-vc-empty__icon git-vc-empty__icon--warn" aria-hidden="true" />
      <h2 className="git-vc-empty__title">Git not detected</h2>
      <p className="git-vc-empty__desc">
        Git is not installed or not found on your system PATH.
        Version control requires Git to be installed.
      </p>
      <AppButton
        variant="primary"
        onClick={() => window.open("https://git-scm.com/download/win", "_blank")}
        className="git-vc-empty__action"
      >
        <ExternalLink size={14} />
        Install Git for Windows
      </AppButton>
    </div>
  );
}

function NoRepoState({ _workspacePath, onInit, initializing }) {
  return (
    <div className="git-vc-empty">
      <GitBranch size={20} className="git-vc-empty__icon" aria-hidden="true" />
      <h2 className="git-vc-empty__title">Not a Git repository</h2>
      <p className="git-vc-empty__desc">
        This workspace is not initialized as a Git repository.
        Initialize it to start tracking changes with version control.
      </p>
      <AppButton
        variant="primary"
        onClick={onInit}
        disabled={initializing}
        className="git-vc-empty__action"
        aria-busy={initializing}
      >
        <GitCommit size={14} />
        {initializing ? "Initializing…" : "Initialize Repository"}
      </AppButton>
    </div>
  );
}

// ── Status Tab ────────────────────────────────────────────────────────────────

function StatusTab({ status, workspacePath, onRefresh, onNotify, onCommitSuccess }) {
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const { files = [], branch = "", ahead = 0, behind = 0 } = status || {};

  const modified = files.filter((f) => f.status !== "untracked");
  const untracked = files.filter((f) => f.status === "untracked");

  async function handleCommit(payload) {
    const result = await gitCommit({ workspacePath, ...payload });
    if (!result?.ok) throw new Error(result?.error || "Commit failed.");
    onNotify?.("Committed successfully.", "success");
    onCommitSuccess?.();
    onRefresh?.();
  }

  return (
    <div className="git-vc-status">
      <div className="git-vc-status__header">
        <div className="git-vc-status__branch">
          <GitBranch size={16} aria-hidden="true" />
          <strong>{branch || "unknown"}</strong>
          {(ahead > 0 || behind > 0) && (
            <span className="git-vc-status__sync">
              {ahead > 0 && <span className="git-vc-status__ahead">{ahead}↑</span>}
              {behind > 0 && <span className="git-vc-status__behind">{behind}↓</span>}
            </span>
          )}
        </div>
        <AppButton variant="small" onClick={onRefresh} data-tooltip="Refresh status">
          <RefreshCw size={14} />
          Refresh
        </AppButton>
      </div>

      {files.length === 0 ? (
        <div className="git-vc-empty git-vc-empty--inline">
          <Check size={20} className="git-vc-empty__icon git-vc-empty__icon--success" />
          <p>Working tree is clean. No changes to commit.</p>
        </div>
      ) : (
        <div className="git-vc-status__body">
          {modified.length > 0 && (
            <div className="git-vc-status__group">
              <h3 className="git-vc-status__group-title">Changes ({modified.length})</h3>
              <ul className="git-vc-file-list" aria-label="Changed files">
                {modified.map((f) => (
                  <li key={f.path} className={`git-vc-file-row git-vc-file-row--${(f.status || "M").toLowerCase()}`}>
                    <span className="git-vc-file-row__status" aria-label={`Status: ${f.status}`}>{f.status || "M"}</span>
                    <span className="git-vc-file-row__path">{f.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {untracked.length > 0 && (
            <div className="git-vc-status__group">
              <h3 className="git-vc-status__group-title">Untracked ({untracked.length})</h3>
              <ul className="git-vc-file-list" aria-label="Untracked files">
                {untracked.map((f) => (
                  <li key={f.path} className="git-vc-file-row git-vc-file-row--untracked">
                    <span className="git-vc-file-row__status" aria-label="Untracked">?</span>
                    <span className="git-vc-file-row__path">{f.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}

      <GitCommitDialog
        open={commitDialogOpen}
        onClose={() => setCommitDialogOpen(false)}
        onCommit={handleCommit}
        stagedFiles={files}
        workspacePath={workspacePath}
      />
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab({ commits, loading, error, _workspacePath, onNotify, _onRefresh, onCreateTag }) {
  async function handleCompare(_commit) {
    onNotify?.("Switch to the Compare tab to compare commits.", "info");
  }

  return (
    <div className="git-vc-history">
      <GitCommitTimeline
        commits={commits}
        loading={loading}
        error={error}
        onCompare={handleCompare}
        onCreateTag={onCreateTag}
        searchable
        emptyMessage="No commits yet. Use the Status tab to make your first commit."
      />
    </div>
  );
}

// ── Compare Tab ───────────────────────────────────────────────────────────────

function CompareTab({ _commits, workspacePath, currentFilePath, documents = [], repoRoot }) {
  const [hashA, setHashA] = useState("");
  const [hashB, setHashB] = useState("");
  const [filePathFilter, setFilePathFilter] = useState("");
  const [fileCommits, setFileCommits] = useState([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [contentA, setContentA] = useState("");
  const [contentB, setContentB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [compared, setCompared] = useState(false);

  // List of workspace markdown documents relative to repoRoot
  const workspaceFiles = useMemo(() => {
    const root = (repoRoot || workspacePath).replace(/\\/g, "/").replace(/\/$/, "");
    return documents
      .filter((doc) => doc.entryType === "file" && doc.filePath?.endsWith(".md"))
      .map((doc) => {
        const target = doc.filePath.replace(/\\/g, "/");
        const rel = target.startsWith(root)
          ? target.slice(root.length).replace(/^\//, "")
          : target;
        return {
          absolutePath: doc.filePath,
          relativePath: rel,
        };
      })
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [documents, repoRoot, workspacePath]);

  // Set initial selected file if currentFilePath is provided
  useEffect(() => {
    if (currentFilePath && workspaceFiles.length > 0) {
      const found = workspaceFiles.find(
        (f) => f.absolutePath.toLowerCase() === currentFilePath.toLowerCase()
      );
      if (found) {
        setFilePathFilter(found.absolutePath);
      } else {
        setFilePathFilter(workspaceFiles[0].absolutePath);
      }
    } else if (workspaceFiles.length > 0 && !filePathFilter) {
      setFilePathFilter(workspaceFiles[0].absolutePath);
    }
  }, [currentFilePath, workspaceFiles, filePathFilter]);

  // Load commits when selected file changes
  useEffect(() => {
    if (!filePathFilter) {
      setFileCommits([]);
      return;
    }

    let active = true;
    setLoadingCommits(true);
    setError(null);
    setCompared(false);

    gitGetLog({ workspacePath, filePath: filePathFilter, limit: 100 })
      .then((res) => {
        if (!active) return;
        if (res?.ok) {
          const list = res.data || [];
          setFileCommits(list);
          if (list.length > 0) {
            setHashA(list[0]?.hash || "");
            setHashB("WORKING");
          } else {
            setHashA("");
            setHashB("");
          }
        } else {
          setFileCommits([]);
          setHashA("");
          setHashB("");
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || "Failed to load file history.");
      })
      .finally(() => {
        if (active) setLoadingCommits(false);
      });

    return () => {
      active = false;
    };
  }, [filePathFilter, workspacePath]);

  async function handleCompare() {
    if (!hashA || !hashB || !filePathFilter.trim()) return;
    setLoading(true);
    setError(null);
    setCompared(false);

    try {
      const fp = filePathFilter.trim();
      const [rA, rB] = await Promise.all([
        gitGetFileAtCommit({ workspacePath, commitHash: hashA, filePath: fp }),
        gitGetFileAtCommit({ workspacePath, commitHash: hashB, filePath: fp }),
      ]);

      if (!rA?.ok) throw new Error(rA?.error || "Failed to load version A.");
      if (!rB?.ok) throw new Error(rB?.error || "Failed to load version B.");

      setContentA(rA.data);
      setContentB(rB.data);
      setCompared(true);
    } catch (err) {
      setError(err?.message || "Failed to compare.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="git-vc-compare">
      <div className="git-vc-compare__controls">
        <div className="git-vc-compare__file-filter" style={{ flex: 1.2 }}>
          <label className="git-vc-compare__label" htmlFor="compare-file">Note</label>
          <select
            id="compare-file"
            className="git-vc-compare__input"
            value={filePathFilter}
            onChange={(e) => setFilePathFilter(e.target.value)}
          >
            {workspaceFiles.map((file) => (
              <option key={file.absolutePath} value={file.absolutePath}>
                {file.relativePath}
              </option>
            ))}
          </select>
        </div>

        <div className="git-vc-compare__picker">
          <label className="git-vc-compare__label" htmlFor="compare-hash-a">From (older)</label>
          <select
            id="compare-hash-a"
            className="git-vc-compare__input"
            value={hashA}
            onChange={(e) => setHashA(e.target.value)}
            disabled={loadingCommits || fileCommits.length === 0}
          >
            {loadingCommits ? (
              <option value="">Loading history...</option>
            ) : fileCommits.length === 0 ? (
              <option value="">No history for this file</option>
            ) : (
              <>
                <option value="WORKING">Working Directory (Uncommitted changes)</option>
                {fileCommits.map((c) => (
                  <option key={c.hash} value={c.hash}>
                    {c.shortHash} — {c.message?.slice(0, 50)}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        <span className="git-vc-compare__arrow" aria-hidden="true">→</span>

        <div className="git-vc-compare__picker">
          <label className="git-vc-compare__label" htmlFor="compare-hash-b">To (newer)</label>
          <select
            id="compare-hash-b"
            className="git-vc-compare__input"
            value={hashB}
            onChange={(e) => setHashB(e.target.value)}
            disabled={loadingCommits || fileCommits.length === 0}
          >
            {loadingCommits ? (
              <option value="">Loading history...</option>
            ) : fileCommits.length === 0 ? (
              <option value="">No history for this file</option>
            ) : (
              <>
                <option value="WORKING">Working Directory (Uncommitted changes)</option>
                {fileCommits.map((c) => (
                  <option key={c.hash} value={c.hash}>
                    {c.shortHash} — {c.message?.slice(0, 50)}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        <AppButton
          variant="primary"
          onClick={handleCompare}
          disabled={!hashA || !hashB || !filePathFilter.trim() || loading || loadingCommits}
          aria-busy={loading}
          style={{ height: "32px" }}
        >
          <GitCompare size={14} />
          {loading ? "Comparing…" : "Compare"}
        </AppButton>

        {error && <p className="git-vc-error" role="alert" style={{ color: "var(--status-danger-text)", margin: "8px 0 0", width: "100%" }}>{error}</p>}
      </div>

      {compared && (
        <GitDiffViewer
          latestContent={contentB}
          previousContent={contentA}
          fromLabel={hashA}
          toLabel={hashB}
          loading={loading}
          error={error}
          basePath={repoRoot}
        />
      )}
    </div>
  );
}

// ── Branches Tab ──────────────────────────────────────────────────────────────

function BranchesTab({ workspacePath, onNotify, onRefresh, _currentBranch }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [, setError] = useState(null);

  const loadBranches = useCallback(async () => {
    setLoading(true);
    try {
      const result = await gitListBranches(workspacePath);
      if (result?.ok) setBranches(result.data?.branches || []);
      else setError(result?.error);
    } catch (err) {
      setError(err?.message);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const result = await gitCreateBranch({ workspacePath, name: newName.trim() });
    setCreating(false);
    if (result?.ok) {
      onNotify?.(`Branch "${newName.trim()}" created.`, "success");
      setNewName("");
      loadBranches();
    } else {
      onNotify?.(result?.error || "Failed to create branch.", "error");
    }
  }

  async function handleSwitch(name) {
    const result = await gitSwitchBranch({ workspacePath, name });
    if (result?.ok) {
      onNotify?.(`Switched to branch "${name}".`, "success");
      onRefresh?.();
      loadBranches();
    } else {
      onNotify?.(result?.error || "Failed to switch branch.", "error");
    }
  }

  async function handleDelete(name) {
    if (!window.confirm(`Delete branch "${name}"? This cannot be undone.`)) return;
    const result = await gitDeleteBranch({ workspacePath, name });
    if (result?.ok) {
      onNotify?.(`Branch "${name}" deleted.`, "success");
      loadBranches();
    } else {
      onNotify?.(result?.error || "Failed to delete branch.", "error");
    }
  }

  return (
    <div className="git-vc-branches">
      <div className="git-vc-branches__create">
        <h3 className="git-vc-section-title">Create branch</h3>
        <div className="git-vc-branches__create-row">
          <AppInput
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="New branch name"
            aria-label="New branch name"
          />
          <AppButton variant="primary" onClick={handleCreate} disabled={!newName.trim() || creating} aria-busy={creating}>
            <Plus size={14} />
            {creating ? "Creating…" : "Create"}
          </AppButton>
        </div>
      </div>

      <div className="git-vc-branches__list">
        <h3 className="git-vc-section-title">Branches</h3>
        {loading ? (
          <div className="git-vc-loading">Loading branches…</div>
        ) : (
          <ul className="git-vc-list" aria-label="Branches">
            {branches.filter((b) => !b.remote).map((b) => (
              <li key={b.name} className={`git-vc-list-item${b.current ? " git-vc-list-item--current" : ""}`}>
                <GitBranch size={14} aria-hidden="true" />
                <span className="git-vc-list-item__name">{b.name}</span>
                {b.current && <span className="git-vc-list-item__badge">current</span>}
                <div className="git-vc-list-item__actions">
                  {!b.current && (
                    <AppButton variant="small" onClick={() => handleSwitch(b.name)} data-tooltip={`Switch to ${b.name}`}>
                      <CornerDownLeft size={12} />
                      Switch
                    </AppButton>
                  )}
                  {!b.current && (
                    <AppButton variant="small" danger onClick={() => handleDelete(b.name)} data-tooltip={`Delete ${b.name}`}>
                      <Trash2 size={12} />
                    </AppButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Tags Tab ──────────────────────────────────────────────────────────────────

function TagsTab({ workspacePath, onNotify }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const result = await gitListTags(workspacePath);
      if (result?.ok) setTags(result.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { loadTags(); }, [loadTags]);

  async function handleCreate() {
    if (!newTagName.trim()) return;
    setCreating(true);
    const result = await gitCreateTag({ workspacePath, name: newTagName.trim() });
    setCreating(false);
    if (result?.ok) {
      onNotify?.(`Tag "${newTagName.trim()}" created.`, "success");
      setNewTagName("");
      loadTags();
    } else {
      onNotify?.(result?.error || "Failed to create tag.", "error");
    }
  }

  async function handleDelete(name) {
    if (!window.confirm(`Delete tag "${name}"?`)) return;
    const result = await gitDeleteTag({ workspacePath, name });
    if (result?.ok) {
      onNotify?.(`Tag "${name}" deleted.`, "success");
      loadTags();
    } else {
      onNotify?.(result?.error || "Failed to delete tag.", "error");
    }
  }

  return (
    <div className="git-vc-tags">
      <div className="git-vc-tags__create">
        <h3 className="git-vc-section-title">Create tag</h3>
        <div className="git-vc-tags__create-row">
          <AppInput
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="Tag name (e.g. v1.0)"
            aria-label="New tag name"
          />
          <AppButton variant="primary" onClick={handleCreate} disabled={!newTagName.trim() || creating} aria-busy={creating}>
            <Plus size={14} />
            {creating ? "Creating…" : "Tag HEAD"}
          </AppButton>
        </div>
      </div>

      <div className="git-vc-tags__list">
        <h3 className="git-vc-section-title">Tags ({tags.length})</h3>
        {loading ? (
          <div className="git-vc-loading">Loading tags…</div>
        ) : tags.length === 0 ? (
          <p className="git-vc-empty-inline">No tags yet.</p>
        ) : (
          <ul className="git-vc-list" aria-label="Tags">
            {tags.map((t) => (
              <li key={t.name} className="git-vc-list-item">
                <Tag size={14} aria-hidden="true" />
                <span className="git-vc-list-item__name">{t.name}</span>
                {t.hash && <span className="git-vc-list-item__meta">{t.hash.slice(0, 7)}</span>}
                {t.date && <span className="git-vc-list-item__meta">{new Date(t.date).toLocaleDateString()}</span>}
                <div className="git-vc-list-item__actions">
                  <AppButton variant="small" danger onClick={() => handleDelete(t.name)}>
                    <Trash2 size={12} />
                  </AppButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Stashes Tab ───────────────────────────────────────────────────────────────

function StashesTab({ workspacePath, onNotify }) {
  const [stashes, setStashes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stashMsg, setStashMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const loadStashes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await gitStashList(workspacePath);
      if (result?.ok) setStashes(result.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { loadStashes(); }, [loadStashes]);

  async function handlePush() {
    setSaving(true);
    const result = await gitStashPush({ workspacePath, message: stashMsg.trim() || null });
    setSaving(false);
    if (result?.ok) {
      onNotify?.("Changes stashed.", "success");
      setStashMsg("");
      loadStashes();
    } else {
      onNotify?.(result?.error || "Stash failed.", "error");
    }
  }

  async function handlePop(index) {
    const result = await gitStashPop({ workspacePath, index });
    if (result?.ok) {
      onNotify?.("Stash applied.", "success");
      loadStashes();
    } else {
      onNotify?.(result?.error || "Failed to apply stash.", "error");
    }
  }

  async function handleDrop(index, message) {
    if (!window.confirm(`Drop stash: "${message}"?`)) return;
    const result = await gitStashDrop({ workspacePath, index });
    if (result?.ok) {
      onNotify?.("Stash dropped.", "success");
      loadStashes();
    } else {
      onNotify?.(result?.error || "Failed to drop stash.", "error");
    }
  }

  return (
    <div className="git-vc-stashes">
      <div className="git-vc-stashes__push">
        <h3 className="git-vc-section-title">Stash changes</h3>
        <div className="git-vc-stashes__push-row">
          <AppInput
            type="text"
            value={stashMsg}
            onChange={(e) => setStashMsg(e.target.value)}
            placeholder="Stash message (optional)"
            aria-label="Stash message"
          />
          <AppButton variant="primary" onClick={handlePush} disabled={saving} aria-busy={saving}>
            <Layers size={14} />
            {saving ? "Stashing…" : "Stash"}
          </AppButton>
        </div>
      </div>

      <div className="git-vc-stashes__list">
        <h3 className="git-vc-section-title">Stashes ({stashes.length})</h3>
        {loading ? (
          <div className="git-vc-loading">Loading stashes…</div>
        ) : stashes.length === 0 ? (
          <p className="git-vc-empty-inline">No stashes.</p>
        ) : (
          <ul className="git-vc-list" aria-label="Stashes">
            {stashes.map((s) => (
              <li key={s.ref} className="git-vc-list-item">
                <Layers size={14} aria-hidden="true" />
                <span className="git-vc-list-item__name">{s.message}</span>
                {s.date && <span className="git-vc-list-item__meta">{new Date(s.date).toLocaleDateString()}</span>}
                <div className="git-vc-list-item__actions">
                  <AppButton variant="small" onClick={() => handlePop(s.index)} data-tooltip="Apply and remove stash">
                    <RotateCcw size={12} />
                    Pop
                  </AppButton>
                  <AppButton variant="small" danger onClick={() => handleDrop(s.index, s.message)}>
                    <Trash2 size={12} />
                  </AppButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Remotes Tab ───────────────────────────────────────────────────────────────

function RemotesTab({ workspacePath, onNotify, status }) {
  const [remotes, setRemotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("origin");
  const [newUrl, setNewUrl] = useState("");
  const [newToken, setNewToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const loadRemotes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await gitListRemotes(workspacePath);
      if (result?.ok) setRemotes(result.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { loadRemotes(); }, [loadRemotes]);

  async function handleAdd() {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    const result = await gitAddRemote({ workspacePath, name: newName.trim(), url: newUrl.trim() });
    setAdding(false);
    if (result?.ok) {
      onNotify?.(`Remote "${newName}" added.`, "success");
      setNewName("origin");
      setNewUrl("");
      setNewToken("");
      loadRemotes();
    } else {
      onNotify?.(result?.error || "Failed to add remote.", "error");
    }
  }

  async function handleRemove(name) {
    if (!window.confirm(`Remove remote "${name}"?`)) return;
    const result = await gitRemoveRemote({ workspacePath, name });
    if (result?.ok) {
      onNotify?.(`Remote "${name}" removed.`, "success");
      loadRemotes();
    } else {
      onNotify?.(result?.error || "Failed to remove remote.", "error");
    }
  }

  async function handleSync(remote, action) {
    setSyncBusy(true);
    const auth = newToken.trim() ? { type: "pat", token: newToken.trim() } : { type: "ssh" };
    try {
      let result;
      if (action === "push") {
        result = await gitPush({ workspacePath, remote: remote.name, auth });
      } else if (action === "pull") {
        result = await gitPull({ workspacePath, remote: remote.name, auth });
      } else {
        result = await gitFetch({ workspacePath, remote: remote.name, auth });
      }
      if (result?.ok) {
        onNotify?.(`${action.charAt(0).toUpperCase() + action.slice(1)} to "${remote.name}" succeeded.`, "success");
      } else {
        onNotify?.(result?.error || `${action} failed.`, "error");
      }
    } catch (err) {
      onNotify?.(err?.message || `${action} failed.`, "error");
    } finally {
      setSyncBusy(false);
    }
  }

  const { ahead = 0, behind = 0 } = status || {};

  return (
    <div className="git-vc-remotes">
      {remotes.length > 0 && (
        <div className="git-vc-remotes__sync">
          <h3 className="git-vc-section-title">Sync</h3>
          {(ahead > 0 || behind > 0) && (
            <p className="git-vc-remotes__sync-status">
              {ahead > 0 && <span className="git-vc-status__ahead">{ahead} commit{ahead === 1 ? "" : "s"} to push</span>}
              {behind > 0 && <span className="git- vc-status__behind">{behind} commit{behind === 1 ? "" : "s"} to pull</span>}
            </p>
          )}

          <div className="git-vc-remotes__pat-row">
            <label className="git-vc-remotes__pat-label" htmlFor="remote-pat">
              Personal Access Token (HTTPS, optional)
            </label>
            <AppInput
              id="remote-pat"
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="Leave blank for SSH or public repos"
              aria-label="Personal Access Token"
            />
            <span className="git-vc-remotes__pat-hint">
              Token is used only for this session and not stored.
            </span>
          </div>

          <div className="git-vc-remotes__sync-actions">
            {remotes.map((r) => (
              <div key={r.name} className="git-vc-remotes__sync-group">
                <span className="git-vc-remotes__sync-remote">{r.name}</span>
                <AppButton variant="primary" onClick={() => handleSync(r, "push")} disabled={syncBusy}>
                  <Upload size={14} />
                  Push
                </AppButton>
                <AppButton variant="small" onClick={() => handleSync(r, "pull")} disabled={syncBusy}>
                  <Download size={14} />
                  Pull
                </AppButton>
                <AppButton variant="small" onClick={() => handleSync(r, "fetch")} disabled={syncBusy}>
                  <RefreshCw size={14} />
                  Fetch
                </AppButton>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="git-vc-remotes__list">
        <h3 className="git-vc-section-title">Remotes</h3>
        {loading ? (
          <div className="git-vc-loading">Loading remotes…</div>
        ) : remotes.length === 0 ? (
          <p className="git-vc-empty-inline">No remotes configured.</p>
        ) : (
          <ul className="git-vc-list" aria-label="Remotes">
            {remotes.map((r) => (
              <li key={r.name} className="git-vc-list-item">
                <Cloud size={14} aria-hidden="true" />
                <span className="git-vc-list-item__name">{r.name}</span>
                <span className="git-vc-list-item__meta">{r.fetchUrl}</span>
                <div className="git-vc-list-item__actions">
                  <AppButton variant="small" danger onClick={() => handleRemove(r.name)}>
                    <Trash2 size={12} />
                  </AppButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="git-vc-remotes__add">
        <h3 className="git-vc-section-title">Add remote</h3>
        <div className="git-vc-remotes__add-fields">
          <AppInput
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Remote name (e.g. origin)"
            aria-label="Remote name"
          />
          <AppInput
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Remote URL (HTTPS or SSH)"
            aria-label="Remote URL"
          />
          <AppButton variant="primary" onClick={handleAdd} disabled={!newName.trim() || !newUrl.trim() || adding} aria-busy={adding}>
            <Plus size={14} />
            {adding ? "Adding…" : "Add Remote"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}



// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ _workspacePath }) {

  return (
    <div className="git-vc-settings">
      <h3 className="git-vc-section-title">Commit Identity</h3>
      <p className="git-vc-settings__desc">
        Git identity is read from your global git config (<code>~/.gitconfig</code>).
        Use the integrated terminal to set it:
      </p>
      <pre className="git-vc-settings__code">
        {`git config --global user.name "Your Name"
git config --global user.email "you@example.com"`}
      </pre>

      <h3 className="git-vc-section-title" style={{ marginTop: "var(--space-7)" }}>
        Gitignore
      </h3>
      <p className="git-vc-settings__desc">
        The &ldquo;Ignore App Data in Git&rdquo; toggle is in the <strong>Version Control</strong> menu bar.
        It controls whether <code>.notes-app/</code> is automatically excluded from your repository.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

/**
 * GitVersionControlPage — full-page version control interface.
 *
 * Props:
 *  workspacePath   — string
 *  onBack          — () => void
 *  onNotify        — (message, type) => void
 *  initialTab      — string (optional, defaults to "status")
 *  onGitStateChange — ({ branch, pendingCount }) => void — called on refresh for GitStatusBar
 */
export function GitVersionControlPage({
  workspacePath,
  onBack,
  onNotify,
  initialTab = "status",
  onGitStateChange,
  currentFilePath = null,
  documents = [],
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [gitAvailable, setGitAvailable] = useState(null); // null = checking
  const [isRepo, setIsRepo] = useState(null);
  const [repoRoot, setRepoRoot] = useState(null);
  const [initializing, setInitializing] = useState(false);
  const [status, setStatus] = useState(null);
  const [commits, setCommits] = useState([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState(null);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagCommit, setTagCommit] = useState(null);
  const [tagName, setTagName] = useState("");

  async function handleConfirmTag() {
    if (!tagCommit || !tagName.trim()) return;
    const targetPath = repoRoot || workspacePath;
    const result = await gitCreateTag({
      workspacePath: targetPath,
      name: tagName.trim(),
      commitHash: tagCommit.hash,
    });
    if (result?.ok) {
      onNotify?.(`Tag "${tagName.trim()}" created successfully.`, "success");
      setTagDialogOpen(false);
      setTagName("");
      setTagCommit(null);
      refreshCommits();
    } else {
      onNotify?.(result?.error || "Failed to create tag.", "error");
    }
  }

  const refreshStatus = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const result = await gitGetStatus(workspacePath);
      if (result?.ok) {
        setStatus(result.data);
        onGitStateChange?.({
          branch: result.data.branch,
          pendingCount: result.data.files.length,
          repoRoot: result.data.repoRoot,
        });
      }
    } catch { /* ignore */ }
  }, [workspacePath, onGitStateChange]);

  const refreshCommits = useCallback(async () => {
    if (!workspacePath) return;
    setCommitsLoading(true);
    setCommitsError(null);
    try {
      const result = await gitGetLog({ workspacePath, limit: 200 });
      if (result?.ok) {
        const enriched = await Promise.all(
          (result.data || []).map(async (c) => {
            try {
              const fileResult = await gitGetCommitFiles({ workspacePath, commitHash: c.hash });
              return { ...c, files: fileResult?.ok ? fileResult.data : [] };
            } catch { return c; }
          })
        );
        setCommits(enriched);
      } else {
        setCommitsError(result?.error || "Failed to load commits.");
      }
    } catch (err) {
      setCommitsError(err?.message);
    } finally {
      setCommitsLoading(false);
    }
  }, [workspacePath]);

  const checkGitAndRepo = useCallback(async () => {
    try {
      const detection = await gitDetect();
      if (!detection?.ok || !detection.data.available) {
        setGitAvailable(false);
        return;
      }
      setGitAvailable(true);

      const repoInfo = await gitGetRepoInfo(workspacePath);
      if (repoInfo?.ok) {
        setIsRepo(repoInfo.data.isRepo);
        setRepoRoot(repoInfo.data.repoRoot);

        if (repoInfo.data.isRepo) {
          refreshStatus();
          refreshCommits();
        }
      }
    } catch { /* ignore */ }
  }, [workspacePath, refreshStatus, refreshCommits]);

  useEffect(() => {
    checkGitAndRepo();
  }, [checkGitAndRepo]);

  async function handleInit() {
    setInitializing(true);
    try {
      const result = await gitInitRepo(workspacePath);
      if (result?.ok) {
        onNotify?.("Git repository initialized successfully.", "success");
        checkGitAndRepo();
      } else {
        onNotify?.(result?.error || "Initialization failed.", "error");
      }
    } catch (err) {
      onNotify?.(err?.message || "Initialization failed.", "error");
    } finally {
      setInitializing(false);
    }
  }

  async function handleGlobalCommit(payload) {
    const result = await gitCommit({ workspacePath, ...payload });
    if (!result?.ok) throw new Error(result?.error || "Commit failed.");
    onNotify?.("Committed successfully.", "success");
    refreshStatus();
    refreshCommits();
  }

  function handleRefresh() {
    refreshStatus();
    refreshCommits();
  }

  // Checking state
  if (gitAvailable === null) {
    return (
      <div className="git-vc-page" aria-label="Version Control">
        <div className="detail-topbar">
          <nav className="detail-breadcrumb" aria-label="Version control location">
            <span className="detail-breadcrumb-part">
              <button className="detail-breadcrumb-link" type="button" onClick={onBack}>Notes</button>
              <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
            </span>
            <span className="detail-breadcrumb-current">Version Control</span>
          </nav>
        </div>
        <div className="git-vc-checking" aria-live="polite">
          <span className="git-timeline-spinner" aria-label="Checking Git" />
          Checking for Git…
        </div>
      </div>
    );
  }

  return (
    <div className="git-vc-page" aria-label="Version Control">
      {/* Breadcrumb / Header — matched with DocumentDetail page header */}
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Version control location">
          <span className="detail-breadcrumb-part">
            <button className="detail-breadcrumb-link" type="button" onClick={onBack}>Notes</button>
            <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
          </span>
          <span className="detail-breadcrumb-current">Version Control</span>
        </nav>

        {isRepo && status?.branch && (
          <div className="panel-header__meta" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginRight: "var(--space-4)", fontSize: "var(--font-size-body-sm)" }}>
            <GitBranch size={14} aria-hidden="true" />
            <strong>{status.branch}</strong>
            {status.files?.length > 0 && (
              <span className="git-status-bar__badge">{status.files.length}</span>
            )}
          </div>
        )}

        <div className="detail-topbar-actions" style={{ display: "flex", gap: "var(--space-2)" }}>
          {isRepo && (
            <>
              <AppButton
                variant="small"
                onClick={() => setCommitDialogOpen(true)}
                data-tooltip="Commit changes (Ctrl+Shift+K)"
                aria-label="Commit"
              >
                <GitCommit size={14} />
                Commit
              </AppButton>
              <AppButton
                variant="small"
                onClick={handleRefresh}
                data-tooltip="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw size={14} />
              </AppButton>
            </>
          )}
        </div>
      </div>

      {/* Empty states */}
      {!gitAvailable && <NoGitState />}
      {gitAvailable && isRepo === false && (
        <NoRepoState
          workspacePath={workspacePath}
          onInit={handleInit}
          initializing={initializing}
        />
      )}

      {/* Full UI when repo exists */}
      {gitAvailable && isRepo && (
        <div className="git-vc-content">
          <div className="p2p-tab-shell">
            {/* Tab strip */}
            <div className="p2p-tab-bar" role="tablist" aria-label="Version control sections">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`git-tab-${id}`}
                  aria-controls={`git-panel-${id}`}
                  aria-selected={activeTab === id}
                  className={`p2p-tab-btn${activeTab === id ? " active" : ""}`}
                  onClick={() => setActiveTab(id)}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            <div
              className="p2p-tab-panel"
              id={`git-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`git-tab-${activeTab}`}
            >
            {activeTab === "status" && (
              <StatusTab
                status={status}
                workspacePath={workspacePath}
                onRefresh={handleRefresh}
                onNotify={onNotify}
                onCommitSuccess={handleRefresh}
              />
            )}
            {activeTab === "history" && (
              <HistoryTab
                commits={commits}
                loading={commitsLoading}
                error={commitsError}
                workspacePath={repoRoot}
                onNotify={onNotify}
                onRefresh={handleRefresh}
                onCreateTag={(commit) => {
                  setTagCommit(commit);
                  setTagName("");
                  setTagDialogOpen(true);
                }}
              />
            )}
            {activeTab === "compare" && (
              <CompareTab commits={commits} workspacePath={workspacePath} currentFilePath={currentFilePath} documents={documents} repoRoot={repoRoot} />
            )}
            {activeTab === "branches" && (
              <BranchesTab
                workspacePath={workspacePath}
                onNotify={onNotify}
                onRefresh={handleRefresh}
                currentBranch={status?.branch}
              />
            )}
            {activeTab === "tags" && (
              <TagsTab workspacePath={workspacePath} onNotify={onNotify} />
            )}
            {activeTab === "stashes" && (
              <StashesTab workspacePath={workspacePath} onNotify={onNotify} />
            )}
            {activeTab === "remotes" && (
              <RemotesTab
                workspacePath={workspacePath}
                onNotify={onNotify}
                status={status}
              />
            )}

            {activeTab === "settings" && (
              <SettingsTab workspacePath={workspacePath} />
            )}
          </div>
        </div>
      </div>
    )}

      {/* Global commit dialog (from header button or keyboard shortcut) */}
      {isRepo && (
        <GitCommitDialog
          open={commitDialogOpen}
          onClose={() => setCommitDialogOpen(false)}
          onCommit={handleGlobalCommit}
          stagedFiles={status?.files || []}
          workspacePath={workspacePath}
        />
      )}

      {/* Tag creation dialog */}
      {tagDialogOpen && tagCommit && (
        <OverlayDialog
          open={tagDialogOpen}
          onClose={() => {
            setTagDialogOpen(false);
            setTagCommit(null);
          }}
          ariaLabel="Tag Commit"
        >
          <div className="overlay-dialog-header">
            <h2>Tag Commit</h2>
          </div>
          <div className="overlay-dialog-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4) 0" }}>
            <p style={{ margin: 0, fontSize: "var(--font-size-body-sm)", color: "var(--text-muted)" }}>
              Add a tag to commit <code style={{ background: "var(--surface-muted)", padding: "2px 4px", borderRadius: "4px" }}>{tagCommit.shortHash}</code>:
            </p>
            <label htmlFor="git-tag-dialog-input" style={{ fontSize: "var(--font-size-label)", color: "var(--text-muted)", fontWeight: 600 }}>Tag Name</label>
            <AppInput
              id="git-tag-dialog-input"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="e.g. v1.0.0"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirmTag();
                }
              }}
            />
          </div>
          <div className="overlay-dialog-actions">
            <AppButton variant="secondary" onClick={() => {
              setTagDialogOpen(false);
              setTagCommit(null);
            }}>Cancel</AppButton>
            <AppButton variant="primary" onClick={handleConfirmTag} disabled={!tagName.trim()}>
              Create Tag
            </AppButton>
          </div>
        </OverlayDialog>
      )}
    </div>
  );
}

export default GitVersionControlPage;
