import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X, ExternalLink } from "lucide-react";
import OverlayDialog from "./OverlayDialog";
import AppButton from "./AppButton";
import { MarkdownPreview } from "./MarkdownPreview";
import { readDocument } from "../services/electronService";

export function NotePreviewModal({
  open = false,
  filePath = null,
  lineNum = null,
  title = null,
  onClose,
  onOpenDocument
}) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Normalize path & line number
  let targetPath = filePath || "";
  let targetLine = lineNum;

  if (targetPath && targetPath.includes("#L")) {
    const parts = targetPath.split("#L");
    targetPath = parts[0];
    if (!targetLine && parts[1]) {
      targetLine = parseInt(parts[1], 10);
    }
  }

  // Strip file:/// prefix and normalize slashes
  if (targetPath.startsWith("file:///")) {
    targetPath = decodeURIComponent(targetPath.replace("file:///", ""));
    if (navigator.platform.indexOf("Win") !== -1) {
      targetPath = targetPath.replace(/\//g, "\\");
    }
  } else if (targetPath.startsWith("file://")) {
    targetPath = decodeURIComponent(targetPath.replace("file://", ""));
    if (navigator.platform.indexOf("Win") !== -1) {
      targetPath = targetPath.replace(/\//g, "\\");
    }
  }

  const fileName = title || targetPath.split(/[\\/]/).pop() || "Note Preview";

  useEffect(() => {
    if (!open || !targetPath) {
      setContent("");
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    async function loadNoteContent() {
      try {
        let noteText = "";

        // 1. Try readDocument from electronService (window.notesApi)
        try {
          const res = await readDocument(targetPath);
          noteText = typeof res === "string" ? res : res?.content || res?.text || "";
        } catch (apiErr) {
          console.warn("[NotePreviewModal] readDocument IPC fallback:", apiErr?.message);
        }

        // 2. Fallback to notesApi.readMarkdownSource if available
        if (!noteText && window.notesApi?.readMarkdownSource) {
          try {
            const res = await window.notesApi.readMarkdownSource(targetPath);
            noteText = typeof res === "string" ? res : res?.content || res?.text || "";
          } catch { /* ignore */ }
        }

        // 3. Fallback to window.require('fs') if in Electron renderer
        if (!noteText && typeof window !== "undefined" && window.require) {
          try {
            const fs = window.require("fs");
            if (fs && fs.existsSync && fs.existsSync(targetPath)) {
              noteText = fs.readFileSync(targetPath, "utf8");
            }
          } catch { /* ignore */ }
        }

        if (isMounted) {
          if (noteText) {
            setContent(noteText);
            setError(null);
          } else {
            setError(`Unable to read note file: "${targetPath}"`);
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error("[NotePreviewModal] Error reading note:", err);
          setError(`Failed to load note content: ${err.message}`);
          setIsLoading(false);
        }
      }
    }

    loadNoteContent();

    return () => {
      isMounted = false;
    };
  }, [open, targetPath]);

  if (!open) return null;

  const modalElement = (
    <OverlayDialog
      open={open}
      onClose={onClose}
      ariaLabel={`Preview of ${fileName}`}
      useDefaultCardClass={false}
      size=""
      cardClassName="note-preview-modal-card"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "min(80vw, calc(100vw - 32px))",
          maxHeight: "85vh",
          height: "650px",
          background: "var(--surface-bg, #ffffff)",
          color: "var(--text-strong, var(--app-text, #333333))",
          border: "1px solid var(--border-soft, #e2e8f0)",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "var(--shadow-overlay, 0 10px 30px rgba(0,0,0,0.3))"
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-soft, #e2e8f0)",
            background: "var(--surface-elevated, var(--surface-muted, #f8fafc))",
            flexShrink: 0
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
            <FileText size={16} style={{ color: "var(--accent-solid, #6366f1)", flexShrink: 0 }} />
            <span
              style={{
                fontWeight: 600,
                fontSize: "13px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              {fileName}
            </span>
            {targetLine ? (
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: "var(--accent-muted, rgba(99,102,241,0.2))",
                  color: "var(--accent-solid, #6366f1)",
                  fontFamily: "monospace",
                  flexShrink: 0
                }}
              >
                Line {targetLine}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-subtle)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              borderRadius: "4px"
            }}
            title="Close Preview"
            aria-label="Close Preview"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            padding: "16px",
            overflowY: "auto",
            fontSize: "13px",
            lineHeight: "1.6",
            background: "var(--surface-bg, #ffffff)"
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-muted)",
                fontSize: "13px"
              }}
            >
              Loading note content…
            </div>
          ) : error ? (
            <div
              style={{
                padding: "16px",
                borderRadius: "6px",
                background: "var(--surface-accent, rgba(239,68,68,0.1))",
                color: "var(--accent-danger, #ef4444)",
                fontSize: "12px",
                border: "1px solid var(--border-soft)"
              }}
            >
              {error}
            </div>
          ) : content ? (
            <MarkdownPreview
              content={content}
              basePath={targetPath}
              readOnly
            />
          ) : (
            <div
              style={{
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "40px"
              }}
            >
              Note is empty.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "10px 14px",
            borderTop: "1px solid var(--border-soft)",
            background: "var(--surface-subtle)",
            flexShrink: 0
          }}
        >
          <AppButton variant="small" onClick={onClose}>
            Close
          </AppButton>

          <AppButton
            variant="primary"
            onClick={() => {
              onOpenDocument?.(targetPath, targetLine);
              onClose?.();
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <ExternalLink size={14} />
            <span>Open in Editor</span>
          </AppButton>
        </div>
      </div>
    </OverlayDialog>
  );

  return typeof document !== "undefined"
    ? createPortal(modalElement, document.body)
    : modalElement;
}

export default NotePreviewModal;
