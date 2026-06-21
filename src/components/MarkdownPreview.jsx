import { useEffect, useMemo, useRef, useState } from "react";
import {
  renderMarkdown,
  parseMermaidBlocks,
  normalizeMarkdownImagePaths,
} from "../utils/renderUtils";
import { readImage, replaceImage, deleteImage, renameImage } from "../services/electronService";
import { readFileAsDataUrl } from "../utils/imageUtils";
import { createImageMarkdown } from "../utils/markdownUtils";
import { MermaidBlock } from "./MermaidBlock";
import { ImageCropModal } from "./ImageCropModal";

function replaceAllLiteral(source, needle, replacement) {
  if (!needle || needle === replacement) return source;
  return String(source || "").split(needle).join(replacement);
}

export function MarkdownPreview({ content, basePath, externalRef, onNotify, onContentChange }) {
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
      if (cache.has(assetPath)) {
        const cached = cache.get(assetPath);
        if (!cancelled && cached) image.src = cached;
        return;
      }

      try {
        const resolved = await readImage(basePath, assetPath);
        if (!cancelled && resolved) {
          cache.set(assetPath, resolved);
          image.src = resolved;
        }
      } catch {
        // Keep original src if resolution fails.
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
  }, [content, basePath]);

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
    const imageElement = sourceImage || event.target.closest("img");
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

  const openCropFromMenu = () => {
    if (!contextMenu?.isWorkspaceImage) {
      onNotify?.("Crop is available for workspace images only.", "info");
      closeContextMenu();
      return;
    }

    setCropState({
      open: true,
      src: contextMenu.src,
      assetPath: contextMenu.assetPath,
      imageLabel: contextMenu.imageLabel,
    });
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
      imageResolveCacheRef.current.set(replaceState.assetPath, dataUrl);

      if (previewRef.current) {
        previewRef.current.querySelectorAll("img").forEach((image) => {
          if ((image.getAttribute("data-asset-path") || "") === replaceState.assetPath) {
            image.src = dataUrl;
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

    const approved = window.confirm("Delete this image asset? Markdown links will remain and may render as missing.");
    if (!approved) {
      closeContextMenu();
      return;
    }

    try {
      await deleteImage(basePath, contextMenu.assetPath);
      imageResolveCacheRef.current.delete(contextMenu.assetPath);

      if (previewRef.current) {
        previewRef.current.querySelectorAll("img").forEach((image) => {
          if ((image.getAttribute("data-asset-path") || "") === contextMenu.assetPath) {
            image.removeAttribute("src");
          }
        });
      }

      onNotify?.("Image deleted.", "success");
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

      imageResolveCacheRef.current.delete(oldAssetPath);
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
      key: "crop",
      label: "Crop image",
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
    setCropState({ open: false, src: "", assetPath: "", imageLabel: "" });
  };

  const handleSaveCrop = async (croppedDataUrl) => {
    if (!basePath || !cropState.assetPath) return;
    setCropSaving(true);
    const targetAssetPath = cropState.assetPath;

    // Optimistically update preview and cache so the crop appears immediately.
    imageResolveCacheRef.current.set(targetAssetPath, croppedDataUrl);
    if (previewRef.current) {
      previewRef.current.querySelectorAll("img").forEach((image) => {
        if ((image.getAttribute("data-asset-path") || "") === targetAssetPath) {
          image.src = croppedDataUrl;
        }
      });
    }

    try {
      await replaceImage(basePath, targetAssetPath, croppedDataUrl);
      onNotify?.("Image cropped and saved.", "success");
      setCropState({ open: false, src: "", assetPath: "", imageLabel: "" });
    } catch (error) {
      imageResolveCacheRef.current.delete(targetAssetPath);
      onNotify?.(error?.message || "Unable to save cropped image.", "error");
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
              dangerouslySetInnerHTML={{ __html: renderMarkdown(normalizeMarkdownImagePaths(part.value)) }}
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
        saving={cropSaving}
        onClose={closeCropModal}
        onSave={handleSaveCrop}
      />
    </>
  );
}
