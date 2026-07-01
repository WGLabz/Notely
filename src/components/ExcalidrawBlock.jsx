import { useEffect, useState } from "react";
import { readDiagramImage, readDiagramSource, writeDiagramSource } from "../services/diagramService";
import ExcalidrawComponent from "./ExcalidrawEditor";
import "./ExcalidrawBlock.css";

export function ExcalidrawBlock({ imagePath, diagramId, documentPath, originAssetPath, originAltText, onUpdate }) {
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
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save diagram:", err);
      setError("Failed to save diagram");
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
