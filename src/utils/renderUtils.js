/**
 * Markdown rendering and processing utilities
 */

import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getImageDisplayName(src, fallback) {
  const cleanSrc = String(src || "").split(/[?#]/)[0];
  const rawName = cleanSrc.split(/[\\/]/).pop() || fallback || "Image";
  try {
    return decodeURIComponent(rawName) || rawName;
  } catch {
    return rawName;
  }
}

const defaultImageRenderer = md.renderer.rules.image
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

md.core.ruler.push("notely-source-lines", (state) => {
  const offset = Number(state.env?.sourceLineOffset) || 0;
  state.tokens.forEach((token) => {
    if (token.nesting === 1 && Array.isArray(token.map)) {
      token.attrSet("data-source-line", String(token.map[0] + offset + 1));
    }
  });
});

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src") || "";
  const label = getImageDisplayName(src, token.content || token.attrGet("alt") || "Image");
  const imageHtml = defaultImageRenderer(tokens, idx, options, env, self);
  return `<span class="markdown-image-frame">${imageHtml}<span class="markdown-image-actions"><button type="button" class="markdown-image-action" data-image-action="view" aria-label="View image">View</button><button type="button" class="markdown-image-action" data-image-action="edit" aria-label="Annotate image">Annotate</button></span><span class="markdown-image-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span></span>`;
};

export function renderMarkdown(content, options = {}) {
  return md.render(content || "", options);
}

/**
 * Parse all diagram blocks (mermaid and excalidraw image references)
 * Supports both ```mermaid and image references to excalidraw diagrams
 */
export function parseDiagramBlocks(content) {
  const chunks = [];
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/gi;
  const excalidrawRegex = /!\[Excalidraw Diagram\]\(((?:\.notes-app\/)?excali-diagrams\/(?:(?:[^/]+\/)?([^/]+))\/diagram\.png)\)(\{[^}]*\})?/gi;
  const positions = [];
  let match;

  const readAttribute = (attributeBlock, attributeName) => {
    if (!attributeBlock) return "";
    const pattern = new RegExp(`${attributeName}=["“]([^"”]+)["”]`, "i");
    const attrMatch = String(attributeBlock).match(pattern);
    return attrMatch ? String(attrMatch[1] || "") : "";
  };

  const countLines = (value) => (String(value || "").match(/\n/g) || []).length;

  // Find all mermaid blocks
  while ((match = mermaidRegex.exec(content || ""))) {
    positions.push({
      index: match.index,
      endIndex: mermaidRegex.lastIndex,
      type: "mermaid",
      value: match[1].trim(),
      fullMatch: match[0],
    });
  }

  // Find all excalidraw image references
  while ((match = excalidrawRegex.exec(content || ""))) {
    const attributeBlock = match[3] || "";
    const explicitDiagramId = readAttribute(attributeBlock, "data-diagram-id");
    const originAssetPath = readAttribute(attributeBlock, "data-origin-asset");
    const originAltText = readAttribute(attributeBlock, "data-origin-alt");
    positions.push({
      index: match.index,
      endIndex: excalidrawRegex.lastIndex,
      type: "excalidraw",
      imagePath: match[1],
      // Prefer explicit data-diagram-id if present, else derive from path segment.
      diagramId: explicitDiagramId || match[2],
      originAssetPath,
      originAltText,
      fullMatch: match[0],
    });
  }

  // Sort by position
  positions.sort((a, b) => a.index - b.index);

  let lastIndex = 0;
  let currentLine = 0;

  positions.forEach((pos) => {
    if (pos.index > lastIndex) {
      const markdownValue = content.slice(lastIndex, pos.index);
      chunks.push({ type: "markdown", value: markdownValue, startLine: currentLine });
      currentLine += countLines(markdownValue);
    }

    if (pos.type === "mermaid") {
      chunks.push({ type: "mermaid", value: pos.value, startLine: currentLine });
    } else if (pos.type === "excalidraw") {
      chunks.push({
        type: "excalidraw",
        imagePath: pos.imagePath,
        diagramId: pos.diagramId,
        originAssetPath: pos.originAssetPath,
        originAltText: pos.originAltText,
        startLine: currentLine,
      });
    }
    
    currentLine += countLines(pos.fullMatch);
    lastIndex = pos.endIndex;
  });

  if (lastIndex < (content || "").length) {
    chunks.push({ type: "markdown", value: content.slice(lastIndex), startLine: currentLine });
  }

  return chunks.length ? chunks : [{ type: "markdown", value: content || "", startLine: 0 }];
}

/**
 * Legacy function - kept for backward compatibility
 * Use parseDiagramBlocks instead for both mermaid and excalidraw
 */
export function parseMermaidBlocks(content) {
  const chunks = [];
  const regex = /```mermaid\s*([\s\S]*?)```/gi;
  let lastIndex = 0;
  let currentLine = 0;
  let match;

  const countLines = (value) => (String(value || "").match(/\n/g) || []).length;

  while ((match = regex.exec(content || ""))) {
    if (match.index > lastIndex) {
      const markdownValue = content.slice(lastIndex, match.index);
      chunks.push({ type: "markdown", value: markdownValue, startLine: currentLine });
      currentLine += countLines(markdownValue);
    }

    chunks.push({ type: "mermaid", value: match[1].trim(), startLine: currentLine });
    currentLine += countLines(match[0]);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < (content || "").length) {
    chunks.push({ type: "markdown", value: content.slice(lastIndex), startLine: currentLine });
  }

  return chunks.length ? chunks : [{ type: "markdown", value: content || "", startLine: 0 }];
}

export function normalizeMarkdownImagePaths(content) {
  if (!content) return content;

  return content.replace(/!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)/g, (match, alt, rawPath) => {
    const trimmed = (rawPath || "").trim();
    const unwrapped =
      trimmed.startsWith("<") && trimmed.endsWith(">")
        ? trimmed.slice(1, -1)
        : trimmed;

    let decoded = unwrapped;
    for (let i = 0; i < 5; i += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        break;
      }
    }

    return `![${alt}](${encodeURI(decoded)})`;
  });
}
