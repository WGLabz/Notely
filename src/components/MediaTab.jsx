import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ImageOff, ImagePlus, RefreshCw, Upload, Trash2 } from "lucide-react";
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
  const [thumbnailFailures, setThumbnailFailures] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionInfo, setActionInfo] = useState("");
  const [replaceTarget, setReplaceTarget] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortType, setSortType] = useState("name-asc");
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);

  const linkedPathSet = useMemo(() => {
    return new Set(linkedImages.map((image) => image.path));
  }, [linkedImages]);

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
          if (linked) {
            return {
              ...linked,
              isLinked: true,
            };
          }

          const fileName = pathValue.split(/[\\/]/).pop() || "Image";
          const altText = fileName.replace(/\.[^.]+$/, "");
          return {
            altText,
            path: pathValue,
            id: pathValue,
            isLinked: false,
          };
        });

        for (const linked of linkedImages) {
          if (!folderPaths.includes(linked.path)) {
            merged.push({
              ...linked,
              isLinked: true,
              missingFile: true,
            });
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

  useEffect(() => {
    if (!actionInfo) return undefined;
    const timer = window.setTimeout(() => setActionInfo(""), 2200);
    return () => window.clearTimeout(timer);
  }, [actionInfo]);

  const filteredImages = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const visible = allImages.filter((image) => {
      const linked = image.isLinked ?? linkedPathSet.has(image.path);
      if (filterType === "linked" && !linked) return false;
      if (filterType === "unlinked" && linked) return false;
      if (!normalizedSearch) return true;

      return (
        image.altText.toLowerCase().includes(normalizedSearch) ||
        image.path.toLowerCase().includes(normalizedSearch)
      );
    });

    visible.sort((left, right) => {
      const leftName = (left.path.split(/[\\/]/).pop() || left.path).toLowerCase();
      const rightName = (right.path.split(/[\\/]/).pop() || right.path).toLowerCase();
      if (sortType === "name-desc") {
        return rightName.localeCompare(leftName);
      }
      if (sortType === "linked-first") {
        const leftLinked = left.isLinked ?? linkedPathSet.has(left.path);
        const rightLinked = right.isLinked ?? linkedPathSet.has(right.path);
        if (leftLinked === rightLinked) return leftName.localeCompare(rightName);
        return leftLinked ? -1 : 1;
      }
      return leftName.localeCompare(rightName);
    });

    return visible;
  }, [allImages, filterType, linkedPathSet, searchText, sortType]);

  const linkedCount = useMemo(() => {
    return allImages.filter((image) => image.isLinked ?? linkedPathSet.has(image.path)).length;
  }, [allImages, linkedPathSet]);

  async function handleAddImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setActionError("");
    setActionInfo("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await saveImage(file.name, dataUrl);
      setRefreshKey((value) => value + 1);
      setActionInfo("Image added successfully.");
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
    setActionInfo("");
    try {
      await deleteImage(basePath, pathValue);
      setRefreshKey((value) => value + 1);
      setActionInfo("Image deleted.");
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
    setActionInfo("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await replaceImage(basePath, replaceTarget, dataUrl);
      setRefreshKey((value) => value + 1);
      setActionInfo("Image updated.");
    } catch (error) {
      setActionError(error?.message || "Unable to replace image.");
    } finally {
      setBusy(false);
      setReplaceTarget("");
      event.target.value = "";
    }
  }

  async function handleCopyMarkdown(image) {
    const markdown = `![${image.altText}](${image.path})`;
    setActionError("");
    setActionInfo("");

    try {
      await navigator.clipboard.writeText(markdown);
      setActionInfo("Markdown copied.");
    } catch {
      setActionError("Unable to copy markdown to clipboard.");
    }
  }

  function markThumbnailFailed(id) {
    setThumbnailFailures((current) => {
      if (current[id]) return current;
      return { ...current, [id]: true };
    });
  }

  return (
    <div>
      <div className="media-actions">
        <button
          className="small-button icon-only"
          onClick={() => addInputRef.current?.click()}
          disabled={busy}
          title="Add image"
        >
          <ImagePlus size={16} />
        </button>
        <button
          className="small-button icon-only"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={busy}
          title="Refresh images"
        >
          <RefreshCw size={16} />
        </button>
        <input ref={addInputRef} type="file" accept="image/*" onChange={handleAddImage} hidden />
        <input ref={replaceInputRef} type="file" accept="image/*" onChange={handleReplaceImage} hidden />
      </div>

      <div className="media-toolbar">
        <input
          className="media-search"
          type="text"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search by name or path"
        />
        <select className="media-select" value={filterType} onChange={(event) => setFilterType(event.target.value)}>
          <option value="all">All</option>
          <option value="linked">Linked</option>
          <option value="unlinked">Unlinked</option>
        </select>
        <select className="media-select" value={sortType} onChange={(event) => setSortType(event.target.value)}>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="linked-first">Linked First</option>
        </select>
      </div>

      <p className="media-summary">
        Showing {filteredImages.length} of {allImages.length} images. {linkedCount} linked in markdown.
      </p>

      {actionError && <p className="media-error">{actionError}</p>}
      {actionInfo && <p className="media-info-text">{actionInfo}</p>}

      {filteredImages.length === 0 ? (
        <div className="media-empty">
          {allImages.length === 0 ? (
            <>
              <p>No images found in notes/images.</p>
              <p className="muted">Insert images using the toolbar button or drag & drop.</p>
            </>
          ) : (
            <>
              <p>No images match your current filters.</p>
              <p className="muted">Try clearing search text or changing filter/sort.</p>
            </>
          )}
        </div>
      ) : (
        <div className="media-grid">
          {filteredImages.map((image) => {
            const imageSrc = resolvedImages[image.id] || image.path;
            const linked = image.isLinked ?? linkedPathSet.has(image.path);
            const showFallback = Boolean(thumbnailFailures[image.id] || image.missingFile);

            return (
            <div className="media-item" key={image.id}>
              <div className="media-preview">
                {showFallback ? (
                  <div className="media-fallback">
                    <ImageOff size={18} />
                    <span>Preview unavailable</span>
                  </div>
                ) : (
                  <img src={imageSrc} alt={image.altText} onError={() => markThumbnailFailed(image.id)} />
                )}
              </div>
              <div className="media-info">
                <div className="media-title-row">
                  <p className="media-alt">{image.altText}</p>
                  <span className={`media-badge ${linked ? "linked" : "unlinked"}`}>
                    {linked ? "Linked" : "Unlinked"}
                  </span>
                </div>
                <p className="media-path" title={image.path}>{image.path}</p>
                <div className="media-item-actions">
                  <button className="small-button icon-only" onClick={() => handleCopyMarkdown(image)} title="Copy markdown">
                    <Copy size={14} />
                  </button>
                  <button
                    className="small-button icon-only"
                    onClick={() => openReplacePicker(image.path)}
                    disabled={busy}
                    title="Update image"
                  >
                    <Upload size={14} />
                  </button>
                  {!linked ? (
                    <button
                      className="small-button danger icon-only"
                      onClick={() => handleDeleteImage(image.path)}
                      disabled={busy}
                      title="Delete image"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
