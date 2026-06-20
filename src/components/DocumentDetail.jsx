import { useRef, useState, useEffect } from "react";
import {
  Home,
  Save,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  FileText,
  FilePenLine,
  FileDown,
  PenLine,
  SplitSquareHorizontal,
  Eye,
  Globe,
  Clock,
  MapPin,
  User,
  Images,
  GitCompare,
  Trash2,
  X,
  Filter,
  Sparkles,
} from "lucide-react";
import { EditorPane } from "./EditorPane";
import { MediaTab } from "./MediaTab";
import { formatDate } from "../utils/dateUtils";
import { openInEditor } from "../services/electronService";
import { openWebView } from "../services/electronService";
import { downloadPdf } from "../services/electronService";
import { deleteVersion, readVersion } from "../services/electronService";

function buildDiffRows(latest, previous, options = {}) {
  const { ignoreWhitespace = false } = options;
  const latestLines = (latest || "").replace(/\r\n/g, "\n").split("\n");
  const previousLines = (previous || "").replace(/\r\n/g, "\n").split("\n");
  const max = Math.max(latestLines.length, previousLines.length);
  const rows = [];

  for (let index = 0; index < max; index += 1) {
    const latestLine = latestLines[index] ?? "";
    const previousLine = previousLines[index] ?? "";
    const normalizedLatest = ignoreWhitespace ? latestLine.replace(/\s+/g, " ").trim() : latestLine;
    const normalizedPrevious = ignoreWhitespace ? previousLine.replace(/\s+/g, " ").trim() : previousLine;
    let status = "same";
    if (index >= previousLines.length) status = "added";
    else if (index >= latestLines.length) status = "removed";
    else if (normalizedLatest !== normalizedPrevious) status = "changed";

    rows.push({ line: index + 1, latestLine, previousLine, status });
  }

  return rows;
}

function buildVisibleRows(rows, options = {}) {
  const { showOnlyChanges = false, smartMode = false, contextLines = 2 } = options;

  if (showOnlyChanges) {
    return rows.filter((row) => row.status !== "same");
  }

  if (!smartMode) {
    return rows;
  }

  const changeIndexes = rows
    .map((row, index) => (row.status === "same" ? -1 : index))
    .filter((index) => index >= 0);

  if (!changeIndexes.length) {
    return rows;
  }

  const ranges = [];
  for (const index of changeIndexes) {
    const start = Math.max(0, index - contextLines);
    const end = Math.min(rows.length - 1, index + contextLines);

    const last = ranges[ranges.length - 1];
    if (!last || start > last.end + 1) {
      ranges.push({ start, end });
    } else {
      last.end = Math.max(last.end, end);
    }
  }

  const output = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      output.push({
        kind: "separator",
        id: `sep-${cursor}-${range.start}`,
        omitted: range.start - cursor,
      });
    }

    for (let i = range.start; i <= range.end; i += 1) {
      output.push(rows[i]);
    }
    cursor = range.end + 1;
  }

  if (cursor < rows.length) {
    output.push({
      kind: "separator",
      id: `sep-${cursor}-${rows.length}`,
      omitted: rows.length - cursor,
    });
  }

  return output;
}

export function DocumentDetail({
  document,
  history,
  activeTab,
  setActiveTab,
  mode,
  setMode,
  onChange,
  onSave,
  onRefreshHistory,
  saving,
  dirty,
  onHome,
  onNotify,
}) {
  const textareaRef = useRef(null);
  const pdfPopoverRef = useRef(null);
  const [isHistoryPanelCollapsed, setIsHistoryPanelCollapsed] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareMeta, setCompareMeta] = useState(null);
  const [diffRows, setDiffRows] = useState([]);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [smartMode, setSmartMode] = useState(true);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfOptionsOpen, setPdfOptionsOpen] = useState(false);
  const [pdfExportMode, setPdfExportMode] = useState("formal");

  useEffect(() => {
    if (!pdfOptionsOpen || typeof globalThis?.document === "undefined") return;

    const handleClickOutside = (event) => {
      if (pdfPopoverRef.current && !pdfPopoverRef.current.contains(event.target)) {
        setPdfOptionsOpen(false);
      }
    };

    globalThis.document.addEventListener("mousedown", handleClickOutside);
    return () => {
      if (typeof globalThis?.document !== "undefined") {
        globalThis.document.removeEventListener("mousedown", handleClickOutside);
      }
    };
  }, [pdfOptionsOpen]);
  const content = activeTab === "raw" ? document.rawNotes : document.cleansed;
  const mediaContent = `${document.rawNotes || ""}\n\n${document.cleansed || ""}`.trim();

  const updateContent = (value) => {
    onChange({
      ...document,
      [activeTab === "raw" ? "rawNotes" : "cleansed"]: value,
    });
  };

  const handleOpenLatestFile = async () => {
    try {
      const result = await openInEditor(document.filePath);
      if (result?.openedWith === "default") {
        onNotify?.("VS Code not available. Opened with system default app.", "info");
      } else {
        onNotify?.("Opened latest note file in VS Code.", "success");
      }
    } catch (error) {
      onNotify?.(error?.message || "Unable to open file in editor.", "error");
    }
  };

  const handleOpenWebsite = async () => {
    try {
      const result = await openWebView(document.filePath, content);
      if (result?.openedWith === "chrome") {
        onNotify?.("Opened website view in Chrome.", "success");
      } else {
        onNotify?.("Chrome not found. Opened in your default browser.", "info");
      }
    } catch (error) {
      onNotify?.(error?.message || "Unable to open website view.", "error");
    }
  };

  const handleDownloadPdf = async () => {
    setPdfOptionsOpen(true);
  };

  const handleConfirmPdfExport = async () => {
    const includeRawNotes = pdfExportMode === "raw" || pdfExportMode === "both";
    const includeCleansed = pdfExportMode === "formal" || pdfExportMode === "both";

    setPdfExporting(true);

    try {
      const result = await downloadPdf({
        filePath: document.filePath,
        title: document.title,
        rawNotes: document.rawNotes,
        cleansed: document.cleansed,
        includeRawNotes,
        includeCleansed,
      });
      if (!result?.canceled) {
        onNotify?.("PDF downloaded.", "success");
        setPdfOptionsOpen(false);
      }
    } catch (error) {
      onNotify?.(error?.message || "Unable to download PDF.", "error");
    } finally {
      setPdfExporting(false);
    }
  };

  const handleCompareVersion = async (entry) => {
    setCompareLoading(true);
    setCompareModalOpen(true);
    setShowOnlyChanges(false);
    setSmartMode(true);
    setCompareMeta(entry);
    setDiffRows([]);

    try {
      const latest = [
        (document.header || "").trim(),
        "# RawNotes",
        (document.rawNotes || "").trim(),
        "",
        "# Cleansed",
        (document.cleansed || "").trim(),
      ].join("\n");

      const previous = await readVersion(document.filePath, entry.versionPath);
      const rows = buildDiffRows(latest, previous, { ignoreWhitespace: smartMode });
      setDiffRows(rows);
    } catch (error) {
      onNotify?.(error?.message || "Unable to load version diff.", "error");
      setCompareModalOpen(false);
    } finally {
      setCompareLoading(false);
    }
  };

  const handleDeleteVersion = async (entry) => {
    const confirmed = window.confirm("Delete this older version? This cannot be undone.");
    if (!confirmed) return;

    try {
      await deleteVersion(document.filePath, entry.versionPath);
      await onRefreshHistory();
      onNotify?.("Older version deleted.", "success");
    } catch (error) {
      onNotify?.(error?.message || "Unable to delete version.", "error");
    }
  };

  const diffSummary = diffRows.reduce(
    (acc, row) => {
      if (row.status === "added") acc.added += 1;
      if (row.status === "removed") acc.removed += 1;
      if (row.status === "changed") acc.changed += 1;
      return acc;
    },
    { added: 0, removed: 0, changed: 0 }
  );

  const visibleRows = buildVisibleRows(diffRows, {
    showOnlyChanges,
    smartMode,
    contextLines: 2,
  });

  const hasSeparators = visibleRows.some((row) => row?.kind === "separator");

  return (
    <div className="detail-shell">
      <div className="detail-topbar">
        <button className="back-button" onClick={onHome} title="Back to home">
          <Home size={18} />
        </button>
        <div className="crumb">Notes / {document.title}</div>
        <div className="save-status">{dirty ? "Unsaved changes" : "Saved"}</div>
        <button className="text-button" onClick={handleOpenLatestFile} title="Open latest file">
          <FolderOpen size={18} />
          Open
        </button>
        <button className="text-button" onClick={handleOpenWebsite} title="Open website in browser">
          <Globe size={18} />
          Website
        </button>
        <div style={{ position: "relative" }}>
          <button
            className="text-button"
            onClick={handleDownloadPdf}
            disabled={pdfExporting}
            title="Export note as PDF"
          >
            <FileDown size={18} />
            {pdfExporting ? "Exporting..." : "Export PDF"}
          </button>
          {pdfOptionsOpen ? (
            <div ref={pdfPopoverRef} className="pdf-popover" style={{ position: "absolute", top: "100%", right: 0, marginTop: "8px", zIndex: 1000 }}>
              <div style={{ background: "#ffffff", border: "1px solid #dde5ea", borderRadius: "8px", padding: "12px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", minWidth: "200px" }}>
                <select
                  value={pdfExportMode}
                  onChange={(event) => setPdfExportMode(event.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d7e0e6",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    marginBottom: "10px",
                    boxSizing: "border-box"
                  }}
                >
                  <option value="formal">Formal Notes</option>
                  <option value="raw">Raw Notes</option>
                  <option value="both">Both Raw and Formal</option>
                </select>
                <button
                  className="primary-button"
                  onClick={handleConfirmPdfExport}
                  disabled={pdfExporting}
                  type="button"
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <FileDown size={14} />
                  {pdfExporting ? "Exporting..." : "Export"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <button
          className="primary-button"
          onClick={onSave}
          disabled={saving || !dirty}
          title="Save document"
        >
          <Save size={18} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <header className="doc-header">
        <div>
          <h1>{document.title}</h1>
          <p>{document.fileName}</p>
        </div>
        <div className="metadata-grid">
          <div>
            <User size={16} />
            <span>Name</span>
            <strong>{document.metadata?.name || "Not captured"}</strong>
          </div>
          <div>
            <Clock size={16} />
            <span>Time</span>
            <strong>{document.metadata?.time || "Not captured"}</strong>
          </div>
          <div>
            <MapPin size={16} />
            <span>Location</span>
            <strong>{document.metadata?.location || "Not captured"}</strong>
          </div>
        </div>
      </header>

      <div className={`workspace ${isHistoryPanelCollapsed ? "history-panel-collapsed" : ""}`}>
        <aside className={`history-panel ${isHistoryPanelCollapsed ? "collapsed" : ""}`}>
          {isHistoryPanelCollapsed ? (
            <div className="history-collapsed-actions">
              <button
                className="small-button"
                onClick={() => setIsHistoryPanelCollapsed(false)}
                title="Expand versions panel"
                aria-expanded="false"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="panel-title-row">
                <h2>Versions</h2>
                <div className="panel-actions">
                  <button className="small-button" onClick={onRefreshHistory} title="Refresh history">
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="small-button"
                    onClick={() => setIsHistoryPanelCollapsed(true)}
                    title="Collapse versions panel"
                    aria-expanded="true"
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>
              </div>
              {history.length ? (
                <div className="history-list">
                  {history.map((entry) => (
                    <div className="history-item" key={entry.versionPath}>
                      <strong>{formatDate(entry.createdAt)}</strong>
                      <span>{entry.reason}</span>
                      <div className="history-item-actions">
                        <button
                          className="small-button"
                          onClick={() => handleCompareVersion(entry)}
                          title="Compare with latest"
                        >
                          <GitCompare size={14} />
                          Compare
                        </button>
                        <button
                          className="small-button"
                          onClick={() => handleDeleteVersion(entry)}
                          title="Delete this version"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Versions appear after the first save.</p>
              )}
            </>
          )}
        </aside>

        <main className="editor-panel">
          <div className="tab-row">
            <div className="tabs">
              <button
                className={activeTab === "raw" ? "active" : ""}
                onClick={() => setActiveTab("raw")}
                title="Quick notes"
              >
                <FilePenLine size={16} />
                <span>Quick Notes</span>
              </button>
              <button
                className={activeTab === "cleansed" ? "active" : ""}
                onClick={() => setActiveTab("cleansed")}
                title="Formal notes"
              >
                <FileText size={16} />
                <span>Formal Notes</span>
              </button>
              <button
                className={activeTab === "media" ? "active" : ""}
                onClick={() => setActiveTab("media")}
                title="Media and images"
              >
                <Images size={16} />
                <span>Media</span>
              </button>
            </div>
            <div className="mode-switch">
              {[
                { key: "edit", label: "Edit", icon: PenLine },
                { key: "split", label: "Split", icon: SplitSquareHorizontal },
                { key: "preview", label: "Preview", icon: Eye },
                { key: "web", label: "Web", icon: Globe },
              ].map((item) => (
                <button
                  className={mode === item.key ? "active" : ""}
                  key={item.key}
                  onClick={() => setMode(item.key)}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {activeTab === "media" ? (
            <MediaTab content={mediaContent} basePath={document.filePath} onNotify={onNotify} />
          ) : (
            <EditorPane
              value={content}
              onChange={updateContent}
              mode={mode}
              textareaRef={textareaRef}
              basePath={document.filePath}
              showToolbar={activeTab !== "media"}
              onNotify={onNotify}
            />
          )}
        </main>
      </div>

      {compareModalOpen ? (
        <div className="diff-modal-overlay" role="dialog" aria-label="Version diff">
          <div className="diff-modal">
            <div className="diff-modal-header">
              <strong>
                Compare Latest with {compareMeta?.createdAt ? formatDate(compareMeta.createdAt) : "Version"}
              </strong>
              <div className="diff-modal-controls">
                <button
                  className={`small-button ${smartMode ? "active" : ""}`}
                  onClick={() => setSmartMode((value) => !value)}
                  title="Ignore whitespace and collapse unchanged blocks"
                >
                  <Sparkles size={14} />
                  Smart
                </button>
                <button
                  className={`small-button ${showOnlyChanges ? "active" : ""}`}
                  onClick={() => setShowOnlyChanges((value) => !value)}
                  title="Toggle changed lines only"
                >
                  <Filter size={14} />
                  {showOnlyChanges ? "All lines" : "Changes only"}
                </button>
                <button className="small-button" onClick={() => setCompareModalOpen(false)} title="Close diff">
                  <X size={14} />
                </button>
              </div>
            </div>

            {compareLoading ? (
              <p className="muted">Loading diff...</p>
            ) : (
              <div className="diff-table">
                <div className="diff-summary">
                  <span className="summary-pill added">+ {diffSummary.added} added</span>
                  <span className="summary-pill removed">- {diffSummary.removed} removed</span>
                  <span className="summary-pill changed">~ {diffSummary.changed} changed</span>
                  <span className="summary-pill neutral">{visibleRows.length} rows shown</span>
                  {smartMode ? <span className="summary-pill smart">Smart on</span> : null}
                  {hasSeparators ? <span className="summary-pill neutral">Context collapsed</span> : null}
                </div>
                <div className="diff-table-head">
                  <span>Line</span>
                  <span>Latest</span>
                  <span>Selected Version</span>
                </div>
                <div className="diff-table-body">
                  {visibleRows.map((row) => {
                    if (row?.kind === "separator") {
                      return (
                        <div className="diff-separator" key={row.id}>
                          ... {row.omitted} unchanged lines hidden ...
                        </div>
                      );
                    }

                    return (
                      <div className={`diff-row ${row.status}`} key={`diff-${row.line}`}>
                        <span>{row.line}</span>
                        <pre className="diff-cell latest" data-prefix={row.status === "added" ? "+" : row.status === "changed" ? "~" : ""}>
                          {row.latestLine || " "}
                        </pre>
                        <pre className="diff-cell previous" data-prefix={row.status === "removed" ? "-" : row.status === "changed" ? "~" : ""}>
                          {row.previousLine || " "}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

    </div>
  );
}
