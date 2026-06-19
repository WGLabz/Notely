import { useEffect, useRef, useState } from "react";
import {
  Heading2,
  Bold,
  Italic,
  List,
  CheckCircle2,
  Quote,
  Code,
  Link,
  Link2,
  Table2,
  ImagePlus,
  Zap,
} from "lucide-react";
import { applySnippet, createImageMarkdown, insertTextAtCursor } from "../utils/markdownUtils";
import { insertImageFromFile } from "../services/imageService";
import { listImages } from "../services/electronService";
import { validateMarkdownSyntax } from "../utils/markdownValidation";

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

export function MarkdownToolbar({ value, onChange, textareaRef, basePath, onNotify }) {
  const imageInputRef = useRef(null);
  const mermaidPopoverRef = useRef(null);
  const imageLinkPopoverRef = useRef(null);
  const webLinkPopoverRef = useRef(null);
  const tablePopoverRef = useRef(null);
  const validationPopoverRef = useRef(null);
  const [showMermaidBuilder, setShowMermaidBuilder] = useState(false);
  const [showImageLinker, setShowImageLinker] = useState(false);
  const [showWebLinker, setShowWebLinker] = useState(false);
  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [validationIssues, setValidationIssues] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const [imageSearch, setImageSearch] = useState("");
  const [imageAltText, setImageAltText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
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

  useEffect(() => {
    if (!showMermaidBuilder && !showImageLinker && !showWebLinker && !showTableBuilder && !showValidationPanel) {
      return undefined;
    }

    const handleGlobalClick = (event) => {
      const insideMermaid = mermaidPopoverRef.current?.contains(event.target);
      const insideImageLinker = imageLinkPopoverRef.current?.contains(event.target);
      const insideWebLinker = webLinkPopoverRef.current?.contains(event.target);
      const insideTableBuilder = tablePopoverRef.current?.contains(event.target);
      const insideValidation = validationPopoverRef.current?.contains(event.target);
      if (!insideMermaid && !insideImageLinker && !insideWebLinker && !insideTableBuilder && !insideValidation) {
        setShowMermaidBuilder(false);
        setShowImageLinker(false);
        setShowWebLinker(false);
        setShowTableBuilder(false);
        setShowValidationPanel(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowMermaidBuilder(false);
        setShowImageLinker(false);
        setShowWebLinker(false);
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
  }, [showImageLinker, showMermaidBuilder, showTableBuilder, showValidationPanel, showWebLinker]);

  const handleImageSelect = async (event) => {
    console.log("Image file selected:", event.target.files);
    const file = event.target.files?.[0];
    if (!file) {
      console.warn("No file selected");
      return;
    }

    try {
      const { imagePath, altText } = await insertImageFromFile(file);
      const markdown = createImageMarkdown(altText, imagePath);
      console.log("Inserting markdown:", markdown);
      insertTextAtCursor(value, onChange, markdown, textareaRef);
      onNotify?.("Image inserted.", "success");
    } catch (error) {
      console.error("Image insertion failed:", error);
      onNotify?.(error?.message || "Failed to insert image.", "error");
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
  const normalizedTableRows = Math.min(Math.max(Number(tableRows) || 1, 1), 20);
  const normalizedTableColumns = Math.min(Math.max(Number(tableColumns) || 1, 1), 20);
  const hasValidImageUrl = isValidHttpUrl(imageUrl);
  const hasValidWebLinkUrl = isValidHttpUrl(webLinkUrl);

  function openTableBuilder() {
    const shouldOpen = !showTableBuilder;
    setShowTableBuilder(shouldOpen);
    setShowMermaidBuilder(false);
    setShowImageLinker(false);
    setShowWebLinker(false);
    setShowValidationPanel(false);
  }

  async function runMarkdownValidation() {
    try {
      const issues = await validateMarkdownSyntax(value);
      setValidationIssues(issues);
      setShowValidationPanel(true);
      setShowMermaidBuilder(false);
      setShowImageLinker(false);
      setShowWebLinker(false);
      setShowTableBuilder(false);

      if (issues.length) {
        onNotify?.(`Found ${issues.length} markdown issue${issues.length > 1 ? "s" : ""}.`, "warning");
      } else {
        onNotify?.("No markdown syntax issues found.", "success");
      }
    } catch (error) {
      onNotify?.(error?.message || "Markdown validation failed.", "error");
    }
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
    setWebLinkError("");
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
      <button onClick={() => imageInputRef.current?.click()} title="Insert image from file">
        <ImagePlus size={18} />
      </button>
      <button onClick={openImageLinker} title="Insert image from existing">
        <Link size={18} />
      </button>
      <button onClick={() => setShowMermaidBuilder((open) => !open)} title="Mermaid Builder">
        <Zap size={18} />
      </button>
      <button onClick={runMarkdownValidation} title="Validate markdown syntax">
        <CheckCircle2 size={18} />
      </button>

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

          {validationIssues.length ? (
            <div className="validation-list">
              {validationIssues.map((issue, index) => (
                <p key={`${issue.line}-${index}`}>
                  Line {issue.line}:{issue.column || 1} - {issue.message}
                  {issue.ruleId ? ` (${issue.ruleId})` : ""}
                </p>
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
        accept="image/*"
        onChange={handleImageSelect}
        hidden
      />
    </div>
  );
}
