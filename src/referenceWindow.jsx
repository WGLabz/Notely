import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Eye, FileText, Save } from "lucide-react";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { MarkdownPreview } from "./components/MarkdownPreview.jsx";
import { readDocument, saveDocument } from "./services/electronService";
import "./styles.css";

function getReferenceFilePath() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("filePath") || "").trim();
  } catch {
    return "";
  }
}

function buildReferenceContent(document) {
  if (!document) return "";
  const parts = [];
  const header = String(document.header || "").trim();
  const rawNotes = String(document.rawNotes || "").trim();
  const cleansed = String(document.cleansed || "").trim();

  if (header) parts.push(header);
  if (rawNotes) parts.push(`# RawNotes\n${rawNotes}`);
  if (cleansed) parts.push(`# Cleansed\n${cleansed}`);
  return parts.join("\n\n").trim();
}

function parseSourceToDocumentParts(sourceText) {
  const normalized = String(sourceText || "").replace(/\r\n/g, "\n");
  const rawMatch = normalized.match(/^#\s*(RawNotes|Notes|Quick Notes)\s*$/im);
  const cleansedMatch = normalized.match(/^#\s*(Cleansed|Formal Notes|Professional Version)\s*$/im);
  const sectionIndexes = [rawMatch?.index, cleansedMatch?.index].filter((value) => Number.isInteger(value));
  const firstSectionIndex = sectionIndexes.length ? Math.min(...sectionIndexes) : -1;

  const header = firstSectionIndex >= 0
    ? normalized.slice(0, firstSectionIndex).trim()
    : normalized.trim();

  const rawStart = rawMatch ? rawMatch.index + rawMatch[0].length : -1;
  const cleansedStart = cleansedMatch ? cleansedMatch.index + cleansedMatch[0].length : -1;
  const rawEnd = cleansedMatch ? cleansedMatch.index : normalized.length;

  return {
    header,
    rawNotes: rawStart >= 0 ? normalized.slice(rawStart, rawEnd).trim() : "",
    cleansed: cleansedStart >= 0 ? normalized.slice(cleansedStart).trim() : "",
  };
}

function ReferenceWindowApp() {
  const filePath = useMemo(() => getReferenceFilePath(), []);
  const [documentData, setDocumentData] = useState(null);
  const [loading, setLoading] = useState(Boolean(filePath));
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("preview");
  const [sourceText, setSourceText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!filePath) {
      setLoading(false);
      setError("No reference note was provided.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    readDocument(filePath)
      .then((result) => {
        if (cancelled) return;
        setDocumentData(result || null);
        setSourceText(buildReferenceContent(result));
        const noteTitle = String(result?.title || "Untitled note").trim() || "Untitled note";
        const notePath = String(result?.filePath || filePath || "").trim();
        document.title = notePath ? `${noteTitle} (${notePath})` : noteTitle;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Unable to load reference note.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const previewContent = useMemo(() => buildReferenceContent(documentData), [documentData]);
  const isDirty = useMemo(() => {
    const baseline = buildReferenceContent(documentData);
    return String(sourceText || "") !== String(baseline || "");
  }, [documentData, sourceText]);

  const handleSave = async () => {
    if (!documentData?.filePath || saving) return;

    setSaving(true);
    setError("");
    setSaveMessage("");

    try {
      const parsed = parseSourceToDocumentParts(sourceText);
      const saved = await saveDocument({
        filePath: documentData.filePath,
        header: parsed.header,
        rawNotes: parsed.rawNotes,
        cleansed: parsed.cleansed,
        reason: "reference-window-save",
      });
      setDocumentData(saved || null);
      setSourceText(buildReferenceContent(saved));
      setSaveMessage("Saved");
    } catch (err) {
      setError(err?.message || "Unable to save reference note.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onSaveShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (String(event.key || "").toLowerCase() !== "s") return;
      event.preventDefault();
      void handleSave();
    };

    document.addEventListener("keydown", onSaveShortcut);
    return () => {
      document.removeEventListener("keydown", onSaveShortcut);
    };
  });

  if (loading) {
    return (
      <div className="reference-window-empty">
        <div className="reference-window-empty-card">
          <h1>Loading reference note</h1>
          <p>Please wait while the note preview opens.</p>
        </div>
      </div>
    );
  }

  if (error || !documentData) {
    return (
      <div className="reference-window-empty">
        <div className="reference-window-empty-card">
          <h1>Reference note unavailable</h1>
          <p>{error || "The selected note could not be loaded."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reference-window-shell">
      <div className="reference-window-layout">
        <header className="reference-window-header">
          <div className="reference-window-header-main">
            <h1>{documentData.title || "Untitled note"}</h1>
          </div>
          <div className="reference-window-header-actions tabs" role="tablist" aria-label="Reference note view mode">
            <button
              className={viewMode === "preview" ? "small-button active" : "small-button"}
              onClick={() => setViewMode("preview")}
              role="tab"
              aria-selected={viewMode === "preview"}
              type="button"
            >
              <Eye size={14} aria-hidden="true" />
              Preview
            </button>
            <button
              className={viewMode === "source" ? "small-button active" : "small-button"}
              onClick={() => setViewMode("source")}
              role="tab"
              aria-selected={viewMode === "source"}
              type="button"
            >
              <FileText size={14} aria-hidden="true" />
              Source
            </button>
            <button
              className="primary-button reference-window-save-btn"
              onClick={() => {
                void handleSave();
              }}
              disabled={!isDirty || saving}
              type="button"
              title="Save (Ctrl/Cmd+S)"
            >
              <Save size={14} aria-hidden="true" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </header>
        {(saveMessage || error) ? (
          <div className="reference-window-status" aria-live="polite">
            {error ? <span className="reference-window-status-error">{error}</span> : null}
            {!error && saveMessage ? <span className="reference-window-status-ok">{saveMessage}</span> : null}
          </div>
        ) : null}
        <main className="reference-window-content">
          {viewMode === "preview" ? (
            <MarkdownPreview
              content={sourceText || previewContent}
              basePath={documentData.filePath}
              inlineLinkedMarkdown
              onNotify={(message, level) => {
                const text = String(message || "").trim();
                if (!text) return;
                if (level === "error") {
                  setError(text);
                  return;
                }
                setSaveMessage(text);
              }}
            />
          ) : (
            <textarea
              className="reference-window-source-editor"
              value={sourceText}
              onChange={(event) => {
                setSourceText(event.target.value);
                if (saveMessage) {
                  setSaveMessage("");
                }
                if (error) {
                  setError("");
                }
              }}
              spellCheck={false}
              aria-label="Reference note source editor"
            />
          )}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary label="Reference Note">
      <ReferenceWindowApp />
    </ErrorBoundary>
  </React.StrictMode>
);
