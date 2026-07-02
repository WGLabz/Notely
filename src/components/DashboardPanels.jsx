import { ArrowRight, Clock3, FilePlus2, FolderPlus, Image as ImageIcon, Search } from "lucide-react";
import { useMemo } from "react";
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

function getDisplayName(filePath) {
  if (!filePath) return "Untitled";
  const normalizedPath = String(filePath).replace(/\\/g, "/");
  const parts = normalizedPath.split("/").filter(Boolean);
  if (parts.length === 1) {
    return parts[0];
  }
  return parts.slice(-2).join("/");
}

export function DashboardPanels({ documents, loading, onOpen, onAction, continueNotes = [], favorites = [], layout = "bar" }) {
  const safeDocuments = useMemo(() => (Array.isArray(documents) ? documents : []), [documents]);
  const safeContinueNotes = useMemo(() => (Array.isArray(continueNotes) ? continueNotes : []), [continueNotes]);
  const safeFavorites = useMemo(() => (Array.isArray(favorites) ? favorites : []), [favorites]);

  const recentNotes = getRecentNotes(safeDocuments);
  const continueCandidates = safeContinueNotes
    .filter((item) => item?.entryType === "file" && item?.filePath)
    .slice(0, 4);
  const continueCandidate = continueCandidates[0] || recentNotes[0] || null;
  const continueHistory = continueCandidates.length > 1 ? continueCandidates.slice(1) : [];
  const recentSlice = recentNotes.slice(0, 5);
  
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
      })
      .slice(0, 5);
  }, [safeFavorites, recentNotes, safeContinueNotes]);

  if (loading) return null;

  if (layout === "rail") {
    return (
      <section className="dashboard-panels rail" aria-label="Workspace dashboard">
        <article className="dashboard-panel continue">
          <div className="dashboard-panel-head">
            <h2>Continue Writing</h2>
            <Clock3 size={14} />
          </div>
          {continueCandidate ? (
            <>
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
              {continueHistory.length ? (
                <ul className="dashboard-recent-list compact continue-list">
                  {continueHistory.map((note) => (
                    <li key={note.filePath}>
                      <button type="button" onClick={() => onOpen(note)}>
                        <span>{note.title}</span>
                        <small>{formatDate(note.updatedAt)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="dashboard-empty">No notes yet. Create one to get started.</p>
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
            <button type="button" onClick={() => onAction("assets")}>
              <ImageIcon size={14} />
              Assets
            </button>
          </div>
        </article>

        <article className="dashboard-panel recent">
          <div className="dashboard-panel-head">
            <h2>Recent Notes</h2>
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

        <article className="dashboard-panel favorites">
          <div className="dashboard-panel-head">
            <h2>Favorites</h2>
          </div>
          {favoriteSlice.length ? (
            <ul className="dashboard-recent-list compact">
              {favoriteSlice.map((note) => (
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
      </section>
    );
  }

  return (
    <section className="dashboard-panels" aria-label="Workspace dashboard">
      <div className="dashboard-bar" role="group" aria-label="Landing productivity bar">
        <article className="dashboard-bar-section continue">
          <div className="dashboard-panel-head">
            <h2>Continue Writing</h2>
            <Clock3 size={14} />
          </div>
          {continueCandidate ? (
            <>
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
              {continueHistory.length ? (
                <ul className="dashboard-recent-list compact continue-list">
                  {continueHistory.map((note) => (
                    <li key={note.filePath}>
                      <button type="button" onClick={() => onOpen(note)}>
                        <span>{note.title}</span>
                        <small>{formatDate(note.updatedAt)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="dashboard-empty">No notes yet. Create one to get started.</p>
          )}
        </article>

        <article className="dashboard-bar-section quick-actions">
          <div className="dashboard-panel-head">
            <h2>Quick Actions</h2>
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
          </div>
        </article>

        <article className="dashboard-bar-section recent">
          <div className="dashboard-panel-head">
            <h2>Recent Notes</h2>
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
            <h2>Favorites</h2>
          </div>
          {favoriteSlice.length ? (
            <ul className="dashboard-recent-list compact">
              {favoriteSlice.map((note) => (
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
      </div>
    </section>
  );
}