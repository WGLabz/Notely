/**
 * MediaPreviewPane - Displays preview of media files (images, videos, audio, PDFs)
 * Used in split view and preview mode
 */

import { useEffect, useRef, useState } from "react";
import { X, Volume2, VolumeX, Pencil, Download, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { ImageCropModal } from "./ImageCropModal";
import {
  getImageDimensions,
  getImageFileSize,
  formatFileSize,
} from "../utils/imageProcessingUtils";
import { readImage, replaceImage, getImageAnnotation, setImageAnnotation, getImageOriginalStatus, restoreImageOriginal } from "../services/electronService";
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

export function MediaPreviewPane({ mediaPath, mediaType, basePath, showOriginalImages = false, onClose, onMediaChanged }) {
  const [error, setError] = useState(null);
  const [pdfPages, setPdfPages] = useState(0);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [pdfContent, setPdfContent] = useState(null);
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
  const imageRef = useRef(null);
  const menuRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  const [resolvedPath, setResolvedPath] = useState(null);

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
          thumbnail: mediaType === "image" && !showOriginalImages,
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
    setPdfPages(0);
    setCurrentPdfPage(1);
    setPdfContent(null);
    setDisplayedImage(null);
    setImageInfo(null);
    setShowCropModal(false);
    setEditImageSrc("");
    setAnnotationOnly(false);
    setImageAnnotationState(null);
    setOriginalStatus({ hasOriginal: false });
    setRestoringOriginal(false);
    setContextMenu(null);

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
          if (!showOriginalImages) {
            try {
              const thumbnail = await readImage(basePath, mediaPath, { thumbnail: true });
              setDisplayedImage(thumbnail || editedDataUrl);
            } catch {
              setDisplayedImage(editedDataUrl);
            }
          }
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
      const previewImage = showOriginalImages
        ? fullImage
        : await readImage(basePath, mediaPath, { thumbnail: true }).catch(() => fullImage);
      setDisplayedImage(previewImage || mediaPath);

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
      return fullImage || previewImage || displayedImage || resolvedPath || "";
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

  const loadPdf = async (source) => {
    try {
      ensurePdfWorker();
      const input = typeof source === "string" && source.startsWith("data:")
        ? { data: dataUrlToUint8Array(source) }
        : source;
      const pdf = await pdfjsLib.getDocument(input).promise;
      setPdfPages(pdf.numPages);
      await renderPdfPage(pdf, 1);
    } catch (err) {
      setError(`Failed to load PDF: ${err.message}`);
    }
  };

  const renderPdfPage = async (pdf, pageNum) => {
    try {
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

      setPdfContent(canvas.toDataURL());
    } catch (err) {
      setError(`Failed to render PDF page: ${err.message}`);
    }
  };

  const handlePdfPageChange = async (direction) => {
    const newPage = Math.max(1, Math.min(pdfPages, currentPdfPage + direction));
    setCurrentPdfPage(newPage);

    try {
      ensurePdfWorker();
      const input = typeof resolvedPath === "string" && resolvedPath.startsWith("data:")
        ? { data: dataUrlToUint8Array(resolvedPath) }
        : resolvedPath;
      const pdf = await pdfjsLib.getDocument(input).promise;
      await renderPdfPage(pdf, newPage);
    } catch (err) {
      setError(`Failed to load PDF page: ${err.message}`);
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
            {mediaType === "document" && "📃"}
          </span>
          <span className="media-preview-filename" title={mediaPath}>
            {(mediaPath || "").split(/[\\/]/).pop() || mediaPath}
          </span>
        </div>
        <button
          className="media-preview-close"
          onClick={onClose}
          title="Close preview"
          aria-label="Close media preview"
        >
          <X size={16} />
        </button>
      </div>

      <div className="media-preview-content">
        {error && <div className="media-preview-error">{error}</div>}

        {mediaType === "image" && !error && (
          <div className="media-preview-image-full">
            <div className="media-preview-image-controls">
              <div className="image-action-buttons">
                <button
                  className="image-action-button"
                  onClick={() => handleOpenCrop({ annotationOnly: true })}
                  title="Annotate image"
                  aria-label="Annotate image"
                >
                  <Pencil size={14} />
                  <span>Annotate</span>
                </button>
                {originalStatus?.hasOriginal ? (
                  <button
                    className="image-action-button"
                    onClick={handleRestoreOriginal}
                    title="Restore original image"
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
                  title="Download image"
                  aria-label="Download image"
                >
                  <Download size={14} />
                </button>
              </div>
            </div>

            <div className="media-preview-image-container">
              <div className="media-preview-image-frame">
                <img
                  ref={imageRef}
                  src={displayedImage || resolvedPath}
                  alt="Preview"
                  onError={() => setError("Failed to load image")}
                  onContextMenu={handleImageContextMenu}
                  title="Use the controls above to annotate or edit"
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
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          </div>
        )}

        {mediaType === "pdf" && !error && (
          <div className="media-preview-pdf-container">
            {pdfContent && (
              <div className="pdf-viewer">
                <img src={pdfContent} alt={`PDF page ${currentPdfPage}`} />
                <div className="pdf-controls">
                  <button
                    className="icon-only"
                    onClick={() => handlePdfPageChange(-1)}
                    disabled={currentPdfPage === 1}
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="pdf-page-info">
                    Page {currentPdfPage} of {pdfPages}
                  </span>
                  <button
                    className="icon-only"
                    onClick={() => handlePdfPageChange(1)}
                    disabled={currentPdfPage === pdfPages}
                    title="Next page"
                    aria-label="Next page"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mediaType === "document" && !error && (
          <div className="media-preview-document-container">
            <div className="document-icon">📃</div>
            <p>Document cannot be previewed inline</p>
            <p className="document-filename">{mediaPath.split("/").pop()}</p>
            <p className="document-hint">Download to open in your application</p>
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
