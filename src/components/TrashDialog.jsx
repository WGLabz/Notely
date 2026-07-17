import React, { useState, useEffect } from "react";
import { Trash2, RotateCcw, Folder, File, AlertCircle, X } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";
import { formatDate } from "../utils/dateUtils";

export function TrashDialog({ isOpen, onClose, onRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrashItems = async () => {
    if (!window.notesApi?.trashList) return;
    setLoading(true);
    setError(null);
    try {
      const list = await window.notesApi.trashList();
      setItems(list || []);
    } catch (err) {
      console.error("Failed to read trash list:", err);
      setError("Failed to load trash list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTrashItems();
    }
  }, [isOpen]);

  const handleRestore = async (item) => {
    if (!window.notesApi?.trashRestore) return;
    try {
      await window.notesApi.trashRestore({
        relativePath: item.relativePath,
        group: item.group
      });
      // Refresh list
      await fetchTrashItems();
      if (onRestored) {
        onRestored();
      }
    } catch (err) {
      console.error("Failed to restore item:", err);
      setError(`Failed to restore: ${err.message}`);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.notesApi?.trashEmpty) return;
    if (!window.confirm("Are you sure you want to permanently empty the trash? This cannot be undone.")) {
      return;
    }
    try {
      await window.notesApi.trashEmpty();
      setItems([]);
    } catch (err) {
      console.error("Failed to empty trash:", err);
      setError("Failed to empty trash.");
    }
  };

  return (
    <OverlayDialog open={isOpen} onClose={onClose} ariaLabel="Trash Recovery" cardClassName="trash-panel-card">
      <div className="overlay-dialog-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Trash2 size={18} />
          <h2 style={{ margin: 0 }}>Trash Bin</h2>
        </div>
        {items.length > 0 && (
          <button className="small-button danger-button" onClick={handleEmptyTrash} style={{ marginLeft: "auto", marginRight: "16px" }}>
            Empty Trash
          </button>
        )}
        <button
          className="icon-button"
          onClick={onClose}
          type="button"
          aria-label="Close trash dialog"
          style={{ marginLeft: items.length > 0 ? "0" : "auto" }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="overlay-dialog-body" style={{ minHeight: "300px", maxHeight: "450px", overflowY: "auto", padding: "16px" }}>
        {error && (
          <div className="validation-banner danger" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", padding: "8px", borderRadius: "6px" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
            <span className="loading-spinner">Loading...</span>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
            <Trash2 size={20} style={{ width: "40px", height: "40px", opacity: 0.3, marginBottom: "12px" }} />
            <p style={{ margin: 0, fontSize: "14px" }}>Your trash bin is empty.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-accent)",
                  border: "1px solid var(--border-soft)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  {item.isDirectory ? (
                    <Folder size={16} style={{ color: "#dfb06c", flexShrink: 0 }} />
                  ) : (
                    <File size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: "14px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      Original Path: {item.relativePath}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "12px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Deleted {formatDate(item.deletedAt)}
                  </span>
                  <button
                    className="small-button icon-only"
                    onClick={() => handleRestore(item)}
                    title="Restore file"
                    aria-label={`Restore ${item.name}`}
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </OverlayDialog>
  );
}
