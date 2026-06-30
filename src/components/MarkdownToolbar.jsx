import { useEffect, useRef, useState } from "react";
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
  ImagePlus,
  Zap,
  SpellCheck,
} from "lucide-react";
import { applySnippet, createMediaMarkdown, insertTextAtCursor, normalizeImagePathForMarkdown } from "../utils/markdownUtils";
import { insertMediaFromFile } from "../services/imageService";
import { listDocuments, listImages } from "../services/electronService";
import { applyMarkdownQuickFix, applyValidationSuggestion, getIssueFixType } from "../utils/markdownQuickFix";
import { MEDIA_FILE_INPUT_ACCEPT } from "../utils/mediaTypeUtils";
import { getMediaTypeFromExtension } from "../utils/mediaUtils";

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
  const extension = String(pathValue || "").split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  return getMediaTypeFromExtension(extension) || "document";
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
  spellCheckEnabled = true,
  onToggleSpellCheck,
  ignoredSpellingWords = [],
  onIgnoreSpellingWord,
  onRemoveIgnoredSpellingWord,
  onClearIgnoredSpellingWords,
}) {
  const imageInputRef = useRef(null);
  const mermaidPopoverRef = useRef(null);
  const assetLinkPopoverRef = useRef(null);
  const webLinkPopoverRef = useRef(null);
  const tablePopoverRef = useRef(null);
  const validationPopoverRef = useRef(null);
  const [showMermaidBuilder, setShowMermaidBuilder] = useState(false);
  const [showAssetLinker, setShowAssetLinker] = useState(false);
  const [showWebLinker, setShowWebLinker] = useState(false);
  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");
  const [linkText, setLinkText] = useState("");
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

  const closeToolbarPanels = () => {
    setShowMermaidBuilder(false);
    setShowAssetLinker(false);
    setShowWebLinker(false);
    setShowTableBuilder(false);
    setShowValidationPanel(false);
  };

  const isPanelOpen = (panel) => {
    if (panel === "mermaid") return showMermaidBuilder;
    if (panel === "asset") return showAssetLinker;
    if (panel === "web") return showWebLinker;
    if (panel === "table") return showTableBuilder;
    if (panel === "validation") return showValidationPanel;
    return false;
  };

  const openPanel = (panel) => {
    if (panel === "mermaid") setShowMermaidBuilder(true);
    if (panel === "asset") setShowAssetLinker(true);
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
      const insideWebLinker = webLinkPopoverRef.current?.contains(event.target);
      const insideTableBuilder = tablePopoverRef.current?.contains(event.target);
      const insideValidation = validationPopoverRef.current?.contains(event.target);
      if (
        !insideMermaid &&
        !insideAssetLinker &&
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
    if (assetFilter === "notes" && asset.type !== "note") return false;
    if (assetFilter !== "all" && assetFilter !== "notes" && asset.type === "media") {
      const mediaType = getAssetMediaType(asset.path);
      if (mediaType !== assetFilter) return false;
    }
    if (assetFilter !== "all" && assetFilter !== "notes" && asset.type !== "media") {
      return false;
    }

    const search = assetSearch.trim().toLowerCase();
    if (!search) return true;
    const label = asset.type === "note"
      ? (asset.title || asset.fileName || "")
      : asset.path || "";
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

      const [paths, docs] = await Promise.all([
        listImages(basePath),
        listAllDocumentEntries(),
      ]);

      const mediaAssets = (paths || []).map((pathValue) => ({
        type: "media",
        path: pathValue,
        mediaType: getAssetMediaType(pathValue),
      }));
      const currentPathKey = canonicalPathKey(basePath);
      const noteAssets = (docs || [])
        .filter((entry) => {
          if (canonicalPathKey(entry.filePath) === currentPathKey) return false;
          if (hasMarkdownExtension(entry?.filePath)) return true;
          return hasMarkdownExtension(entry?.fileName);
        })
        .map((entry) => ({
          type: "note",
          filePath: entry.filePath,
          fileName: entry.fileName,
          title: entry.title,
        }));

      setAvailableAssets([...noteAssets, ...mediaAssets]);
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

  function insertDocLink(targetDoc) {
    const filePath = targetDoc?.filePath;
    const text = (linkText || "").trim() || targetDoc?.title || targetDoc?.fileName || "Linked note";
    if (!hasMarkdownExtension(filePath)) {
      setAssetsError("Only markdown notes can be linked. Choose a .md file.");
      return;
    }

    let relativePath = toRelativeDocPath(basePath, filePath);
    if (relativePath && !hasMarkdownExtension(relativePath) && hasMarkdownExtension(targetDoc?.fileName)) {
      relativePath = `${relativePath}.md`;
    }
    const normalizedPath = normalizeImagePathForMarkdown(relativePath);
    if (!normalizedPath || normalizedPath === "./" || normalizedPath === ".") {
      setAssetsError("Choose a different note. Linking the current note is not supported.");
      return;
    }

    insertTextAtCursor(value, onChange, `[${text}](${normalizedPath})`, textareaRef);
    setShowAssetLinker(false);
    setLinkText("");
    setAssetSearch("");
    onNotify?.("Document link inserted.", "success");
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

  return (
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
      <button onClick={() => imageInputRef.current?.click()} title="Insert media from file">
        <ImagePlus size={18} />
      </button>
      <button onClick={openAssetLinker} title="Insert from workspace">
        <Link size={18} />
      </button>
      <button onClick={() => toggleToolbarPanel("mermaid")} title="Mermaid Builder">
        <Zap size={18} />
      </button>
      <button onClick={runMarkdownValidation} title="Validate markdown syntax">
        <CheckCircle2 size={18} />
      </button>
      <button
        onClick={onToggleSpellCheck}
        title={spellCheckEnabled ? "Disable typo check" : "Enable typo check"}
        className={spellCheckEnabled ? "" : "toolbar-btn-inactive"}
        aria-pressed={spellCheckEnabled}
      >
        <SpellCheck size={18} />
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
            <strong>Insert From Workspace</strong>
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
                placeholder="Type note title or file name"
              />
            </label>
            <label>
              Filter
              <select
                value={assetFilter}
                onChange={(event) => setAssetFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="notes">Notes</option>
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
                asset.type === "note" ? (
                  <button
                    key={asset.filePath}
                    onClick={() => insertDocLink(asset)}
                    title={asset.fileName || asset.title}
                  >
                    {(asset.title || asset.fileName || "Untitled note").trim()}
                  </button>
                ) : (
                  <button key={asset.path} onClick={() => linkExistingAsset(asset.path)} title={asset.path}>
                    {asset.path}
                  </button>
                )
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
            <strong>Mermaid Builder</strong>
            <button
              className="mermaid-close"
              onClick={() => setShowMermaidBuilder(false)}
              title="Close"
            >
              x
            </button>
          </div>

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
            <button onClick={() => setShowMermaidBuilder(false)}>Cancel</button>
          </div>
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
  );
}
