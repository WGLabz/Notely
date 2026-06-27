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
  FileText,
  SpellCheck,
} from "lucide-react";
import { applySnippet, createImageMarkdown, createMediaMarkdown, insertTextAtCursor } from "../utils/markdownUtils";
import { insertMediaFromFile } from "../services/imageService";
import { listDocuments, listImages } from "../services/electronService";
import { applyMarkdownQuickFix, applyValidationSuggestion, getIssueFixType } from "../utils/markdownQuickFix";

function toRelativeDocPath(fromFilePath, toFilePath) {
  if (!fromFilePath || !toFilePath) return "";
  const fromParts = fromFilePath.split(/[\\/]+/);
  const toParts = toFilePath.split(/[\\/]+/);

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
  if (issue.ruleId === "grammar" || String(issue.ruleId || "").includes("grammar")) return "Grammar";
  if (String(issue.ruleId || "").includes("table")) return "Markdown";
  return "Issue";
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
}) {
  const imageInputRef = useRef(null);
  const mermaidPopoverRef = useRef(null);
  const imageLinkPopoverRef = useRef(null);
  const webLinkPopoverRef = useRef(null);
  const docLinkPopoverRef = useRef(null);
  const tablePopoverRef = useRef(null);
  const validationPopoverRef = useRef(null);
  const [showMermaidBuilder, setShowMermaidBuilder] = useState(false);
  const [showImageLinker, setShowImageLinker] = useState(false);
  const [showWebLinker, setShowWebLinker] = useState(false);
  const [showDocLinker, setShowDocLinker] = useState(false);
  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [availableImages, setAvailableImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const [imageSearch, setImageSearch] = useState("");
  const [imageAltText, setImageAltText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [webLinkText, setWebLinkText] = useState("");
  const [webLinkUrl, setWebLinkUrl] = useState("");
  const [webLinkError, setWebLinkError] = useState("");
  const [docSearch, setDocSearch] = useState("");
  const [docLinkText, setDocLinkText] = useState("");
  const [availableDocs, setAvailableDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");
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

  useEffect(() => {
    if (
      !showMermaidBuilder &&
      !showImageLinker &&
      !showWebLinker &&
      !showDocLinker &&
      !showTableBuilder &&
      !showValidationPanel
    ) {
      return undefined;
    }

    const handleGlobalClick = (event) => {
      const insideMermaid = mermaidPopoverRef.current?.contains(event.target);
      const insideImageLinker = imageLinkPopoverRef.current?.contains(event.target);
      const insideWebLinker = webLinkPopoverRef.current?.contains(event.target);
      const insideDocLinker = docLinkPopoverRef.current?.contains(event.target);
      const insideTableBuilder = tablePopoverRef.current?.contains(event.target);
      const insideValidation = validationPopoverRef.current?.contains(event.target);
      if (
        !insideMermaid &&
        !insideImageLinker &&
        !insideWebLinker &&
        !insideDocLinker &&
        !insideTableBuilder &&
        !insideValidation
      ) {
        setShowMermaidBuilder(false);
        setShowImageLinker(false);
        setShowWebLinker(false);
        setShowDocLinker(false);
        setShowTableBuilder(false);
        setShowValidationPanel(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowMermaidBuilder(false);
        setShowImageLinker(false);
        setShowWebLinker(false);
        setShowDocLinker(false);
        setShowTableBuilder(false);
        setShowValidationPanel(false);
      }
    };

    document.addEventListener("mousedown", handleGlobalClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleGlobalClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showDocLinker, showImageLinker, showMermaidBuilder, showTableBuilder, showValidationPanel, showWebLinker]);

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

  const filteredImages = availableImages.filter((pathValue) => {
    const search = imageSearch.trim().toLowerCase();
    if (!search) return true;
    return pathValue.toLowerCase().includes(search);
  });
  const filteredDocs = availableDocs.filter((entry) => {
    const query = docSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      (entry.title || "").toLowerCase().includes(query) ||
      (entry.fileName || "").toLowerCase().includes(query)
    );
  });
  const normalizedTableRows = Math.min(Math.max(Number(tableRows) || 1, 1), 20);
  const normalizedTableColumns = Math.min(Math.max(Number(tableColumns) || 1, 1), 20);
  const hasValidImageUrl = isValidHttpUrl(imageUrl);
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
    const shouldOpen = !showTableBuilder;
    setShowTableBuilder(shouldOpen);
    setShowMermaidBuilder(false);
    setShowImageLinker(false);
    setShowWebLinker(false);
    setShowValidationPanel(false);
  }

  function runMarkdownValidation() {
    setShowValidationPanel(true);
    setShowMermaidBuilder(false);
    setShowImageLinker(false);
    setShowWebLinker(false);
    setShowDocLinker(false);
    setShowTableBuilder(false);

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

  async function openImageLinker() {
    const shouldOpen = !showImageLinker;
    setShowImageLinker(shouldOpen);
    setShowMermaidBuilder(false);
    setImagesError("");

    if (!shouldOpen) return;

    if (!basePath) {
      setAvailableImages([]);
      setImagesError("Save or open a note file before linking existing images.");
      return;
    }

    setImagesLoading(true);
    try {
      const paths = await listImages(basePath);
      setAvailableImages(paths);
    } catch (error) {
      setAvailableImages([]);
      setImagesError(error?.message || "Unable to load existing images.");
    } finally {
      setImagesLoading(false);
    }
  }

  function openWebLinker() {
    const shouldOpen = !showWebLinker;
    setShowWebLinker(shouldOpen);
    setShowMermaidBuilder(false);
    setShowImageLinker(false);
    setShowDocLinker(false);
    setWebLinkError("");
  }

  async function openDocLinker() {
    const shouldOpen = !showDocLinker;
    setShowDocLinker(shouldOpen);
    setShowMermaidBuilder(false);
    setShowImageLinker(false);
    setShowWebLinker(false);
    setShowTableBuilder(false);
    setShowValidationPanel(false);
    setDocsError("");

    if (!shouldOpen) return;

    setDocsLoading(true);
    try {
      const docs = await listDocuments();
      setAvailableDocs((docs || []).filter((entry) => entry.filePath !== basePath));
    } catch (error) {
      setAvailableDocs([]);
      setDocsError(error?.message || "Unable to load documents.");
    } finally {
      setDocsLoading(false);
    }
  }

  function insertDocLink(targetDoc) {
    const filePath = targetDoc?.filePath;
    const text = (docLinkText || "").trim() || targetDoc?.title || targetDoc?.fileName || "Linked note";
    const relativePath = toRelativeDocPath(basePath, filePath);
    if (!relativePath) {
      setDocsError("Unable to build a relative link for that file.");
      return;
    }

    insertTextAtCursor(value, onChange, `[${text}](${relativePath})`, textareaRef);
    setShowDocLinker(false);
    setDocLinkText("");
    setDocSearch("");
    onNotify?.("Document link inserted.", "success");
  }

  function linkExistingImage(pathValue) {
    const fileName = pathValue.split(/[\\/]/).pop() || "Image";
    const fallbackAlt = fileName.replace(/\.[^.]+$/, "");
    const markdown = createImageMarkdown(imageAltText.trim() || fallbackAlt, pathValue);
    insertTextAtCursor(value, onChange, `${markdown}\n`, textareaRef);
    setShowImageLinker(false);
    setImageAltText("");
    setImageSearch("");
    onNotify?.("Image link inserted.", "success");
  }

  function linkImageFromUrl() {
    const trimmedUrl = imageUrl.trim();
    if (!trimmedUrl) {
      setImagesError("Enter an image URL first.");
      return;
    }
    if (!isValidHttpUrl(trimmedUrl)) {
      setImagesError("Use a valid http/https image URL.");
      return;
    }

    const fallbackAlt = trimmedUrl.split(/[/?#]/).filter(Boolean).pop() || "Image";
    const markdown = createImageMarkdown(imageAltText.trim() || fallbackAlt, trimmedUrl);
    insertTextAtCursor(value, onChange, `${markdown}\n`, textareaRef);
    setShowImageLinker(false);
    setImageAltText("");
    setImageSearch("");
    setImageUrl("");
    setImagesError("");
    onNotify?.("Image URL inserted.", "success");
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
      <button onClick={openDocLinker} title="Link to another note">
        <FileText size={18} />
      </button>
      <button onClick={() => imageInputRef.current?.click()} title="Insert media from file">
        <ImagePlus size={18} />
      </button>
      <button onClick={openImageLinker} title="Insert media from existing">
        <Link size={18} />
      </button>
      <button onClick={() => setShowMermaidBuilder((open) => !open)} title="Mermaid Builder">
        <Zap size={18} />
      </button>
      <button onClick={runMarkdownValidation} title="Validate markdown syntax">
        <CheckCircle2 size={18} />
      </button>
      <button
        onClick={onToggleSpellCheck}
        title={spellCheckEnabled ? "Disable spell check" : "Enable spell check"}
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
          ) : validationIssues.length ? (
            <div className="validation-list">
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="toolbar-inline-note">No syntax issues detected.</p>
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

      {showImageLinker && (
        <div className="image-linker" ref={imageLinkPopoverRef} role="dialog" aria-label="Image linker">
          <div className="mermaid-builder-header">
            <strong>Link Existing Image</strong>
            <button className="mermaid-close" onClick={() => setShowImageLinker(false)} title="Close">
              x
            </button>
          </div>

          <div className="mermaid-fields">
            <label>
              Search images
              <input
                value={imageSearch}
                onChange={(event) => setImageSearch(event.target.value)}
                placeholder="Type file name"
              />
            </label>
            <label>
              Alt text (optional)
              <input
                value={imageAltText}
                onChange={(event) => setImageAltText(event.target.value)}
                placeholder="Defaults to file name"
              />
            </label>
            <label>
              Image URL (optional)
              <input
                value={imageUrl}
                onChange={(event) => {
                  setImageUrl(event.target.value);
                  setImagesError("");
                }}
                placeholder="https://example.com/image.png"
              />
            </label>
          </div>

          <div className="image-linker-url-actions">
            <button onClick={linkImageFromUrl} disabled={!hasValidImageUrl}>Insert URL Image</button>
          </div>

          {imageUrl.trim() && !hasValidImageUrl ? (
            <p className="toolbar-inline-error">Use a valid http/https image URL.</p>
          ) : null}

          {imagesError && <p className="toolbar-inline-error">{imagesError}</p>}
          {imagesLoading ? <p className="toolbar-inline-note">Loading images...</p> : null}

          {!imagesLoading && !filteredImages.length ? (
            <p className="toolbar-inline-note">No matching images found.</p>
          ) : (
            <div className="image-linker-list">
              {filteredImages.map((pathValue) => (
                <button key={pathValue} onClick={() => linkExistingImage(pathValue)} title={pathValue}>
                  {pathValue}
                </button>
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

      {showDocLinker && (
        <div className="doc-linker" ref={docLinkPopoverRef} role="dialog" aria-label="Document link inserter">
          <div className="mermaid-builder-header">
            <strong>Link to Note</strong>
            <button className="mermaid-close" onClick={() => setShowDocLinker(false)} title="Close">
              x
            </button>
          </div>

          <div className="mermaid-fields">
            <label>
              Search notes
              <input
                value={docSearch}
                onChange={(event) => setDocSearch(event.target.value)}
                placeholder="Type title or filename"
              />
            </label>
            <label>
              Link text (optional)
              <input
                value={docLinkText}
                onChange={(event) => setDocLinkText(event.target.value)}
                placeholder="Defaults to note title"
              />
            </label>
          </div>

          {docsError ? <p className="toolbar-inline-error">{docsError}</p> : null}
          {docsLoading ? <p className="toolbar-inline-note">Loading notes...</p> : null}

          {!docsLoading && !filteredDocs.length ? (
            <p className="toolbar-inline-note">No matching notes found.</p>
          ) : (
            <div className="doc-linker-list">
              {filteredDocs.map((entry) => (
                <button
                  key={entry.filePath}
                  onClick={() => insertDocLink(entry)}
                  title={entry.fileName || entry.title}
                >
                  {(entry.title || entry.fileName || "Untitled note").trim()}
                </button>
              ))}
            </div>
          )}
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
        accept="image/*,video/*,audio/*,.pdf"
        onChange={handleMediaSelect}
        hidden
      />
    </div>
  );
}
