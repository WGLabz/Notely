import { ArrowRight, CheckSquare, Clock3, FilePlus2, FolderPlus, Image as ImageIcon, Search, Trash2, FileText, Star, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { formatDate } from "../utils/dateUtils";
import { extractOpenTasksFromDocuments, getTaskCountsFromDocuments } from "../utils/taskUtils";

const DASHBOARD_SECTION_LIMIT = 3;

function getRecentNotes(documents) {
  return [...documents]
    .filter((entry) => entry.entryType === "file")
    .sort((a, b) => {
      const left = new Date(a.updatedAt || 0).getTime();
      const right = new Date(b.updatedAt || 0).getTime();
      return right - left;
    });
}

function getDisplayName(filePath) {
  if (!filePath) return "Untitled";
  const normalizedPath = String(filePath).replace(/\\/g, "/");
  const parts = normalizedPath.split("/").filter(Boolean);
  if (parts.length === 1) {
    return parts[0];
  }
  return parts.slice(-2).join("/");
}

export function DashboardPanels({ documents, taskDocuments = documents, loading, onOpen, onOpenTask, onOpenAllTasks, onOpenRecentNotes, onOpenFavorites, onAction, continueNotes = [], favorites = [], layout = "bar" }) {
  const safeDocuments = useMemo(() => (Array.isArray(documents) ? documents : []), [documents]);
  const safeTaskDocuments = useMemo(() => (Array.isArray(taskDocuments) ? taskDocuments : []), [taskDocuments]);
  const safeContinueNotes = useMemo(() => (Array.isArray(continueNotes) ? continueNotes : []), [continueNotes]);
  const safeFavorites = useMemo(() => (Array.isArray(favorites) ? favorites : []), [favorites]);

  const recentNotes = getRecentNotes(safeDocuments);
  const continueCandidates = safeContinueNotes
    .filter((item) => item?.entryType === "file" && item?.filePath);
  const continueCandidate = continueCandidates[0] || recentNotes[0] || null;

  const limit = layout === "rail" ? 5 : DASHBOARD_SECTION_LIMIT;

  const recentSlice = recentNotes.slice(0, limit);
  const allOpenTasks = useMemo(() => extractOpenTasksFromDocuments(safeTaskDocuments), [safeTaskDocuments]);
  const openTasks = useMemo(() => allOpenTasks.slice(0, limit), [allOpenTasks, limit]);
  const taskCounts = useMemo(() => getTaskCountsFromDocuments(safeTaskDocuments), [safeTaskDocuments]);
  
  const favoriteSlice = useMemo(() => {
    const favoriteSet = new Set(safeFavorites);
    const metadataMap = new Map(
      [...recentNotes, ...safeContinueNotes]
        .filter((item) => item?.entryType === "file" && item?.filePath)
        .map((item) => [String(item.filePath).toLowerCase(), item])
    );

    return Array.from(favoriteSet)
      .map((filePath) => {
        const key = String(filePath || "").toLowerCase();
        const item = metadataMap.get(key) || { filePath, title: filePath, entryType: "file" };
        return {
          ...item,
          displayName: getDisplayName(item.filePath || filePath)
        };
      })
      .filter((item) => item?.filePath)
      .sort((a, b) => {
        const left = new Date(a.updatedAt || 0).getTime();
        const right = new Date(b.updatedAt || 0).getTime();
        return right - left;
      });
  }, [safeFavorites, recentNotes, safeContinueNotes]);

  const visibleFavorites = favoriteSlice.slice(0, limit);

  function renderSectionToggle(items, onOpenPanel) {
    if (!Array.isArray(items) || items.length <= limit) {
      return null;
    }

    return (
      <button type="button" className="dashboard-inline-action" onClick={onOpenPanel}>
        View all
        <ArrowRight size={12} aria-hidden="true" />
      </button>
    );
  }

  function renderBarSectionToggle(onOpenPanel) {
    return (
      <button type="button" className="dashboard-inline-action" onClick={onOpenPanel}>
        View all
        <ArrowRight size={12} aria-hidden="true" />
      </button>
    );
  }

  if (loading) return null;

  if (layout === "rail") {
    return (
      <section className="dashboard-panels rail" aria-label="Workspace dashboard">
        <article className="dashboard-panel quick-actions">
          <div className="dashboard-panel-head">
            <h3>Quick Actions</h3>
          </div>
          <div className="dashboard-action-grid row-mode">
            <button type="button" onClick={() => onAction("new-note")} data-tooltip="New Note" aria-label="New Note">
              <FilePlus2 size={14} />
            </button>
            <button type="button" onClick={() => onAction("new-folder")} data-tooltip="New Folder" aria-label="New Folder">
              <FolderPlus size={14} />
            </button>
            <button type="button" onClick={() => onAction("search")} data-tooltip="Search" aria-label="Search">
              <Search size={14} />
            </button>
            <button type="button" onClick={() => onAction("ai")} data-tooltip="AI Assistant" aria-label="AI Assistant">
              <Sparkles size={14} />
            </button>
            <button type="button" onClick={() => onAction("assets")} data-tooltip="Assets" aria-label="Assets">
              <ImageIcon size={14} />
            </button>
            <button type="button" onClick={() => onAction("trash")} data-tooltip="Trash" aria-label="Trash">
              <Trash2 size={14} />
            </button>
          </div>
        </article>

        <article className="dashboard-panel continue">
          <div className="dashboard-panel-head">
            <h3>Continue Writing</h3>
            <Clock3 size={14} />
          </div>
          {continueCandidate ? (
            <button
              className="dashboard-continue-card"
              type="button"
              onClick={() => onOpen(continueCandidate)}
              data-tooltip={`Last edited: ${formatDate(continueCandidate.updatedAt)}`}
            >
              <strong>{continueCandidate.title}</strong>
              <em>
                Open
                <ArrowRight size={14} />
              </em>
            </button>
          ) : (
            <p className="dashboard-empty">No notes yet. Create one to get started.</p>
          )}
        </article>

        <article className="dashboard-panel recent">
          <div className="dashboard-panel-head">
            <h3>Recent Notes</h3>
            {renderBarSectionToggle(onOpenRecentNotes)}
          </div>
          {recentSlice.length ? (
            <ul className="dashboard-recent-list compact">
              {recentSlice.map((note) => (
                <li key={note.filePath}>
                  <button
                    type="button"
                    onClick={() => onOpen(note)}
                    data-tooltip={`Last edited: ${formatDate(note.updatedAt)}`}
                  >
                    <FileText size={12} style={{ flexShrink: 0, color: "var(--text-muted)", opacity: 0.8 }} />
                    <span>{note.title}</span>
                    <em className="dashboard-item-open-indicator">
                      <ArrowRight size={12} />
                    </em>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">No recent notes available.</p>
          )}
        </article>

        <article className="dashboard-panel favorites">
          <div className="dashboard-panel-head">
            <h3>Favorites</h3>
            {renderBarSectionToggle(onOpenFavorites)}
          </div>
          {visibleFavorites.length ? (
            <ul className="dashboard-recent-list compact">
              {visibleFavorites.map((note) => (
                <li key={note.filePath}>
                  <button
                    type="button"
                    onClick={() => onOpen(note)}
                    data-tooltip={`Last edited: ${formatDate(note.updatedAt)}`}
                  >
                    <Star size={12} style={{ flexShrink: 0, color: "#f5a623", opacity: 0.9 }} />
                    <span>{note.displayName}</span>
                    <em className="dashboard-item-open-indicator">
                      <ArrowRight size={12} />
                    </em>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">No favorites yet. Star notes from the list.</p>
          )}
        </article>

        <article className="dashboard-panel tasks">
          <div className="dashboard-panel-head">
            <h3>Open Tasks</h3>
            <div className="dashboard-task-head-actions">
              {taskCounts.total > 0 && (
                <button
                  type="button"
                  className="dashboard-task-badge dashboard-task-summary"
                  onClick={onOpenAllTasks}
                  data-tooltip={`View all tasks (${taskCounts.open} open | ${taskCounts.closed} closed)`}
                  aria-label={`${taskCounts.open} open tasks and ${taskCounts.closed} closed tasks`}
                  style={{ cursor: "pointer" }}
                >
                  <span className="task-open">{taskCounts.open}</span>
                  <span className="dashboard-task-separator" aria-hidden="true">|</span>
                  <span className="task-closed">{taskCounts.closed}</span>
                </button>
              )}
              {renderBarSectionToggle(onOpenAllTasks)}
            </div>
          </div>
          {openTasks.length ? (
            <ul className="dashboard-task-list compact">
              {openTasks.map((task, idx) => (
                <li key={`${task.filePath}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => (onOpenTask || onOpen)?.(task)}
                    data-tooltip={`Folder: ${getDisplayName(task.filePath)}`}
                  >
                    <CheckSquare size={12} />
                    <span>{task.text}</span>
                    <em className="dashboard-item-open-indicator">
                      <ArrowRight size={12} />
                    </em>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">No open tasks. Great work!</p>
          )}
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-panels" aria-label="Workspace dashboard">
      <div className="dashboard-bar" role="group" aria-label="Landing productivity bar">
        <article className="dashboard-bar-section continue">
          <div className="dashboard-panel-head">
            <h3>Continue Writing</h3>
            <Clock3 size={14} />
          </div>
          {continueCandidate ? (
            <button
              className="dashboard-continue-card"
              type="button"
              onClick={() => onOpen(continueCandidate)}
            >
              <strong>{continueCandidate.title}</strong>
              <span>Last edited {formatDate(continueCandidate.updatedAt)}</span>
              <em>
                Open
                <ArrowRight size={14} />
              </em>
            </button>
          ) : (
            <p className="dashboard-empty">No notes yet. Create one to get started.</p>
          )}
        </article>

        <article className="dashboard-bar-section quick-actions">
          <div className="dashboard-panel-head">
            <h3>Quick Actions</h3>
          </div>
          <div className="dashboard-action-grid inline">
            <button type="button" onClick={() => onAction("new-note")}>
              <FilePlus2 size={14} />
              New Note
            </button>
            <button type="button" onClick={() => onAction("new-folder")}>
              <FolderPlus size={14} />
              New Folder
            </button>
            <button type="button" onClick={() => onAction("search")}>
              <Search size={14} />
              Search
            </button>
            <button type="button" onClick={() => onAction("assets")}>
              <ImageIcon size={14} />
              Assets
            </button>
            <button type="button" onClick={() => onAction("trash")}>
              <Trash2 size={14} />
              Trash
            </button>
          </div>
        </article>

        <article className="dashboard-bar-section recent">
          <div className="dashboard-panel-head">
            <h3>Recent Notes</h3>
            {renderBarSectionToggle(onOpenRecentNotes)}
          </div>
          {recentSlice.length ? (
            <ul className="dashboard-recent-list compact">
              {recentSlice.map((note) => (
                <li key={note.filePath}>
                  <button type="button" onClick={() => onOpen(note)}>
                    <span>{note.title}</span>
                    <small>{formatDate(note.updatedAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">No recent notes available.</p>
          )}
        </article>

        <article className="dashboard-bar-section favorites">
          <div className="dashboard-panel-head">
            <h3>Favorites</h3>
            {renderBarSectionToggle(onOpenFavorites)}
          </div>
          {visibleFavorites.length ? (
            <ul className="dashboard-recent-list compact">
              {visibleFavorites.map((note) => (
                <li key={note.filePath}>
                  <button type="button" onClick={() => onOpen(note)}>
                    <span>{note.displayName}</span>
                    <small>{formatDate(note.updatedAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">No favorites yet. Star notes from the list.</p>
          )}
        </article>

        <article className="dashboard-bar-section tasks">
          <div className="dashboard-panel-head">
            <h3>Open Tasks</h3>
            <div className="dashboard-task-head-actions">
              {taskCounts.total > 0 && (
                <button
                  type="button"
                  className="dashboard-task-badge dashboard-task-summary"
                  onClick={onOpenAllTasks}
                  data-tooltip={`View all tasks (${taskCounts.open} open | ${taskCounts.closed} closed)`}
                  aria-label={`${taskCounts.open} open tasks and ${taskCounts.closed} closed tasks`}
                  style={{ cursor: "pointer" }}
                >
                  <span className="task-open">{taskCounts.open}</span>
                  <span className="dashboard-task-separator" aria-hidden="true">|</span>
                  <span className="task-closed">{taskCounts.closed}</span>
                </button>
              )}
              {renderBarSectionToggle(onOpenAllTasks)}
            </div>
          </div>
          {openTasks.length ? (
            <ul className="dashboard-task-list compact">
              {openTasks.map((task, idx) => (
                <li key={`${task.filePath}-${idx}`}>
                  <button type="button" onClick={() => (onOpenTask || onOpen)?.(task)}>
                    <CheckSquare size={12} />
                    <span>{task.text}</span>
                    <small>{getDisplayName(task.filePath)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">No open tasks. Great work!</p>
          )}
        </article>
      </div>
    </section>
  );
}