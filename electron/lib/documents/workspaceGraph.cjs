const DEFAULT_EXCLUDE_DIRS = new Set([
  ".notes-app", ".versions", "node_modules", ".git", ".svn", ".hg",
  "dist", "build", ".artifacts", ".cache", "__pycache__", "removed",
  ".venv", "venv", ".next", ".nuxt", "coverage"
]);

// Extracts [[wiki link]] targets from markdown content.
function extractWikiLinks(content) {
  const results = [];
  const pattern = /\[\[([^\]|#\n]+?)(?:[|#][^\]]*?)?\]\]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const target = String(match[1] || "").trim();
    if (target) results.push(target);
  }
  return results;
}

// Extracts relative .md file targets from standard markdown links.
function extractMarkdownLinks(content) {
  const results = [];
  const pattern = /\[[^\]]*\]\(([^)#?\s]+\.md)[^)]*\)/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const raw = String(match[1] || "").trim();
    if (raw && !raw.startsWith("http://") && !raw.startsWith("https://")) {
      results.push(raw);
    }
  }
  return results;
}

// Extracts image references from markdown content (both inline and linked).
function extractMediaLinks(content) {
  const results = [];
  // Inline images: ![alt](path/to/image.ext)
  const imgPattern = /!\[[^\]]*\]\(([^)#?\s]+)\)/gi;
  let match;
  while ((match = imgPattern.exec(content)) !== null) {
    const raw = String(match[1] || "").trim();
    if (raw && !raw.startsWith("http://") && !raw.startsWith("https://")) {
      results.push(raw);
    }
  }
  return results;
}

function walkMarkdownFiles(fs, rootDir) {
  const files = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = require("path").join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!DEFAULT_EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          visit(fullPath);
        }
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(fullPath);
      }
    }
  };
  visit(rootDir);
  return files;
}

// Common media file extensions
const MEDIA_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico",
  ".mp4", ".webm", ".mov", ".mp3", ".wav", ".m4a", ".pdf"
]);

function walkMediaFiles(fs, rootDir) {
  const files = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = require("path").join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!DEFAULT_EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          visit(fullPath);
        }
        continue;
      }
      if (entry.isFile()) {
        const ext = require("path").extname(entry.name).toLowerCase();
        if (MEDIA_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  };
  visit(rootDir);
  return files;
}

function normalizePosix(p) {
  return p.replace(/\\/g, "/");
}

function buildWorkspaceGraph(fs, path, workspaceRoot) {
  const mdFiles = walkMarkdownFiles(fs, workspaceRoot);
  const mediaFiles = walkMediaFiles(fs, workspaceRoot);
  const nodes = [];
  const edges = [];
  const edgeSet = new Set();

  // Build a lookup: posix relative path (no extension) → node id, and absolute path → node id
  const relIdMap = new Map(); // "folder/name" (no .md) → id
  const absIdMap = new Map(); // absolute lowercase path → id
  const mediaIdMap = new Map(); // media absolute lowercase path → id

  // Add markdown note nodes
  for (const filePath of mdFiles) {
    const rel = normalizePosix(path.relative(workspaceRoot, filePath));
    const id = rel;
    const label = path.basename(filePath, ".md");
    const folder = normalizePosix(path.relative(workspaceRoot, path.dirname(filePath))) || ".";

    nodes.push({ id, label, filePath, folder, relativePath: rel, nodeType: "note" });

    // Map without extension for wiki link resolution
    const relNoExt = rel.replace(/\.md$/i, "");
    relIdMap.set(relNoExt.toLowerCase(), id);
    relIdMap.set(rel.toLowerCase(), id);
    absIdMap.set(filePath.toLowerCase(), id);

    // Also index just the filename (without ext) for flat wiki links
    relIdMap.set(label.toLowerCase(), id);
  }

  // Add media nodes
  for (const filePath of mediaFiles) {
    const rel = normalizePosix(path.relative(workspaceRoot, filePath));
    const id = `media::${rel}`;
    const label = path.basename(filePath);
    const folder = normalizePosix(path.relative(workspaceRoot, path.dirname(filePath))) || ".";

    nodes.push({ id, label, filePath, folder, relativePath: rel, nodeType: "media" });
    mediaIdMap.set(filePath.toLowerCase(), id);
  }

  // Build edges from markdown notes to other notes and to media
  for (const node of mdFiles.map(f => nodes.find(n => n.filePath === f && n.nodeType === "note"))) {
    if (!node) continue;
    let content;
    try {
      content = fs.readFileSync(node.filePath, "utf8");
    } catch {
      continue;
    }

    const sourceFolder = path.dirname(node.filePath);

    // Note-to-note links
    const wikiLinks = extractWikiLinks(content);
    const mdLinks = extractMarkdownLinks(content);

    for (const link of [...wikiLinks, ...mdLinks]) {
      let targetId = null;

      const resolvedAbs = path.resolve(sourceFolder, link.replace(/\.md$/i, "") + ".md");
      const resolvedAbsRaw = path.resolve(sourceFolder, link.endsWith(".md") ? link : link + ".md");

      if (absIdMap.has(resolvedAbs.toLowerCase())) {
        targetId = absIdMap.get(resolvedAbs.toLowerCase());
      } else if (absIdMap.has(resolvedAbsRaw.toLowerCase())) {
        targetId = absIdMap.get(resolvedAbsRaw.toLowerCase());
      } else {
        const normalizedLink = normalizePosix(link).replace(/\.md$/i, "").toLowerCase();
        if (relIdMap.has(normalizedLink)) {
          targetId = relIdMap.get(normalizedLink);
        }
      }

      if (!targetId || targetId === node.id) continue;

      const edgeKey = [node.id, targetId].sort().join("|||");
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({
          id: edgeKey,
          source: node.id,
          target: targetId,
          type: "default",
        });
      }
    }

    // Note-to-media links
    const mediaLinks = extractMediaLinks(content);
    for (const link of mediaLinks) {
      let targetId = null;

      // Try resolving as absolute or relative path
      const resolvedAbs = path.resolve(sourceFolder, link);
      if (mediaIdMap.has(resolvedAbs.toLowerCase())) {
        targetId = mediaIdMap.get(resolvedAbs.toLowerCase());
      } else {
        // Try to find media by filename if exact path doesn't match
        for (const [mediaPath, mediaId] of mediaIdMap) {
          if (mediaPath.toLowerCase().endsWith(link.toLowerCase())) {
            targetId = mediaId;
            break;
          }
        }
      }

      if (!targetId) continue;

      const edgeKey = [node.id, targetId].sort().join("|||");
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({
          id: edgeKey,
          source: node.id,
          target: targetId,
          type: "default",
        });
      }
    }
  }

  return { nodes, edges, workspaceRoot, totalFiles: mdFiles.length, totalMedia: mediaFiles.length };
}

module.exports = { buildWorkspaceGraph };
