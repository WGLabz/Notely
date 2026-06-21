/**
 * MediaPreviewPane - Displays preview of media files (images, videos, audio, PDFs)
 * Used in split view and preview mode
 */

import { useEffect, useRef, useState } from "react";
import { X, Volume2, VolumeX, RotateCw, Download } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { ImageCropModal } from "./ImageCropModal";
import {
  rotateImage,
  downsampleImage,
  IMAGE_DOWNSAMPLE_OPTIONS,
  getImageDimensions,
  getImageFileSize,
  formatFileSize,
} from "../utils/imageProcessingUtils";
import { readImage } from "../services/electronService";
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

export function MediaPreviewPane({ mediaPath, mediaType, basePath, showOriginalImages = false, onClose }) {
  const [error, setError] = useState(null);
  const [pdfPages, setPdfPages] = useState(0);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [pdfContent, setPdfContent] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [imageRotation, setImageRotation] = useState(0);
  const [displayedImage, setDisplayedImage] = useState(null);
  const [imageQuality, setImageQuality] = useState("ORIGINAL");
  const [imageInfo, setImageInfo] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);
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
        const result = await readImage(basePath, mediaPath);
        if (!cancelled) setResolvedPath(result || mediaPath);
      } catch {
        if (!cancelled) setResolvedPath(mediaPath);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [basePath, mediaPath]);

  useEffect(() => {
    setError(null);
    setPdfPages(0);
    setCurrentPdfPage(1);
    setPdfContent(null);
    setImageRotation(0);
    setDisplayedImage(null);
    setImageQuality("ORIGINAL");
    setImageInfo(null);
    setShowCropModal(false);
    setContextMenu(null);

    if (!resolvedPath) return;

    if (mediaType === "pdf" && mediaPath) {
      loadPdf(resolvedPath);
    }

    if (mediaType === "image" && mediaPath) {
      loadImage(resolvedPath, showOriginalImages);
    }
  }, [mediaPath, mediaType, resolvedPath, showOriginalImages]);

  const loadImage = async (path, preferOriginal = false) => {
    try {
      if (preferOriginal) {
        setImageQuality("ORIGINAL");
        setDisplayedImage(path);
      } else {
        const defaultQuality = "MEDIUM";
        const option = IMAGE_DOWNSAMPLE_OPTIONS[defaultQuality];
        try {
          const downsampled = await downsampleImage(path, option.scale, option.quality);
          setImageQuality(defaultQuality);
          setDisplayedImage(downsampled);
        } catch {
          // Downsample failed (e.g. unsupported format), fall back to original.
          setImageQuality("ORIGINAL");
          setDisplayedImage(path);
        }
      }
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

  const handleImageRotate = async () => {
    if (!displayedImage) return;
    try {
      const newRotation = (imageRotation + 90) % 360;
      const rotated = await rotateImage(displayedImage, 90);
      setDisplayedImage(rotated);
      setImageRotation(newRotation);
    } catch (err) {
      setError(`Failed to rotate image: ${err.message}`);
    }
  };

  const handleQualityChange = async (newQuality) => {
    if (!displayedImage) return;
    if (newQuality === imageQuality) return;

    try {
      setImageQuality(newQuality);
      const option = IMAGE_DOWNSAMPLE_OPTIONS[newQuality];
      if (option.scale === 1) {
        setDisplayedImage(resolvedPath);
      } else {
        const downsampled = await downsampleImage(resolvedPath, option.scale, option.quality);
        setDisplayedImage(downsampled);
      }
    } catch (err) {
      setError(`Failed to adjust quality: ${err.message}`);
    }
  };

  const handleDownloadImage = () => {
    if (!displayedImage) return;
    const link = document.createElement("a");
    link.href = displayedImage;
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

  const handleOpenCrop = () => {
    setShowCropModal(true);
    setContextMenu(null);
  };

  const handleSaveCrop = async (croppedDataUrl) => {
    try {
      setDisplayedImage(croppedDataUrl);
      setShowCropModal(false);
      const dimensions = await getImageDimensions(croppedDataUrl);
      setImageInfo({
        ...imageInfo,
        dimensions,
        fileSize: getImageFileSize(croppedDataUrl),
        formattedSize: formatFileSize(getImageFileSize(croppedDataUrl)),
      });
    } catch (err) {
      setError(`Failed to apply crop: ${err.message}`);
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
            {mediaType === "image" && "🖼️ Image"}
            {mediaType === "video" && "🎬 Video"}
            {mediaType === "audio" && "🎵 Audio"}
            {mediaType === "pdf" && "📄 PDF"}
            {mediaType === "document" && "📃 Document"}
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
              <div className="image-quality-selector">
                <label htmlFor="quality-select">Quality:</label>
                <select
                  id="quality-select"
                  value={imageQuality}
                  onChange={(e) => handleQualityChange(e.target.value)}
                  className="quality-select"
                >
                  {Object.entries(IMAGE_DOWNSAMPLE_OPTIONS).map(([key, option]) => (
                    <option key={key} value={key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="image-action-buttons">
                <button
                  className="image-action-button"
                  onClick={handleImageRotate}
                  title="Rotate 90°"
                  aria-label="Rotate image"
                >
                  <RotateCw size={16} /> Rotate
                </button>
                <button
                  className="image-action-button"
                  onClick={handleDownloadImage}
                  title="Download image"
                  aria-label="Download image"
                >
                  <Download size={16} /> Download
                </button>
              </div>
            </div>

            <div className="media-preview-image-container">
              <img
                ref={imageRef}
                src={displayedImage || resolvedPath}
                alt="Preview"
                style={{ transform: `rotate(${imageRotation}deg)` }}
                onError={() => setError("Failed to load image")}
                onContextMenu={handleImageContextMenu}
                title="Right-click to crop"
              />
            </div>

            {imageInfo && (
              <div className="image-info-bar">
                <span className="info-item">
                  📐 {imageInfo.dimensions.width} × {imageInfo.dimensions.height}px
                </span>
                <span className="info-item">
                  💾 {imageInfo.formattedSize}
                </span>
                <span className="info-item">
                  🔄 {imageRotation}°
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
                    onClick={() => handlePdfPageChange(-1)}
                    disabled={currentPdfPage === 1}
                    title="Previous page"
                  >
                    ← Prev
                  </button>
                  <span className="pdf-page-info">
                    Page {currentPdfPage} of {pdfPages}
                  </span>
                  <button
                    onClick={() => handlePdfPageChange(1)}
                    disabled={currentPdfPage === pdfPages}
                    title="Next page"
                  >
                    Next →
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

      {showCropModal && displayedImage && (
        <ImageCropModal
          open={showCropModal}
          imageSrc={resolvedPath}
          imageLabel={mediaPath.split("/").pop()}
          onClose={() => setShowCropModal(false)}
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
            onClick={handleOpenCrop}
          >
            ✏️ Edit image
          </button>
        </div>
      )}
    </div>
  );
}
