import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  Heading2,
  Bold,
  Italic,
  Undo2,
  Redo2,
  List,
  CheckCircle2,
  Quote,
  Code,
  Link,
  Link2,
  Table2,
  FileText,
  ImagePlus,
  Zap,
  Scan,
} from "lucide-react";
import { applySnippet, createMediaMarkdown, insertTextAtCursor, normalizeImagePathForMarkdown } from "../utils/markdownUtils";
import { insertMediaFromFile } from "../services/imageService";
import { captureCurrentDisplay, listDocuments, listImages, openReferenceNoteWindow, saveImage } from "../services/electronService";
import { applyMarkdownQuickFix, applyValidationSuggestion, getIssueFixType } from "../utils/markdownQuickFix";
import { MEDIA_FILE_INPUT_ACCEPT } from "../utils/mediaTypeUtils";
import { getMediaTypeFromExtension } from "../utils/mediaUtils";
import { createDiagramMarkdown, generateDiagramId } from "../utils/diagramFileUtils";
import { ImageCropModal } from "./ImageCropModal";

function canonicalPathKey(pathValue) {
  const normalized = String(pathValue || "").trim().replace(/\\/g, "/");
  if (!normalized) return "";
  const trimmed = normalized.replace(/\/+$/, "");
  return trimmed.toLowerCase();
}

function stripUrlSuffix(pathValue) {
  return String(pathValue || "").split(/[?#]/)[0];
}

function hasMarkdownExtension(pathValue) {
  return /\.md$/i.test(stripUrlSuffix(pathValue));
}

function toRelativeDocPath(fromFilePath, toFilePath) {
  if (!fromFilePath || !toFilePath) return "";
  const fromNormalized = String(fromFilePath).replace(/\\/g, "/");
  const toNormalized = String(toFilePath).replace(/\\/g, "/");

  if (canonicalPathKey(fromNormalized) === canonicalPathKey(toNormalized)) {
    return "";
  }

  const fromDrive = fromNormalized.match(/^([A-Za-z]:)\//)?.[1]?.toLowerCase() || "";
  const toDrive = toNormalized.match(/^([A-Za-z]:)\//)?.[1]?.toLowerCase() || "";
  // Cross-drive links cannot be represented as sane relative paths on Windows.
  if (fromDrive && toDrive && fromDrive !== toDrive) {
    return toNormalized;
  }

  const fromParts = fromNormalized.split(/[\\/]+/);
  const toParts = toNormalized.split(/[\\/]+/);

  fromParts.pop();
  while (fromParts.length && toParts.length && fromParts[0].toLowerCase() === toParts[0].toLowerCase()) {
    fromParts.shift();
    toParts.shift();
  }

  const up = Array.from({ length: fromParts.length }, () => "..");
  const relative = [...up, ...toParts].join("/");
  if (!relative) return "./";
  if (relative.startsWith(".")) return relative;
  return `./${relative}`;
}

function isValidHttpUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getIssueLabel(issue) {
  if (!issue) return "Issue";
  if (issue.ruleId === "spelling") return issue.word ? "Typo" : "Spelling";
  if (String(issue.ruleId || "").includes("table")) return "Markdown";
  return "Issue";
}

function getAssetMediaType(pathValue) {
  const normalized = String(pathValue || "").trim().replace(/\\/g, "/");
  if (!normalized) return "document";

  const withoutSuffix = normalized.split(/[?#]/)[0];
  const fileName = withoutSuffix.split("/").pop() || "";
  let decodedFileName = fileName;
  try {
    decodedFileName = decodeURIComponent(fileName);
  } catch {
    decodedFileName = fileName;
  }

  const extension = decodedFileName.split(".").pop()?.trim().toLowerCase();
  return getMediaTypeFromExtension(extension) || "document";
}

function decodePathForDisplay(pathValue) {
  const normalized = String(pathValue || "").replace(/\\/g, "/").trim();
  if (!normalized) return "";
  return normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

function cleanRelativePathForDisplay(relativePath) {
  const normalized = String(relativePath || "").replace(/^\.\//, "");
  const withoutParents = normalized.replace(/^(\.\.\/)+/, "");
  return decodePathForDisplay(withoutParents);
}

function getAssetPathDisplayLabel(pathValue) {
  const normalized = String(pathValue || "").replace(/\\/g, "/").trim();
  if (!normalized) return "";

  const withoutPrefix = normalized
    .replace(/^\.\/images\//i, "")
    .replace(/^\/images\//i, "")
    .replace(/^images\//i, "");

  return decodePathForDisplay(withoutPrefix);
}

export function MarkdownToolbar({
  value,
  onChange,
  textareaRef,
  basePath,
  onNotify,
  validationIssues = [],
  validationStatus = "idle",
  onJumpToLine,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  ignoredSpellingWords = [],
  onIgnoreSpellingWord,
  onRemoveIgnoredSpellingWord,
  onClearIgnoredSpellingWords,
  screenCaptureMode = "auto",
}) {
  const imageInputRef = useRef(null);
  const mermaidPopoverRef = useRef(null);
  const assetLinkPopoverRef = useRef(null);
  const referenceLinkPopoverRef = useRef(null);
  const webLinkPopoverRef = useRef(null);
  const tablePopoverRef = useRef(null);
  const validationPopoverRef = useRef(null);
  const [showMermaidBuilder, setShowMermaidBuilder] = useState(false);
  const [showAssetLinker, setShowAssetLinker] = useState(false);
  const [showReferenceLinker, setShowReferenceLinker] = useState(false);
  const [referencePickerMode, setReferencePickerMode] = useState("preview");
  const [showWebLinker, setShowWebLinker] = useState(false);
  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [availableReferenceNotes, setAvailableReferenceNotes] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [linkText, setLinkText] = useState("");
  const [referenceLinkText, setReferenceLinkText] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [webLinkText, setWebLinkText] = useState("");
  const [webLinkUrl, setWebLinkUrl] = useState("");
  const [webLinkError, setWebLinkError] = useState("");
  const [chartType, setChartType] = useState("flowchart");
  const [flowDirection, setFlowDirection] = useState("LR");
  const [flowStart, setFlowStart] = useState("Start");
  const [flowMiddle, setFlowMiddle] = useState("Review");
  const [flowEnd, setFlowEnd] = useState("Done");
  const [seqActorA, setSeqActorA] = useState("User");
  const [seqActorB, setSeqActorB] = useState("System");
  const [seqMessage, setSeqMessage] = useState("Submit request");
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [diagramMode, setDiagramMode] = useState("picker");
  const [screenCaptureOpen, setScreenCaptureOpen] = useState(false);
  const [screenCaptureImageSrc, setScreenCaptureImageSrc] = useState("");
  const [screenCaptureLabel, setScreenCaptureLabel] = useState("");
  const [screenCaptureBusy, setScreenCaptureBusy] = useState(false);
  const [screenCaptureSaving, setScreenCaptureSaving] = useState(false);

  const closeToolbarPanels = () => {
    setShowMermaidBuilder(false);
    setShowAssetLinker(false);
    setShowReferenceLinker(false);
    setShowWebLinker(false);
    setShowTableBuilder(false);
    setShowValidationPanel(false);
    setDiagramMode("picker");
  };

  const isPanelOpen = (panel) => {
    if (panel === "mermaid") return showMermaidBuilder;
    if (panel === "asset") return showAssetLinker;
    if (panel === "reference") return showReferenceLinker;
    if (panel === "web") return showWebLinker;
    if (panel === "table") return showTableBuilder;
    if (panel === "validation") return showValidationPanel;
    return false;
  };

  const openPanel = (panel) => {
    if (panel === "mermaid") setShowMermaidBuilder(true);
    if (panel === "asset") setShowAssetLinker(true);
    if (panel === "reference") setShowReferenceLinker(true);
    if (panel === "web") setShowWebLinker(true);
    if (panel === "table") setShowTableBuilder(true);
    if (panel === "validation") setShowValidationPanel(true);
  };

  const toggleToolbarPanel = (panel) => {
    const shouldOpen = !isPanelOpen(panel);
    closeToolbarPanels();
    if (shouldOpen) {
      openPanel(panel);
    }
    return shouldOpen;
  };

  const anyPopoverOpen =
    showMermaidBuilder ||
    showAssetLinker ||
    showReferenceLinker ||
    showWebLinker ||
    showTableBuilder ||
    showValidationPanel;

  useEffect(() => {
    if (!anyPopoverOpen) {
      return undefined;
    }

    const handleGlobalClick = (event) => {
      const insideMermaid = mermaidPopoverRef.current?.contains(event.target);
      const insideAssetLinker = assetLinkPopoverRef.current?.contains(event.target);
      const insideReferenceLinker = referenceLinkPopoverRef.current?.contains(event.target);
      const insideWebLinker = webLinkPopoverRef.current?.contains(event.target);
      const insideTableBuilder = tablePopoverRef.current?.contains(event.target);
      const insideValidation = validationPopoverRef.current?.contains(event.target);
      if (
        !insideMermaid &&
        !insideAssetLinker &&
        !insideReferenceLinker &&
        !insideWebLinker &&
        !insideTableBuilder &&
        !insideValidation
      ) {
        closeToolbarPanels();
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeToolbarPanels();
      }
    };

    document.addEventListener("mousedown", handleGlobalClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleGlobalClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [anyPopoverOpen]);

  const handleMediaSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const { mediaPath, altText } = await insertMediaFromFile(file);
      const markdown = createMediaMarkdown(altText, mediaPath);
      insertTextAtCursor(value, onChange, markdown, textareaRef);
      onNotify?.("Media inserted.", "success");
    } catch (error) {
      console.error("Media insertion failed:", error);
      onNotify?.(error?.message || "Failed to insert media.", "error");
    } finally {
      event.target.value = "";
    }
  };

  const snippets = [
    { key: "heading", icon: Heading2, title: "Heading", before: "## ", after: "", placeholder: "Heading" },
    { key: "bold", icon: Bold, title: "Bold", before: "**", after: "**", placeholder: "bold text" },
    { key: "italic", icon: Italic, title: "Italic", before: "_", after: "_", placeholder: "italic text" },
    { key: "list", icon: List, title: "List", before: "- ", after: "", placeholder: "list item" },
    { key: "quote", icon: Quote, title: "Quote", before: "> ", after: "", placeholder: "quote" },
    { key: "code", icon: Code, title: "Code", before: "`", after: "`", placeholder: "code" },
  ];

  const filteredAssets = availableAssets.filter((asset) => {
    if (assetFilter !== "all") {
      const mediaType = asset.mediaType || getAssetMediaType(asset.path);
      if (mediaType !== assetFilter) return false;
    }

    const search = assetSearch.trim().toLowerCase();
    if (!search) return true;
    const label = `${asset.path || ""} ${getAssetPathDisplayLabel(asset.path)}`;
    return label.toLowerCase().includes(search);
  });
  const normalizedTableRows = Math.min(Math.max(Number(tableRows) || 1, 1), 20);
  const normalizedTableColumns = Math.min(Math.max(Number(tableColumns) || 1, 1), 20);
  const hasValidAssetUrl = isValidHttpUrl(assetUrl);
  const hasValidWebLinkUrl = isValidHttpUrl(webLinkUrl);
  const validationSummary =
    validationStatus === "checking"
      ? "Checking"
      : validationStatus === "error"
        ? "Error"
        : validationIssues.length
          ? `${validationIssues.length} issue${validationIssues.length === 1 ? "" : "s"}`
          : "No issues";

  function openTableBuilder() {
    toggleToolbarPanel("table");
  }

  const listAllDocumentEntries = async () => {
    const visited = new Set();
    const seenFiles = new Set();
    const files = [];
    const queue = ["ROOT"];

    while (queue.length > 0) {
      const nextFolder = queue.shift();
      const folderArg = nextFolder === "ROOT" ? undefined : nextFolder;
      const entries = await listDocuments(folderArg);

      for (const entry of entries || []) {
        const key = canonicalPathKey(entry?.filePath);
        if (!key) continue;
        if (entry?.entryType === "folder") {
          if (visited.has(key)) continue;
          visited.add(key);
          queue.push(entry.filePath);
          continue;
        }
        if (seenFiles.has(key)) continue;
        seenFiles.add(key);
        files.push(entry);
      }
    }

    return files;
  };

  async function openReferenceLinker(mode = "preview") {
    const shouldOpen = toggleToolbarPanel("reference");
    setReferencePickerMode(mode === "insert" ? "insert" : "preview");
    setReferenceError("");

    if (!shouldOpen) return;

    if (!basePath) {
      setAvailableReferenceNotes([]);
      setReferenceError("Save or open a note file before referencing workspace notes.");
      return;
    }

    setReferenceLoading(true);
    try {
      const docs = await listAllDocumentEntries();
      const currentPathKey = canonicalPathKey(basePath);
      const noteAssets = (docs || [])
        .filter((entry) => {
          if (canonicalPathKey(entry.filePath) === currentPathKey) return false;
          if (hasMarkdownExtension(entry?.filePath)) return true;
          return hasMarkdownExtension(entry?.fileName);
        })
        .map((entry) => {
          const fallbackName = String(entry.fileName || entry.title || "Untitled note").trim() || "Untitled note";
          const relativePath = normalizeImagePathForMarkdown(toRelativeDocPath(basePath, entry.filePath));
          const compactPath = cleanRelativePathForDisplay(relativePath);
          const displayTitle = String(entry.title || entry.fileName || fallbackName).trim() || fallbackName;
          const showPath = compactPath.includes("/");
          const displayPath = showPath ? compactPath : "";

          return {
            filePath: entry.filePath,
            fileName: entry.fileName,
            title: entry.title,
            displayTitle,
            displayPath,
          };
        });

      setAvailableReferenceNotes(noteAssets);
    } catch (error) {
      setAvailableReferenceNotes([]);
      setReferenceError(error?.message || "Unable to load workspace notes.");
    } finally {
      setReferenceLoading(false);
    }
  }

  function openDiagramBuilder() {
    const shouldOpen = toggleToolbarPanel("mermaid");
    if (shouldOpen) {
      setDiagramMode("picker");
    }
  }

  function runMarkdownValidation() {
    const shouldOpen = toggleToolbarPanel("validation");
    if (!shouldOpen) return;

    if (validationStatus === "checking") {
      onNotify?.("Validation is running...", "info");
      return;
    }
    if (validationStatus === "error") {
      onNotify?.("Validation service unavailable.", "error");
      return;
    }
    if (validationIssues.length) {
      onNotify?.(
        `Found ${validationIssues.length} markdown issue${validationIssues.length > 1 ? "s" : ""}.`,
        "warning"
      );
    } else {
      onNotify?.("No markdown syntax issues found.", "success");
    }
  }

  function applyValidationFix(issue) {
    if (!issue) return;
    const result = applyMarkdownQuickFix(value, issue);
    if (!result.changed) {
      onNotify?.(result.message, "warning");
      return;
    }
    onChange(result.nextValue);
    onNotify?.(result.message, "success");
  }

  function applyValidationSuggestionFix(issue) {
    if (!issue) return;
    const result = applyValidationSuggestion(value, issue);
    if (!result.changed) {
      onNotify?.(result.message, "warning");
      return;
    }

    onChange(result.nextValue);
    onNotify?.(result.message, "success");
  }

  function ignoreSpellingWord(issue) {
    const word = String(issue?.word || "").trim();
    if (!word) {
      onNotify?.("No word available to ignore.", "warning");
      return;
    }
    onIgnoreSpellingWord?.(word);
  }

  function insertTableTemplate() {
    const rows = normalizedTableRows;
    const columns = normalizedTableColumns;
    const headerCells = Array.from({ length: columns }, (_value, index) => `Column ${index + 1}`);
    const separatorCells = Array.from({ length: columns }, () => "---");
    const bodyRows = Array.from({ length: rows }, (_row, rowIndex) => {
      const cells = Array.from({ length: columns }, (_col, colIndex) => `Value ${rowIndex + 1}.${colIndex + 1}`);
      return `| ${cells.join(" | ")} |`;
    });

    const table = [
      `| ${headerCells.join(" | ")} |`,
      `| ${separatorCells.join(" | ")} |`,
      ...bodyRows,
    ].join("\n");

    insertTextAtCursor(value, onChange, `\n${table}\n`, textareaRef);
    setShowTableBuilder(false);
    onNotify?.("Table inserted.", "success");
  }

  async function openAssetLinker() {
    const shouldOpen = toggleToolbarPanel("asset");
    setAssetsError("");

    if (!shouldOpen) return;

    if (!basePath) {
      setAvailableAssets([]);
      setAssetsError("Save or open a note file before linking workspace assets.");
      return;
    }

    setAssetsLoading(true);
    try {
      const paths = await listImages(basePath);

      const mediaAssets = (paths || []).map((pathValue) => ({
        type: "media",
        path: pathValue,
        mediaType: getAssetMediaType(pathValue),
      }));

      setAvailableAssets(mediaAssets);
      setAssetFilter("all");
    } catch (error) {
      setAvailableAssets([]);
      setAssetsError(error?.message || "Unable to load workspace assets.");
    } finally {
      setAssetsLoading(false);
    }
  }

  function openWebLinker() {
    toggleToolbarPanel("web");
    setWebLinkError("");
  }

  function insertReferenceDocLink(targetDoc) {
    const filePath = targetDoc?.filePath;
    const text = (referenceLinkText || "").trim() || targetDoc?.title || targetDoc?.fileName || "Linked note";
    if (!hasMarkdownExtension(filePath)) {
      setReferenceError("Only markdown notes can be linked. Choose a .md file.");
      return;
    }

    let relativePath = toRelativeDocPath(basePath, filePath);
    if (relativePath && !hasMarkdownExtension(relativePath) && hasMarkdownExtension(targetDoc?.fileName)) {
      relativePath = `${relativePath}.md`;
    }
    const normalizedPath = normalizeImagePathForMarkdown(relativePath);
    if (!normalizedPath || normalizedPath === "./" || normalizedPath === ".") {
      setReferenceError("Choose a different note. Linking the current note is not supported.");
      return;
    }

    insertTextAtCursor(value, onChange, `[${text}](${normalizedPath})`, textareaRef);
    setShowReferenceLinker(false);
    setReferenceLinkText("");
    setReferenceSearch("");
    onNotify?.("Document link inserted.", "success");
  }

  async function previewReferenceDocLink(targetDoc) {
    const filePath = targetDoc?.filePath;
    if (!hasMarkdownExtension(filePath)) {
      setReferenceError("Only markdown notes can be previewed. Choose a .md file.");
      return;
    }

    try {
      await openReferenceNoteWindow(filePath);
      onNotify?.("Reference note opened in a new window.", "success");
    } catch (error) {
      setReferenceError(error?.message || "Unable to open reference note preview.");
    }
  }

  function linkExistingAsset(pathValue) {
    const fileName = pathValue.split(/[\\/]/).pop() || "Media";
    const fallbackLabel = fileName.replace(/\.[^.]+$/, "");
    const markdown = createMediaMarkdown(linkText.trim() || fallbackLabel, pathValue);
    insertTextAtCursor(value, onChange, `${markdown}\n`, textareaRef);
    setShowAssetLinker(false);
    setLinkText("");
    setAssetSearch("");
    onNotify?.("Media link inserted.", "success");
  }

  function linkAssetFromUrl() {
    const trimmedUrl = assetUrl.trim();
    if (!trimmedUrl) {
      setAssetsError("Enter an asset URL first.");
      return;
    }
    if (!isValidHttpUrl(trimmedUrl)) {
      setAssetsError("Use a valid http/https URL.");
      return;
    }

    const fallbackLabel = trimmedUrl.split(/[/?#]/).filter(Boolean).pop() || "Media";
    const markdown = createMediaMarkdown(linkText.trim() || fallbackLabel, trimmedUrl);
    insertTextAtCursor(value, onChange, `${markdown}\n`, textareaRef);
    setShowAssetLinker(false);
    setLinkText("");
    setAssetSearch("");
    setAssetUrl("");
    setAssetsError("");
    onNotify?.("Asset URL inserted.", "success");
  }

  function insertWebLink() {
    const trimmedUrl = webLinkUrl.trim();
    if (!trimmedUrl) {
      setWebLinkError("Enter a URL.");
      return;
    }
    if (!isValidHttpUrl(trimmedUrl)) {
      setWebLinkError("Use a valid http/https URL.");
      return;
    }

    const text = webLinkText.trim() || "link text";
    insertTextAtCursor(value, onChange, `[${text}](${trimmedUrl})`, textareaRef);
    setShowWebLinker(false);
    setWebLinkText("");
    setWebLinkUrl("");
    setWebLinkError("");
    onNotify?.("Web link inserted.", "success");
  }

  const buildMermaidCode = () => {
    if (chartType === "sequence") {
      const actorA = seqActorA.trim() || "User";
      const actorB = seqActorB.trim() || "System";
      const message = seqMessage.trim() || "Message";
      return [
        "sequenceDiagram",
        `  participant ${actorA}`,
        `  participant ${actorB}`,
        `  ${actorA}->>${actorB}: ${message}`,
        `  ${actorB}-->>${actorA}: Acknowledged`,
      ].join("\n");
    }

    const from = flowStart.trim() || "Start";
    const middle = flowMiddle.trim() || "Review";
    const to = flowEnd.trim() || "Done";
    const direction = flowDirection.trim() || "LR";
    return [
      `flowchart ${direction}`,
      `  A[${from}] --> B[${middle}]`,
      `  B --> C[${to}]`,
    ].join("\n");
  };

  const insertMermaidDiagram = () => {
    const code = buildMermaidCode();
    const markdown = `\n\n\`\`\`mermaid\n${code}\n\`\`\`\n`;
    insertTextAtCursor(value, onChange, markdown, textareaRef);
    setShowMermaidBuilder(false);
    onNotify?.("Mermaid block inserted.", "success");
  };

  const deriveDocSlug = () => {
    const fileName = String(basePath || "").split(/[\\/]/).pop() || "document";
    const withoutExt = fileName.replace(/\.md$/i, "").trim() || "document";
    const slug = withoutExt
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "document";
  };

  const insertExcalidrawDiagram = () => {
    const docSlug = deriveDocSlug();
    const diagramId = generateDiagramId();
    const rawMarkdown = createDiagramMarkdown(docSlug, diagramId);
    const normalizedMarkdown = rawMarkdown.replace(/\(([^)]+)\)/, (_match, pathValue) => {
      return `(${normalizeImagePathForMarkdown(pathValue)})`;
    });

    insertTextAtCursor(value, onChange, `\n\n${normalizedMarkdown}\n`, textareaRef);
    setShowMermaidBuilder(false);
    if (!basePath) {
      onNotify?.("Excalidraw reference inserted. Save this note to resolve diagram files.", "info");
      return;
    }
    onNotify?.("Excalidraw reference inserted.", "success");
  };

  const createScreenshotFileName = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join("");
    return `screenshot-${stamp}.png`;
  };

  const closeScreenCapture = () => {
    if (screenCaptureSaving) return;
    setScreenCaptureOpen(false);
    setScreenCaptureImageSrc("");
    setScreenCaptureLabel("");
  };

  const insertCapturedImage = async (dataUrl) => {
    if (screenCaptureSaving) return false;

    setScreenCaptureSaving(true);
    try {
      const savedPath = await saveImage(createScreenshotFileName(), dataUrl, basePath);
      const markdown = createMediaMarkdown("Screenshot", savedPath);
      insertTextAtCursor(value, onChange, `${markdown}\n`, textareaRef);
      onNotify?.("Screen area inserted.", "success");
      return true;
    } finally {
      setScreenCaptureSaving(false);
    }
  };

  const openScreenCapture = async () => {
    if (screenCaptureBusy || screenCaptureSaving) return;

    setScreenCaptureBusy(true);
    closeToolbarPanels();
    onNotify?.("Select area to snip. Press Esc to cancel.", "info");
    try {
      const result = await captureCurrentDisplay();
      if (result?.canceled) {
        onNotify?.("Screen snip canceled.", "info");
        return;
      }

      if (!result?.dataUrl) {
        throw new Error("Screen snip returned empty data.");
      }

      if (screenCaptureMode === "review") {
        setScreenCaptureImageSrc(result.dataUrl);
        setScreenCaptureLabel("Adjust capture area, then save.");
        setScreenCaptureOpen(true);
        return;
      }

      await insertCapturedImage(result.dataUrl);
    } catch (error) {
      onNotify?.(error?.message || "Unable to start area snipping.", "error");
    } finally {
      setScreenCaptureBusy(false);
    }
  };

  const saveScreenCapture = async (editedDataUrl) => {
    if (!editedDataUrl || screenCaptureSaving) return;

    try {
      const inserted = await insertCapturedImage(editedDataUrl);
      if (inserted) {
        closeScreenCapture();
      }
    } catch (error) {
      onNotify?.(error?.message || "Unable to save screen capture.", "error");
    }
  };

  const handleScreenCaptureShortcut = useEffectEvent(() => {
    void openScreenCapture();
  });

  const handleReferenceNoteShortcut = useEffectEvent(() => {
    void openReferenceLinker("preview");
  });

  const handleInsertReferenceLinkShortcut = useEffectEvent(() => {
    void openReferenceLinker("insert");
  });

  const handleOpenReferencePickerEvent = useEffectEvent(() => {
    void openReferenceLinker("preview");
  });

  const handleInsertReferenceLinkPickerEvent = useEffectEvent(() => {
    void openReferenceLinker("insert");
  });

  useEffect(() => {
    const onShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      const key = String(event.key || "").toLowerCase();
      if (key === "k") {
        event.preventDefault();
        handleReferenceNoteShortcut();
        return;
      }
      if (key === "l") {
        event.preventDefault();
        handleInsertReferenceLinkShortcut();
        return;
      }
      if (key !== "s") return;
      event.preventDefault();
      handleScreenCaptureShortcut();
    };

    const onOpenReferencePicker = () => {
      handleOpenReferencePickerEvent();
    };

    const onInsertReferenceLinkPicker = () => {
      handleInsertReferenceLinkPickerEvent();
    };

    document.addEventListener("keydown", onShortcut);
    window.addEventListener("notely:open-reference-note-picker", onOpenReferencePicker);
    window.addEventListener("notely:insert-reference-link-picker", onInsertReferenceLinkPicker);
    return () => {
      document.removeEventListener("keydown", onShortcut);
      window.removeEventListener("notely:open-reference-note-picker", onOpenReferencePicker);
      window.removeEventListener("notely:insert-reference-link-picker", onInsertReferenceLinkPicker);
    };
  }, [
    handleScreenCaptureShortcut,
    handleReferenceNoteShortcut,
    handleInsertReferenceLinkShortcut,
    handleOpenReferencePickerEvent,
    handleInsertReferenceLinkPickerEvent,
  ]);

  return (
    <>
      <div className="editor-toolbar" aria-label="Markdown formatting toolbar">
      <button onClick={() => onUndo?.()} title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo}>
        <Undo2 size={18} />
      </button>
      <button onClick={() => onRedo?.()} title="Redo (Ctrl/Cmd+Y)" disabled={!canRedo}>
        <Redo2 size={18} />
      </button>
      {snippets.map((snippet) => (
        <button
          key={snippet.key}
          onClick={() =>
            applySnippet(value, onChange, textareaRef, snippet.before, snippet.after, snippet.placeholder)
          }
          title={snippet.title}
        >
          <snippet.icon size={18} />
        </button>
      ))}
      <button onClick={openTableBuilder} title="Insert table">
        <Table2 size={18} />
      </button>
      <button onClick={openWebLinker} title="Insert web link">
        <Link2 size={18} />
      </button>
      <button onClick={() => void openReferenceLinker("preview")} title="Open reference note (Ctrl/Cmd+Shift+K)">
        <FileText size={18} />
      </button>
      <button onClick={() => imageInputRef.current?.click()} title="Insert media from file">
        <ImagePlus size={18} />
      </button>
      <button
        onClick={() => {
          void openScreenCapture();
        }}
        title={`Capture screen area (Ctrl/Cmd+Shift+S) - ${screenCaptureMode === "review" ? "Review before insert" : "Auto insert"}`}
        disabled={screenCaptureBusy || screenCaptureSaving}
        className={screenCaptureMode === "review" ? "toolbar-btn-capture review" : "toolbar-btn-capture auto"}
      >
        <Scan size={18} />
        <span className="toolbar-capture-mode-glyph" aria-hidden="true">
          {screenCaptureMode === "review" ? "R" : "A"}
        </span>
      </button>
      <button onClick={openAssetLinker} title="Insert workspace asset">
        <Link size={18} />
      </button>
      <button onClick={openDiagramBuilder} title="Insert diagram">
        <Zap size={18} />
      </button>
      <button onClick={runMarkdownValidation} title="Validate markdown syntax">
        <CheckCircle2 size={18} />
      </button>
      <span className={`toolbar-validation-summary ${validationStatus}`} title={validationSummary}>
        {validationSummary}
      </span>

      {showValidationPanel && (
        <div
          className="validation-panel"
          ref={validationPopoverRef}
          role="dialog"
          aria-label="Markdown validation"
        >
          <div className="mermaid-builder-header">
            <strong>Markdown Validation</strong>
            <button className="mermaid-close" onClick={() => setShowValidationPanel(false)} title="Close">
              x
            </button>
          </div>

          {validationStatus === "checking" ? (
            <p className="toolbar-inline-note">Checking markdown...</p>
          ) : validationStatus === "error" ? (
            <p className="toolbar-inline-error">Validation service unavailable.</p>
          ) : (
            <div className="validation-list">
              {ignoredSpellingWords.length ? (
                <div className="validation-item">
                  <div className="validation-item-head">
                    <span className="validation-kind-badge info">Ignored words</span>
                  </div>
                  <p>{ignoredSpellingWords.length} word{ignoredSpellingWords.length === 1 ? "" : "s"} ignored in this workspace.</p>
                  <div className="validation-item-actions">
                    <button type="button" onClick={() => onClearIgnoredSpellingWords?.()}>
                      Clear all
                    </button>
                  </div>
                  <div className="validation-item-actions">
                    {ignoredSpellingWords.map((word) => (
                      <button
                        key={`ignored-${word}`}
                        type="button"
                        onClick={() => onRemoveIgnoredSpellingWord?.(word)}
                      >
                        Remove &quot;{word}&quot;
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {validationIssues.map((issue, index) => (
                <div className="validation-item" key={`${issue.line}-${index}`}>
                  <div className="validation-item-head">
                    <span className={`validation-kind-badge ${issue.ruleId || "issue"}`}>{getIssueLabel(issue)}</span>
                  </div>
                  <p>
                    Line {issue.line}:{issue.column || 1} - {issue.message}
                    {issue.ruleId ? ` (${issue.ruleId})` : ""}
                    {issue.suggestion ? ` Suggestion: ${issue.suggestion}` : ""}
                  </p>
                  <div className="validation-item-actions">
                    {Number.isFinite(issue.line) ? (
                      <button type="button" onClick={() => onJumpToLine?.(issue.line)}>
                        Go to line
                      </button>
                    ) : null}
                    {getIssueFixType(issue) ? (
                      <button type="button" onClick={() => applyValidationFix(issue)}>
                        Quick fix
                      </button>
                    ) : issue.suggestion ? (
                      <button type="button" onClick={() => applyValidationSuggestionFix(issue)}>
                        Apply suggestion
                      </button>
                    ) : null}
                    {issue.ruleId === "spelling" && issue.word ? (
                      <button type="button" onClick={() => ignoreSpellingWord(issue)}>
                        Ignore word
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!validationIssues.length ? <p className="toolbar-inline-note">No typo issues detected.</p> : null}
            </div>
          )}
        </div>
      )}

      {showTableBuilder && (
        <div className="table-builder" ref={tablePopoverRef} role="dialog" aria-label="Table builder">
          <div className="mermaid-builder-header">
            <strong>Insert Table</strong>
            <button className="mermaid-close" onClick={() => setShowTableBuilder(false)} title="Close">
              x
            </button>
          </div>

          <div className="mermaid-fields">
            <label>
              Rows
              <input
                type="number"
                min="1"
                max="20"
                value={tableRows}
                onChange={(event) => setTableRows(event.target.value)}
              />
            </label>
            <label>
              Columns
              <input
                type="number"
                min="1"
                max="20"
                value={tableColumns}
                onChange={(event) => setTableColumns(event.target.value)}
              />
            </label>
          </div>

          <div className="table-preview-wrap">
            <p className="table-preview-label">Preview</p>
            <div className="table-preview-grid" role="img" aria-label="Table preview grid">
              {Array.from({ length: normalizedTableRows + 1 }, (_row, rowIndex) => (
                <div className="table-preview-row" key={`preview-row-${rowIndex}`}>
                  {Array.from({ length: normalizedTableColumns }, (_col, colIndex) => (
                    <span
                      className={`table-preview-cell ${rowIndex === 0 ? "header" : "body"}`}
                      key={`preview-cell-${rowIndex}-${colIndex}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="image-linker-url-actions">
            <button onClick={insertTableTemplate}>Insert Table</button>
          </div>
        </div>
      )}

      {showAssetLinker && (
        <div className="image-linker" ref={assetLinkPopoverRef} role="dialog" aria-label="Workspace asset linker">
          <div className="mermaid-builder-header">
            <strong>Insert Media From Workspace</strong>
            <button className="mermaid-close" onClick={() => setShowAssetLinker(false)} title="Close">
              x
            </button>
          </div>

          <div className="mermaid-fields">
            <label>
              Search assets
              <input
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                placeholder="Type media path"
              />
            </label>
            <label>
              Filter
              <select
                value={assetFilter}
                onChange={(event) => setAssetFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="pdf">PDFs</option>
                <option value="document">Documents</option>
              </select>
            </label>
            <label>
              Link text (optional)
              <input
                value={linkText}
                onChange={(event) => setLinkText(event.target.value)}
                placeholder="Defaults to item name"
              />
            </label>
            <label>
              Asset URL (optional)
              <input
                value={assetUrl}
                onChange={(event) => {
                  setAssetUrl(event.target.value);
                  setAssetsError("");
                }}
                placeholder="https://example.com/file"
              />
            </label>
          </div>

          <div className="image-linker-url-actions">
            <button onClick={linkAssetFromUrl} disabled={!hasValidAssetUrl}>Insert URL Asset</button>
          </div>

          {assetUrl.trim() && !hasValidAssetUrl ? (
            <p className="toolbar-inline-error">Use a valid http/https URL.</p>
          ) : null}

          {assetsError && <p className="toolbar-inline-error">{assetsError}</p>}
          {assetsLoading ? <p className="toolbar-inline-note">Loading assets...</p> : null}

          {!assetsLoading && !filteredAssets.length ? (
            <p className="toolbar-inline-note">No matching assets found.</p>
          ) : (
            <div className="image-linker-list">
              {filteredAssets.map((asset) => (
                <button key={asset.path} onClick={() => linkExistingAsset(asset.path)} title={asset.path}>
                  {getAssetPathDisplayLabel(asset.path) || asset.path}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showReferenceLinker && (
        <div className="image-linker" ref={referenceLinkPopoverRef} role="dialog" aria-label="Reference note picker">
          <div className="mermaid-builder-header">
            <strong>{referencePickerMode === "insert" ? "Insert Reference Link" : "Open Reference Note"}</strong>
            <button className="mermaid-close" onClick={() => setShowReferenceLinker(false)} title="Close">
              x
            </button>
          </div>

          <div className="mermaid-fields">
            <label>
              Search notes
              <input
                value={referenceSearch}
                onChange={(event) => setReferenceSearch(event.target.value)}
                placeholder="Type note title or file name"
              />
            </label>
            {referencePickerMode === "insert" ? (
              <label>
                Link text (optional)
                <input
                  value={referenceLinkText}
                  onChange={(event) => setReferenceLinkText(event.target.value)}
                  placeholder="Defaults to note title"
                />
              </label>
            ) : null}
          </div>

          {referenceError && <p className="toolbar-inline-error">{referenceError}</p>}
          {referenceLoading ? <p className="toolbar-inline-note">Loading workspace notes...</p> : null}

          {!referenceLoading && !availableReferenceNotes.filter((asset) => {
            const search = referenceSearch.trim().toLowerCase();
            if (!search) return true;
            const label = [asset.displayTitle, asset.displayPath, asset.fileName]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return label.includes(search);
          }).length ? (
            <p className="toolbar-inline-note">No matching notes found.</p>
          ) : (
            <div className="image-linker-list">
              {availableReferenceNotes
                .filter((asset) => {
                  const search = referenceSearch.trim().toLowerCase();
                  if (!search) return true;
                  const label = [asset.displayTitle, asset.displayPath, asset.fileName]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                  return label.includes(search);
                })
                .map((asset) => (
                  <div className="image-linker-note-row" key={asset.filePath}>
                    <button
                      className="image-linker-note-primary"
                      onClick={() => {
                        if (referencePickerMode === "insert") {
                          insertReferenceDocLink(asset);
                          return;
                        }
                        void previewReferenceDocLink(asset);
                      }}
                      title={asset.displayPath || asset.fileName || asset.title}
                    >
                      <span className="image-linker-note-title">{(asset.displayTitle || asset.fileName || "Untitled note").trim()}</span>
                      {asset.displayPath ? (
                        <span className="image-linker-note-path">{asset.displayPath}</span>
                      ) : null}
                    </button>
                    <button
                      className={referencePickerMode === "insert"
                        ? "image-linker-note-secondary"
                        : "image-linker-note-secondary image-linker-note-secondary-icon"}
                      onClick={() => {
                        if (referencePickerMode === "insert") {
                          void previewReferenceDocLink(asset);
                          return;
                        }
                        insertReferenceDocLink(asset);
                      }}
                      title={referencePickerMode === "insert"
                        ? `Preview ${asset.displayTitle || asset.fileName || asset.title || "note"}`
                        : `Insert link to ${asset.displayTitle || asset.fileName || asset.title || "note"}`}
                      aria-label={referencePickerMode === "insert"
                        ? `Preview ${asset.displayTitle || asset.fileName || asset.title || "note"}`
                        : `Insert link to ${asset.displayTitle || asset.fileName || asset.title || "note"}`}
                      type="button"
                    >
                      {referencePickerMode === "insert" ? "Open Preview" : <Link2 size={14} aria-hidden="true" />}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {showWebLinker && (
        <div className="web-linker" ref={webLinkPopoverRef} role="dialog" aria-label="Web link inserter">
          <div className="mermaid-builder-header">
            <strong>Insert Web Link</strong>
            <button className="mermaid-close" onClick={() => setShowWebLinker(false)} title="Close">
              x
            </button>
          </div>

          <div className="mermaid-fields">
            <label>
              Link text
              <input
                value={webLinkText}
                onChange={(event) => setWebLinkText(event.target.value)}
                placeholder="Example: Open dashboard"
              />
            </label>
            <label>
              URL
              <input
                value={webLinkUrl}
                onChange={(event) => {
                  setWebLinkUrl(event.target.value);
                  setWebLinkError("");
                }}
                placeholder="https://example.com"
              />
            </label>
          </div>

          {webLinkUrl.trim() && !hasValidWebLinkUrl ? (
            <p className="toolbar-inline-error">Use a valid http/https URL.</p>
          ) : null}

          {webLinkError && <p className="toolbar-inline-error">{webLinkError}</p>}

          <div className="image-linker-url-actions">
            <button onClick={insertWebLink} disabled={!hasValidWebLinkUrl}>Insert Link</button>
          </div>
        </div>
      )}

      {showMermaidBuilder && (
        <div className="mermaid-builder" ref={mermaidPopoverRef} role="dialog" aria-label="Mermaid builder">
          <div className="mermaid-builder-header">
            <strong>{diagramMode === "picker" ? "Insert Diagram" : "Mermaid Builder"}</strong>
            <button
              className="mermaid-close"
              onClick={() => setShowMermaidBuilder(false)}
              title="Close"
            >
              x
            </button>
          </div>

          {diagramMode === "picker" ? (
            <>
              <div className="mermaid-type-switch">
                <button onClick={() => setDiagramMode("mermaid")}>Mermaid</button>
                <button onClick={insertExcalidrawDiagram}>Excalidraw</button>
              </div>
              <p className="toolbar-inline-note">
                Mermaid inserts an editable code block. Excalidraw inserts an image reference + metadata tag.
              </p>
            </>
          ) : null}

          {diagramMode === "mermaid" ? (
            <>
              <div className="mermaid-type-switch">
                <button
                  className={chartType === "flowchart" ? "active" : ""}
                  onClick={() => setChartType("flowchart")}
                >
                  Flowchart
                </button>
                <button
                  className={chartType === "sequence" ? "active" : ""}
                  onClick={() => setChartType("sequence")}
                >
                  Sequence
                </button>
              </div>

              {chartType === "flowchart" ? (
                <div className="mermaid-fields">
                  <label>
                    Direction
                    <select value={flowDirection} onChange={(event) => setFlowDirection(event.target.value)}>
                      <option value="LR">Left to Right</option>
                      <option value="TD">Top to Down</option>
                      <option value="RL">Right to Left</option>
                      <option value="BT">Bottom to Top</option>
                    </select>
                  </label>
                  <label>
                    Step 1
                    <input value={flowStart} onChange={(event) => setFlowStart(event.target.value)} />
                  </label>
                  <label>
                    Step 2
                    <input value={flowMiddle} onChange={(event) => setFlowMiddle(event.target.value)} />
                  </label>
                  <label>
                    Step 3
                    <input value={flowEnd} onChange={(event) => setFlowEnd(event.target.value)} />
                  </label>
                </div>
              ) : (
                <div className="mermaid-fields">
                  <label>
                    Participant A
                    <input value={seqActorA} onChange={(event) => setSeqActorA(event.target.value)} />
                  </label>
                  <label>
                    Participant B
                    <input value={seqActorB} onChange={(event) => setSeqActorB(event.target.value)} />
                  </label>
                  <label>
                    Message
                    <input value={seqMessage} onChange={(event) => setSeqMessage(event.target.value)} />
                  </label>
                </div>
              )}

              <pre className="mermaid-preview-code">{buildMermaidCode()}</pre>

              <div className="mermaid-builder-actions">
                <button onClick={insertMermaidDiagram}>Insert</button>
                <button onClick={() => setDiagramMode("picker")}>Back</button>
                <button onClick={() => setShowMermaidBuilder(false)}>Cancel</button>
              </div>
            </>
          ) : null}
        </div>
      )}
      <input
        ref={imageInputRef}
        type="file"
        accept={MEDIA_FILE_INPUT_ACCEPT}
        onChange={handleMediaSelect}
        hidden
      />
      </div>
      <ImageCropModal
        open={screenCaptureOpen}
        imageSrc={screenCaptureImageSrc}
        imageLabel={screenCaptureLabel || "Adjust capture area, then save."}
        allowSaveWithoutEdits
        saving={screenCaptureSaving}
        onClose={closeScreenCapture}
        onSave={(editedDataUrl) => saveScreenCapture(editedDataUrl)}
      />
    </>
  );
}
