import { ArrowRight, Clock3, FilePlus2, FolderPlus, Search } from "lucide-react";
import { formatDate } from "../utils/dateUtils";

function getRecentNotes(documents) {
  return [...documents]
    .filter((entry) => entry.entryType === "file")
    .sort((a, b) => {
      const left = new Date(a.updatedAt || 0).getTime();
      const right = new Date(b.updatedAt || 0).getTime();
      return right - left;
    });
}

export function DashboardPanels({ documents, loading, onOpen, onAction }) {
  if (loading) return null;

  const recentNotes = getRecentNotes(documents);
  const continueNote = recentNotes[0] || null;
  const recentSlice = recentNotes.slice(0, 5);

  return (
    <section className="dashboard-panels" aria-label="Workspace dashboard">
      <article className="dashboard-panel continue">
        <div className="dashboard-panel-head">
          <h2>Continue Writing</h2>
          <Clock3 size={14} />
        </div>
        {continueNote ? (
          <button
            className="dashboard-continue-card"
            type="button"
            onClick={() => onOpen(continueNote)}
          >
            <strong>{continueNote.title}</strong>
            <span>Last edited {formatDate(continueNote.updatedAt)}</span>
            <em>
              Open Note
              <ArrowRight size={13} />
            </em>
          </button>
        ) : (
          <p className="dashboard-empty">No notes yet. Create one to get started.</p>
        )}
      </article>

      <article className="dashboard-panel recent">
        <div className="dashboard-panel-head">
          <h2>Recent Notes</h2>
        </div>
        {recentSlice.length ? (
          <ul className="dashboard-recent-list">
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

      <article className="dashboard-panel quick-actions">
        <div className="dashboard-panel-head">
          <h2>Quick Actions</h2>
        </div>
        <div className="dashboard-action-grid">
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
        </div>
      </article>
    </section>
  );
}