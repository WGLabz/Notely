import { formatDate } from "../utils/dateUtils";

export function DocumentList({ documents, onOpen, loading, viewMode = "tile" }) {
  if (loading) {
    return <div className="empty-state">Loading notes...</div>;
  }

  if (!documents.length) {
    return <div className="empty-state">No folders or markdown files found in this location.</div>;
  }

  if (viewMode === "table") {
    return (
      <div className="document-table-wrap">
        <table className="document-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Metadata</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.filePath} onClick={() => onOpen(doc)}>
                <td>{doc.entryType === "folder" ? `/${doc.title}` : doc.title}</td>
                <td>{doc.entryType === "folder" ? "Folder" : "Markdown"}</td>
                <td>
                  {doc.entryType === "folder"
                    ? "-"
                    : ([doc.metadata?.time, doc.metadata?.location].filter(Boolean).join(" - ") ||
                      "No meeting metadata")}
                </td>
                <td>{formatDate(doc.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="document-grid">
      {documents.map((doc) => (
        <button className="document-card" key={doc.filePath} onClick={() => onOpen(doc)}>
          <span className="document-title">{doc.entryType === "folder" ? `/${doc.title}` : doc.title}</span>
          <span className="document-meta">
            {doc.entryType === "folder"
              ? "Folder"
              : ([doc.metadata?.time, doc.metadata?.location].filter(Boolean).join(" - ") ||
                "No meeting metadata")}
          </span>
          <span className="document-updated">Updated {formatDate(doc.updatedAt)}</span>
        </button>
      ))}
    </div>
  );
}
