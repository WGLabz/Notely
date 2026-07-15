import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { readDiagramImage, readDiagramSource, writeDiagramSource } from "../services/diagramService";
import { downloadImage } from "../services/electronService";
import ExcalidrawComponent from "./ExcalidrawEditor";
import "./ExcalidrawBlock.css";

export function ExcalidrawBlock({ imagePath, diagramId, documentPath, originAssetPath, originAltText, onUpdate, onNotify, onForceSaveNote }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [thumbnail, setThumbnail] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [diagramData, setDiagramData] = useState(null);

  useEffect(() => {
    if (!diagramId || !documentPath) return;

    let cancelled = false;
    const loadDiagram = async () => {
      try {
        setLoading(true);

        const source = await readDiagramSource(documentPath, diagramId);
        if (!cancelled && source) {
          setDiagramData(source);
        }

        const imageDataUrl = await readDiagramImage(documentPath, diagramId);
        if (!cancelled) {
          if (imageDataUrl) {
            setThumbnail(imageDataUrl);
          } else if (imagePath) {
            // fallback for legacy references
            setThumbnail(imagePath);
          }
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load diagram:", err);
          setError("Failed to load diagram");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDiagram();
    return () => {
      cancelled = true;
    };
  }, [diagramId, documentPath, imagePath]);

  const handleDownload = async () => {
    if (!thumbnail) return;
    try {
      const result = await downloadImage(thumbnail, `${diagramId || "diagram"}.png`);
      if (result?.success) {
        onNotify?.("Diagram exported successfully.", "success");
      }
    } catch (err) {
      console.error("Failed to download diagram:", err);
      onNotify?.("Failed to export diagram.", "error");
    }
  };

  const handleSave = async (newDiagramData, previewImageData) => {
    try {
      setLoading(true);
      
      // Save source file
      const sourceSaved = await writeDiagramSource(documentPath, diagramId, newDiagramData);
      if (!sourceSaved) {
        throw new Error("Failed to persist diagram source");
      }

      if (previewImageData) {
        setThumbnail(previewImageData);
      }
      
      setDiagramData(newDiagramData);
      onUpdate?.({
        diagramId,
        imagePath,
        data: newDiagramData,
      });
      
      setError("");
      onNotify?.("Diagram saved successfully.", "success");
      onForceSaveNote?.();
    } catch (err) {
      console.error("Failed to save diagram:", err);
      setError("Failed to save diagram");
      onNotify?.("Failed to save diagram.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="excalidraw-block"
      data-diagram-id={diagramId || ""}
      data-diagram-image-path={imagePath || ""}
      data-origin-asset-path={originAssetPath || ""}
      data-origin-alt-text={originAltText || ""}
    >
      <div
        className="excalidraw-preview-container"
        onClick={() => !loading && setIsModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyPress={(e) => {
          if (e.key === "Enter" && !loading) setIsModalOpen(true);
        }}
      >
        {loading && <div className="excalidraw-loading">Loading...</div>}
        
        {thumbnail && !loading ? (
          <div className="excalidraw-preview-thumbnail">
            <img 
              src={thumbnail} 
              alt="Diagram preview" 
              className="diagram-image"
              onError={() => setThumbnail(null)}
            />
            <button
              className="excalidraw-download-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              title="Download diagram as PNG"
              aria-label="Download diagram as PNG"
            >
              <Download size={14} />
            </button>
            <span className="click-hint">(Click to edit)</span>
          </div>
        ) : !loading ? (
          <div className="excalidraw-empty-state">
            <div className="empty-icon">📐</div>
            <span>Click to create a diagram</span>
          </div>
        ) : null}
      </div>

      {error && <div className="excalidraw-error">{error}</div>}

      {isModalOpen && (
        <ExcalidrawComponent
          initialData={diagramData}
          diagramId={diagramId}
          documentPath={documentPath}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
