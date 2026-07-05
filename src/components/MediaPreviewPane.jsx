/**
 * MediaPreviewPane - Displays preview of media files (images, videos, audio, PDFs)
 * Used in split view and preview mode
 */

import { useEffect, useRef, useState } from "react";
import { X, Volume2, VolumeX, Pencil, Download, RotateCcw, ZoomIn, ZoomOut, Maximize2, ExternalLink } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker";
import { ImageCropModal } from "./ImageCropModal";
import {
  getImageDimensions,
  getImageFileSize,
  formatFileSize,
} from "../utils/imageProcessingUtils";
import { readImage, replaceImage, getImageAnnotation, setImageAnnotation, getImageOriginalStatus, restoreImageOriginal, openMediaInDefaultApp } from "../services/electronService";
import "../styles/mediaPreview.css";

// Initialize the pdf.js worker once via a Vite-bundled module worker so it
// runs offline and under Electron's file:// scheme (no CDN, no URL resolution
// quirks).
let pdfWorkerPort = null;
function ensurePdfWorker() {
  if (typeof window === "undefined") return;
  if (pdfjsLib.GlobalWorkerOptions.workerPort) return;
  if (!pdfWorkerPort) {
    pdfWorkerPort = new PdfWorker();
  }
  pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorkerPort;
}

function dataUrlToUint8Array(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;
  try {
    const binary = atob(dataUrl.slice(commaIndex + 1));
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function getDocumentKind(extension) {
  const ext = String(extension || "").toLowerCase();
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return { icon: "📝", family: "Word Document" };
  if (["xls", "xlsx", "csv", "tsv", "ods"].includes(ext)) return { icon: "📊", family: "Spreadsheet" };
  if (["ppt", "pptx", "odp"].includes(ext)) return { icon: "📽️", family: "Presentation" };
  if (["txt", "md", "markdown", "log"].includes(ext)) return { icon: "📄", family: "Text File" };
  if (["json", "xml", "yaml", "yml"].includes(ext)) return { icon: "🧩", family: "Data File" };
  if (["zip", "7z", "rar"].includes(ext)) return { icon: "🗜️", family: "Archive" };
  return { icon: "📃", family: "Document" };
}

export function MediaPreviewPane({ mediaPath, mediaType, basePath, showOriginalImages = false, onClose, onMediaChanged }) {
  const [error, setError] = useState(null);
  const [pdfPageImages, setPdfPageImages] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [displayedImage, setDisplayedImage] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [editImageSrc, setEditImageSrc] = useState("");
  const [annotationOnly, setAnnotationOnly] = useState(false);
  const [imageAnnotation, setImageAnnotationState] = useState(null);
  const [originalStatus, setOriginalStatus] = useState({ hasOriginal: false });
  const [restoringOriginal, setRestoringOriginal] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  const [resolvedPath, setResolvedPath] = useState(null);
  const [openingExternal, setOpeningExternal] = useState(false);
  const fileName = (mediaPath || "").split(/[\\/]/).pop() || mediaPath;
  const fileExtension = String(fileName || "").split(".").pop()?.toLowerCase() || "";
  const docKind = getDocumentKind(fileExtension);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!mediaPath) {
        if (!cancelled) setResolvedPath(null);
        return;
      }

      if (/^(data:|blob:|https?:)/i.test(mediaPath)) {
        if (!cancelled) setResolvedPath(mediaPath);
        return;
      }

      if (!basePath) {
        if (!cancelled) setResolvedPath(mediaPath);
        return;
      }

      try {
        const result = await readImage(basePath, mediaPath, {
          thumbnail: false,
        });
        if (!cancelled) setResolvedPath(result || mediaPath);
      } catch {
        if (!cancelled) setResolvedPath(mediaPath);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [basePath, mediaPath, mediaType, showOriginalImages]);

  useEffect(() => {
    setError(null);
    setPdfPageImages([]);
    setPdfLoading(false);
    setDisplayedImage(null);
    setImageInfo(null);
    setShowCropModal(false);
    setEditImageSrc("");
    setAnnotationOnly(false);
    setImageAnnotationState(null);
    setOriginalStatus({ hasOriginal: false });
    setRestoringOriginal(false);
    setContextMenu(null);
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setIsDragging(false);

    if (!resolvedPath) return;

    if (mediaType === "pdf" && mediaPath) {
      loadPdf(resolvedPath);
    }

    if (mediaType === "image" && mediaPath) {
      loadImage(resolvedPath);
      loadImageAnnotation();
      loadOriginalStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaPath, mediaType, resolvedPath, showOriginalImages]);

  const loadImageAnnotation = async () => {
    if (!basePath || !mediaPath || /^(data:|blob:|https?:)/i.test(mediaPath)) {
      setImageAnnotationState(null);
      return;
    }

    try {
      setImageAnnotationState(await getImageAnnotation(basePath, mediaPath));
    } catch {
      setImageAnnotationState(null);
    }
  };

  const loadOriginalStatus = async () => {
    if (!basePath || !mediaPath || /^(data:|blob:|https?:)/i.test(mediaPath)) {
      setOriginalStatus({ hasOriginal: false });
      return;
    }

    try {
      setOriginalStatus(await getImageOriginalStatus(basePath, mediaPath));
    } catch {
      setOriginalStatus({ hasOriginal: false });
    }
  };

  const loadImage = async (path) => {
    try {
      setDisplayedImage(path);
      try {
        const dimensions = await getImageDimensions(path);
        const fileSize = getImageFileSize(path);
        setImageInfo({
          dimensions,
          fileSize,
          formattedSize: formatFileSize(fileSize),
        });
      } catch {
        setImageInfo(null);
      }
    } catch (err) {
      setError(`Failed to load image: ${err.message}`);
    }
  };

  const readFullImage = async () => {
    if (!basePath || !mediaPath || /^(data:|blob:|https?:)/i.test(mediaPath)) {
      return displayedImage || resolvedPath;
    }

    return await readImage(basePath, mediaPath);
  };

  const handleDownloadImage = async () => {
    const fullImage = await readFullImage();
    if (!fullImage) return;
    const link = document.createElement("a");
    link.href = fullImage;
    link.download = mediaPath.split("/").pop() || "image.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadMedia = () => {
    if (!resolvedPath) return;
    const link = document.createElement("a");
    link.href = resolvedPath;
    link.download = fileName || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInDefaultApp = async () => {
    if (!basePath || !mediaPath || /^(data:|blob:|https?:)/i.test(mediaPath)) return;
    try {
      setOpeningExternal(true);
      await openMediaInDefaultApp(basePath, mediaPath);
    } catch (err) {
      setError(`Failed to open file: ${err?.message || "Unknown error"}`);
    } finally {
      setOpeningExternal(false);
    }
  };

  const handleZoomIn = () => {
    setImageZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setImageZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleZoomReset = () => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  };

  const handleImageContextMenu = (event) => {
    if (!displayedImage) return;
    event.preventDefault();
    const bounds = imageRef.current?.getBoundingClientRect();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      anchorX: bounds?.left + (bounds?.width || 0) * 0.5,
      anchorY: bounds?.top + (bounds?.height || 0) * 0.5,
    });
  };

  const handleOpenCrop = async (options = {}) => {
    try {
      const fullImage = await readFullImage();
      setEditImageSrc(fullImage || displayedImage || resolvedPath || "");
      setAnnotationOnly(Boolean(options.annotationOnly));
      await loadImageAnnotation();
      setShowCropModal(true);
      setContextMenu(null);
    } catch (err) {
      setError(`Failed to open full image: ${err.message}`);
    }
  };

  const handleSaveCrop = async (editedDataUrl, annotation) => {
    try {
      setShowCropModal(false);
      if (basePath && mediaPath && !/^(data:|blob:|https?:)/i.test(mediaPath)) {
        if (editedDataUrl) {
          setDisplayedImage(editedDataUrl);
          const dimensions = await getImageDimensions(editedDataUrl);
          setImageInfo({
            ...imageInfo,
            dimensions,
            fileSize: getImageFileSize(editedDataUrl),
            formattedSize: formatFileSize(getImageFileSize(editedDataUrl)),
          });
          await replaceImage(basePath, mediaPath, editedDataUrl);
        }

        const savedAnnotation = await setImageAnnotation(basePath, mediaPath, annotation);
        setImageAnnotationState(savedAnnotation);
        await loadOriginalStatus();
        onMediaChanged?.(mediaPath);
      }
    } catch (err) {
      setError(`Failed to save image edit: ${err.message}`);
    }
  };

  const handleRestoreOriginal = async () => {
    if (!basePath || !mediaPath || restoringOriginal || !originalStatus?.hasOriginal) return;

    const approved = window.confirm("Restore the original image from .notes-app backup? This will overwrite the current edited image.");
    if (!approved) return;

    try {
      setRestoringOriginal(true);
      await restoreImageOriginal(basePath, mediaPath);
      const fullImage = await readImage(basePath, mediaPath);
      setDisplayedImage(fullImage || mediaPath);

      // Update editImageSrc so that the ImageCropModal's imageSrc prop reflects the
      // restored original. Without this, subsequent rotation in the modal would still
      // use the old (edited) image as its base, producing degraded output.
      if (fullImage) {
        setEditImageSrc(fullImage);
      }

      try {
        const dimensions = await getImageDimensions(fullImage || mediaPath);
        const fileSize = getImageFileSize(fullImage || mediaPath);
        setImageInfo({
          dimensions,
          fileSize,
          formattedSize: formatFileSize(fileSize),
        });
      } catch {
        setImageInfo(null);
      }

      await loadOriginalStatus();
      onMediaChanged?.(mediaPath);
      return fullImage || displayedImage || resolvedPath || "";
    } catch (err) {
      setError(`Failed to restore original image: ${err.message}`);
      return "";
    } finally {
      setRestoringOriginal(false);
    }
  };

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  // Handle keyboard zoom shortcuts
  useEffect(() => {
    if (mediaType !== "image") return;

    const handleKeyDown = (event) => {
      // Check if we're typing in an input field
      if (
        event.target.tagName === "INPUT" ||
        event.target.tagName === "TEXTAREA" ||
        event.target.contentEditable === "true"
      ) {
        return;
      }

      if (event.key === "+") {
        event.preventDefault();
        handleZoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        handleZoomOut();
      } else if (event.key === "1" || event.key === "0") {
        event.preventDefault();
        handleZoomReset();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mediaType]);

  // Handle mouse wheel zoom and drag to pan
  useEffect(() => {
    if (mediaType !== "image" || !containerRef.current) return;

    const container = containerRef.current;

    const handleWheel = (event) => {
      if (!displayedImage) return;
      event.preventDefault();
      
      const zoomDelta = event.deltaY > 0 ? -0.1 : 0.1;
      setImageZoom((prev) => Math.max(0.5, Math.min(3, prev + zoomDelta)));
    };

    const handleMouseDown = (event) => {
      if (imageZoom <= 1) return;
      setIsDragging(true);
      setDragStart({ x: event.clientX, y: event.clientY });
    };

    const handleMouseMove = (event) => {
      if (!isDragging || !dragStart) return;

      const deltaX = event.clientX - dragStart.x;
      const deltaY = event.clientY - dragStart.y;

      setImagePan((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));

      setDragStart({ x: event.clientX, y: event.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
    };

    const handleDoubleClick = () => {
      handleZoomReset();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("dblclick", handleDoubleClick);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("dblclick", handleDoubleClick);
    };
  }, [displayedImage, imageZoom, isDragging, dragStart, mediaType]);

  const loadPdf = async (source) => {
    setPdfLoading(true);
    try {
      ensurePdfWorker();
      const input = typeof source === "string" && source.startsWith("data:")
        ? { data: dataUrlToUint8Array(source) }
        : source;
      const pdf = await pdfjsLib.getDocument(input).promise;
      await renderPdfPages(pdf);
    } catch (err) {
      setError(`Failed to load PDF: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

  const renderPdfPages = async (pdf) => {
    try {
      const renderedPages = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        renderedPages.push({
          page: pageNum,
          dataUrl: canvas.toDataURL(),
        });
      }

      setPdfPageImages(renderedPages);
    } catch (err) {
      setError(`Failed to render PDF: ${err.message}`);
    }
  };

  if (!mediaPath) {
    return null;
  }

  return (
    <div className="media-preview-pane">
      <div className="media-preview-header">
        <div className="media-preview-title">
          <span className="media-preview-icon">
            {mediaType === "image" && "🖼️"}
            {mediaType === "video" && "🎬"}
            {mediaType === "audio" && "🎵"}
            {mediaType === "pdf" && "📄"}
            {mediaType === "document" && docKind.icon}
          </span>
          <span className="media-preview-filename" data-tooltip={mediaPath}>
            {fileName}
          </span>
          {fileExtension ? <span className="media-preview-ext">{fileExtension.toUpperCase()}</span> : null}
        </div>
        <button
          className="media-preview-close"
          onClick={onClose}
          data-tooltip="Close preview"
          aria-label="Close media preview"
        >
          <X size={16} />
        </button>
      </div>

      <div className={`media-preview-content ${mediaType === "pdf" ? "pdf-mode" : ""}`}>
        {error && <div className="media-preview-error">{error}</div>}

        {mediaType === "image" && !error && (
          <div className="media-preview-image-full">
            <div className="media-preview-image-controls">
              <div className="image-zoom-controls">
                <button
                  className="image-action-button icon-only"
                  onClick={handleZoomOut}
                  disabled={imageZoom <= 0.5}
                  data-tooltip="Zoom out"
                  aria-label="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="zoom-level">{Math.round(imageZoom * 100)}%</span>
                <button
                  className="image-action-button icon-only"
                  onClick={handleZoomIn}
                  disabled={imageZoom >= 3}
                  data-tooltip="Zoom in"
                  aria-label="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  className="image-action-button icon-only"
                  onClick={handleZoomReset}
                  disabled={imageZoom === 1}
                  data-tooltip="Reset zoom"
                  aria-label="Reset zoom"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
              <div className="image-action-buttons">
                <button
                  className="image-action-button"
                  onClick={() => handleOpenCrop({ annotationOnly: true })}
                  data-tooltip="Annotate image"
                  aria-label="Annotate image"
                >
                  <Pencil size={14} />
                  <span>Annotate</span>
                </button>
                {originalStatus?.hasOriginal ? (
                  <button
                    className="image-action-button"
                    onClick={handleRestoreOriginal}
                    data-tooltip="Restore original image"
                    aria-label="Restore original image"
                    disabled={restoringOriginal}
                  >
                    <RotateCcw size={14} />
                    <span>{restoringOriginal ? "Restoring..." : "Restore Original"}</span>
                  </button>
                ) : null}
                <button
                  className="image-action-button icon-only"
                  onClick={handleDownloadImage}
                  data-tooltip="Download image"
                  aria-label="Download image"
                >
                  <Download size={14} />
                </button>
              </div>
            </div>

            <div className="media-preview-image-container" ref={containerRef}>
              <div
                className="media-preview-image-frame"
                style={{
                  transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
                  transformOrigin: "center",
                  cursor: imageZoom > 1 && isDragging ? "grabbing" : imageZoom > 1 ? "grab" : "default",
                }}
              >
                <img
                  ref={imageRef}
                  src={displayedImage || resolvedPath}
                  alt="Preview"
                  onError={() => setError("Failed to load image")}
                  onContextMenu={handleImageContextMenu}
                  data-tooltip="Use the controls above to annotate or edit"
                />
                {imageAnnotation?.text ? (
                  <span className="media-preview-image-annotation">
                    {imageAnnotation.text}
                  </span>
                ) : null}
              </div>
            </div>

            {imageInfo && (
              <div className="image-info-bar">
                <span className="info-item">
                  📐 {imageInfo.dimensions.width} × {imageInfo.dimensions.height}px
                </span>
                <span className="info-item">
                  💾 {imageInfo.formattedSize}
                </span>
              </div>
            )}
          </div>
        )}

        {mediaType === "video" && !error && (
          <div className="media-preview-video-container">
            <video ref={videoRef} controls>
              <source src={resolvedPath} />
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {mediaType === "audio" && !error && (
          <div className="media-preview-audio-container">
            <div className="audio-visualizer">
              <div className="audio-icon">🎵</div>
              <div className="audio-info">
                <div className="audio-filename">{mediaPath.split("/").pop()}</div>
              </div>
            </div>
            <audio ref={audioRef} controls style={{ width: "100%" }}>
              <source src={resolvedPath} />
              Your browser does not support the audio tag.
            </audio>
            <button
              className="audio-mute-button"
              onClick={() => setIsMuted(!isMuted)}
              data-tooltip={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          </div>
        )}

        {mediaType === "pdf" && !error && (
          <div className="media-preview-pdf-container">
            <div className="pdf-viewer">
              {pdfLoading ? <p className="pdf-empty-state">Rendering PDF...</p> : null}
              {!pdfLoading && !pdfPageImages.length ? <p className="pdf-empty-state">No pages to display.</p> : null}
              {pdfPageImages.map((entry) => (
                <div className="pdf-page-frame" key={`pdf-page-${entry.page}`}>
                  <img src={entry.dataUrl} alt={`PDF page ${entry.page}`} />
                  <span className="pdf-page-label">Page {entry.page}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mediaType === "document" && !error && (
          <div className="media-preview-document-container">
            <div className="document-icon">{docKind.icon}</div>
            <p className="document-family">{docKind.family}</p>
            <p>Inline preview is not available for this format.</p>
            <p className="document-filename">{fileName}</p>
            <button
              className="image-action-button"
              type="button"
              onClick={handleOpenInDefaultApp}
              disabled={!basePath || openingExternal}
              data-tooltip="Open in default app"
              aria-label="Open in default app"
            >
              <ExternalLink size={14} />
              <span>{openingExternal ? "Opening..." : "Open in App"}</span>
            </button>
            <button
              className="image-action-button"
              type="button"
              onClick={handleDownloadMedia}
              data-tooltip="Download file"
              aria-label="Download file"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
            <p className="document-hint">Open the downloaded file in your preferred app.</p>
          </div>
        )}
      </div>

      {showCropModal && editImageSrc && (
        <ImageCropModal
          open={showCropModal}
          imageSrc={editImageSrc}
          imageLabel={mediaPath.split("/").pop()}
          initialAnnotation={imageAnnotation}
          annotationOnly={annotationOnly}
          restoreOriginalAvailable={originalStatus?.hasOriginal}
          restoringOriginal={restoringOriginal}
          onClose={() => {
            setShowCropModal(false);
            setEditImageSrc("");
            setAnnotationOnly(false);
          }}
          onRestoreOriginal={handleRestoreOriginal}
          onSave={handleSaveCrop}
        />
      )}

      {contextMenu && (
        <div
          ref={menuRef}
          className="media-context-menu"
          style={{
            position: "fixed",
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            zIndex: 10000,
          }}
        >
          <button
            className="media-context-menu-item"
            onClick={() => handleOpenCrop({ annotationOnly: false })}
          >
            ✏️ Edit image
          </button>
        </div>
      )}
    </div>
  );
}
