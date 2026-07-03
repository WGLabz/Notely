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
  const imageScale = compact ? 0.85 : 0.8;

  return `
    :root {
      color-scheme: light;
    }

    @page {
      margin: 12mm 10mm;
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
      margin: 0;
      padding: 0;
      overflow-wrap: anywhere;
      word-break: normal;
      orphans: 3;
      widows: 3;
    }

    h1 {
      font-size: ${h1Size};
      line-height: 1.2;
      margin: 0 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d7e0e6;
      break-after: avoid-page;
      page-break-after: avoid;
    }

    h2 {
      font-size: ${h2Size};
      line-height: 1.3;
      margin: 24px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #d7e0e6;
      break-after: avoid-page;
      page-break-after: avoid;
    }

    h3, h4, h5, h6 {
      line-height: 1.3;
      margin: 18px 0 8px;
      break-after: avoid-page;
      page-break-after: avoid;
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
      background: #f6f8fa;
      color: #24292f;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      break-inside: auto;
      page-break-inside: auto;
    }

    pre code {
      background: transparent;
      border: 0;
      padding: 0;
      color: inherit;
    }

    .markdown-code-block {
      margin: 12px 0;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      background: #f6f8fa;
      overflow: hidden;
      break-inside: auto;
      page-break-inside: auto;
    }

    .markdown-code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 34px;
      padding: 4px 10px;
      border-bottom: 1px solid #d0d7de;
      background: #f6f8fa;
    }

    .markdown-code-lang {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: uppercase;
      color: #57606a;
    }

    .markdown-code-pre {
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: #f6f8fa;
      break-inside: auto;
      page-break-inside: auto;
    }

    .markdown-code-pre code {
      display: block;
      margin: 0;
      padding: 8px 0;
      background: transparent;
      color: #24292f;
    }

    .markdown-code-line {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      align-items: baseline;
    }

    .markdown-code-line-number {
      text-align: right;
      padding: 0 8px 0 0;
      border-right: 1px solid #d8dee4;
      color: #6e7781;
      user-select: none;
    }

    .markdown-code-line-content {
      display: block;
      padding: 0 10px;
      white-space: pre;
    }

    .hljs-comment,
    .hljs-quote {
      color: #6e7781;
      font-style: italic;
    }

    .hljs-keyword,
    .hljs-selector-tag,
    .hljs-subst {
      color: #cf222e;
      font-weight: 700;
    }

    .hljs-string,
    .hljs-attr,
    .hljs-template-tag,
    .hljs-template-variable {
      color: #0a3069;
    }

    .hljs-number,
    .hljs-literal,
    .hljs-variable,
    .hljs-bullet {
      color: #0550ae;
    }

    .hljs-function,
    .hljs-title,
    .hljs-title.function_ {
      color: #8250df;
    }

    .hljs-type,
    .hljs-class .hljs-title {
      color: #953800;
    }

    .hljs-meta,
    .hljs-meta .hljs-keyword {
      color: #57606a;
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
      max-height: 240mm;
      object-fit: contain;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .notely-image-frame {
      position: relative;
      display: block;
      max-width: 100%;
      vertical-align: top;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .notely-image-frame img {
      display: block;
      margin: 0 auto;
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

    @media print {
      pre,
      .markdown-code-pre {
        overflow: visible !important;
      }

      p,
      li {
        orphans: 3;
        widows: 3;
      }

      blockquote,
      table,
      tr,
      .notely-image-frame,
      img {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }

      .markdown-code-block,
      .markdown-code-pre,
      .markdown-code-line {
        break-inside: auto;
        page-break-inside: auto;
      }

      /* Slightly shrink images in print to reduce forced page splits and large white gaps. */
      .notely-image-frame img,
      .markdown-body > img,
      p > img,
      li > img {
        max-width: ${imageScale * 100}%;
        width: auto;
      }
    }
  `;
}

module.exports = {
  buildPdfExportMarkdown,
  buildPdfStyles
};
