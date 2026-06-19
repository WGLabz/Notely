import { useEffect, useRef, useState } from "react";
import {
  Heading2,
  Bold,
  Italic,
  List,
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

export function MarkdownToolbar({ value, onChange, textareaRef, basePath }) {
  const imageInputRef = useRef(null);
  const mermaidPopoverRef = useRef(null);
  const imageLinkPopoverRef = useRef(null);
  const webLinkPopoverRef = useRef(null);
  const [showMermaidBuilder, setShowMermaidBuilder] = useState(false);
  const [showImageLinker, setShowImageLinker] = useState(false);
  const [showWebLinker, setShowWebLinker] = useState(false);
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

  useEffect(() => {
    if (!showMermaidBuilder && !showImageLinker && !showWebLinker) return undefined;

    const handleGlobalClick = (event) => {
      const insideMermaid = mermaidPopoverRef.current?.contains(event.target);
      const insideImageLinker = imageLinkPopoverRef.current?.contains(event.target);
      const insideWebLinker = webLinkPopoverRef.current?.contains(event.target);
      if (!insideMermaid && !insideImageLinker && !insideWebLinker) {
        setShowMermaidBuilder(false);
        setShowImageLinker(false);
        setShowWebLinker(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowMermaidBuilder(false);
        setShowImageLinker(false);
        setShowWebLinker(false);
      }
    };

    document.addEventListener("mousedown", handleGlobalClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleGlobalClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showImageLinker, showMermaidBuilder, showWebLinker]);

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
    } catch (error) {
      console.error("Image insertion failed:", error);
      alert("Failed to insert image: " + error.message);
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

  function insertTableTemplate() {
    const table = "\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Value A | Value B | Value C |\n";
    insertTextAtCursor(value, onChange, table, textareaRef);
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
  }

  function linkImageFromUrl() {
    const trimmedUrl = imageUrl.trim();
    if (!trimmedUrl) {
      setImagesError("Enter an image URL first.");
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
  }

  function insertWebLink() {
    const trimmedUrl = webLinkUrl.trim();
    if (!trimmedUrl) {
      setWebLinkError("Enter a URL.");
      return;
    }

    const text = webLinkText.trim() || "link text";
    insertTextAtCursor(value, onChange, `[${text}](${trimmedUrl})`, textareaRef);
    setShowWebLinker(false);
    setWebLinkText("");
    setWebLinkUrl("");
    setWebLinkError("");
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
      <button onClick={insertTableTemplate} title="Insert table">
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
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://example.com/image.png"
              />
            </label>
          </div>

          <div className="image-linker-url-actions">
            <button onClick={linkImageFromUrl}>Insert URL Image</button>
          </div>

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
                onChange={(event) => setWebLinkUrl(event.target.value)}
                placeholder="https://example.com"
              />
            </label>
          </div>

          {webLinkError && <p className="toolbar-inline-error">{webLinkError}</p>}

          <div className="image-linker-url-actions">
            <button onClick={insertWebLink}>Insert Link</button>
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
