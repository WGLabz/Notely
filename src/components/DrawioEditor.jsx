import { useEffect, useRef, useState, useCallback } from "react";
import { Save, X } from "lucide-react";
import AppButton from "./AppButton";
import OverlayDialog from "./OverlayDialog";
import useConfirm from "../hooks/useConfirm";
import { writeDrawioSource, writeDrawioImage } from "../services/drawioService";
import "./ExcalidrawEditor.css"; // Reuse modal styling

export function DrawioEditor({
  initialData, // XML string
  diagramId,
  onClose,
  onSave,
}) {
  const iframeRef = useRef(null);
  const saveButtonRef = useRef(null);
  const { confirm } = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const lastSavedXmlRef = useRef(initialData || "");

  // Intercept close attempt if there are unsaved changes
  const handleClose = useCallback(async () => {
    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: "Discard Changes?",
        message: "You have unsaved changes. Are you sure you want to discard them?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        variant: "danger"
      });
      if (!confirmed) return;
    }
    onClose?.();
  }, [hasUnsavedChanges, onClose, confirm]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleClose]);

  const triggerSave = useCallback(() => {
    if (!iframeRef.current || isSaving) return;
    setIsSaving(true);
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        action: "export",
        format: "png",
        spin: "Exporting PNG...",
      }),
      "*"
    );
  }, [isSaving]);

  // Handle postMessage communication with Draw.io iframe
  useEffect(() => {
    const handleMessage = async (event) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      let msg;
      try {
        msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return; // Non-JSON message, ignore
      }

      if (!msg || !msg.event) return;

      switch (msg.event) {
        case "init":
          setIframeLoading(false);
          // Load the initial XML drawing into Draw.io
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({
              action: "load",
              xml: lastSavedXmlRef.current || '<mxfile><diagram id="page-1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
            }),
            "*"
          );
          break;

        case "change":
          setHasUnsavedChanges(true);
          break;

        case "save":
          // When save is clicked in the iframe, trigger the export save flow
          triggerSave();
          break;

        case "export":
          // Draw.io responds with exported PNG base64 representation and XML source
          try {
            const pngDataUrl = msg.data; // data:image/png;base64,...
            const xmlContent = msg.xml || lastSavedXmlRef.current;

            if (diagramId) {
              await writeDrawioSource(diagramId, xmlContent);
              await writeDrawioImage(diagramId, pngDataUrl);
            }

            lastSavedXmlRef.current = xmlContent;
            setHasUnsavedChanges(false);
            onSave?.(xmlContent, pngDataUrl);
          } catch (err) {
            console.error("Failed to save Draw.io diagram:", err);
          } finally {
            setIsSaving(false);
          }
          break;

        case "exit":
          handleClose();
          break;

        default:
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [diagramId, hasUnsavedChanges, onSave, handleClose, triggerSave]);

  return (
    <OverlayDialog
      onClose={handleClose}
      closeOnClickOutside={false}
      ariaLabel="Create or edit Draw.io diagram"
      overlayClassName="excalidraw-modal-overlay"
      cardClassName="excalidraw-modal-container drawio-modal-container"
      useDefaultCardClass={false}
      initialFocusRef={saveButtonRef}
    >
      <div className="excalidraw-modal-header">
        <h2>Draw.io Diagram</h2>
        <div className="excalidraw-modal-actions">
          <AppButton
            ref={saveButtonRef}
            variant="primary"
            onClick={triggerSave}
            disabled={isSaving}
          >
            <Save size={14} aria-hidden="true" />
            {isSaving ? "Saving..." : "Save Diagram"}
          </AppButton>
          <AppButton variant="small" onClick={handleClose} disabled={isSaving}>
            <X size={14} aria-hidden="true" />
            Close
          </AppButton>
        </div>
      </div>

      <div className="excalidraw-workspace">
        <div className="excalidraw-editor-container" style={{ position: "relative" }}>
          {iframeLoading && (
            <div className="excalidraw-loading" style={{ zIndex: 10 }}>
              Loading Draw.io Editor...
            </div>
          )}
          <iframe
            ref={iframeRef}
            src="https://embed.diagrams.net/?embed=1&proto=json&spin=1"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "#ffffff",
            }}
            title="Draw.io Editor"
          />
        </div>
      </div>
    </OverlayDialog>
  );
}

export default DrawioEditor;
