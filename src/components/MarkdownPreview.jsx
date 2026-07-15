import { useEffect, useMemo, useRef, useState, memo } from "react";
import { Search, Copy, ExternalLink, Pencil, RefreshCw, Trash2, RotateCcw } from "lucide-react";
import {
  renderMarkdown,
  parseDiagramBlocks,
  normalizeMarkdownImagePaths,
} from "../utils/renderUtils";
import { readMarkdownSource, checkIsDirectory, openFolder } from "../services/electronService";
import { readImage, replaceImage, deleteImage, renameImage, getImageAnnotation, setImageAnnotation, getImageOriginalStatus, restoreImageOriginal } from "../services/electronService";
import { readFileAsDataUrl } from "../utils/mediaTypeUtils";
import { createImageMarkdown, normalizeImagePathForMarkdown } from "../utils/markdownUtils";
import { createDiagramMarkdown, generateDiagramId } from "../utils/diagramFileUtils";
import { writeDiagramSource } from "../services/diagramService";
import { getMediaTypeFromExtension } from "../utils/mediaUtils";
import { formatImageDeleteResult } from "../utils/imageDeleteResult";
import { removeImageReferenceFromMarkdown } from "../utils/imageMarkdownReferences";
import useConfirm from "../hooks/useConfirm";
import { MermaidBlock } from "./MermaidBlock";
import { ExcalidrawBlock } from "./ExcalidrawBlock";
import ExcalidrawComponent from "./ExcalidrawEditor";
import { DrawioBlock } from "./DrawioBlock";
import { ImageCropModal } from "./ImageCropModal";
import CodeBlockModal from "./CodeBlockModal";

function replaceAllLiteral(source, needle, replacement) {
  if (!needle || needle === replacement) return source;
  return String(source || "").split(needle).join(replacement);
}

function imageCacheKey(assetPath, variant = "thumbnail") {
  return `${variant}:${assetPath}`;
}

function getImageActionElement(target) {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest?.(".excalidraw-block")) return null;
  if (target.tagName === "IMG") return target;
  const frame = target.closest?.(".markdown-image-frame");
  const framedImage = frame?.querySelector?.("img");
  return framedImage instanceof HTMLImageElement ? framedImage : null;
}

function getExcalidrawActionContext(target) {
  if (!(target instanceof HTMLElement)) return null;
  const block = target.closest?.(".excalidraw-block");
  if (!block) return null;

  const preview = block.querySelector?.(".excalidraw-preview-container");
  if (!(preview instanceof HTMLElement)) return null;

  const image = block.querySelector?.(".diagram-image");
  const bounds = preview.getBoundingClientRect();
  return {
    block,
    preview,
    image: image instanceof HTMLImageElement ? image : null,
    bounds,
    diagramId: block.getAttribute("data-diagram-id") || "",
    imagePath: block.getAttribute("data-diagram-image-path") || "",
    originAssetPath: block.getAttribute("data-origin-asset-path") || "",
    originAltText: block.getAttribute("data-origin-alt-text") || "",
  };
}

function sanitizeAttributeValue(value) {
  return String(value || "").replace(/"/g, "&quot;");
}

function toComparableAssetPath(value) {
  let normalized = String(value || "").trim();
  if (!normalized) return "";
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(normalized);
      if (next === normalized) break;
      normalized = next;
    } catch {
      break;
    }
  }
  return normalized.replace(/\\/g, "/");
}

function replaceFirstImageReferenceWithDiagram(content, targetAssetPath, replacementMarkdown) {
  const source = String(content || "");
  const targetComparable = toComparableAssetPath(targetAssetPath);
  if (!targetComparable) {
    return { nextContent: source, replaced: false, originalAlt: "" };
  }

  const imageRegex = /!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)/g;
  let replaced = false;
  let originalAlt = "";
  const nextContent = source.replace(imageRegex, (match, alt, rawPath) => {
    if (replaced) return match;
    const cleanedPath = String(rawPath || "").trim().replace(/^<|>$/g, "");
    const comparablePath = toComparableAssetPath(cleanedPath);
    if (comparablePath !== targetComparable) return match;
    replaced = true;
    originalAlt = String(alt || "").trim();
    return replacementMarkdown;
  });

  return { nextContent, replaced, originalAlt };
}

function replaceDiagramReferenceWithOriginal(content, options = {}) {
  const source = String(content || "");
  const {
    diagramId,
    diagramImagePath,
    originAssetPath,
    originAltText,
  } = options;

  const comparableDiagramPath = toComparableAssetPath(diagramImagePath);
  const replacementMarkdown = createImageMarkdown(originAltText || "Image", originAssetPath || "");
  const diagramRegex = /!\[Excalidraw Diagram\]\(((?:\.notes-app\/)?excali-diagrams\/(?:(?:[^/]+\/)?([^/]+))\/diagram\.png)\)\s*(\{[^}]*\})?/gi;
  let replaced = false;

  const nextContent = source.replace(diagramRegex, (match, imagePath, fallbackDiagramId, attributeBlock) => {
    if (replaced) return match;
    const explicitIdMatch = String(attributeBlock || "").match(/data-diagram-id=["“]([^"”]+)["”]/i);
    const currentDiagramId = String(explicitIdMatch?.[1] || fallbackDiagramId || "").trim();
    const currentComparablePath = toComparableAssetPath(imagePath);
    const idMatch = diagramId && currentDiagramId && diagramId === currentDiagramId;
    const pathMatch = comparableDiagramPath && comparableDiagramPath === currentComparablePath;
    if (!idMatch && !pathMatch) return match;
    replaced = true;
    return replacementMarkdown;
  });

  return { nextContent, replaced };
}

function replaceCodeBlockAtLine(source, targetLine, newLanguage, newCode) {
  const lines = String(source || "").split("\n");
  const startIdx = targetLine - 1; // 0-indexed

  if (startIdx < 0 || startIdx >= lines.length || !lines[startIdx].startsWith("```")) {
    return null;
  }

  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "```") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) return null;

  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx + 1);
  const newBlock = `\`\`\`${newLanguage}\n${newCode}\n\`\`\``;

  return [...before, newBlock, ...after].join("\n");
}

function inferDataUrlMimeType(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,/i);
  return String(match?.[1] || "image/png").toLowerCase();
}

function measureDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: Number(image.naturalWidth || image.width || 1280),
        height: Number(image.naturalHeight || image.height || 720),
      });
    };
    image.onerror = () => reject(new Error("Unable to load image for Excalidraw background."));
    image.src = dataUrl;
  });
}

function createExcalidrawSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function buildExcalidrawInitialDataFromImage(imageDataUrl, dimensions = {}, imageLabel = "Image") {
  const fileId = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const elementId = `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const width = Math.max(1, Math.round(Number(dimensions.width) || 1280));
  const height = Math.max(1, Math.round(Number(dimensions.height) || 720));
  const now = Date.now();

  return {
    elements: [
      {
        id: elementId,
        type: "image",
        x: 0,
        y: 0,
        width,
        height,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        roundness: null,
        seed: createExcalidrawSeed(),
        version: 1,
        versionNonce: createExcalidrawSeed(),
        isDeleted: false,
        boundElements: null,
        updated: now,
        link: null,
        locked: false,
        status: "saved",
        fileId,
        scale: [1, 1],
        crop: null,
      },
    ],
    appState: {
      viewBackgroundColor: "#ffffff",
      selectedElementIds: {
        [elementId]: true,
      },
    },
    files: {
      [fileId]: {
        id: fileId,
        dataURL: imageDataUrl,
        mimeType: inferDataUrlMimeType(imageDataUrl),
        created: now,
        lastRetrieved: now,
        size: 0,
        name: imageLabel || "Image",
      },
    },
  };
}

function resolveDocumentPathFromBase(basePath) {
  if (!basePath) return "";
  return String(basePath).split(/[\\/]/).slice(0, -1).join("/");
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

function normalizePathSeparators(value) {
  return String(value || "").replace(/\\/g, "/");
}

function normalizeAbsolutePath(pathValue) {
  const normalized = normalizePathSeparators(pathValue).trim();
  if (!normalized) return "";

  const driveMatch = normalized.match(/^([A-Za-z]:)(\/.*)?$/);
  if (driveMatch) {
    const drive = driveMatch[1];
    const rest = driveMatch[2] || "/";
    const segments = rest.split("/");
    const output = [];
    for (const segment of segments) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        if (output.length > 0) output.pop();
        continue;
      }
      output.push(segment);
    }
    return `${drive}/${output.join("/")}`;
  }

  if (normalized.startsWith("/")) {
    const segments = normalized.split("/");
    const output = [];
    for (const segment of segments) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        if (output.length > 0) output.pop();
        continue;
      }
      output.push(segment);
    }
    return `/${output.join("/")}`;
  }

  return "";
}

function dirname(pathValue) {
  const normalized = normalizePathSeparators(pathValue);
  const at = normalized.lastIndexOf("/");
  if (at <= 0) return normalized;
  return normalized.slice(0, at);
}

function hasPathExtension(pathValue) {
  const normalized = normalizePathSeparators(pathValue);
  const leaf = normalized.split("/").pop() || "";
  return /\.[^./\\]+$/.test(leaf);
}

function resolveMarkdownLinkPath(basePath, href) {
  const cleanedHref = String(href || "").trim();
  if (!cleanedHref) return "";

  let withoutQuery = cleanedHref;
  if (!/^file:/i.test(withoutQuery)) {
    withoutQuery = withoutQuery.split(/[?#]/)[0];
  }
  if (!withoutQuery || /^(https?:|data:|blob:|mailto:|#)/i.test(withoutQuery)) {
    return "";
  }

  let decoded = withoutQuery;
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  if (/^file:/i.test(decoded)) {
    try {
      const parsed = new URL(decoded);
      let pathname = parsed.pathname || "";
      if (/^\/[A-Za-z]:\//.test(pathname)) {
        pathname = pathname.slice(1);
      }
      let filePath = decodeURIComponent(pathname || "");
      if (filePath === "." || filePath === "./" || filePath.endsWith("/")) return "";
      const hasExt = hasPathExtension(filePath);
      if (hasExt && !filePath.toLowerCase().endsWith(".md")) return "";
      if (!hasExt) filePath = `${filePath}.md`;
      const normalizedFilePath = normalizeAbsolutePath(filePath);
      return normalizedFilePath.replace(/\//g, "\\");
    } catch {
      return "";
    }
  }

  if (decoded === "." || decoded === "./" || decoded.endsWith("/")) return "";
  const hasExt = hasPathExtension(decoded);
  if (hasExt && !decoded.toLowerCase().endsWith(".md")) return "";
  if (!hasExt) {
    decoded = `${decoded}.md`;
  }
  const normalizedBasePath = normalizeAbsolutePath(basePath);
  if (!normalizedBasePath) return "";

  if (/^[a-zA-Z]:\//.test(decoded)) {
    const absolute = normalizeAbsolutePath(decoded);
    return absolute.replace(/\//g, "\\");
  }

  const driveMatch = normalizedBasePath.match(/^([a-zA-Z]:)/);
  const drive = driveMatch ? driveMatch[1] : "";
  const baseDir = dirname(normalizedBasePath);

  if (decoded.startsWith("/")) {
    const absolute = normalizeAbsolutePath(drive ? `${drive}${decoded}` : decoded);
    return absolute.replace(/\//g, "\\");
  }

  const absolute = normalizeAbsolutePath(`${baseDir}/${decoded}`);
  return absolute.replace(/\//g, "\\");
}

function clearInlineLinkedPreview(linkElement) {
  const next = linkElement?.nextElementSibling;
  if (next instanceof HTMLElement && next.classList.contains("inline-linked-note")) {
    next.remove();
    return true;
  }
  return false;
}

export const MarkdownPreview = memo(function MarkdownPreviewContent({
  content,
  basePath,
  externalRef,
  onNotify,
  onContentChange,
  onMediaClick,
  showOriginalImages = false,
  inlineLinkedMarkdown = false,
  onSearchRequest,
  onForceSaveDocument,
}) {
  const previewRef = useRef(null);
  const menuRef = useRef(null);
  const menuItemsRef = useRef([]);
  const menuSourceRef = useRef(null);
  const replaceInputRef = useRef(null);
  const imageResolveCacheRef = useRef(new Map());
  const { confirm } = useConfirm();
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
  const [codeEditState, setCodeEditState] = useState({ open: false, language: "", code: "", sourceLine: null });
  const [diagramEditState, setDiagramEditState] = useState({
    open: false,
    diagramId: "",
    documentPath: "",
    initialData: null,
    sourceAssetPath: "",
    sourceAltText: "",
  });
  const parts = useMemo(() => {
    return parseDiagramBlocks(content);
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

      const existingAssetPath = image.getAttribute("data-asset-path") || "";
      const src = image.getAttribute("src") || "";
      const assetPath = existingAssetPath || src;
      image.setAttribute("data-asset-path", assetPath);

      const shouldSkipResolution = !existingAssetPath && (!src || /^(data:|blob:|https?:)/i.test(src));
      if (shouldSkipResolution) return;

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
    if (!onMediaClick && !inlineLinkedMarkdown) return;

    const previewElement = previewRef.current;
    if (!previewElement) return;

    const openInlineLinkedMarkdown = async (linkElement, event) => {
      if (!inlineLinkedMarkdown || !basePath) return false;

      const rawHref = linkElement.getAttribute("href") || "";
      const resolvedPath = resolveMarkdownLinkPath(basePath, rawHref);
      if (!resolvedPath) return false;

      event.preventDefault();
      event.stopPropagation();

      if (clearInlineLinkedPreview(linkElement)) {
        return true;
      }

      const wrapper = document.createElement("section");
      wrapper.className = "inline-linked-note";
      wrapper.innerHTML = "<div class=\"inline-linked-note-status\">Loading linked note…</div>";
      linkElement.insertAdjacentElement("afterend", wrapper);

      try {
        const source = await readMarkdownSource(resolvedPath);
        const normalized = normalizeMarkdownImagePaths(source || "");
        wrapper.innerHTML = `
          <div class="inline-linked-note-header">
            <strong>Linked Note</strong>
            <span>${resolvedPath.split(/[/\\\\]/).pop() || "note.md"}</span>
          </div>
          <div class="inline-linked-note-body">${renderMarkdown(normalized, { sourceLineOffset: 0 })}</div>
        `;
      } catch (error) {
        const message = error?.message || "Unable to load linked note.";
        wrapper.innerHTML = `<div class="inline-linked-note-status error">${message}</div>`;
        onNotify?.(message, "error");
      }

      return true;
    };

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

    const handleRunCodeBlock = async (runButton) => {
      const rawCode = decodeURIComponent(runButton.getAttribute("data-code-raw") || "");
      const lang = runButton.getAttribute("data-code-lang") || "";
      const figure = runButton.closest("figure.markdown-code-block");
      if (!figure) return;

      let outputDiv = figure.querySelector(".code-execution-output");
      if (!outputDiv) {
        outputDiv = document.createElement("div");
        outputDiv.className = "code-execution-output";
        outputDiv.style.marginTop = "8px";
        outputDiv.style.borderRadius = "4px";
        outputDiv.style.border = "1px solid #282c34";
        outputDiv.style.background = "#181a1f";
        outputDiv.style.color = "#abb2bf";
        outputDiv.style.fontFamily = "Consolas, Monaco, 'Courier New', monospace";
        outputDiv.style.fontSize = "12px";
        outputDiv.style.padding = "8px 12px";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.justify = "space-between";
        header.style.alignItems = "center";
        header.style.paddingBottom = "6px";
        header.style.borderBottom = "1px solid #282c34";
        header.style.marginBottom = "6px";
        header.style.fontSize = "11px";
        header.style.fontWeight = "600";
        header.style.color = "#5c6370";
        header.innerHTML = `
          <span class="status-label">EXECUTION OUTPUT</span>
          <button type="button" class="clear-output-btn" style="background:none; border:none; color:#e06c75; cursor:pointer; font-size:11px; padding: 2px 6px;">Clear</button>
        `;
        outputDiv.appendChild(header);

        const pre = document.createElement("pre");
        pre.style.margin = "0";
        pre.style.whiteSpace = "pre-wrap";
        pre.style.wordBreak = "break-all";
        pre.style.maxHeight = "200px";
        pre.style.overflowY = "auto";
        pre.style.color = "#abb2bf";
        outputDiv.appendChild(pre);

        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.style.width = "100%";
        iframe.style.height = "250px";
        iframe.style.border = "none";
        iframe.style.background = "#ffffff";
        iframe.style.borderRadius = "2px";
        iframe.style.marginTop = "4px";
        iframe.sandbox = "allow-scripts";
        outputDiv.appendChild(iframe);

        figure.appendChild(outputDiv);

        const clearBtn = header.querySelector(".clear-output-btn");
        clearBtn.onclick = () => {
          outputDiv.remove();
        };
      }

      const pre = outputDiv.querySelector("pre");
      const iframe = outputDiv.querySelector("iframe");
      const statusLabel = outputDiv.querySelector(".status-label");

      statusLabel.textContent = "EXECUTING...";
      statusLabel.style.color = "#61afef";
      if (iframe) iframe.style.display = "none";
      if (pre) {
        pre.style.display = "block";
        pre.textContent = "Running script...";
        pre.style.color = "#abb2bf";
      }

      try {
        const { executeCodeBlock } = await import("../services/electronService");
        const result = await executeCodeBlock(lang, rawCode);

        if (result.success) {
          if (result.isHtml) {
            statusLabel.textContent = "HTML PREVIEW";
            statusLabel.style.color = "#98c379";
            if (pre) pre.style.display = "none";
            if (iframe) {
              iframe.style.display = "block";
              iframe.srcdoc = result.htmlContent;
            }
          } else {
            statusLabel.textContent = `SUCCESS (exit code ${result.exitCode})`;
            statusLabel.style.color = "#98c379";
            if (iframe) iframe.style.display = "none";
            if (pre) {
              pre.style.display = "block";
              pre.textContent = result.stdout || "(No output)";
              pre.style.color = "#abb2bf";
            }
          }
        } else {
          statusLabel.textContent = `FAILED (exit code ${result.exitCode})`;
          statusLabel.style.color = "#e06c75";
          if (iframe) iframe.style.display = "none";
          if (pre) {
            pre.style.display = "block";
            pre.textContent = result.stderr || result.stdout || "Execution failed with no output.";
            pre.style.color = "#e06c75";
          }
        }
      } catch (err) {
        statusLabel.textContent = "ERROR";
        statusLabel.style.color = "#e06c75";
        if (iframe) iframe.style.display = "none";
        if (pre) {
          pre.style.display = "block";
          pre.textContent = err.message || "Failed to execute code block.";
          pre.style.color = "#e06c75";
        }
      }
    };

    const handleMediaClick = async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const runButton = target.closest('[data-code-run="true"]');
      if (runButton instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        handleRunCodeBlock(runButton);
        return;
      }

      const copyButton = target.closest('[data-code-copy="true"]');
      if (copyButton instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const rawCode = decodeURIComponent(copyButton.getAttribute("data-code-raw") || "");
        try {
          await navigator.clipboard.writeText(rawCode);
          onNotify?.("Code copied.", "success");
        } catch {
          onNotify?.("Unable to copy code.", "error");
        }
        return;
      }

      const formatButton = target.closest('[data-code-format="true"]');
      if (formatButton instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const rawCode = decodeURIComponent(formatButton.getAttribute("data-code-raw") || "");
        const lang = formatButton.getAttribute("data-code-lang") || "";
        const figure = formatButton.closest("figure.markdown-code-block");
        const sourceLine = figure ? Number(figure.getAttribute("data-source-line")) : null;
        
        if (sourceLine) {
          import("../utils/codeFormatter").then(({ formatCode }) => {
            formatCode(rawCode, lang).then((formatted) => {
              if (formatted && formatted !== rawCode) {
                if (onContentChange) {
                  const nextContent = replaceCodeBlockAtLine(content, sourceLine, lang, formatted);
                  if (nextContent !== null) {
                    onContentChange(nextContent);
                    onNotify?.("Code formatted successfully.", "success");
                  }
                }
              } else {
                onNotify?.("Code is already formatted or language unsupported.", "info");
              }
            });
          });
        }
        return;
      }

      const editButton = target.closest('[data-code-edit="true"]');
      if (editButton instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const rawCode = decodeURIComponent(editButton.getAttribute("data-code-raw") || "");
        const lang = editButton.getAttribute("data-code-lang") || "";
        const figure = editButton.closest("figure.markdown-code-block");
        const sourceLine = figure ? Number(figure.getAttribute("data-source-line")) : null;
        
        if (sourceLine) {
          setCodeEditState({ open: true, language: lang, code: rawCode, sourceLine });
        } else {
          onNotify?.("Unable to determine source line for this block.", "error");
        }
        return;
      }

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

      const linkElement = target.closest("a");
      if (linkElement instanceof HTMLAnchorElement) {
        const rawHref = (linkElement.getAttribute("href") || "").trim();
        if (rawHref === "." || rawHref === "./") {
          event.preventDefault();
          event.stopPropagation();
          onNotify?.("Directory links like ./ are not supported here. Link a specific .md file.", "info");
          return;
        }

        if (rawHref) {
          try {
            const resolvedDirPath = await checkIsDirectory(rawHref, basePath);
            if (resolvedDirPath) {
              event.preventDefault();
              event.stopPropagation();
              const confirmed = await confirm({
                title: "Open Folder?",
                message: `Are you sure you want to open this folder in File Explorer?\n\nPath: ${resolvedDirPath}`,
                confirmLabel: "Open",
                cancelLabel: "Cancel",
                variant: "primary"
              });
              if (confirmed) {
                await openFolder(resolvedDirPath);
              }
              return;
            }
          } catch (dirCheckErr) {
            console.warn("Failed to check if link is directory:", dirCheckErr);
          }
        }

        if (inlineLinkedMarkdown) {
          const openedInline = await openInlineLinkedMarkdown(linkElement, event);
          if (openedInline) return;
        }

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
  }, [basePath, inlineLinkedMarkdown, onMediaClick, onNotify, content, onContentChange, confirm]);

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

  const closeContextMenu = (options = {}) => {
    const { restoreFocus = true } = options;
    const shouldRestoreFocus = restoreFocus && Boolean(contextMenu?.keyboardOpened);
    setContextMenu(null);
    if (shouldRestoreFocus) {
      menuSourceRef.current?.focus?.();
    }
    menuSourceRef.current = null;
    menuItemsRef.current = [];
    setMenuIndex(0);
  };

  const openImageContextMenu = (event, sourceImage = null, x = null, y = null) => {
    const sourceTarget = sourceImage || event?.target;
    const diagramContext = getExcalidrawActionContext(sourceTarget);
    if (diagramContext) {
      event?.preventDefault?.();
      menuSourceRef.current = diagramContext.preview;
      setContextMenu({
        kind: "diagram",
        x: Number.isFinite(x) ? x : event?.clientX,
        y: Number.isFinite(y) ? y : event?.clientY,
        keyboardOpened: !Number.isFinite(event?.clientX),
        anchorX: diagramContext.bounds.left + Math.min(diagramContext.bounds.width * 0.5, 220),
        anchorY: diagramContext.bounds.top + Math.min(diagramContext.bounds.height * 0.5, 80),
        diagramId: diagramContext.diagramId,
        diagramImagePath: diagramContext.imagePath,
        originAssetPath: diagramContext.originAssetPath,
        originAltText: diagramContext.originAltText,
      });
      return;
    }

    const imageElement = sourceImage || getImageActionElement(event.target);
    if (!imageElement) {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      if (text) {
        event?.preventDefault?.();
        setContextMenu({
          kind: "text",
          x: Number.isFinite(x) ? x : event?.clientX,
          y: Number.isFinite(y) ? y : event?.clientY,
          keyboardOpened: !Number.isFinite(event?.clientX),
          anchorX: Number.isFinite(x) ? x : event?.clientX,
          anchorY: Number.isFinite(y) ? y : event?.clientY,
          selectedText: text,
        });
        return;
      }
      closeContextMenu({ restoreFocus: false });
      return;
    }

    const assetPath = imageElement.getAttribute("data-asset-path") || "";
    const isWorkspaceImage = Boolean(basePath && assetPath && !/^(https?:|data:|blob:)/i.test(assetPath));

    event?.preventDefault?.();
    const bounds = imageElement.getBoundingClientRect();
    menuSourceRef.current = imageElement;
    setContextMenu({
      kind: "image",
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
    closeContextMenu({ restoreFocus: false });
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
    closeContextMenu({ restoreFocus: false });
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

  const editDiagramFromMenu = () => {
    const source = menuSourceRef.current;
    const preview = source instanceof HTMLElement
      ? (source.classList.contains("excalidraw-preview-container") ? source : source.closest?.(".excalidraw-preview-container"))
      : null;
    if (preview instanceof HTMLElement) {
      preview.click();
    }
    closeContextMenu();
  };

  const copyDiagramMarkdownFromMenu = async () => {
    if (!contextMenu?.diagramImagePath) {
      onNotify?.("Diagram reference unavailable.", "info");
      closeContextMenu({ restoreFocus: false });
      return;
    }

    const metadata = contextMenu.diagramId
      ? `{data-diagram-id="${contextMenu.diagramId}" data-diagram-type="excalidraw"}`
      : "";
    const markdown = `![Excalidraw Diagram](${contextMenu.diagramImagePath})${metadata}`;

    try {
      await navigator.clipboard.writeText(markdown);
      onNotify?.("Diagram markdown copied.", "success");
    } catch {
      onNotify?.("Unable to copy diagram markdown.", "error");
    } finally {
      closeContextMenu();
    }
  };

  const closeDiagramEditor = () => {
    setDiagramEditState({
      open: false,
      diagramId: "",
      documentPath: "",
      initialData: null,
      sourceAssetPath: "",
      sourceAltText: "",
    });
  };

  const openExcalidrawFromImageMenu = async () => {
    if (!basePath || !contextMenu?.isWorkspaceImage || !contextMenu?.assetPath) {
      onNotify?.("Edit with Excalidraw is available for workspace images only.", "info");
      closeContextMenu({ restoreFocus: false });
      return;
    }

    const sourceAssetPath = contextMenu.assetPath;
    const sourceAltText = contextMenu.imageLabel || "Image";
    closeContextMenu();

    try {
      const fullSizeSrc = await readImage(basePath, sourceAssetPath);
      const dimensions = await measureDataUrlImage(fullSizeSrc);
      const diagramId = generateDiagramId();
      const initialData = buildExcalidrawInitialDataFromImage(fullSizeSrc, dimensions, sourceAltText);

      setDiagramEditState({
        open: true,
        diagramId,
        documentPath: resolveDocumentPathFromBase(basePath),
        initialData,
        sourceAssetPath,
        sourceAltText,
      });
    } catch (error) {
      onNotify?.(error?.message || "Unable to open image in Excalidraw.", "error");
    }
  };

  const saveExcalidrawFromImageMenu = async (newDiagramData, previewImageData) => {
    if (!diagramEditState.diagramId || !diagramEditState.documentPath || !diagramEditState.sourceAssetPath) {
      return;
    }

    const sourceAssetPath = diagramEditState.sourceAssetPath;
    const sourceAltText = diagramEditState.sourceAltText || "Image";

    try {
      const sourceSaved = await writeDiagramSource(diagramEditState.documentPath, diagramEditState.diagramId, newDiagramData);
      if (!sourceSaved) {
        throw new Error("Failed to persist diagram source.");
      }

      const baseMarkdown = createDiagramMarkdown("document", diagramEditState.diagramId);
      const normalizedOriginAsset = normalizeImagePathForMarkdown(sourceAssetPath);
      const metadataSuffix = ` data-origin-asset="${sanitizeAttributeValue(normalizedOriginAsset)}" data-origin-alt="${sanitizeAttributeValue(sourceAltText)}"}`;
      const diagramMarkdown = baseMarkdown.includes("}")
        ? baseMarkdown.replace(/\}$/, metadataSuffix)
        : `${baseMarkdown}{data-diagram-id="${diagramEditState.diagramId}" data-diagram-type="excalidraw" data-origin-asset="${sanitizeAttributeValue(normalizedOriginAsset)}" data-origin-alt="${sanitizeAttributeValue(sourceAltText)}"}`;

      const replacementResult = replaceFirstImageReferenceWithDiagram(content, sourceAssetPath, diagramMarkdown);
      if (!replacementResult.replaced) {
        throw new Error("Could not locate the source image markdown to replace.");
      }

      const finalContent = replacementResult.nextContent;
      if (typeof onContentChange === "function" && finalContent !== String(content || "")) {
        onContentChange(finalContent);
      }

      onNotify?.("Image converted to Excalidraw diagram.", "success");
      onForceSaveDocument?.();
      void previewImageData;
    } catch (error) {
      onNotify?.(error?.message || "Unable to save Excalidraw diagram.", "error");
    }
  };

  const restoreOriginalImageFromDiagramMenu = () => {
    if (!contextMenu?.originAssetPath) {
      onNotify?.("Original image metadata is unavailable for this diagram.", "info");
      closeContextMenu();
      return;
    }

    const result = replaceDiagramReferenceWithOriginal(content, {
      diagramId: contextMenu.diagramId,
      diagramImagePath: contextMenu.diagramImagePath,
      originAssetPath: contextMenu.originAssetPath,
      originAltText: contextMenu.originAltText || "Image",
    });

    if (!result.replaced) {
      onNotify?.("Unable to restore the original image reference.", "error");
      closeContextMenu();
      return;
    }

    if (typeof onContentChange === "function" && result.nextContent !== String(content || "")) {
      onContentChange(result.nextContent);
    }
    onNotify?.("Restored original image reference.", "success");
    closeContextMenu({ restoreFocus: false });
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

    const approved = await confirm({
      title: "Remove Image?",
      message: "Remove this image? Links are removed first; the image file is kept if it is referenced elsewhere.",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "danger"
    });
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

  const imageMenuActions = [
    {
      key: "view-image",
      label: "View image",
      icon: <ExternalLink size={16} />,
      onSelect: viewImageFromMenu,
      disabled: false,
    },
    {
      key: "crop",
      label: "Edit image",
      icon: <Pencil size={16} />,
      onSelect: openCropFromMenu,
      disabled: false,
    },
    {
      key: "edit-excalidraw",
      label: "Edit with Excalidraw",
      icon: <Pencil size={16} />,
      onSelect: openExcalidrawFromImageMenu,
      disabled: false,
    },
    {
      key: "copy",
      label: "Copy markdown",
      icon: <Copy size={16} />,
      onSelect: copyMarkdownFromMenu,
      disabled: false,
    },
    {
      key: "replace",
      label: "Replace image",
      icon: <RefreshCw size={16} />,
      onSelect: openReplaceFromMenu,
      disabled: replaceState.busy,
    },
    {
      key: "rename",
      label: "Rename image",
      icon: <Pencil size={16} />,
      onSelect: handleRenameFromMenu,
      disabled: replaceState.busy,
    },
    {
      key: "delete",
      label: "Delete image",
      icon: <Trash2 size={16} />,
      onSelect: handleDeleteFromMenu,
      disabled: replaceState.busy,
    },
  ];

  const diagramMenuActions = [
    {
      key: "edit-diagram",
      label: "Edit diagram",
      icon: <Pencil size={16} />,
      onSelect: editDiagramFromMenu,
      disabled: false,
    },
    {
      key: "copy-diagram",
      label: "Copy diagram markdown",
      icon: <Copy size={16} />,
      onSelect: copyDiagramMarkdownFromMenu,
      disabled: false,
    },
  ];

  if (contextMenu?.originAssetPath) {
    diagramMenuActions.push({
      key: "restore-original",
      label: "Restore original image",
      icon: <RotateCcw size={16} />,
      onSelect: restoreOriginalImageFromDiagramMenu,
      disabled: false,
    });
  }

  const textMenuActions = [
    {
      key: "copy-text",
      label: "Copy selection",
      icon: <Copy size={16} />,
      onSelect: () => {
        navigator.clipboard.writeText(contextMenu?.selectedText || "").then(() => {
          onNotify?.("Copied to clipboard", "success");
        }).catch(() => {
          onNotify?.("Failed to copy text", "error");
        });
        closeContextMenu();
      },
      disabled: false,
    },
    {
      key: "search-text",
      label: "Find in document",
      icon: <Search size={16} />,
      onSelect: () => {
        onSearchRequest?.(contextMenu?.selectedText || "");
        closeContextMenu();
      },
      disabled: false,
    }
  ];

  const activeMenuActions =
    contextMenu?.kind === "text"
      ? textMenuActions
      : contextMenu?.kind === "diagram"
      ? diagramMenuActions
      : imageMenuActions;

  const handleMenuKeyDown = (event) => {
    if (!contextMenu) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeContextMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMenuIndex((current) => (current + 1) % activeMenuActions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMenuIndex((current) => (current - 1 + activeMenuActions.length) % activeMenuActions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setMenuIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setMenuIndex(activeMenuActions.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const action = activeMenuActions[menuIndex];
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
    const approved = await confirm({
      title: "Restore Original?",
      message: "Restore the original image from .notes-app backup? This will overwrite the current edited image.",
      confirmLabel: "Restore",
      cancelLabel: "Cancel",
      variant: "danger"
    });
    if (!approved) return "";

    try {
      await restoreImageOriginal(basePath, cropState.assetPath);
      imageResolveCacheRef.current.delete(imageCacheKey(cropState.assetPath));
      imageResolveCacheRef.current.delete(imageCacheKey(cropState.assetPath, "original"));

      const fullSizeSrc = await readImage(basePath, cropState.assetPath);
      const previewImage = showOriginalImages
        ? fullSizeSrc
        : await readImage(basePath, cropState.assetPath, { thumbnail: true }).catch(() => fullSizeSrc);

      // Update cropState.src so that the ImageCropModal's imageSrc prop reflects the
      // restored original. Without this, subsequent rotation in the modal would still
      // use the old (edited) image as its base, producing degraded output.
      if (fullSizeSrc) {
        setCropState((prev) => ({ ...prev, src: fullSizeSrc }));
      }

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
      onForceSaveDocument?.();
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
          ) : part.type === "excalidraw" ? (
            <ExcalidrawBlock
              imagePath={part.imagePath}
              diagramId={part.diagramId}
              originAssetPath={part.originAssetPath}
              originAltText={part.originAltText}
              documentPath={basePath?.split(/[/\\]/).slice(0, -1).join("/")}
              onNotify={onNotify}
              index={index}
              key={`${part.type}-${index}`}
              onForceSaveNote={onForceSaveDocument}
            />
          ) : part.type === "drawio" ? (
            <DrawioBlock
              imagePath={part.imagePath}
              diagramId={part.diagramId}
              onNotify={onNotify}
              key={`${part.type}-${index}`}
              onForceSaveNote={onForceSaveDocument}
            />
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
            <div className="editor-context-menu-label">
              {contextMenu?.kind === "diagram" ? "Diagram actions" : contextMenu?.kind === "text" ? "Text actions" : "Image actions"}
            </div>
            {activeMenuActions.map((action, index) => (
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
                {action.icon}
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
      {diagramEditState.open ? (
        <ExcalidrawComponent
          initialData={diagramEditState.initialData}
          diagramId={diagramEditState.diagramId}
          documentPath={diagramEditState.documentPath}
          onClose={closeDiagramEditor}
          onSave={saveExcalidrawFromImageMenu}
        />
      ) : null}
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
      <CodeBlockModal
        open={codeEditState.open}
        initialLanguage={codeEditState.language}
        initialCode={codeEditState.code}
        onClose={() => setCodeEditState({ open: false, language: "", code: "", sourceLine: null })}
        onSave={({ language, code }) => {
          if (!onContentChange || !codeEditState.sourceLine) return;
          const nextContent = replaceCodeBlockAtLine(content, codeEditState.sourceLine, language, code);
          if (nextContent !== null) {
            onContentChange(nextContent);
            setTimeout(() => {
              onForceSaveDocument?.();
            }, 50);
          } else {
            onNotify?.("Failed to update code block. Source line might have shifted.", "error");
          }
        }}
      />
    </>
  );
});
