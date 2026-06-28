import { formatDate } from "../utils/dateUtils";
import { useEffect, useMemo, useState } from "react";
import { readImage } from "../services/electronService";

function EntryIcon({ entryType }) {
  if (entryType === "folder") {
    return (
      <svg className="document-kind-icon folder" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h4.1a2 2 0 0 1 1.4.58l1.02 1.02A1 1 0 0 0 11.24 6H16a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" />
      </svg>
    );
  }

  return (
    <svg className="document-kind-icon note" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 2.5h6.6a2 2 0 0 1 1.4.58l2.92 2.92A2 2 0 0 1 16.5 7.4V15A2.5 2.5 0 0 1 14 17.5H5A2.5 2.5 0 0 1 2.5 15V5A2.5 2.5 0 0 1 5 2.5m0 1.5A1 1 0 0 0 4 5v10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V7.6a.5.5 0 0 0-.15-.36l-2.9-2.9a.5.5 0 0 0-.35-.14z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="document-calendar-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M6 2.5a.75.75 0 0 1 .75.75V4h6.5v-.75a.75.75 0 1 1 1.5 0V4H15a2.5 2.5 0 0 1 2.5 2.5V15A2.5 2.5 0 0 1 15 17.5H5A2.5 2.5 0 0 1 2.5 15V6.5A2.5 2.5 0 0 1 5 4h.25v-.75A.75.75 0 0 1 6 2.5M4 8v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zm1-2.5a1 1 0 0 0-1 1V6.5h12a1 1 0 0 0-1-1h-.25v.75a.75.75 0 1 1-1.5 0V5.5h-6.5v.75a.75.75 0 1 1-1.5 0V5.5z" />
    </svg>
  );
}

export function DocumentList({ documents, onOpen, loading, viewMode = "tile" }) {
  const [resolvedPreviewImages, setResolvedPreviewImages] = useState({});

  const previewRequests = useMemo(() => {
    return documents.flatMap((doc) => (doc.previewImages || []).slice(0, 4).map((image, index) => ({
      key: `${doc.filePath}:${index}:${image.sourceFilePath || doc.filePath}:${image.path}`,
      basePath: image.sourceFilePath || doc.filePath,
      path: image.path,
      name: image.name || image.path,
    })));
  }, [documents]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreviewImages() {
      if (!previewRequests.length) {
        setResolvedPreviewImages({});
        return;
      }

      const entries = await Promise.all(previewRequests.map(async (request) => {
        try {
          const src = await readImage(request.basePath, request.path, { thumbnail: true });
          return [request.key, { src, name: request.name }];
        } catch {
          return [request.key, null];
        }
      }));

      if (!cancelled) {
        setResolvedPreviewImages(Object.fromEntries(entries.filter(([, value]) => value)));
      }
    }

    loadPreviewImages();

    return () => {
      cancelled = true;
    };
  }, [previewRequests]);

  if (loading) {
    return <div className="empty-state">Loading notes and folders...</div>;
  }

  if (!documents.length) {
    return <div className="empty-state">No folders or markdown files found here yet. Create a folder or add a note to get started.</div>;
  }

  if (viewMode === "table") {
    return (
      <div className="document-table-wrap">
        <table className="document-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Metadata</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr
                key={doc.filePath}
                onClick={() => onOpen(doc)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(doc);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={doc.entryType === "folder" ? `Open folder ${doc.title}` : `Open note ${doc.title}`}
              >
                <td>
                  <span className="document-name-cell">
                    <EntryIcon entryType={doc.entryType} />
                    <span>{doc.title}</span>
                  </span>
                </td>
                <td>
                  {doc.entryType === "folder"
                    ? "Contains notes and subfolders"
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
      {documents.map((doc) => {
        const previewTiles = (doc.previewImages || []).slice(0, 4).map((image, index) => {
          const key = `${doc.filePath}:${index}:${image.sourceFilePath || doc.filePath}:${image.path}`;
          const resolved = resolvedPreviewImages[key];
          return resolved ? <img src={resolved.src} alt="" title={resolved.name} key={key} /> : null;
        });
        const hasPreview = previewTiles.some(Boolean);

        return (
          <button className="document-card" key={doc.filePath} onClick={() => onOpen(doc)}>
            <span className="document-card-header">
              <span className="document-title-wrap">
                <EntryIcon entryType={doc.entryType} />
                <span className="document-title">{doc.title}</span>
              </span>
            </span>
            <span className="document-meta">
              {doc.entryType === "folder"
                ? "Contains notes and subfolders"
                : ([doc.metadata?.time, doc.metadata?.location].filter(Boolean).join(" - ") ||
                  "No meeting metadata")}
            </span>
            <span className="document-updated">
              <CalendarIcon />
              <span>{formatDate(doc.updatedAt)}</span>
            </span>
            <span className={`document-thumb-strip${hasPreview ? "" : " is-empty"}`} aria-hidden="true">
              {hasPreview ? previewTiles : <span className="document-thumb-empty">No media</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
