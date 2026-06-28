import { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  renderMarkdown,
  parseMermaidBlocks,
  normalizeMarkdownImagePaths,
} from "../utils/renderUtils";
import { readImage, replaceImage, deleteImage, renameImage, getImageAnnotation, setImageAnnotation, getImageOriginalStatus, restoreImageOriginal } from "../services/electronService";
import { readFileAsDataUrl } from "../utils/mediaTypeUtils";
import { createImageMarkdown } from "../utils/markdownUtils";
import { getMediaTypeFromExtension } from "../utils/mediaUtils";
import { formatImageDeleteResult } from "../utils/imageDeleteResult";
import { removeImageReferenceFromMarkdown } from "../utils/imageMarkdownReferences";
import { MermaidBlock } from "./MermaidBlock";
import { ImageCropModal } from "./ImageCropModal";

function replaceAllLiteral(source, needle, replacement) {
  if (!needle || needle === replacement) return source;
  return String(source || "").split(needle).join(replacement);
}

function imageCacheKey(assetPath, variant = "thumbnail") {
  return `${variant}:${assetPath}`;
}

function getImageActionElement(target) {
  if (!(target instanceof HTMLElement)) return null;
  if (target.tagName === "IMG") return target;
  const frame = target.closest?.(".markdown-image-frame");
  const framedImage = frame?.querySelector?.("img");
  return framedImage instanceof HTMLImageElement ? framedImage : null;
}

function applyImageAnnotation(image, annotation) {
  const frame = image?.closest?.(".markdown-image-frame");
  if (!frame) return;
  frame.querySelector(".markdown-image-annotation")?.remove();
  const text = String(annotation?.text || "").trim();
  if (!text) return;

  const overlay = document.createElement("span");
  overlay.className = "markdown-image-annotation";
  overlay.textContent = text;
  frame.appendChild(overlay);
}

function applyImageOriginalBadge(image, hasOriginal) {
  const frame = image?.closest?.(".markdown-image-frame");
  if (!frame) return;
  frame.querySelector(".markdown-image-original-badge")?.remove();
  if (!hasOriginal) return;

  const badge = document.createElement("span");
  badge.className = "markdown-image-original-badge";
  badge.textContent = "Original saved";
  frame.appendChild(badge);
}

function getImagePath(imageElement) {
  return imageElement?.getAttribute("data-asset-path") || imageElement?.getAttribute("src") || "";
}

export const MarkdownPreview = memo(function MarkdownPreviewContent({ content, basePath, externalRef, onNotify, onContentChange, onMediaClick, showOriginalImages = false }) {
  const previewRef = useRef(null);
  const menuRef = useRef(null);
  const menuItemsRef = useRef([]);
  const menuSourceRef = useRef(null);
  const replaceInputRef = useRef(null);
  const imageResolveCacheRef = useRef(new Map());
  const [cropState, setCropState] = useState({
    open: false,
    src: "",
    assetPath: "",
    imageLabel: "",
    annotation: null,
    hasOriginal: false,
    annotationOnly: false,
  });
  const [contextMenu, setContextMenu] = useState(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [cropSaving, setCropSaving] = useState(false);
  const [replaceState, setReplaceState] = useState({ busy: false, assetPath: "" });
  const parts = useMemo(() => {
    return parseMermaidBlocks(content);
  }, [content]);

  useEffect(() => {
    let cancelled = false;
    const previewElement = previewRef.current;
    if (!previewElement || !basePath) return undefined;

    const resolveImage = async (image) => {
      if (!image || !(image instanceof HTMLImageElement)) return;
      if (!image.hasAttribute("tabindex")) {
        image.setAttribute("tabindex", "0");
      }
      image.setAttribute("aria-haspopup", "menu");
      image.setAttribute("aria-label", image.getAttribute("alt") || "Image");

      const src = image.getAttribute("src") || "";
      if (!src || /^(data:|blob:|https?:)/i.test(src)) return;

      const assetPath = image.getAttribute("data-asset-path") || src;
      image.setAttribute("data-asset-path", assetPath);

      const cache = imageResolveCacheRef.current;
      const variant = showOriginalImages ? "original" : "thumbnail";
      const cacheKey = imageCacheKey(assetPath, variant);
      if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (!cancelled && cached) image.src = cached;
        try {
          const annotation = await getImageAnnotation(basePath, assetPath);
          if (!cancelled) applyImageAnnotation(image, annotation);
        } catch {
          if (!cancelled) applyImageAnnotation(image, null);
        }
        try {
          const originalStatus = await getImageOriginalStatus(basePath, assetPath);
          if (!cancelled) applyImageOriginalBadge(image, Boolean(originalStatus?.hasOriginal));
        } catch {
          if (!cancelled) applyImageOriginalBadge(image, false);
        }
        return;
      }

      try {
        const resolved = await readImage(basePath, assetPath, { thumbnail: !showOriginalImages });
        if (!cancelled && resolved) {
          cache.set(cacheKey, resolved);
          image.src = resolved;
        }
      } catch {
        // Keep original src if resolution fails.
      }

      try {
        const annotation = await getImageAnnotation(basePath, assetPath);
        if (!cancelled) applyImageAnnotation(image, annotation);
      } catch {
        if (!cancelled) applyImageAnnotation(image, null);
      }
      try {
        const originalStatus = await getImageOriginalStatus(basePath, assetPath);
        if (!cancelled) applyImageOriginalBadge(image, Boolean(originalStatus?.hasOriginal));
      } catch {
        if (!cancelled) applyImageOriginalBadge(image, false);
      }
    };

    const resolveAllImages = () => {
      const images = Array.from(previewElement.querySelectorAll("img"));
      images.forEach((image) => {
        void resolveImage(image);
      });
    };

    resolveAllImages();
    const timer = window.setTimeout(resolveAllImages, 40);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.tagName === "IMG") {
            void resolveImage(node);
            return;
          }
          node.querySelectorAll?.("img").forEach((image) => {
            void resolveImage(image);
          });
        });
      });
    });

    observer.observe(previewElement, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [content, basePath, showOriginalImages]);

  useEffect(() => {
    if (!onMediaClick) return;

    const previewElement = previewRef.current;
    if (!previewElement) return;

    const openImageViewer = (imageElement, event) => {
      const src = getImagePath(imageElement);
      if (!src) return;

      const ext = src.split(".").pop()?.toLowerCase();
      const mediaType = getMediaTypeFromExtension(ext);
      if (!mediaType) return;

      event.preventDefault();
      event.stopPropagation();
      onMediaClick({ path: src, type: mediaType });
    };

    const openImageEditor = async (imageElement, event) => {
      const assetPath = imageElement.getAttribute("data-asset-path") || "";
      const isWorkspaceImage = Boolean(basePath && assetPath && !/^(https?:|data:|blob:)/i.test(assetPath));
      if (!isWorkspaceImage) {
        onNotify?.("Image editing is available for workspace images only.", "info");
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      let fullSizeSrc = imageElement.currentSrc || imageElement.src || "";
      let annotation = null;
      let hasOriginal = false;

      try {
        fullSizeSrc = await readImage(basePath, assetPath);
      } catch {
        // Fall back to the rendered preview image if the full-size read fails.
      }

      try {
        annotation = await getImageAnnotation(basePath, assetPath);
      } catch {
        annotation = null;
      }
      try {
        const originalStatus = await getImageOriginalStatus(basePath, assetPath);
        hasOriginal = Boolean(originalStatus?.hasOriginal);
      } catch {
        hasOriginal = false;
      }

      setCropState({
        open: true,
        src: fullSizeSrc,
        assetPath,
        imageLabel: imageElement.getAttribute("alt") || assetPath,
        annotation,
        hasOriginal,
        annotationOnly: true,
      });
    };

    const handleMediaClick = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const imageAction = target.closest?.("[data-image-action]");
      if (imageAction instanceof HTMLButtonElement) {
        const imageElement = getImageActionElement(imageAction);
        if (!imageElement) return;

        if (imageAction.dataset.imageAction === "edit") {
          void openImageEditor(imageElement, event);
          return;
        }

        openImageViewer(imageElement, event);
        return;
      }

      // Handle markdown links to media files (e.g., [file](./images/file.pdf))
      const linkElement = target.closest("a");
      if (linkElement instanceof HTMLAnchorElement) {
        const rawHref = linkElement.getAttribute("href") || "";
        if (rawHref) {
          const normalizedHref = rawHref.split(/[?#]/)[0];
          const ext = normalizedHref.split(".").pop()?.toLowerCase();
          const mediaType = getMediaTypeFromExtension(ext);
          if (mediaType) {
            event.preventDefault();
            event.stopPropagation();
            onMediaClick({ path: normalizedHref, type: mediaType });
            return;
          }
        }
      }

      const imageElement = getImageActionElement(target);
      if (imageElement) {
        openImageViewer(imageElement, event);
        return;
      }

      // Handle audio/video element clicks
      if (target.tagName === "AUDIO" || target.tagName === "VIDEO") {
        const src = target.querySelector("source")?.getAttribute("src") || target.getAttribute("src") || "";
        if (src) {
          const ext = src.split(".").pop()?.toLowerCase();
          const mediaType = getMediaTypeFromExtension(ext);
          if (mediaType) {
            event.preventDefault();
            event.stopPropagation();
            onMediaClick({ path: src, type: mediaType });
          }
        }
      }
    };

    previewElement.addEventListener("click", handleMediaClick);

    return () => {
      previewElement.removeEventListener("click", handleMediaClick);
    };
  }, [basePath, onMediaClick, onNotify]);

  useEffect(() => {
    if (!contextMenu) return undefined;

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
    setMenuIndex(0);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const activeItem = menuItemsRef.current[menuIndex];
    activeItem?.focus();
  }, [contextMenu, menuIndex]);

  const closeContextMenu = () => {
    setContextMenu(null);
    menuSourceRef.current?.focus?.();
    menuSourceRef.current = null;
    menuItemsRef.current = [];
    setMenuIndex(0);
  };

  const openImageContextMenu = (event, sourceImage = null, x = null, y = null) => {
    const imageElement = sourceImage || getImageActionElement(event.target);
    if (!imageElement) {
      closeContextMenu();
      return;
    }

    const assetPath = imageElement.getAttribute("data-asset-path") || "";
    const isWorkspaceImage = Boolean(basePath && assetPath && !/^(https?:|data:|blob:)/i.test(assetPath));

    event?.preventDefault?.();
    const bounds = imageElement.getBoundingClientRect();
    menuSourceRef.current = imageElement;
    setContextMenu({
      x: Number.isFinite(x) ? x : event.clientX,
      y: Number.isFinite(y) ? y : event.clientY,
      keyboardOpened: !Number.isFinite(event?.clientX),
      anchorX: bounds.left + Math.min(bounds.width * 0.5, 220),
      anchorY: bounds.top + Math.min(bounds.height * 0.5, 80),
      isWorkspaceImage,
      src: imageElement.currentSrc || imageElement.src || "",
      assetPath,
      imageLabel: imageElement.getAttribute("alt") || assetPath,
    });
  };

  const handlePreviewKeyDown = (event) => {
    const imageElement = event.target?.closest?.("img");
    if (!imageElement) return;

    const shouldOpenMenu = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!shouldOpenMenu) return;

    const bounds = imageElement.getBoundingClientRect();
    openImageContextMenu(event, imageElement, bounds.left + bounds.width / 2, bounds.top + Math.min(bounds.height / 2, 80));
  };

  const openCropFromMenu = async () => {
    if (!contextMenu?.isWorkspaceImage) {
      onNotify?.("Crop is available for workspace images only.", "info");
      closeContextMenu();
      return;
    }

    const assetPath = contextMenu.assetPath;
    let fullSizeSrc = contextMenu.src;
    let annotation = null;
    try {
      fullSizeSrc = await readImage(basePath, assetPath);
    } catch {
      // Fall back to the rendered preview image if the full-size read fails.
    }
    try {
      annotation = await getImageAnnotation(basePath, assetPath);
    } catch {
      annotation = null;
    }
    let hasOriginal = false;
    try {
      const originalStatus = await getImageOriginalStatus(basePath, assetPath);
      hasOriginal = Boolean(originalStatus?.hasOriginal);
    } catch {
      hasOriginal = false;
    }

    setCropState({
      open: true,
      src: fullSizeSrc,
      assetPath,
      imageLabel: contextMenu.imageLabel,
      annotation,
      hasOriginal,
      annotationOnly: false,
    });
    closeContextMenu();
  };

  const viewImageFromMenu = () => {
    if (!contextMenu) return;
    if (typeof onMediaClick !== "function") {
      onNotify?.("Image viewer is unavailable in this view.", "info");
      closeContextMenu();
      return;
    }

    const imagePath = contextMenu.assetPath || contextMenu.src || "";
    if (!imagePath) {
      closeContextMenu();
      return;
    }

    const ext = imagePath.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
    const mediaType = getMediaTypeFromExtension(ext) || "image";
    onMediaClick({ path: imagePath, type: mediaType });
    closeContextMenu();
  };

  const copyMarkdownFromMenu = async () => {
    if (!contextMenu) return;
    const markdown = createImageMarkdown(
      contextMenu.imageLabel || "image",
      contextMenu.assetPath || contextMenu.src || ""
    );

    try {
      await navigator.clipboard.writeText(markdown);
      onNotify?.("Image markdown copied.", "success");
    } catch {
      onNotify?.("Unable to copy image markdown.", "error");
    } finally {
      closeContextMenu();
    }
  };

  const openReplaceFromMenu = () => {
    if (!contextMenu?.isWorkspaceImage) {
      onNotify?.("Replace is available for workspace images only.", "info");
      closeContextMenu();
      return;
    }

    setReplaceState({ busy: false, assetPath: contextMenu.assetPath });
    closeContextMenu();
    replaceInputRef.current?.click();
  };

  const handleReplaceImageFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !basePath || !replaceState.assetPath) {
      event.target.value = "";
      return;
    }

    setReplaceState((current) => ({ ...current, busy: true }));
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await replaceImage(basePath, replaceState.assetPath, dataUrl);
      imageResolveCacheRef.current.delete(imageCacheKey(replaceState.assetPath));
      imageResolveCacheRef.current.delete(imageCacheKey(replaceState.assetPath, "original"));
      const originalStatus = await getImageOriginalStatus(basePath, replaceState.assetPath).catch(() => ({ hasOriginal: false }));

      if (previewRef.current) {
        previewRef.current.querySelectorAll("img").forEach((image) => {
          if ((image.getAttribute("data-asset-path") || "") === replaceState.assetPath) {
            image.src = dataUrl;
            applyImageOriginalBadge(image, Boolean(originalStatus?.hasOriginal));
          }
        });
      }

      onNotify?.("Image replaced.", "success");
    } catch (error) {
      onNotify?.(error?.message || "Unable to replace image.", "error");
    } finally {
      setReplaceState({ busy: false, assetPath: "" });
      event.target.value = "";
    }
  };

  const handleDeleteFromMenu = async () => {
    if (!contextMenu?.isWorkspaceImage || !basePath || !contextMenu.assetPath) {
      onNotify?.("Delete is available for workspace images only.", "info");
      closeContextMenu();
      return;
    }

    const approved = window.confirm("Remove this image? Links are removed first; the image file is kept if it is referenced elsewhere.");
    if (!approved) {
      closeContextMenu();
      return;
    }

    try {
      const result = await deleteImage(basePath, contextMenu.assetPath);
      imageResolveCacheRef.current.delete(imageCacheKey(contextMenu.assetPath));

      if (previewRef.current) {
        previewRef.current.querySelectorAll("img").forEach((image) => {
          if ((image.getAttribute("data-asset-path") || "") === contextMenu.assetPath) {
            image.removeAttribute("src");
          }
        });
      }

      if (typeof onContentChange === "function" && Number(result?.referencesRemoved || 0) > 0) {
        const nextContent = removeImageReferenceFromMarkdown(content, contextMenu.assetPath);
        if (nextContent !== String(content || "")) {
          onContentChange(nextContent);
        }
      }

      const message = formatImageDeleteResult(result);
      onNotify?.(message, "success");
    } catch (error) {
      onNotify?.(error?.message || "Unable to delete image.", "error");
    } finally {
      closeContextMenu();
    }
  };

  const handleRenameFromMenu = async () => {
    if (!contextMenu?.isWorkspaceImage || !basePath || !contextMenu.assetPath) {
      onNotify?.("Rename is available for workspace images only.", "info");
      closeContextMenu();
      return;
    }

    const currentFileName = contextMenu.assetPath.split("/").pop() || "image.png";
    const nextFileName = window.prompt("Rename image file", currentFileName);
    if (!nextFileName || !nextFileName.trim()) {
      closeContextMenu();
      return;
    }

    const oldAssetPath = contextMenu.assetPath;
    try {
      const renamedAssetPath = await renameImage(basePath, oldAssetPath, nextFileName.trim());
      const normalizedNewAssetPath = encodeURI(String(renamedAssetPath || "").trim());

      imageResolveCacheRef.current.delete(imageCacheKey(oldAssetPath));
      if (previewRef.current) {
        previewRef.current.querySelectorAll("img").forEach((image) => {
          if ((image.getAttribute("data-asset-path") || "") === oldAssetPath) {
            image.setAttribute("data-asset-path", normalizedNewAssetPath);
            image.setAttribute("src", normalizedNewAssetPath);
          }
        });
      }

      if (typeof onContentChange === "function") {
        let nextContent = String(content || "");
        nextContent = replaceAllLiteral(nextContent, oldAssetPath, normalizedNewAssetPath);

        try {
          const decodedOld = decodeURIComponent(oldAssetPath);
          if (decodedOld && decodedOld !== oldAssetPath) {
            nextContent = replaceAllLiteral(nextContent, decodedOld, normalizedNewAssetPath);
          }
        } catch {
          // Keep best-effort replacement.
        }

        if (nextContent !== String(content || "")) {
          onContentChange(nextContent);
        }
      }

      onNotify?.("Image renamed and markdown updated.", "success");
    } catch (error) {
      onNotify?.(error?.message || "Unable to rename image.", "error");
    } finally {
      closeContextMenu();
    }
  };

  const menuActions = [
    {
      key: "view",
      label: "View image",
      onSelect: viewImageFromMenu,
      disabled: false,
    },
    {
      key: "crop",
      label: "Edit image",
      onSelect: openCropFromMenu,
      disabled: false,
    },
    {
      key: "copy",
      label: "Copy markdown",
      onSelect: copyMarkdownFromMenu,
      disabled: false,
    },
    {
      key: "replace",
      label: "Replace image",
      onSelect: openReplaceFromMenu,
      disabled: replaceState.busy,
    },
    {
      key: "rename",
      label: "Rename image",
      onSelect: handleRenameFromMenu,
      disabled: replaceState.busy,
    },
    {
      key: "delete",
      label: "Delete image",
      onSelect: handleDeleteFromMenu,
      disabled: replaceState.busy,
    },
  ];

  const handleMenuKeyDown = (event) => {
    if (!contextMenu) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeContextMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMenuIndex((current) => (current + 1) % menuActions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMenuIndex((current) => (current - 1 + menuActions.length) % menuActions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setMenuIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setMenuIndex(menuActions.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const action = menuActions[menuIndex];
      if (!action?.disabled) {
        action.onSelect();
      }
    }
  };

  const closeCropModal = () => {
    if (cropSaving) return;
    setCropState({ open: false, src: "", assetPath: "", imageLabel: "", annotation: null, hasOriginal: false, annotationOnly: false });
  };

  const handleRestoreOriginal = async () => {
    if (!basePath || !cropState.assetPath || !cropState.hasOriginal) return "";
    const approved = window.confirm("Restore the original image from .notes-app backup? This will overwrite the current edited image.");
    if (!approved) return "";

    try {
      await restoreImageOriginal(basePath, cropState.assetPath);
      imageResolveCacheRef.current.delete(imageCacheKey(cropState.assetPath));
      imageResolveCacheRef.current.delete(imageCacheKey(cropState.assetPath, "original"));

      const fullSizeSrc = await readImage(basePath, cropState.assetPath);
      const previewImage = showOriginalImages
        ? fullSizeSrc
        : await readImage(basePath, cropState.assetPath, { thumbnail: true }).catch(() => fullSizeSrc);

      if (previewRef.current) {
        previewRef.current.querySelectorAll("img").forEach((image) => {
          if ((image.getAttribute("data-asset-path") || "") === cropState.assetPath) {
            image.src = previewImage || fullSizeSrc;
            applyImageOriginalBadge(image, true);
          }
        });
      }

      return fullSizeSrc || previewImage || "";
    } catch (error) {
      onNotify?.(error?.message || "Unable to restore original image.", "error");
      return "";
    }
  };

  const handleSaveCrop = async (editedDataUrl, annotation) => {
    if (!basePath || !cropState.assetPath) return;
    setCropSaving(true);
    const targetAssetPath = cropState.assetPath;

    try {
      if (editedDataUrl) {
        imageResolveCacheRef.current.delete(imageCacheKey(targetAssetPath));
        imageResolveCacheRef.current.delete(imageCacheKey(targetAssetPath, "original"));
        if (previewRef.current) {
          previewRef.current.querySelectorAll("img").forEach((image) => {
            if ((image.getAttribute("data-asset-path") || "") === targetAssetPath) {
              image.src = editedDataUrl;
            }
          });
        }
        await replaceImage(basePath, targetAssetPath, editedDataUrl);
      }

      const savedAnnotation = await setImageAnnotation(basePath, targetAssetPath, annotation);
      const originalStatus = await getImageOriginalStatus(basePath, targetAssetPath).catch(() => ({ hasOriginal: false }));
      if (previewRef.current) {
        previewRef.current.querySelectorAll("img").forEach((image) => {
          if ((image.getAttribute("data-asset-path") || "") === targetAssetPath) {
            applyImageAnnotation(image, savedAnnotation);
            applyImageOriginalBadge(image, Boolean(originalStatus?.hasOriginal));
          }
        });
      }

      onNotify?.(editedDataUrl ? "Image edit saved." : "Image annotation saved.", "success");
      setCropState({ open: false, src: "", assetPath: "", imageLabel: "", annotation: null, hasOriginal: false, annotationOnly: false });
    } catch (error) {
      imageResolveCacheRef.current.delete(imageCacheKey(targetAssetPath));
      onNotify?.(error?.message || "Unable to save image edit.", "error");
    } finally {
      setCropSaving(false);
    }
  };

  return (
    <>
      <div
        className="preview"
        onContextMenu={openImageContextMenu}
        onKeyDown={handlePreviewKeyDown}
        ref={(node) => {
          previewRef.current = node;
          if (externalRef && typeof externalRef === "object") {
            externalRef.current = node;
          }
        }}
      >
        {parts.map((part, index) =>
          part.type === "mermaid" ? (
            <MermaidBlock code={part.value} index={index} key={`${part.type}-${index}`} />
          ) : (
            <div
              key={`${part.type}-${index}`}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(normalizeMarkdownImagePaths(part.value), {
                  sourceLineOffset: part.startLine || 0,
                }),
              }}
            />
          )
        )}
      </div>
      {contextMenu ? (
        <div
          ref={menuRef}
          className="editor-context-menu"
          style={{
            left: Number.isFinite(contextMenu.x) ? contextMenu.x : contextMenu.anchorX,
            top: Number.isFinite(contextMenu.y) ? contextMenu.y : contextMenu.anchorY,
          }}
          role="menu"
          aria-label="Image context menu"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="editor-context-menu-group">
            <div className="editor-context-menu-label">Image actions</div>
            {menuActions.map((action, index) => (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                ref={(node) => {
                  menuItemsRef.current[index] = node;
                }}
                onClick={action.onSelect}
                disabled={action.disabled}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleReplaceImageFile}
      />
      <ImageCropModal
        open={cropState.open}
        imageSrc={cropState.src}
        imageLabel={cropState.imageLabel}
        initialAnnotation={cropState.annotation}
        annotationOnly={cropState.annotationOnly}
        restoreOriginalAvailable={cropState.hasOriginal}
        saving={cropSaving}
        onClose={closeCropModal}
        onRestoreOriginal={handleRestoreOriginal}
        onSave={handleSaveCrop}
      />
    </>
  );
});
