const path = require("node:path");

function sanitizePdfMarkdown(markdown) {
  const source = String(markdown || "");

  // Excalidraw image references store edit metadata as an attribute block:
  // ![Excalidraw Diagram](...){data-diagram-id="..." data-diagram-type="excalidraw"}
  // markdown-it does not parse this extension, so it shows as literal `{...}` in PDF.
  return source.replace(
    /(!\[Excalidraw Diagram\]\((?:<[^>]+>|[^)]+)\))\{[^}\r\n]*\}/gi,
    "$1"
  );
}

function buildPdfExportMarkdown(document, options = {}) {
  const includeRawNotes = Boolean(options.includeRawNotes);
  const includeCleansed = Boolean(options.includeCleansed);
  const title = String(document?.title || path.basename(document?.filePath || "note", ".md") || "Note").trim() || "Note";

  const sections = [];
  if (includeRawNotes) {
    sections.push([
      "## Raw Notes",
      sanitizePdfMarkdown(document?.rawNotes || "").trim() || "_No raw notes captured yet._"
    ].join("\n\n"));
  }

  if (includeCleansed) {
    sections.push([
      "## Formal Notes",
      sanitizePdfMarkdown(document?.cleansed || "").trim() || "_No formal notes captured yet._"
    ].join("\n\n"));
  }

  return [
    `# ${title}`,
    "",
    sections.join("\n\n")
  ].filter(Boolean).join("\n");
}

function buildPdfStyles({ compact = false } = {}) {
  const bodyFontSize = compact ? "13px" : "14px";
  const bodyLineHeight = compact ? "1.55" : "1.65";
  const paragraphMargin = compact ? "10px" : "14px";
  const h1Size = compact ? "22px" : "24px";
  const h2Size = compact ? "16px" : "17px";

  return `
    :root {
      color-scheme: light;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", "Inter", Arial, sans-serif;
      color: #0d1f26;
      background: #ffffff;
      line-height: ${bodyLineHeight};
      font-size: ${bodyFontSize};
    }

    .markdown-body {
      max-width: 100%;
    }

    h1 {
      font-size: ${h1Size};
      line-height: 1.2;
      margin: 0 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d7e0e6;
    }

    h2 {
      font-size: ${h2Size};
      line-height: 1.3;
      margin: 24px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #d7e0e6;
    }

    h3, h4, h5, h6 {
      line-height: 1.3;
      margin: 18px 0 8px;
    }

    p, ul, ol, blockquote, pre, table {
      margin: 0 0 ${paragraphMargin};
    }

    ul, ol {
      padding-left: 22px;
    }

    code {
      font-family: Consolas, "Cascadia Code", monospace;
      font-size: 12.5px;
      background: #eef4f7;
      border: 1px solid #d5e2e8;
      border-radius: 4px;
      padding: 1px 4px;
    }

    pre {
      background: #0d2029;
      color: #d6eaf0;
      border-radius: 8px;
      padding: 14px 16px;
      overflow-x: auto;
    }

    pre code {
      background: transparent;
      border: 0;
      padding: 0;
      color: inherit;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      border: 1px solid #d7e0e6;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #f5f8fa;
      font-weight: 600;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    .notely-image-frame {
      position: relative;
      display: inline-block;
      max-width: 100%;
      vertical-align: top;
    }

    .notely-image-annotation {
      position: absolute;
      z-index: 2;
      max-width: min(60%, 420px);
      padding: 6px 9px;
      border-radius: 4px;
      background: rgba(10, 23, 27, 0.72);
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .notely-image-annotation { left: 10px; top: 10px; }
  `;
}

module.exports = {
  buildPdfExportMarkdown,
  buildPdfStyles
};
