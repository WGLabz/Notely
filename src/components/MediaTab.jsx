import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eye, ImageOff, ImagePlus, RefreshCw, Upload, Trash2 } from "lucide-react";
import { extractImagesFromMarkdown } from "../utils/mediaUtils";
import { getMediaTypeFromExtension } from "../utils/mediaUtils";
import { MediaStats } from "./MediaStats";
import { MediaPreviewPane } from "./MediaPreviewPane";
import {
  getImageUsage,
  listImages,
  readImage,
  saveImage,
  deleteImage,
  replaceImage,
} from "../services/electronService";
import { readFileAsDataUrl } from "../utils/mediaTypeUtils";
import "../styles/media.css";

export function MediaTab({ content, basePath, onNotify }) {
  const linkedImages = useMemo(() => extractImagesFromMarkdown(content), [content]);
  const [allImages, setAllImages] = useState([]);
  const [imageUsage, setImageUsage] = useState({});
  const [resolvedImages, setResolvedImages] = useState({});
  const [mediaSizes, setMediaSizes] = useState({});
  const [thumbnailFailures, setThumbnailFailures] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionInfo, setActionInfo] = useState("");
  const [replaceTarget, setReplaceTarget] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortType, setSortType] = useState("name-asc");
  const [selectedMediaPreview, setSelectedMediaPreview] = useState(null);
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);

  const linkedPathSet = useMemo(() => {
    return new Set(linkedImages.map((image) => image.path));
  }, [linkedImages]);

  const referencedPathSet = useMemo(() => {
    return new Set(Object.keys(imageUsage).filter((pathValue) => (imageUsage[pathValue]?.referenceCount || 0) > 0));
  }, [imageUsage]);

  useEffect(() => {
    let cancelled = false;

    async function loadAllImages() {
      if (!basePath) {
        if (!cancelled) setAllImages(linkedImages);
        return;
      }

      try {
        const [folderPaths, usage] = await Promise.all([
          listImages(basePath),
          getImageUsage(basePath),
        ]);
        if (!cancelled) {
          setImageUsage(usage || {});
        }
        const linkedByPath = new Map(linkedImages.map((image) => [image.path, image]));

        const merged = folderPaths.map((pathValue) => {
          const linked = linkedByPath.get(pathValue);
          const usageEntry = usage?.[pathValue];
          if (linked) {
            return {
              ...linked,
              isLinkedInCurrent: true,
              referenceCount: usageEntry?.referenceCount || 0,
              referencedBy: usageEntry?.documents || [],
            };
          }

          const fileName = pathValue.split(/[\\/]/).pop() || "Image";
          const altText = fileName.replace(/\.[^.]+$/, "");
          return {
            altText,
            path: pathValue,
            id: pathValue,
            isLinkedInCurrent: false,
            referenceCount: usageEntry?.referenceCount || 0,
            referencedBy: usageEntry?.documents || [],
          };
        });

        for (const linked of linkedImages) {
          if (!folderPaths.includes(linked.path)) {
            const usageEntry = usage?.[linked.path];
            merged.push({
              ...linked,
              isLinkedInCurrent: true,
              referenceCount: usageEntry?.referenceCount || 0,
              referencedBy: usageEntry?.documents || [],
              missingFile: true,
            });
          }
        }

        if (!cancelled) setAllImages(merged);
      } catch {
        if (!cancelled) setImageUsage({});
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

    const getDataUrlSizeBytes = (value) => {
      if (typeof value !== "string" || !value.startsWith("data:")) return 0;
      const commaIndex = value.indexOf(",");
      if (commaIndex === -1) return 0;
      const base64 = value.slice(commaIndex + 1);
      const padding = (base64.match(/=+$/) || [""])[0].length;
      return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
    };

    async function loadResolvedImages() {
      if (!allImages.length || !basePath) {
        if (!cancelled) {
          setResolvedImages({});
          setMediaSizes({});
        }
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
        const resolvedById = Object.fromEntries(entries);
        const sizeById = Object.fromEntries(
          entries.map(([id, src]) => [id, getDataUrlSizeBytes(src)])
        );
        setResolvedImages(resolvedById);
        setMediaSizes(sizeById);
        // Clear stale failure flags so newly resolved data URLs get a chance to render.
        setThumbnailFailures({});
      }
    }

    loadResolvedImages();

    return () => {
      cancelled = true;
    };
  }, [allImages, basePath]);

  const mediaItemsWithSize = useMemo(() => {
    return allImages.map((item) => ({
      ...item,
      fileSize: mediaSizes[item.id] || item.fileSize || 0,
    }));
  }, [allImages, mediaSizes]);

  useEffect(() => {
    if (!actionInfo) return undefined;
    const timer = window.setTimeout(() => setActionInfo(""), 2200);
    return () => window.clearTimeout(timer);
  }, [actionInfo]);

  const filteredImages = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const visible = allImages.filter((image) => {
      const referenced = (image.referenceCount || 0) > 0 || referencedPathSet.has(image.path);
      const extension = image.path.split(".").pop()?.toLowerCase();
      const mediaType = getMediaTypeFromExtension(extension);

      // Apply usage filter
      if (filterType === "referenced" && !referenced) return false;
      if (filterType === "unused" && referenced) return false;

      // Apply media type filters
      if (filterType === "images" && mediaType !== "image") return false;
      if (filterType === "videos" && mediaType !== "video") return false;
      if (filterType === "audio" && mediaType !== "audio") return false;
      if (filterType === "pdfs" && mediaType !== "pdf") return false;
      if (filterType === "documents" && mediaType !== "document") return false;

      // Search filter
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
      if (sortType === "referenced-first") {
        const leftReferenced = (left.referenceCount || 0) > 0 || referencedPathSet.has(left.path);
        const rightReferenced = (right.referenceCount || 0) > 0 || referencedPathSet.has(right.path);
        if (leftReferenced === rightReferenced) return leftName.localeCompare(rightName);
        return leftReferenced ? -1 : 1;
      }
      return leftName.localeCompare(rightName);
    });

    return visible;
  }, [allImages, filterType, referencedPathSet, searchText, sortType]);

  const linkedCount = useMemo(() => {
    return allImages.filter((image) => (image.referenceCount || 0) > 0 || referencedPathSet.has(image.path)).length;
  }, [allImages, referencedPathSet]);

  async function handleAddImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setActionError("");
    setActionInfo("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await saveImage(file.name, dataUrl, basePath);
      setRefreshKey((value) => value + 1);
      setActionInfo("Media added successfully.");
      onNotify?.("Media added.", "success");
    } catch (error) {
      setActionError(error?.message || "Unable to add media.");
      onNotify?.(error?.message || "Unable to add media.", "error");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleDeleteImage(pathValue) {
    const approved = window.confirm("Move this media item to the removed folder?");
    if (!approved) return;

    setBusy(true);
    setActionError("");
    setActionInfo("");
    try {
      await deleteImage(basePath, pathValue);
      setRefreshKey((value) => value + 1);
      setActionInfo("Media moved to removed folder.");
      onNotify?.("Media moved to removed folder.", "success");
    } catch (error) {
      setActionError(error?.message || "Unable to delete media.");
      onNotify?.(error?.message || "Unable to delete media.", "error");
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
      setActionInfo("Media updated.");
      onNotify?.("Media updated.", "success");
    } catch (error) {
      setActionError(error?.message || "Unable to replace media.");
      onNotify?.(error?.message || "Unable to replace media.", "error");
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
      onNotify?.("Markdown copied.", "success");
    } catch {
      setActionError("Unable to copy markdown to clipboard.");
      onNotify?.("Unable to copy markdown to clipboard.", "error");
    }
  }

  async function handleDeleteUnusedMedia() {
    const unusedFiles = allImages.filter(
      (image) => (image.referenceCount || 0) === 0 && !referencedPathSet.has(image.path)
    );

    if (unusedFiles.length === 0) {
      setActionInfo("No unused media to delete.");
      return;
    }

    const approved = window.confirm(
      `Delete ${unusedFiles.length} unused media file${unusedFiles.length === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (!approved) return;

    setBusy(true);
    setActionError("");
    setActionInfo("");

    let successCount = 0;
    let failureCount = 0;

    for (const file of unusedFiles) {
      try {
        await deleteImage(basePath, file.path);
        successCount += 1;
      } catch {
        failureCount += 1;
      }
    }

    setBusy(false);

    if (successCount > 0) {
      setRefreshKey((value) => value + 1);
      const message = `Deleted ${successCount} unused file${successCount === 1 ? "" : "s"}.${
        failureCount > 0 ? ` Failed to delete ${failureCount} file${failureCount === 1 ? "" : "s"}.` : ""
      }`;
      setActionInfo(message);
      onNotify?.(message, failureCount > 0 ? "warning" : "success");
    } else {
      setActionError("Failed to delete unused files.");
      onNotify?.("Failed to delete unused files.", "error");
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
      <MediaStats allMedia={mediaItemsWithSize} onDeleteUnused={handleDeleteUnusedMedia} isDeleting={busy} />

      <div className="media-toolbar">
        <input
          className="media-search"
          type="text"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search by name or path"
        />
        <select className="media-select" value={filterType} onChange={(event) => setFilterType(event.target.value)}>
          <option value="all">All Media</option>
          <option value="referenced">Referenced Only</option>
          <option value="unused">Unused Only</option>
          <optgroup label="By Type">
            <option value="images">Images Only</option>
            <option value="videos">Videos Only</option>
            <option value="audio">Audio Only</option>
            <option value="pdfs">PDFs Only</option>
            <option value="documents">Documents Only</option>
          </optgroup>
        </select>
        <select className="media-select" value={sortType} onChange={(event) => setSortType(event.target.value)}>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="referenced-first">Referenced First</option>
        </select>
        <div className="media-toolbar-actions">
          <button
            className="small-button icon-only"
            onClick={() => addInputRef.current?.click()}
            disabled={busy}
            title="Add media"
          >
            <ImagePlus size={16} />
          </button>
          <button
            className="small-button icon-only"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={busy}
            title="Refresh media"
          >
            <RefreshCw size={16} />
          </button>
          <input ref={addInputRef} type="file" accept="image/*,video/*,audio/*,.pdf" onChange={handleAddImage} hidden />
          <input ref={replaceInputRef} type="file" accept="image/*,video/*,audio/*,.pdf" onChange={handleReplaceImage} hidden />
        </div>
      </div>

      <p className="media-summary">
        Showing {filteredImages.length} of {allImages.length} media. {linkedCount} <strong>used</strong>, {allImages.length - linkedCount} <strong>unused</strong>.
      </p>

      {actionError && <p className="media-error">{actionError}</p>}
      {actionInfo && <p className="media-info-text">{actionInfo}</p>}

      {filteredImages.length === 0 ? (
        <div className="media-empty">
          {allImages.length === 0 ? (
            <>
              <p>No media found in notes/images.</p>
              <p className="muted">Insert media using the toolbar button or drag and drop.</p>
            </>
          ) : (
            <>
              <p>No media match your current filters.</p>
              <p className="muted">Try clearing search text or changing filter/sort.</p>
            </>
          )}
        </div>
      ) : (
        <div className="media-grid">
          {filteredImages.map((image) => {
            const resolvedSrc = resolvedImages[image.id];
            const extension = image.path.split(".").pop()?.toLowerCase();
            const mediaType = getMediaTypeFromExtension(extension) || "unknown";
            const referenced = (image.referenceCount || 0) > 0 || referencedPathSet.has(image.path);
            const isResolving = basePath && resolvedSrc === undefined;
            const isDataUrl = typeof resolvedSrc === "string" && resolvedSrc.startsWith("data:");
            const canRender = !isResolving && (isDataUrl || !basePath);
            const showFallback = Boolean(thumbnailFailures[image.id] || image.missingFile || (!isResolving && !isDataUrl && basePath));
            const imageSrc = resolvedSrc || image.path;

            return (
            <div className="media-item" key={image.id}>
              <div className="media-preview">
                {showFallback ? (
                  <div className="media-fallback">
                    <ImageOff size={18} />
                    <span>Preview unavailable</span>
                  </div>
                ) : !canRender ? (
                  <div className="media-fallback">
                    <span>Loading…</span>
                  </div>
                ) : mediaType === "image" ? (
                  <img src={imageSrc} alt={image.altText} onError={() => markThumbnailFailed(image.id)} />
                ) : mediaType === "video" ? (
                  <video muted preload="metadata" onError={() => markThumbnailFailed(image.id)}>
                    <source src={imageSrc} />
                  </video>
                ) : mediaType === "audio" ? (
                  <div className="media-fallback">
                    <span>🎵 Audio</span>
                  </div>
                ) : mediaType === "pdf" ? (
                  <div className="media-fallback">
                    <span>📄 PDF</span>
                  </div>
                ) : mediaType === "document" ? (
                  <div className="media-fallback">
                    <span>📃 Document</span>
                  </div>
                ) : (
                  <div className="media-fallback">
                    <span>📎 File</span>
                  </div>
                )}
              </div>
              <div className="media-info">
                <div className="media-title-row">
                  <p className="media-alt" title={image.altText}>{image.altText}</p>
                  {referenced ? (
                    <span
                      className="media-badge linked"
                      title={`Referenced in ${image.referenceCount || 0} note${(image.referenceCount || 0) === 1 ? "" : "s"}`}
                    >
                      {`${image.referenceCount || 0} Refs`}
                    </span>
                  ) : (
                    <span className="media-unused-group" title="Not referenced in any note">
                      <span className="media-badge unlinked">Unused</span>
                      <button
                        className="media-badge-action"
                        onClick={() => handleDeleteImage(image.path)}
                        disabled={busy}
                        title="Delete media"
                        aria-label="Delete media"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  )}
                </div>
                <p className="media-path" title={image.path}>{image.path}</p>
                <div className="media-item-actions">
                  <button
                    className="small-button icon-only"
                    onClick={() => setSelectedMediaPreview({ path: image.path, type: mediaType })}
                    title="Preview media"
                  >
                    <Eye size={14} />
                  </button>
                  <button className="small-button icon-only" onClick={() => handleCopyMarkdown(image)} title="Copy markdown">
                    <Copy size={14} />
                  </button>
                  <button
                    className="small-button icon-only"
                    onClick={() => openReplacePicker(image.path)}
                    disabled={busy}
                    title="Update media"
                  >
                    <Upload size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {selectedMediaPreview && (
        <div className="media-full-preview-overlay" role="dialog" aria-modal="true" aria-label="Media preview">
          <div className="media-full-preview-content">
            <MediaPreviewPane
              mediaPath={selectedMediaPreview.path}
              mediaType={selectedMediaPreview.type}
              basePath={basePath}
              onClose={() => setSelectedMediaPreview(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
