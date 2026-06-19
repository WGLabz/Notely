import { useRef } from "react";
import {
  Home,
  Save,
  RotateCcw,
  FileText,
  FilePenLine,
  PenLine,
  SplitSquareHorizontal,
  Eye,
  Clock,
  MapPin,
  User,
  Images,
} from "lucide-react";
import { EditorPane } from "./EditorPane";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MediaTab } from "./MediaTab";
import { formatDate } from "../utils/dateUtils";

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
}) {
  const textareaRef = useRef(null);
  const content = activeTab === "raw" ? document.rawNotes : document.cleansed;
  const mediaContent = `${document.rawNotes || ""}\n\n${document.cleansed || ""}`.trim();

  const updateContent = (value) => {
    onChange({
      ...document,
      [activeTab === "raw" ? "rawNotes" : "cleansed"]: value,
    });
  };

  return (
    <div className="detail-shell">
      <div className="detail-topbar">
        <button className="back-button" onClick={onHome} title="Back to home">
          <Home size={18} />
        </button>
        <div className="crumb">Notes / {document.title}</div>
        <div className="save-status">{dirty ? "Unsaved changes" : "Saved"}</div>
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

      <div className="workspace">
        <aside className="history-panel">
          <div className="panel-title-row">
            <h2>Versions</h2>
            <button className="small-button" onClick={onRefreshHistory} title="Refresh history">
              <RotateCcw size={16} />
            </button>
          </div>
          {history.length ? (
            <div className="history-list">
              {history.map((entry) => (
                <div className="history-item" key={entry.versionPath}>
                  <strong>{formatDate(entry.createdAt)}</strong>
                  <span>{entry.reason}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Versions appear after the first save.</p>
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
            {mode !== "preview" && activeTab !== "media" && (
              <MarkdownToolbar value={content} onChange={updateContent} textareaRef={textareaRef} />
            )}
            <div className="mode-switch">
              {[
                { key: "edit", label: "Edit", icon: PenLine },
                { key: "split", label: "Split", icon: SplitSquareHorizontal },
                { key: "preview", label: "Preview", icon: Eye },
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
            <MediaTab content={mediaContent} basePath={document.filePath} />
          ) : (
            <EditorPane
              value={content}
              onChange={updateContent}
              mode={mode}
              textareaRef={textareaRef}
              basePath={document.filePath}
            />
          )}
        </main>
      </div>
    </div>
  );
}
