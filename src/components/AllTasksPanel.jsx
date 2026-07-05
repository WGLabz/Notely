import { useMemo, useState } from "react";
import { CheckSquare, ExternalLink, ListChecks, Search, Square, X } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";
import { extractTasksFromDocuments } from "../utils/taskUtils";

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

export function AllTasksPanel({ isOpen, documents = [], onClose, onOpenNote }) {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const allTasks = useMemo(() => extractTasksFromDocuments(documents), [documents]);

  const filteredTasks = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return allTasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (!needle) return true;
      return task.text.toLowerCase().includes(needle) || task.noteTitle.toLowerCase().includes(needle);
    });
  }, [allTasks, filter, statusFilter]);

  const groups = useMemo(() => groupTasksByNote(filteredTasks), [filteredTasks]);

  if (!isOpen) return null;

  return (
    <OverlayDialog open={isOpen} onClose={onClose} ariaLabel="All tasks" cardClassName="tasks-panel-card all-tasks-panel-card">
      <div className="overlay-dialog-header tasks-panel-header">
        <div className="tasks-panel-title-group">
          <ListChecks size={16} />
          <h2>All Tasks</h2>
          <span className="tasks-panel-count">{filteredTasks.length}</span>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          type="button"
          aria-label="Close all tasks panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="tasks-panel-controls">
        <div className="tasks-panel-search">
          <Search size={14} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tasks or notes…"
            aria-label="Filter all tasks"
            className="tasks-panel-filter-input"
          />
        </div>
        <div className="tasks-panel-filter-row" role="tablist" aria-label="Task status filters">
          <button
            type="button"
            className={`tasks-status-chip${statusFilter === "all" ? " active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            <ListChecks size={12} aria-hidden="true" />
            All
          </button>
          <button
            type="button"
            className={`tasks-status-chip${statusFilter === "open" ? " active" : ""}`}
            onClick={() => setStatusFilter("open")}
          >
            <CheckSquare size={12} aria-hidden="true" />
            Open
          </button>
          <button
            type="button"
            className={`tasks-status-chip${statusFilter === "closed" ? " active" : ""}`}
            onClick={() => setStatusFilter("closed")}
          >
            <Square size={12} aria-hidden="true" />
            Closed
          </button>
        </div>
      </div>

      <div className="tasks-panel-body">
        {!allTasks.length ? (
          <div className="tasks-panel-empty">
            <p>No tasks found.</p>
            <p className="muted">Add <code>- [ ] task text</code> or <code>- [x] done task</code> to notes to track them here.</p>
          </div>
        ) : !filteredTasks.length ? (
          <div className="tasks-panel-empty">
            <p>No tasks match your current filters.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div className="tasks-group" key={group.filePath}>
              <div className="tasks-group-header">
                <span className="tasks-group-title" data-tooltip={group.filePath}>{group.noteTitle}</span>
                <button
                  type="button"
                  className="tasks-group-open"
                  data-tooltip={`Open ${group.noteTitle}`}
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
                  <li key={task.id} className={`task-item ${task.status === "closed" ? "closed" : "open"}`}>
                    <span className="task-checkbox" aria-hidden="true">
                      {task.status === "closed" ? <Square size={12} /> : <CheckSquare size={12} />}
                    </span>
                    <span className="task-text">{task.text}</span>
                    <span className={`task-status-label ${task.status}`}>{task.status === "closed" ? "Closed" : "Open"}</span>
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