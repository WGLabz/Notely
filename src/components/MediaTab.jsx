import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { extractImagesFromMarkdown } from "../utils/mediaUtils";
import {
  listImages,
  readImage,
  saveImage,
  deleteImage,
  replaceImage,
} from "../services/electronService";
import { readFileAsDataUrl } from "../utils/imageUtils";
import "../styles/media.css";

export function MediaTab({ content, basePath }) {
  const linkedImages = useMemo(() => extractImagesFromMarkdown(content), [content]);
  const [allImages, setAllImages] = useState([]);
  const [resolvedImages, setResolvedImages] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [replaceTarget, setReplaceTarget] = useState("");
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAllImages() {
      if (!basePath) {
        if (!cancelled) setAllImages(linkedImages);
        return;
      }

      try {
        const folderPaths = await listImages(basePath);
        const linkedByPath = new Map(linkedImages.map((image) => [image.path, image]));

        const merged = folderPaths.map((pathValue) => {
          const linked = linkedByPath.get(pathValue);
          if (linked) return linked;

          const fileName = pathValue.split(/[\\/]/).pop() || "Image";
          const altText = fileName.replace(/\.[^.]+$/, "");
          return {
            altText,
            path: pathValue,
            id: pathValue,
          };
        });

        for (const linked of linkedImages) {
          if (!folderPaths.includes(linked.path)) {
            merged.push(linked);
          }
        }

        if (!cancelled) setAllImages(merged);
      } catch {
        if (!cancelled) setAllImages(linkedImages);
      }
    }

    loadAllImages();

    return () => {
      cancelled = true;
    };
  }, [linkedImages, basePath, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadResolvedImages() {
      if (!allImages.length || !basePath) {
        if (!cancelled) setResolvedImages({});
        return;
      }

      const entries = await Promise.all(
        allImages.map(async (image) => {
          try {
            const src = await readImage(basePath, image.path);
            return [image.id, src];
          } catch {
            return [image.id, image.path];
          }
        })
      );

      if (!cancelled) {
        setResolvedImages(Object.fromEntries(entries));
      }
    }

    loadResolvedImages();

    return () => {
      cancelled = true;
    };
  }, [allImages, basePath]);

  async function handleAddImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setActionError("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await saveImage(file.name, dataUrl);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setActionError(error?.message || "Unable to add image.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleDeleteImage(pathValue) {
    const approved = window.confirm("Delete this image from notes/images?");
    if (!approved) return;

    setBusy(true);
    setActionError("");
    try {
      await deleteImage(basePath, pathValue);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setActionError(error?.message || "Unable to delete image.");
    } finally {
      setBusy(false);
    }
  }

  function openReplacePicker(pathValue) {
    setReplaceTarget(pathValue);
    replaceInputRef.current?.click();
  }

  async function handleReplaceImage(event) {
    const file = event.target.files?.[0];
    if (!file || !replaceTarget) return;

    setBusy(true);
    setActionError("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await replaceImage(basePath, replaceTarget, dataUrl);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setActionError(error?.message || "Unable to replace image.");
    } finally {
      setBusy(false);
      setReplaceTarget("");
      event.target.value = "";
    }
  }

  return (
    <div>
      <div className="media-actions">
        <button className="small-button" onClick={() => addInputRef.current?.click()} disabled={busy}>
          <ImagePlus size={16} />
          <span>Add Image</span>
        </button>
        <button className="small-button" onClick={() => setRefreshKey((value) => value + 1)} disabled={busy}>
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
        <input ref={addInputRef} type="file" accept="image/*" onChange={handleAddImage} hidden />
        <input ref={replaceInputRef} type="file" accept="image/*" onChange={handleReplaceImage} hidden />
      </div>

      {actionError && <p className="media-error">{actionError}</p>}

      {allImages.length === 0 ? (
        <div className="media-empty">
          <p>No images found in notes/images.</p>
          <p className="muted">Insert images using the toolbar button or drag & drop.</p>
        </div>
      ) : (
        <div className="media-grid">
          {allImages.map((image) => (
            <div className="media-item" key={image.id}>
              <div className="media-preview">
                <img src={resolvedImages[image.id] || image.path} alt={image.altText} />
              </div>
              <div className="media-info">
                <p className="media-alt">{image.altText}</p>
                <p className="media-path" title={image.path}>{image.path}</p>
                <div className="media-item-actions">
                  <button className="small-button" onClick={() => openReplacePicker(image.path)} disabled={busy}>
                    <RefreshCw size={14} />
                    <span>Update</span>
                  </button>
                  <button className="small-button danger" onClick={() => handleDeleteImage(image.path)} disabled={busy}>
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
