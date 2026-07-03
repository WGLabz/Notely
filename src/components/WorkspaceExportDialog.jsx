import { Download, X } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";

export function WorkspaceExportDialog({
  isOpen,
  values,
  loading = false,
  progress,
  onClose,
  onChange,
  onBrowse,
  onExport,
}) {
  if (!isOpen) return null;
  const supportsSectionModes = values.mode === "pdf" || values.mode === "web";

  return (
    <OverlayDialog open={isOpen} onClose={onClose} ariaLabel="Export workspace as zip" cardClassName="workspace-export-dialog-card">
      <div className="overlay-dialog-header">
        <h2>Export Workspace as Zip</h2>
        <button
          className="icon-button"
          onClick={onClose}
          type="button"
          aria-label="Close workspace export dialog"
          disabled={loading}
        >
          <X size={16} />
        </button>
      </div>

      <p className="workspace-export-intro">
        Create a portable zip bundle for this workspace. Choose the output format, metadata inclusion, destination, and filename.
      </p>

      <label className="overlay-dialog-field" htmlFor="workspace-export-mode">
        <span>Export format</span>
        <select
          id="workspace-export-mode"
          value={values.mode}
          onChange={(event) => onChange({ mode: event.target.value })}
          disabled={loading}
        >
          <option value="raw">Notes as-is (Markdown + assets)</option>
          <option value="pdf">PDF-only</option>
          <option value="web">Web format (static HTML package)</option>
        </select>
      </label>

      {supportsSectionModes ? (
        <label className="overlay-dialog-field" htmlFor="workspace-export-content-mode">
          <span>Section export</span>
          <select
            id="workspace-export-content-mode"
            value={values.contentMode || "combined"}
            onChange={(event) => onChange({ contentMode: event.target.value })}
            disabled={loading}
          >
            <option value="combined">Combined file (Raw + Cleansed together)</option>
            <option value="separate">Separate files (Raw and Cleansed split)</option>
            <option value="raw">Raw Notes only</option>
            <option value="cleansed">Cleansed only</option>
          </select>
        </label>
      ) : null}

      <label className="overlay-dialog-checkbox" htmlFor="workspace-export-include-metadata">
        <input
          id="workspace-export-include-metadata"
          type="checkbox"
          checked={Boolean(values.includeMetadata)}
          onChange={(event) => onChange({ includeMetadata: event.target.checked })}
          disabled={loading}
        />
        <span>
          <strong>Include .notes-app metadata</strong>
          <small>Off by default. Enable only when you want to transfer app metadata, cache, versions, and internal state.</small>
        </span>
      </label>

      <label className="overlay-dialog-field" htmlFor="workspace-export-destination">
        <span>Destination folder</span>
        <div className="workspace-export-destination-row">
          <input
            id="workspace-export-destination"
            type="text"
            value={values.destinationPath}
            onChange={(event) => onChange({ destinationPath: event.target.value })}
            placeholder="Choose an export destination"
            disabled={loading}
          />
          <button
            className="small-button"
            type="button"
            onClick={onBrowse}
            disabled={loading}
          >
            Browse
          </button>
        </div>
      </label>

      <label className="overlay-dialog-field" htmlFor="workspace-export-filename">
        <span>Zip file name</span>
        <input
          id="workspace-export-filename"
          type="text"
          value={values.fileName}
          onChange={(event) => onChange({ fileName: event.target.value })}
          placeholder="workspace_docs_dd_mm_yyyy.zip"
          disabled={loading}
        />
      </label>

      <div className="overlay-dialog-actions">
        <button className="small-button" type="button" onClick={onClose} disabled={loading}>
          <X size={14} />
          <span>Cancel</span>
        </button>
        <button className="primary-button" type="button" onClick={onExport} disabled={loading}>
          <Download size={14} />
          <span>{loading ? "Exporting..." : "Export Zip"}</span>
        </button>
      </div>

      {loading ? (
        <div className="workspace-export-progress" aria-live="polite">
          <div className="workspace-export-progress-head">
            <strong>{progress?.phase || "Exporting..."}</strong>
            <span>{Number.isFinite(Number(progress?.percent)) ? `${Math.round(Number(progress.percent))}%` : ""}</span>
          </div>
          <div className="workspace-export-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Number(progress?.percent || 0))}>
            <div className="workspace-export-progress-fill" style={{ width: `${Math.max(0, Math.min(100, Number(progress?.percent || 0)))}%` }} />
          </div>
        </div>
      ) : null}
    </OverlayDialog>
  );
}

export default WorkspaceExportDialog;
