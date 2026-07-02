import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, ExternalLink, Eye, ImageOff, ImagePlus, ListTree, RefreshCw, Upload, Trash2, X } from "lucide-react";
import { extractAllMediaFromMarkdown } from "../utils/mediaUtils";
import { getMediaTypeFromExtension } from "../utils/mediaUtils";
import AppButton from "./AppButton";
import AppInput from "./AppInput";
import AppSelect from "./AppSelect";
import { MediaPreviewPane } from "./MediaPreviewPane";
import OverlayDialog from "./OverlayDialog";
import {
  getImageUsage,
  listImages,
  readImage,
  saveImage,
  deleteImage,
  replaceImage,
  setImageAnnotation,
  openMediaInDefaultApp,
} from "../services/electronService";
import { MEDIA_FILE_INPUT_ACCEPT, readFileAsDataUrl } from "../utils/mediaTypeUtils";
import { formatFileSize } from "../utils/imageProcessingUtils";
import { formatImageDeleteResult } from "../utils/imageDeleteResult";
import "../styles/media.css";

function getDocumentVisual(extension) {
  const ext = String(extension || "").toLowerCase();
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return { icon: "📝", label: "Word" };
  if (["xls", "xlsx", "csv", "tsv", "ods"].includes(ext)) return { icon: "📊", label: "Sheet" };
  if (["ppt", "pptx", "odp"].includes(ext)) return { icon: "📽️", label: "Slides" };
  if (["txt", "md", "markdown", "log"].includes(ext)) return { icon: "📄", label: "Text" };
  if (["json", "xml", "yaml", "yml"].includes(ext)) return { icon: "🧩", label: "Data" };
  if (["zip", "7z", "rar"].includes(ext)) return { icon: "🗜️", label: "Archive" };
  return { icon: "📃", label: "Document" };
}

function getPreviewBadge(mediaType, extension) {
  const ext = String(extension || "").toUpperCase();
  if (mediaType === "image") return null;
  if (mediaType === "video") return { icon: "🎬", label: ext || "VIDEO" };
  if (mediaType === "audio") return { icon: "🎵", label: ext || "AUDIO" };
  if (mediaType === "pdf") return { icon: "📄", label: "PDF" };
  const documentVisual = getDocumentVisual(extension);
  return { icon: documentVisual.icon, label: ext || documentVisual.label.toUpperCase() };
}

export function MediaTab({ content, basePath, onNotify, onOpenDocument }) {
  const linkedImages = useMemo(() => extractAllMediaFromMarkdown(content), [content]);
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
  const [uploadTarget, setUploadTarget] = useState("note");
  const [selectedMediaPreview, setSelectedMediaPreview] = useState(null);
  const [usageInspectorImage, setUsageInspectorImage] = useState(null);
  const [openingPath, setOpeningPath] = useState("");
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);

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
          listImages(basePath, { includeAnnotations: true, includeOriginalStatus: true }),
          getImageUsage(basePath),
        ]);
        if (!cancelled) {
          setImageUsage(usage || {});
        }
        const linkedByPath = new Map(linkedImages.map((image) => [image.path, image]));

        const folderRecords = folderPaths.map((entry) => {
          return typeof entry === "string" ? { path: entry, annotation: null } : entry;
        });
        const folderPathValues = folderRecords.map((entry) => entry.path);
        const annotationByPath = new Map(folderRecords.map((entry) => [entry.path, entry.annotation]));

        const merged = folderRecords.map((record) => {
          const pathValue = record.path;
          const linked = linkedByPath.get(pathValue);
          const usageEntry = usage?.[pathValue];
          if (linked) {
            return {
              ...linked,
              isLinkedInCurrent: true,
              annotation: record.annotation || null,
              hasOriginal: Boolean(record.hasOriginal),
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
            annotation: record.annotation || null,
            hasOriginal: Boolean(record.hasOriginal),
            referenceCount: usageEntry?.referenceCount || 0,
            referencedBy: usageEntry?.documents || [],
          };
        });

        for (const linked of linkedImages) {
          if (!folderPathValues.includes(linked.path)) {
            const usageEntry = usage?.[linked.path];
            merged.push({
              ...linked,
              isLinkedInCurrent: true,
              annotation: annotationByPath.get(linked.path) || null,
              hasOriginal: false,
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
            const src = await readImage(basePath, image.path, { thumbnail: true });
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

  const mediaSummary = useMemo(() => {
    return mediaItemsWithSize.reduce(
      (summary, image) => {
        const referenced = (image.referenceCount || 0) > 0 || referencedPathSet.has(image.path);
        return {
          total: summary.total + 1,
          used: summary.used + (referenced ? 1 : 0),
          unused: summary.unused + (referenced ? 0 : 1),
          annotated: summary.annotated + (String(image.annotation?.text || "").trim() ? 1 : 0),
          size: summary.size + (image.fileSize || 0),
        };
      },
      { total: 0, used: 0, unused: 0, annotated: 0, size: 0 }
    );
  }, [mediaItemsWithSize, referencedPathSet]);

  useEffect(() => {
    if (!actionInfo) return undefined;
    const timer = window.setTimeout(() => setActionInfo(""), 2200);
    return () => window.clearTimeout(timer);
  }, [actionInfo]);

  const healthReport = useMemo(() => {
    const duplicateGroupsByName = new Map();
    const missingFiles = [];
    const unusedFiles = [];
    const previewFailures = [];

    allImages.forEach((image) => {
      const referenced = (image.referenceCount || 0) > 0 || referencedPathSet.has(image.path);
      const fileName = (image.path.split(/[\\/]/).pop() || image.path).toLowerCase();

      if (!duplicateGroupsByName.has(fileName)) {
        duplicateGroupsByName.set(fileName, []);
      }
      duplicateGroupsByName.get(fileName).push(image);

      if (image.missingFile) missingFiles.push(image);
      if (!referenced) unusedFiles.push(image);
      if (thumbnailFailures[image.id]) previewFailures.push(image);
    });

    const duplicateGroups = Array.from(duplicateGroupsByName.values()).filter((group) => group.length > 1);
    const duplicatePathSet = new Set(duplicateGroups.flatMap((group) => group.map((image) => image.path)));

    return {
      missingFiles,
      unusedFiles,
      previewFailures,
      duplicateGroups,
      duplicatePathSet,
      issueCount: missingFiles.length + unusedFiles.length + previewFailures.length + duplicateGroups.length,
    };
  }, [allImages, referencedPathSet, thumbnailFailures]);

  const filteredImages = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const visible = allImages.filter((image) => {
      const referenced = (image.referenceCount || 0) > 0 || referencedPathSet.has(image.path);
      const extension = image.path.split(".").pop()?.toLowerCase();
      const mediaType = getMediaTypeFromExtension(extension);
      const annotationText = String(image.annotation?.text || "").trim();

      // Apply usage filter
      if (filterType === "referenced" && !referenced) return false;
      if (filterType === "unused" && referenced) return false;
      if (filterType === "annotated" && !annotationText) return false;
      if (filterType === "missing" && !image.missingFile) return false;
      if (filterType === "duplicates" && !healthReport.duplicatePathSet.has(image.path)) return false;
      if (filterType === "preview-failed" && !thumbnailFailures[image.id]) return false;

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
        image.path.toLowerCase().includes(normalizedSearch) ||
        annotationText.toLowerCase().includes(normalizedSearch)
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
  }, [allImages, filterType, healthReport.duplicatePathSet, referencedPathSet, searchText, sortType, thumbnailFailures]);

  const linkedCount = useMemo(() => {
    return allImages.filter((image) => (image.referenceCount || 0) > 0 || referencedPathSet.has(image.path)).length;
  }, [allImages, referencedPathSet]);

  const unusedCount = allImages.length - linkedCount;

  async function handleAddImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setActionError("");
    setActionInfo("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const savedPath = await saveImage(file.name, dataUrl, basePath, { storageTarget: uploadTarget });
      setRefreshKey((value) => value + 1);
      const targetLabel = uploadTarget === "workspace" ? "workspace library" : "note folder";
      setActionInfo(`Media added to ${targetLabel}.`);
      onNotify?.(`Media added to ${targetLabel}: ${savedPath}`, "success");
    } catch (error) {
      setActionError(error?.message || "Unable to add media.");
      onNotify?.(error?.message || "Unable to add media.", "error");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleDeleteImage(pathValue, isReferenced = false) {
    const message = isReferenced
      ? "This media is referenced in one or more notes. Remove matching links from the current note? The file is kept when other references remain."
      : "Move this media item to the removed folder?";
    const approved = window.confirm(message);
    if (!approved) return;

    setBusy(true);
    setActionError("");
    setActionInfo("");
    try {
      const result = await deleteImage(basePath, pathValue);
      setRefreshKey((value) => value + 1);
      const deleteMessage = formatImageDeleteResult(result, "Media moved to removed folder.");
      setActionInfo(deleteMessage);
      onNotify?.(deleteMessage, "success");
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
    const extension = image.path.split(".").pop()?.toLowerCase();
    const mediaType = getMediaTypeFromExtension(extension);
    const markdown = mediaType === "image"
      ? `![${image.altText}](${image.path})`
      : `[${image.altText}](${image.path})`;
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

  async function handleClearAnnotation(image) {
    if (!basePath || !image?.path) return;
    setBusy(true);
    setActionError("");
    setActionInfo("");
    try {
      await setImageAnnotation(basePath, image.path, null);
      setAllImages((current) => current.map((item) => (
        item.path === image.path ? { ...item, annotation: null } : item
      )));
      setActionInfo("Annotation cleared.");
      onNotify?.("Annotation cleared.", "success");
    } catch (error) {
      setActionError(error?.message || "Unable to clear annotation.");
      onNotify?.(error?.message || "Unable to clear annotation.", "error");
    } finally {
      setBusy(false);
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

  async function handleOpenUsageDocument(filePath) {
    if (!filePath || typeof onOpenDocument !== "function") return;
    setUsageInspectorImage(null);
    await onOpenDocument(filePath);
  }

  async function handleOpenInDefaultApp(pathValue) {
    if (!basePath || !pathValue) return;
    setActionError("");
    setActionInfo("");
    try {
      setOpeningPath(pathValue);
      await openMediaInDefaultApp(basePath, pathValue);
      onNotify?.("Opened file in default app.", "success");
    } catch (error) {
      const message = error?.message || "Unable to open file in default app.";
      setActionError(message);
      onNotify?.(message, "error");
    } finally {
      setOpeningPath("");
    }
  }

  return (
    <div>
      <div className={`media-health-panel ${healthReport.issueCount ? "warn" : "ok"}`}>
        <div className="media-health-main">
          <div className="media-health-title">
            <AlertTriangle size={14} />
            <strong>Workspace Health</strong>
            <span className="media-health-status">
              {healthReport.issueCount ? `${healthReport.issueCount} item${healthReport.issueCount === 1 ? "" : "s"} to review` : "No issues"}
            </span>
            <span className="media-health-summary">
              {mediaSummary.total} media · {formatFileSize(mediaSummary.size)} · {mediaSummary.used} used · {mediaSummary.unused} unused · {mediaSummary.annotated} annotated
            </span>
          </div>
        </div>
        <div className="media-health-actions">
          <button
            className="media-health-chip"
            type="button"
            onClick={() => setFilterType("missing")}
            disabled={!healthReport.missingFiles.length}
            title="Show media links whose files are missing"
          >
            Missing {healthReport.missingFiles.length}
          </button>
          <button
            className="media-health-chip"
            type="button"
            onClick={() => setFilterType("unused")}
            disabled={!healthReport.unusedFiles.length}
            title="Show media files not referenced by any note"
          >
            Unused {healthReport.unusedFiles.length}
          </button>
          <button
            className="media-health-chip"
            type="button"
            onClick={() => setFilterType("duplicates")}
            disabled={!healthReport.duplicateGroups.length}
            title="Show files with duplicate names"
          >
            Duplicates {healthReport.duplicateGroups.length}
          </button>
          <button
            className="media-health-chip"
            type="button"
            onClick={() => setFilterType("annotated")}
            disabled={!mediaSummary.annotated}
            title="Show media with annotations"
          >
            Annotated {mediaSummary.annotated}
          </button>
          <button
            className="media-health-chip"
            type="button"
            onClick={() => setFilterType("preview-failed")}
            disabled={!healthReport.previewFailures.length}
            title="Show media whose preview failed to load"
          >
            Preview failed {healthReport.previewFailures.length}
          </button>
          {healthReport.unusedFiles.length ? (
            <button
              className="media-health-clean"
              type="button"
              onClick={handleDeleteUnusedMedia}
              disabled={busy}
              title="Delete all unused media files"
            >
              <Trash2 size={14} />
              Clean unused
            </button>
          ) : null}
        </div>
      </div>

      <div className="media-toolbar">
        <AppInput
          className="media-search"
          type="text"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search by name or path"
        />
        <AppSelect className="media-select" value={filterType} onChange={(event) => setFilterType(event.target.value)}>
          <option value="all">All Media</option>
          <option value="referenced">Referenced Only</option>
          <option value="unused">Unused Only</option>
          <option value="annotated">Annotated Only</option>
          <option value="missing">Missing Files</option>
          <option value="duplicates">Duplicate Names</option>
          <option value="preview-failed">Preview Failed</option>
          <optgroup label="By Type">
            <option value="images">Images Only</option>
            <option value="videos">Videos Only</option>
            <option value="audio">Audio Only</option>
            <option value="pdfs">PDFs Only</option>
            <option value="documents">Documents Only</option>
          </optgroup>
        </AppSelect>
        <AppSelect className="media-select" value={sortType} onChange={(event) => setSortType(event.target.value)}>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="referenced-first">Referenced First</option>
        </AppSelect>
        <div className="media-toolbar-actions">
          <label className="media-upload-target" title="Choose where newly added media is stored">
            <span>Save to</span>
            <AppSelect
              className="media-select"
              value={uploadTarget}
              onChange={(event) => setUploadTarget(event.target.value)}
              disabled={busy}
              aria-label="Media upload target"
            >
              <option value="note">Note folder</option>
              <option value="workspace">Workspace library</option>
            </AppSelect>
          </label>
          {unusedCount > 0 && (
            <AppButton
              variant="small"
              danger
              onClick={handleDeleteUnusedMedia}
              disabled={busy}
              title={`Delete ${unusedCount} unused media file${unusedCount === 1 ? "" : "s"}`}
            >
              <Trash2 size={14} />
              <span>Delete unused ({unusedCount})</span>
            </AppButton>
          )}
          <AppButton
            variant="small"
            iconOnly
            onClick={() => addInputRef.current?.click()}
            disabled={busy}
            title="Add media"
          >
            <ImagePlus size={16} />
          </AppButton>
          <AppButton
            variant="small"
            iconOnly
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={busy}
            title="Refresh media"
          >
            <RefreshCw size={16} />
          </AppButton>
          <AppInput ref={addInputRef} type="file" accept={MEDIA_FILE_INPUT_ACCEPT} onChange={handleAddImage} hidden />
          <AppInput ref={replaceInputRef} type="file" accept={MEDIA_FILE_INPUT_ACCEPT} onChange={handleReplaceImage} hidden />
        </div>
      </div>

      <p className="media-summary">
        Showing {filteredImages.length} of {allImages.length} media. {linkedCount} <strong>used</strong>, {allImages.length - linkedCount} <strong>unused</strong>, {mediaSummary.annotated} <strong>annotated</strong>.
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
            const previewBadge = getPreviewBadge(mediaType, extension);
            const documentVisual = getDocumentVisual(extension);
            const referenced = (image.referenceCount || 0) > 0 || referencedPathSet.has(image.path);
            const fileName = image.path.split(/[\\/]/).pop() || image.altText || "Image";
            const annotationText = String(image.annotation?.text || "").trim();
            const isResolving = basePath && resolvedSrc === undefined;
            const isDataUrl = typeof resolvedSrc === "string" && resolvedSrc.startsWith("data:");
            const canRender = !isResolving && (isDataUrl || !basePath);
            const showFallback = Boolean(thumbnailFailures[image.id] || image.missingFile || (!isResolving && !isDataUrl && basePath));
            const imageSrc = resolvedSrc || image.path;

            return (
            <div className="media-item" key={image.id}>
              <div
                className="media-preview"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedMediaPreview({ path: image.path, type: mediaType })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedMediaPreview({ path: image.path, type: mediaType });
                  }
                }}
                aria-label={`Preview ${fileName}`}
                title="Click to preview"
              >
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
                    <span>{previewBadge?.icon || "🎵"} Audio File</span>
                  </div>
                ) : mediaType === "pdf" ? (
                  <div className="media-fallback">
                    <span>{previewBadge?.icon || "📄"} Portable Document</span>
                  </div>
                ) : mediaType === "document" ? (
                  <div className="media-fallback">
                    <span>{documentVisual.icon} {documentVisual.label}</span>
                  </div>
                ) : (
                  <div className="media-fallback">
                    <span>{previewBadge?.icon || "📎"} File</span>
                  </div>
                )}
                {previewBadge ? (
                  <span className="media-type-chip" title={`Type: ${previewBadge.label}`}>
                    {previewBadge.icon} {previewBadge.label}
                  </span>
                ) : null}
                {annotationText ? (
                  <span className="media-annotation-badge" title={`Annotation: ${annotationText}`}>
                    Note
                  </span>
                ) : null}
                {mediaType === "image" && image.hasOriginal ? (
                  <span className="media-original-badge" title="Original image backup available in .notes-app">
                    Original saved
                  </span>
                ) : null}
                <span className="media-preview-name" title={fileName}>{fileName}</span>
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
                    <span className="media-badge unlinked" title="Not referenced in any note">
                      Unused
                    </span>
                  )}
                </div>
                {annotationText ? (
                  <div className="media-annotation-row" title={annotationText}>
                    <p className="media-annotation-text">{annotationText}</p>
                    <button
                      className="media-annotation-clear"
                      type="button"
                      onClick={() => handleClearAnnotation(image)}
                      disabled={busy}
                      title="Clear annotation"
                      aria-label="Clear annotation"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : null}
                <p className="media-path" title={image.path}>{image.path}</p>
                {referenced ? (
                  <button
                    className="media-usage-link"
                    type="button"
                    onClick={() => setUsageInspectorImage(image)}
                    title="Inspect note usage"
                  >
                    <ListTree size={12} />
                    <span>{image.referenceCount || 0} note{(image.referenceCount || 0) === 1 ? "" : "s"}</span>
                  </button>
                ) : null}
                <div className="media-item-actions">
                  <AppButton
                    variant="small"
                    iconOnly
                    onClick={() => setSelectedMediaPreview({ path: image.path, type: mediaType })}
                    title="Preview media"
                  >
                    <Eye size={14} />
                  </AppButton>
                  <AppButton variant="small" iconOnly onClick={() => handleCopyMarkdown(image)} title="Copy markdown">
                    <Copy size={14} />
                  </AppButton>
                  <AppButton
                    variant="small"
                    iconOnly
                    onClick={() => setUsageInspectorImage(image)}
                    title="Inspect usage"
                  >
                    <ListTree size={14} />
                  </AppButton>
                  <AppButton
                    variant="small"
                    iconOnly
                    onClick={() => handleOpenInDefaultApp(image.path)}
                    disabled={!basePath || openingPath === image.path}
                    title={openingPath === image.path ? "Opening..." : "Open in default app"}
                  >
                    <ExternalLink size={14} />
                  </AppButton>
                  <AppButton
                    variant="small"
                    iconOnly
                    onClick={() => openReplacePicker(image.path)}
                    disabled={busy}
                    title="Update media"
                  >
                    <Upload size={14} />
                  </AppButton>
                  <AppButton
                    variant="small"
                    danger
                    iconOnly
                    onClick={() => handleDeleteImage(image.path, referenced)}
                    disabled={busy}
                    title={referenced ? "Remove media links" : "Delete media"}
                  >
                    <Trash2 size={14} />
                  </AppButton>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {selectedMediaPreview && (
        <OverlayDialog
          onClose={() => setSelectedMediaPreview(null)}
          ariaLabel="Media preview"
          overlayClassName="media-full-preview-overlay"
          cardClassName="media-full-preview-content"
          useDefaultCardClass={false}
        >
            <MediaPreviewPane
              mediaPath={selectedMediaPreview.path}
              mediaType={selectedMediaPreview.type}
              basePath={basePath}
              onClose={() => setSelectedMediaPreview(null)}
              onMediaChanged={() => setRefreshKey((value) => value + 1)}
            />
        </OverlayDialog>
      )}

      {usageInspectorImage ? (
        <OverlayDialog
          onClose={() => setUsageInspectorImage(null)}
          ariaLabel="Media usage inspector"
          overlayClassName="media-usage-overlay"
          cardClassName="media-usage-dialog"
          useDefaultCardClass={false}
        >
            <div className="media-usage-header">
              <div>
                <h3>Media Usage</h3>
                <p title={usageInspectorImage.path}>{usageInspectorImage.path}</p>
              </div>
              <AppButton
                variant="small"
                iconOnly
                onClick={() => setUsageInspectorImage(null)}
                aria-label="Close usage inspector"
              >
                <X size={14} />
              </AppButton>
            </div>

            {(usageInspectorImage.referencedBy || []).length ? (
              <div className="media-usage-list">
                {usageInspectorImage.referencedBy.map((documentRef) => (
                  <div className="media-usage-row" key={documentRef.filePath}>
                    <div className="media-usage-row-text">
                      <strong>{documentRef.title || documentRef.fileName || "Untitled note"}</strong>
                      <span title={documentRef.filePath}>{documentRef.filePath}</span>
                    </div>
                    {typeof onOpenDocument === "function" ? (
                      <AppButton variant="small" onClick={() => handleOpenUsageDocument(documentRef.filePath)}>
                        <ExternalLink size={14} />
                        <span>Open</span>
                      </AppButton>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="media-usage-empty">
                <p>This media item is not referenced by any note in the current workspace.</p>
              </div>
            )}
        </OverlayDialog>
      ) : null}
    </div>
  );
}
