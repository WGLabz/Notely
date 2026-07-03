import { useMemo, useState } from "react";
import { CheckSquare, ExternalLink, X, Search } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";

const TASK_REGEX = /^[-*+]\s+\[ \]\s+(.+)/gm;

function extractTasks(documents) {
  const tasks = [];
  for (const doc of documents) {
    if (doc.entryType !== "file") continue;
    const content = String(doc.searchText || "");
    if (!content.includes("- [ ]") && !content.includes("* [ ]") && !content.includes("+ [ ]")) continue;

    TASK_REGEX.lastIndex = 0;
    let match;
    while ((match = TASK_REGEX.exec(content)) !== null) {
      tasks.push({
        id: `${doc.filePath}::${match.index}`,
        text: match[1].trim(),
        filePath: doc.filePath,
        noteTitle: doc.title || doc.filePath,
      });
    }
  }
  return tasks;
}

function groupTasksByNote(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    if (!groups.has(task.filePath)) {
      groups.set(task.filePath, { filePath: task.filePath, noteTitle: task.noteTitle, tasks: [] });
    }
    groups.get(task.filePath).tasks.push(task);
  }
  return [...groups.values()];
}

export function TasksPanel({ isOpen, documents = [], onClose, onOpenNote }) {
  const [filter, setFilter] = useState("");

  const allTasks = useMemo(() => extractTasks(documents), [documents]);

  const filteredTasks = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return allTasks;
    return allTasks.filter(
      (task) =>
        task.text.toLowerCase().includes(needle) ||
        task.noteTitle.toLowerCase().includes(needle),
    );
  }, [allTasks, filter]);

  const groups = useMemo(() => groupTasksByNote(filteredTasks), [filteredTasks]);

  if (!isOpen) return null;

  return (
    <OverlayDialog open={isOpen} onClose={onClose} ariaLabel="Tasks" cardClassName="tasks-panel-card">
        <div className="overlay-dialog-header tasks-panel-header">
          <div className="tasks-panel-title-group">
            <CheckSquare size={16} />
            <h2>Open Tasks</h2>
            <span className="tasks-panel-count">{filteredTasks.length}</span>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            type="button"
            aria-label="Close tasks panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="tasks-panel-search">
          <Search size={14} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tasks or notes…"
            aria-label="Filter tasks"
            className="tasks-panel-filter-input"
          />
        </div>

        <div className="tasks-panel-body">
          {!allTasks.length ? (
            <div className="tasks-panel-empty">
              <p>No open tasks found.</p>
              <p className="muted">Add <code>- [ ] task text</code> to any note to track it here.</p>
            </div>
          ) : !filteredTasks.length ? (
            <div className="tasks-panel-empty">
              <p>No tasks match your filter.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div className="tasks-group" key={group.filePath}>
                <div className="tasks-group-header">
                  <span className="tasks-group-title" title={group.filePath}>{group.noteTitle}</span>
                  <button
                    type="button"
                    className="tasks-group-open"
                    title={`Open ${group.noteTitle}`}
                    onClick={() => {
                      onOpenNote?.(group);
                      onClose();
                    }}
                  >
                    <ExternalLink size={12} />
                    Open note
                  </button>
                </div>
                <ul className="tasks-list" aria-label={`Tasks in ${group.noteTitle}`}>
                  {group.tasks.map((task) => (
                    <li key={task.id} className="task-item">
                      <span className="task-checkbox" aria-hidden="true">☐</span>
                      <span className="task-text">{task.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
    </OverlayDialog>
  );
}
