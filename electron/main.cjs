const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn } = require("node:child_process");
const MarkdownIt = require("markdown-it");

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const projectRoot = app.getAppPath();
const userConfigPath = path.join(app.getPath("userData"), "settings.json");
let notesRoot = "";
let appDataDir = "";
let versionsRoot = "";
const ROOT_PROJECT_SLUG = "__root__";
let activeProjectSlug = ROOT_PROJECT_SLUG;
let mainWindow = null;
let webPreviewServer = null;
let webPreviewPort = 0;
const webPreviewContentOverrides = new Map();
let webPreviewScopeRoot = "";
let webPreviewScopeLabel = "Project";

function ensureDir(dirPath) {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("Invalid directory path.");
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function readUserSettings() {
  if (!fs.existsSync(userConfigPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(userConfigPath, "utf8"));
  } catch {
    return {};
  }
}

function writeUserSettings(nextSettings) {
  ensureDir(path.dirname(userConfigPath));
  fs.writeFileSync(userConfigPath, JSON.stringify(nextSettings, null, 2), "utf8");
}

function resolveInitialNotesRoot() {
  const envNotesRoot = process.env.NOTES_ROOT;
  if (envNotesRoot && envNotesRoot.trim()) {
    return path.resolve(envNotesRoot.trim());
  }

  const settings = readUserSettings();
  if (settings?.notesRoot && typeof settings.notesRoot === "string") {
    return path.resolve(settings.notesRoot);
  }

  return path.join(app.getPath("documents"), "Notely Notes");
}

function applyNotesRoot(nextRootPath) {
  notesRoot = path.resolve(nextRootPath);
  appDataDir = path.join(notesRoot, ".notes-app");
  versionsRoot = path.join(appDataDir, "versions");

  ensureDir(notesRoot);
  ensureDir(versionsRoot);

  metadataStore = new MetadataStore();
  activeProjectSlug = ROOT_PROJECT_SLUG;
}

function slugify(value) {
  return value
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";
}

function nowStamp() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("-");
}

function hashContent(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function filePathWithin(rootDir, targetPath) {
  const normalizedRoot = path.resolve(rootDir).toLowerCase();
  const normalizedTarget = path.resolve(targetPath).toLowerCase();
  return normalizedTarget.startsWith(normalizedRoot);
}

function listProjectsState() {
  ensureDir(notesRoot);
  const projects = [
    {
      slug: ROOT_PROJECT_SLUG,
      name: "Root",
      rootPath: notesRoot,
      isRoot: true
    },
    ...fs.readdirSync(notesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !entry.name.startsWith("."))
      .filter((entry) => entry.name !== "images")
      .map((entry) => ({
        slug: entry.name,
        name: entry.name,
        rootPath: path.join(notesRoot, entry.name),
        isRoot: false
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  ];

  if (!projects.some((item) => item.slug === activeProjectSlug)) {
    activeProjectSlug = ROOT_PROJECT_SLUG;
  }

  const activeProject = projects.find((item) => item.slug === activeProjectSlug)
    || projects[0]
    || {
      slug: ROOT_PROJECT_SLUG,
      name: "Root",
      rootPath: notesRoot,
      isRoot: true
    };

  return {
    projects: projects.map((item) => ({
      slug: item.slug,
      name: item.name,
      rootPath: item.rootPath,
      isRoot: Boolean(item.isRoot)
    })),
    activeProject: {
      slug: activeProject.slug,
      name: activeProject.name,
      rootPath: activeProject.rootPath,
      isRoot: Boolean(activeProject.isRoot)
    }
  };
}

function getActiveProject() {
  const state = listProjectsState();
  return state.activeProject;
}

function parseDocument(content, filePath) {
  const normalized = content.replace(/\r\n/g, "\n");
  const rawMatch = normalized.match(/^#\s*(RawNotes|Notes|Quick Notes)\s*$/im);
  const cleansedMatch = normalized.match(/^#\s*(Cleansed|Formal Notes|Professional Version)\s*$/im);
  const firstSectionIndex = Math.min(
    ...[rawMatch?.index, cleansedMatch?.index].filter((value) => Number.isInteger(value))
  );
  const header = Number.isFinite(firstSectionIndex)
    ? normalized.slice(0, firstSectionIndex).trim()
    : normalized.trim();

  const rawStart = rawMatch ? rawMatch.index + rawMatch[0].length : -1;
  const cleansedStart = cleansedMatch ? cleansedMatch.index + cleansedMatch[0].length : -1;
  const rawEnd = cleansedMatch ? cleansedMatch.index : normalized.length;
  const cleansedEnd = normalized.length;

  const metadata = {};
  header.split("\n").forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) metadata[match[1].trim().toLowerCase()] = match[2].trim();
  });

  return {
    filePath,
    fileName: path.basename(filePath),
    title: path.basename(filePath, ".md"),
    metadata,
    header,
    rawNotes: rawStart >= 0 ? normalized.slice(rawStart, rawEnd).trim() : "",
    cleansed: cleansedStart >= 0 ? normalized.slice(cleansedStart, cleansedEnd).trim() : "",
    hasRawNotes: rawStart >= 0,
    hasCleansed: cleansedStart >= 0,
    hash: hashContent(content)
  };
}

function buildDocumentContent(document) {
  const header = (document.header || "").trim();
  const parts = [];
  if (header) parts.push(header);
  parts.push("# RawNotes\n" + (document.rawNotes || "").trim());
  parts.push("# Cleansed\n" + (document.cleansed || "").trim());
  return parts.join("\n\n") + "\n";
}

function listMarkdownFiles(rootDir) {
  ensureDir(rootDir);
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => {
      const filePath = path.join(rootDir, entry.name);
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = parseDocument(content, filePath);
      const stat = fs.statSync(filePath);
      return {
        filePath,
        fileName: parsed.fileName,
        title: parsed.title,
        metadata: parsed.metadata,
        updatedAt: stat.mtime.toISOString(),
        hash: parsed.hash
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function walkFiles(rootDir, options = {}) {
  const excludeDirs = new Set(options.excludeDirs || []);
  const files = [];

  const visit = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        visit(nextPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  };

  visit(rootDir);
  return files;
}

function normalizeToPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePathForUrl(relPath) {
  return normalizeToPosix(relPath)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeUrlPath(pathname, prefix) {
  const sliced = pathname.slice(prefix.length).replace(/^\/+/, "");
  return safeDecode(sliced);
}

function getWebPreviewScopeRoot() {
  const activeProject = getActiveProject();
  if (activeProject?.rootPath) {
    return path.resolve(activeProject.rootPath);
  }
  return path.resolve(notesRoot);
}

function getWebPreviewScopeLabel() {
  const activeProject = getActiveProject();
  if (!activeProject) return "Project";
  return activeProject.isRoot ? "Root" : activeProject.name;
}

const WALK_EXCLUDE_DIRS = new Set([
  ".notes-app", ".versions", "node_modules", ".git", ".svn", ".hg",
  "dist", "build", ".artifacts", ".cache", "__pycache__",
  ".venv", "venv", ".next", ".nuxt", "coverage"
]);

function listMarkdownRelativePaths() {
  const scopeRoot = webPreviewScopeRoot || getWebPreviewScopeRoot();
  return walkFiles(scopeRoot, { excludeDirs: Array.from(WALK_EXCLUDE_DIRS) })
    .filter((item) => path.extname(item).toLowerCase() === ".md")
    .map((item) => normalizeToPosix(path.relative(scopeRoot, item)))
    .sort((a, b) => a.localeCompare(b));
}

function resolveRelativeToNotesRoot(relPath) {
  const scopeRoot = webPreviewScopeRoot || getWebPreviewScopeRoot();
  const normalized = normalizeToPosix(String(relPath || "")).replace(/^\/+/, "");
  const resolved = path.resolve(scopeRoot, normalized);
  if (!filePathWithin(scopeRoot, resolved)) {
    return null;
  }
  // Block access inside excluded directories
  const relNorm = normalizeToPosix(path.relative(scopeRoot, resolved));
  if (relNorm.split("/").some((part) => WALK_EXCLUDE_DIRS.has(part))) {
    return null;
  }
  return {
    normalized,
    resolved
  };
}

function buildWebsiteMarkdownRenderer() {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true
  });

  const headingSlugCounts = new Map();

  markdown.core.ruler.push("notely-heading-ids", (state) => {
    headingSlugCounts.clear();
    for (let i = 0; i < state.tokens.length; i += 1) {
      const token = state.tokens[i];
      if (token.type !== "heading_open") continue;

      const inlineToken = state.tokens[i + 1];
      const headingText = (inlineToken?.content || "").trim().toLowerCase();
      const baseSlug = (headingText
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")) || "section";

      const count = headingSlugCounts.get(baseSlug) || 0;
      headingSlugCounts.set(baseSlug, count + 1);
      const finalSlug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
      token.attrSet("id", finalSlug);
    }
  });

  const defaultLinkOpen = markdown.renderer.rules.link_open
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  const rewriteAssetPath = (rawPath, env) => {
    const fromRelMd = env?.relMdPath || "";
    const normalizedPath = safeDecode(String(rawPath || "").replace(/\\/g, "/"));
    const resolved = normalizedPath.startsWith("/")
      ? path.posix.normalize(normalizedPath.slice(1))
      : path.posix.normalize(path.posix.join(path.posix.dirname(fromRelMd), normalizedPath));
    return `/raw/${encodePathForUrl(resolved)}`;
  };

  markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const hrefIndex = tokens[idx].attrIndex("href");
    if (hrefIndex >= 0) {
      const rawHref = String(tokens[idx].attrs[hrefIndex][1] || "").trim();
      if (rawHref && !/^(https?:|mailto:|tel:|#|javascript:|data:|blob:)/i.test(rawHref)) {
        const [pathAndQuery, hashPart = ""] = rawHref.split("#");
        const [pathPart, queryPart = ""] = pathAndQuery.split("?");
        const normalizedLinkPath = safeDecode(pathPart.replace(/\\/g, "/"));
        const isMarkdownTarget = /\.md$/i.test(normalizedLinkPath);
        const suffix = `${queryPart ? `?${queryPart}` : ""}${hashPart ? `#${hashPart}` : ""}`;

        if (isMarkdownTarget) {
          const fromRelMd = env?.relMdPath || "";
          const resolvedTargetMd = normalizedLinkPath.startsWith("/")
            ? path.posix.normalize(normalizedLinkPath.slice(1))
            : path.posix.normalize(path.posix.join(path.posix.dirname(fromRelMd), normalizedLinkPath));
          tokens[idx].attrs[hrefIndex][1] = `/view/${encodePathForUrl(resolvedTargetMd)}${suffix}`;
        } else if (normalizedLinkPath) {
          tokens[idx].attrs[hrefIndex][1] = `${rewriteAssetPath(normalizedLinkPath, env)}${suffix}`;
        }
      }
    }

    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  const defaultImage = markdown.renderer.rules.image
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
    const srcIndex = tokens[idx].attrIndex("src");
    if (srcIndex >= 0) {
      const src = String(tokens[idx].attrs[srcIndex][1] || "").trim();
      if (src && !/^(https?:|data:|blob:)/i.test(src)) {
        const [pathPart, queryPart = ""] = src.split("?");
        const rewritten = rewriteAssetPath(pathPart, env);
        tokens[idx].attrs[srcIndex][1] = queryPart ? `${rewritten}?${queryPart}` : rewritten;
      }
    }

    return defaultImage(tokens, idx, options, env, self);
  };

  return markdown;
}

function buildWebsiteHtml({ title, bodyHtml, navigationHtml = "" }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
      :root {
        --font-sans: "Inter", "Segoe UI", system-ui, sans-serif;
        --font-mono: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
        --bg: #f6f8f9;
        --surface: #ffffff;
        --surface2: #f0f4f6;
        --border: #dde5ea;
        --border-strong: #c8d5dc;
        --accent: #0a6b8a;
        --accent-hover: #075a75;
        --accent-soft: #e3f3f8;
        --ink: #0d1f26;
        --ink-2: #2c4a54;
        --ink-3: #4e6a75;
        --ink-4: #7a9aaa;
        --sidebar-w: 272px;
        --toc-w: 220px;
        --radius: 10px;
      }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      html { scroll-behavior: smooth; }

      body {
        font-family: var(--font-sans);
        font-size: 14.5px;
        line-height: 1.7;
        color: var(--ink);
        background: var(--bg);
        min-height: 100vh;
      }

      /* ── Shell ─────────────────────────────────────────────── */
      .shell {
        display: grid;
        grid-template-columns: var(--sidebar-w) 1fr;
        grid-template-rows: 52px 1fr;
        min-height: 100vh;
      }

      /* ── Top bar ───────────────────────────────────────────── */
      .topbar {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 20px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
        position: sticky;
        top: 0;
        z-index: 100;
      }

      .topbar-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: calc(var(--sidebar-w) - 20px);
        text-decoration: none;
        color: inherit;
      }

      .topbar-logo {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        background: linear-gradient(135deg, #0a6b8a 0%, #0d9ec2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: -0.5px;
        flex-shrink: 0;
      }

      .topbar-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--ink);
        white-space: nowrap;
      }

      .topbar-scope {
        font-size: 12px;
        color: var(--ink-4);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .topbar-search {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface2);
        color: var(--ink-3);
        font-size: 13px;
        font-weight: 500;
        text-decoration: none;
        transition: background 0.14s, color 0.14s, border-color 0.14s;
      }

      .topbar-search:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--border-strong); }

      .topbar-search kbd {
        padding: 1px 5px;
        border: 1px solid var(--border-strong);
        border-radius: 4px;
        font-family: var(--font-sans);
        font-size: 11px;
        color: var(--ink-4);
        background: var(--surface);
      }

      .topbar-divider {
        color: var(--border-strong);
      }

      /* ── Left sidebar ──────────────────────────────────────── */
      .nav-sidebar {
        border-right: 1px solid var(--border);
        background: var(--surface);
        padding: 14px 10px;
        overflow-y: auto;
        position: sticky;
        top: 52px;
        height: calc(100vh - 52px);
      }

      .nav-group-label {
        padding: 4px 8px 6px;
        font-size: 11px;
        font-weight: 600;
        color: var(--ink-4);
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }

      .nav-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .nav-list a {
        display: block;
        padding: 7px 8px;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 450;
        color: var(--ink-2);
        text-decoration: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: background 0.14s, color 0.14s;
      }

      .nav-list a:hover { background: var(--surface2); color: var(--ink); }
      .nav-list a.active {
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 600;
      }

      .nav-search-link {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 9px;
        margin-bottom: 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface2);
        font-size: 13px;
        font-weight: 500;
        color: var(--ink-3);
        text-decoration: none;
        transition: background 0.14s, color 0.14s, border-color 0.14s;
      }

      .nav-search-link:hover {
        background: var(--accent-soft);
        color: var(--accent);
        border-color: var(--border-strong);
      }

      .nav-home {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 8px;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-2);
        text-decoration: none;
        margin-bottom: 8px;
        background: var(--surface2);
      }

      .nav-home:hover { background: var(--accent-soft); color: var(--accent); }

      /* ── Content area ──────────────────────────────────────── */
      .content-area {
        display: grid;
        grid-template-columns: 1fr var(--toc-w);
        gap: 0;
        min-width: 0;
        align-items: start;
      }

      .doc-main {
        min-width: 0;
        padding: 28px 28px 48px;
      }

      /* ── Right TOC ─────────────────────────────────────────── */
      .toc-panel {
        padding: 28px 14px 24px 0;
        position: sticky;
        top: 52px;
        max-height: calc(100vh - 52px);
        overflow-y: auto;
      }

      .toc-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--ink-4);
        text-transform: uppercase;
        letter-spacing: 0.07em;
        padding: 0 0 8px 2px;
      }

      .toc-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .toc-list a {
        display: block;
        font-size: 12px;
        color: var(--ink-3);
        text-decoration: none;
        padding: 4px 6px;
        border-radius: 5px;
        border-left: 2px solid transparent;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: color 0.13s, border-color 0.13s, background 0.13s;
      }

      .toc-list a:hover { color: var(--accent); background: var(--accent-soft); }
      .toc-list a.toc-active {
        color: var(--accent);
        border-left-color: var(--accent);
        background: var(--accent-soft);
        font-weight: 500;
      }

      .toc-list li[data-level="3"] a { padding-left: 16px; font-size: 11.5px; }
      .toc-list li[data-level="4"] a { padding-left: 24px; font-size: 11px; }

      /* ── Document card ─────────────────────────────────────── */
      .doc-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: 0 2px 12px rgba(10, 30, 40, 0.07);
        overflow: hidden;
      }

      .doc-hero {
        padding: 24px 28px 18px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(120deg, #f4f9fb 0%, #ffffff 100%);
      }

      .doc-hero h1 {
        font-size: 26px;
        font-weight: 700;
        color: var(--ink);
        line-height: 1.2;
      }

      .doc-breadcrumb {
        margin-top: 6px;
        font-size: 12px;
        color: var(--ink-4);
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .doc-body {
        padding: 24px 28px 28px;
      }

      /* ── Meta block ────────────────────────────────────────── */
      .doc-meta {
        margin-bottom: 20px;
        padding: 12px 16px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface2);
        font-size: 13px;
        color: var(--ink-2);
      }

      .doc-meta p { margin: 0 0 4px; }
      .doc-meta p:last-child { margin: 0; }

      /* ── Section tabs ──────────────────────────────────────── */
      .section-tabs {
        display: flex;
        gap: 2px;
        border-bottom: 2px solid var(--border);
        margin-bottom: 20px;
        padding: 0;
      }

      .tab-btn {
        padding: 8px 16px;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        background: transparent;
        color: var(--ink-3);
        font-family: var(--font-sans);
        font-size: 13.5px;
        font-weight: 500;
        cursor: pointer;
        border-radius: 6px 6px 0 0;
        transition: color 0.15s, border-color 0.15s, background 0.15s;
      }

      .tab-btn:hover { color: var(--ink); background: var(--surface2); }

      .tab-btn.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
        font-weight: 600;
        background: transparent;
      }

      .tab-panel { display: none; }
      .tab-panel.active { display: block; }
      .tab-empty { color: var(--ink-4); font-style: italic; padding: 12px 0; }

      /* ── Markdown content ──────────────────────────────────── */
      .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
        color: var(--ink);
        scroll-margin-top: 72px;
        line-height: 1.3;
        font-weight: 650;
      }

      .prose h1 { font-size: 22px; margin: 28px 0 10px; }
      .prose h2 { font-size: 18px; margin: 24px 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
      .prose h3 { font-size: 15.5px; margin: 20px 0 6px; }
      .prose h4 { font-size: 13.5px; margin: 16px 0 4px; color: var(--ink-2); }
      .prose h1:first-child, .prose h2:first-child, .prose h3:first-child { margin-top: 0; }

      .prose p { margin: 0 0 14px; }
      .prose p:last-child { margin-bottom: 0; }

      .prose ul, .prose ol { margin: 0 0 14px 20px; }
      .prose li { margin: 4px 0; }

      .prose a { color: var(--accent); text-decoration: none; }
      .prose a:hover { text-decoration: underline; }

      .prose code {
        font-family: var(--font-mono);
        font-size: 12.5px;
        background: #eef4f7;
        border: 1px solid #d5e2e8;
        border-radius: 4px;
        padding: 1px 5px;
        color: #0a4a5f;
      }

      .prose pre {
        background: #0d2029;
        color: #d6eaf0;
        border-radius: 8px;
        padding: 16px 18px;
        overflow-x: auto;
        margin: 0 0 16px;
        font-size: 13px;
        line-height: 1.55;
      }

      .prose pre code {
        background: transparent;
        border: 0;
        padding: 0;
        color: inherit;
        font-size: inherit;
      }

      .prose blockquote {
        border-left: 3px solid var(--accent);
        padding-left: 14px;
        margin: 14px 0;
        color: var(--ink-2);
        font-style: italic;
      }

      .prose img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        display: block;
        margin: 12px 0;
        border: 1px solid var(--border);
      }

      .prose table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 16px;
        font-size: 13.5px;
      }

      .prose th {
        background: var(--surface2);
        font-weight: 600;
        border: 1px solid var(--border);
        padding: 8px 12px;
        text-align: left;
      }

      .prose td {
        border: 1px solid var(--border);
        padding: 7px 12px;
      }

      .prose tr:nth-child(even) td { background: #fafcfd; }

      .prose hr {
        border: 0;
        border-top: 1px solid var(--border);
        margin: 24px 0;
      }

      /* ── Home page cards ───────────────────────────────────── */
      .home-hero {
        margin-bottom: 24px;
      }

      .home-hero h1 {
        font-size: 28px;
        font-weight: 700;
        color: var(--ink);
        margin-bottom: 6px;
      }

      .home-hero p { color: var(--ink-3); }

      .note-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .note-card {
        display: block;
        text-decoration: none;
        padding: 14px 16px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        color: var(--ink);
        transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
      }

      .note-card:hover {
        border-color: var(--accent);
        box-shadow: 0 4px 16px rgba(10, 107, 138, 0.12);
        transform: translateY(-1px);
      }

      .note-card-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--ink);
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .note-card-path {
        font-size: 11px;
        color: var(--ink-4);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ── Responsive ────────────────────────────────────────── */
      @media (max-width: 1100px) {
        :root { --toc-w: 0px; }
        .toc-panel { display: none; }
        .content-area { grid-template-columns: 1fr; }
      }

      @media (max-width: 760px) {
        :root { --sidebar-w: 0px; }
        .nav-sidebar { display: none; }
        .shell { grid-template-columns: 1fr; }
        .doc-main { padding: 16px; }
        .doc-hero, .doc-body { padding: 16px; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <a href="/" class="topbar-brand">
          <span class="topbar-logo">N</span>
          <span class="topbar-title">Notely</span>
        </a>
        <span class="topbar-divider">/</span>
        <span class="topbar-scope">${escapeHtml(webPreviewScopeLabel)}</span>
        <a href="/search" class="topbar-search">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Search
          <kbd>Ctrl+K</kbd>
        </a>
      </header>

      <nav class="nav-sidebar" aria-label="Notes navigation">
        <a href="/" class="nav-home">&#8962; All Notes</a>
        <p class="nav-group-label">In This Project</p>
        ${navigationHtml}
      </nav>

      <div class="content-area">
        <main class="doc-main">
          <div class="doc-card">
            ${bodyHtml}
          </div>
        </main>
        <aside class="toc-panel" id="toc-panel" aria-label="On this page">
          <p class="toc-label">On This Page</p>
          <ul class="toc-list" id="toc-list"></ul>
        </aside>
      </div>
    </div>

    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base",
        themeVariables: { primaryColor: "#e6f3f8", primaryBorderColor: "#0a6b8a", primaryTextColor: "#0d1f26", lineColor: "#4e6a75" }
      });
      const blocks = Array.from(document.querySelectorAll("pre code.language-mermaid"));
      for (const block of blocks) {
        const source = block.textContent || "";
        const container = document.createElement("div");
        container.className = "mermaid";
        container.textContent = source;
        block.parentElement.replaceWith(container);
      }
      await mermaid.run({ querySelector: ".mermaid" });

      // ── Ctrl/Cmd+K → search ───────────────────────────────
      document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          const si = document.getElementById("search-input");
          if (si) si.focus();
          else location.href = "/search";
        }
      });

      // ── Section tabs ──────────────────────────────────────
      const tabGroups = Array.from(document.querySelectorAll("[data-tabs]"));
      for (const group of tabGroups) {
        const buttons = Array.from(group.querySelectorAll("[data-tab-target]"));
        const panels = Array.from(group.querySelectorAll("[data-tab-panel]"));
        const activate = (target) => {
          buttons.forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab-target") === target));
          panels.forEach((p) => p.classList.toggle("active", p.getAttribute("data-tab-panel") === target));
          buildToc();
        };
        buttons.forEach((b) => b.addEventListener("click", () => activate(b.getAttribute("data-tab-target"))));
        // honour URL hash for tab
        const hash = location.hash.slice(1);
        const hashMatch = buttons.find((b) => b.getAttribute("data-tab-target") === hash);
        if (hashMatch) activate(hash);
      }

      // ── Heading TOC ───────────────────────────────────────
      function buildToc() {
        const tocList = document.getElementById("toc-list");
        if (!tocList) return;
        const panel = document.querySelector(".tab-panel.active") || document.querySelector(".doc-body") || document.body;
        const headings = Array.from(panel.querySelectorAll("h1, h2, h3, h4"));
        tocList.innerHTML = "";
        if (headings.length < 2) {
          document.getElementById("toc-panel").style.visibility = "hidden";
          return;
        }
        document.getElementById("toc-panel").style.visibility = "visible";
        headings.forEach((h) => {
          if (!h.id) {
            h.id = (h.textContent || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
          }
          const li = document.createElement("li");
          li.setAttribute("data-level", h.tagName[1]);
          const a = document.createElement("a");
          a.href = "#" + h.id;
          a.textContent = h.textContent;
          li.appendChild(a);
          tocList.appendChild(li);
        });
      }

      buildToc();

      // ── Active TOC highlight on scroll ───────────────────
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.id;
          document.querySelectorAll("#toc-list a").forEach((a) => {
            a.classList.toggle("toc-active", a.getAttribute("href") === "#" + id);
          });
        }
      }, { rootMargin: "-20% 0px -75% 0px" });

      document.querySelectorAll("h1[id], h2[id], h3[id], h4[id]").forEach((h) => observer.observe(h));
    </script>
  </body>
</html>`;
}

function buildNavigationHtml(activeRelPath = "") {
  const docs = listMarkdownRelativePaths();
  const links = docs.map((docPath) => {
    const href = `/view/${encodePathForUrl(docPath)}`;
    const title = path.basename(docPath, ".md");
    const activeClass = docPath === activeRelPath ? " class=\"active\"" : "";
    return `<li><a${activeClass} href="${href}" title="${escapeHtml(docPath)}">${escapeHtml(title)}</a></li>`;
  }).join("");

  return `<a href="/search" class="nav-search-link">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      Search notes
    </a>
    <ul class="nav-list">${links}</ul>`;
}

function renderRootWebsitePage() {
  const docs = listMarkdownRelativePaths();
  const cards = docs
    .map((docPath) => {
      const title = path.basename(docPath, ".md");
      const href = `/view/${encodePathForUrl(docPath)}`;
      return `<a href="${href}" class="note-card"><div class="note-card-title">${escapeHtml(title)}</div><div class="note-card-path">${escapeHtml(docPath)}</div></a>`;
    })
    .join("");

  const body = `
    <div class="doc-hero">
      <div class="home-hero">
        <h1>${escapeHtml(webPreviewScopeLabel)}</h1>
        <p>${docs.length} note${docs.length !== 1 ? "s" : ""} in this project</p>
      </div>
    </div>
    <div class="doc-body">
      ${docs.length ? `<div class="note-grid">${cards}</div>` : "<p class=\"tab-empty\">No markdown files were found in this project folder.</p>"}
    </div>`;

  return buildWebsiteHtml({
    title: `${webPreviewScopeLabel} \u2014 Notely`,
    bodyHtml: body,
    navigationHtml: buildNavigationHtml("")
  });
}

function renderMarkdownWebsitePage(relMdPath, rawContent) {
  const markdown = buildWebsiteMarkdownRenderer();
  const parsed = parseDocument(rawContent, relMdPath);
  const hasTabbedSections = parsed.hasRawNotes || parsed.hasCleansed;

  let bodyHtml = `<div class="doc-hero"><h1>${escapeHtml(parsed.title || path.basename(relMdPath, ".md"))}</h1><p class="doc-breadcrumb">${escapeHtml(relMdPath)}</p></div><div class="doc-body prose">${markdown.render(rawContent, { relMdPath })}</div>`;
  if (hasTabbedSections) {
    const headerHtml = parsed.header
      ? `<section class="doc-meta prose">${markdown.render(parsed.header, { relMdPath })}</section>`
      : "";
    const rawHtml = parsed.rawNotes
      ? markdown.render(parsed.rawNotes, { relMdPath })
      : `<p class="tab-empty">No raw notes captured yet.</p>`;
    const cleansedHtml = parsed.cleansed
      ? markdown.render(parsed.cleansed, { relMdPath })
      : `<p class="tab-empty">No cleansed notes captured yet.</p>`;

    bodyHtml = `
      <div class="doc-hero">
        <h1>${escapeHtml(parsed.title || path.basename(relMdPath, ".md"))}</h1>
        <p class="doc-breadcrumb"><span>&#8962; Home</span> <span>/</span> <span>${escapeHtml(relMdPath)}</span></p>
      </div>
      <div class="doc-body">
        ${headerHtml}
        <section data-tabs>
          <div class="section-tabs" role="tablist" aria-label="Note sections">
            <button class="tab-btn active" type="button" role="tab" data-tab-target="raw">Raw Notes</button>
            <button class="tab-btn" type="button" role="tab" data-tab-target="cleansed">Cleansed</button>
          </div>
          <section class="tab-panel prose active" data-tab-panel="raw">
            ${rawHtml}
          </section>
          <section class="tab-panel prose" data-tab-panel="cleansed">
            ${cleansedHtml}
          </section>
        </section>
      </div>
    `;
  }

  return buildWebsiteHtml({
    title: path.basename(relMdPath, ".md"),
    bodyHtml,
    navigationHtml: buildNavigationHtml(relMdPath)
  });
}

function renderPdfNotePage(relMdPath, markdownContent) {
  const markdown = buildWebsiteMarkdownRenderer();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
      :root {
        --font-sans: "Inter", "Segoe UI", system-ui, sans-serif;
        --font-mono: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
        --bg: #ffffff;
        --surface: #ffffff;
        --surface2: #f5f8fa;
        --border: #d7e0e6;
        --ink: #0d1f26;
        --ink-2: #334a53;
        --ink-3: #5b717a;
        --accent: #0a6b8a;
        --radius: 12px;
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink); }
      body { font-family: var(--font-sans); line-height: 1.7; }

      .page {
        padding: 0;
        margin: 0;
      }

      .content {
        max-width: 860px;
        margin: 0 auto;
        padding: 18mm 16mm 20mm;
        font-size: 14.5px;
      }

      .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
        line-height: 1.3;
        color: var(--ink);
        scroll-margin-top: 72px;
      }

      .content h1 { font-size: 22px; margin: 28px 0 10px; }
      .content h2 { font-size: 18px; margin: 22px 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
      .content h3 { font-size: 15.5px; margin: 18px 0 6px; }
      .content h4 { font-size: 13.5px; margin: 14px 0 4px; color: var(--ink-2); }
      .content p { margin: 0 0 14px; }
      .content ul, .content ol { margin: 0 0 14px 20px; }
      .content li { margin: 4px 0; }
      .content a { color: var(--accent); text-decoration: none; }
      .content a:hover { text-decoration: underline; }
      .content code { font-family: var(--font-mono); font-size: 12.5px; background: #eef4f7; border: 1px solid #d5e2e8; border-radius: 4px; padding: 1px 5px; color: #0a4a5f; }
      .content pre { background: #0d2029; color: #d6eaf0; border-radius: 8px; padding: 16px 18px; overflow-x: auto; margin: 0 0 16px; font-size: 13px; line-height: 1.55; }
      .content pre code { background: transparent; border: 0; padding: 0; color: inherit; font-size: inherit; }
      .content blockquote { border-left: 3px solid var(--accent); padding-left: 14px; margin: 14px 0; color: var(--ink-2); font-style: italic; }
      .content img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 12px 0; border: 1px solid var(--border); }
      .content table { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 13.5px; }
      .content th { background: var(--surface2); font-weight: 600; border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
      .content td { border: 1px solid var(--border); padding: 7px 12px; }
      .content tr:nth-child(even) td { background: #fafcfd; }
      .content hr { border: 0; border-top: 1px solid var(--border); margin: 24px 0; }
      .empty { color: var(--ink-3); font-style: italic; }

      @page { margin: 18mm 16mm; }
      @media print {
        .page { padding: 0; max-width: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <article class="content">
        ${markdownContent ? markdown.render(markdownContent, { relMdPath }) : '<p class="empty">No cleansed notes captured yet.</p>'}
      </article>
    </main>
  </body>
</html>`;
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".pdf": "application/pdf"
  };
  return map[ext] || "application/octet-stream";
}

function writeHtmlResponse(res, html, statusCode = 200) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function writeTextResponse(res, text, statusCode = 400) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function buildSearchIndex() {
  const scopeRoot = webPreviewScopeRoot || getWebPreviewScopeRoot();
  return listMarkdownRelativePaths().map((relMdPath) => {
    try {
      const resolved = path.resolve(scopeRoot, relMdPath);
      const raw = fs.readFileSync(resolved, "utf8");
      const parsed = parseDocument(raw, resolved);
      const text = [parsed.header || "", parsed.rawNotes || "", parsed.cleansed || ""]
        .join(" ").replace(/[#*_`>\[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
      return { path: relMdPath, title: parsed.title || path.basename(relMdPath, ".md"), text };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function renderSearchPage() {
  const bodyHtml = `
    <div class="doc-hero">
      <h1>Search</h1>
      <p class="doc-breadcrumb">Full-text search across all notes in this project</p>
    </div>
    <div class="doc-body">
      <div class="search-box-wrap">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search-input" type="search" class="search-input" placeholder="Type to search notes\u2026" autofocus spellcheck="false" />
      </div>
      <div id="search-status" class="search-status"></div>
      <div id="search-results" class="search-results" aria-live="polite"></div>
    </div>`;

  // Build script as a plain string to avoid backtick/regex escaping conflicts
  const scriptContent = [
    "const resp = await fetch('/search-index.json');",
    "const index = await resp.json();",
    "const input = document.getElementById('search-input');",
    "const results = document.getElementById('search-results');",
    "const status = document.getElementById('search-status');",
    "document.addEventListener('keydown', function(e) {",
    "  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.focus(); }",
    "});",
    "function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }",
    "function escRe(s) { return s.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'); }",
    "function highlight(text, tokens) {",
    "  var out = esc(text);",
    "  for (var i = 0; i < tokens.length; i++) {",
    "    var re = new RegExp(escRe(tokens[i]), 'gi');",
    "    out = out.replace(re, function(m) { return '<mark>' + m + '</mark>'; });",
    "  }",
    "  return out;",
    "}",
    "function search(query) {",
    "  var q = query.trim().toLowerCase();",
    "  if (!q) { results.innerHTML = ''; status.textContent = ''; return; }",
    "  var tokens = q.split(/\\s+/).filter(Boolean);",
    "  var hits = index.map(function(doc) {",
    "    var haystack = (doc.title + ' ' + doc.text).toLowerCase();",
    "    var score = tokens.reduce(function(acc, t) {",
    "      var cnt = (haystack.match(new RegExp(escRe(t), 'g')) || []).length;",
    "      return acc + (doc.title.toLowerCase().indexOf(t) >= 0 ? cnt * 5 : cnt);",
    "    }, 0);",
    "    return Object.assign({}, doc, { score: score });",
    "  }).filter(function(d) { return d.score > 0; })",
    "   .sort(function(a, b) { return b.score - a.score; })",
    "   .slice(0, 25);",
    "  status.textContent = hits.length ? hits.length + ' result' + (hits.length !== 1 ? 's' : '') : '';",
    "  if (!hits.length) {",
    "    results.innerHTML = '<p class=\"search-empty\">No notes matched <strong>' + esc(query) + '</strong>.</p>';",
    "    return;",
    "  }",
    "  results.innerHTML = hits.map(function(doc) {",
    "    var lc = doc.text.toLowerCase();",
    "    var pos = tokens.reduce(function(best, t) { var i = lc.indexOf(t); return i >= 0 && (best < 0 || i < best) ? i : best; }, -1);",
    "    var start = Math.max(0, (pos >= 0 ? pos : 0) - 60);",
    "    var snippet = doc.text.slice(start, start + 220);",
    "    var href = '/view/' + encodeURIComponent(doc.path).replace(/%2F/gi, '/');",
    "    return '<a href=\"' + href + '\" class=\"search-hit\">'",
    "      + '<div class=\"search-hit-title\">' + highlight(doc.title, tokens) + '</div>'",
    "      + '<div class=\"search-hit-path\">' + esc(doc.path) + '</div>'",
    "      + '<div class=\"search-hit-snippet\">\u2026' + highlight(snippet, tokens) + '\u2026</div>'",
    "      + '</a>';",
    "  }).join('');",
    "}",
    "var timer;",
    "input.addEventListener('input', function(e) { clearTimeout(timer); timer = setTimeout(function() { search(e.target.value); }, 120); });"
  ].join("\n");

  const style = `<style>
      .search-box-wrap { position: relative; margin-bottom: 16px; display: flex; align-items: center; }
      .search-icon { position: absolute; left: 14px; color: var(--ink-4); pointer-events: none; }
      .search-input {
        width: 100%; min-height: 46px; padding: 0 16px 0 42px;
        border: 1.5px solid var(--border-strong); border-radius: 12px;
        font-family: var(--font-sans); font-size: 15px; color: var(--ink);
        background: var(--surface); outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
      .search-status { font-size: 12px; color: var(--ink-4); margin-bottom: 10px; min-height: 18px; }
      .search-results { display: flex; flex-direction: column; gap: 8px; }
      .search-hit {
        display: block; text-decoration: none; padding: 14px 16px;
        border: 1px solid var(--border); border-radius: var(--radius);
        background: var(--surface); color: var(--ink);
        transition: border-color 0.15s, box-shadow 0.15s, transform 0.12s;
      }
      .search-hit:hover { border-color: var(--accent); box-shadow: 0 4px 14px rgba(10,107,138,0.12); transform: translateY(-1px); }
      .search-hit-title { font-size: 14.5px; font-weight: 600; color: var(--ink); margin-bottom: 2px; }
      .search-hit-path { font-size: 11px; color: var(--ink-4); margin-bottom: 6px; font-family: var(--font-mono); }
      .search-hit-snippet { font-size: 13px; color: var(--ink-3); line-height: 1.55; }
      mark { background: #fff176; color: var(--ink); border-radius: 2px; padding: 0 1px; }
      .search-empty { color: var(--ink-3); font-style: italic; padding: 12px 0; }
    </style>`;

  const injection = style + "\n    <script type=\"module\">\n" + scriptContent + "\n    </script>";

  return buildWebsiteHtml({
    title: "Search \u2014 Notely",
    bodyHtml,
    navigationHtml: buildNavigationHtml("")
  }).replace("</body>", injection + "\n  </body>");
}

function handleWebPreviewRequest(req, res) {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname || "/";

  if (pathname === "/" || pathname === "/index.html") {
    const noteQuery = requestUrl.searchParams.get("note");
    if (noteQuery) {
      const redirectPath = `/view/${encodePathForUrl(noteQuery)}`;
      res.writeHead(302, { Location: redirectPath });
      res.end();
      return;
    }

    writeHtmlResponse(res, renderRootWebsitePage());
    return;
  }

  if (pathname === "/search") {
    writeHtmlResponse(res, renderSearchPage());
    return;
  }

  if (pathname === "/search-index.json") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(buildSearchIndex()));
    return;
  }

  if (pathname.startsWith("/view/")) {
    const relMdPath = normalizeToPosix(decodeUrlPath(pathname, "/view/"));
    const resolved = resolveRelativeToNotesRoot(relMdPath);
    if (!resolved || path.extname(resolved.resolved).toLowerCase() !== ".md" || !fs.existsSync(resolved.resolved)) {
      writeTextResponse(res, "Note not found.", 404);
      return;
    }

    const rawContent = webPreviewContentOverrides.get(resolved.resolved)
      || fs.readFileSync(resolved.resolved, "utf8");
    writeHtmlResponse(res, renderMarkdownWebsitePage(resolved.normalized, rawContent));
    return;
  }

  if (pathname.startsWith("/pdf/")) {
    const relMdPath = normalizeToPosix(decodeUrlPath(pathname, "/pdf/"));
    const resolved = resolveRelativeToNotesRoot(relMdPath);
    if (!resolved || path.extname(resolved.resolved).toLowerCase() !== ".md" || !fs.existsSync(resolved.resolved)) {
      writeTextResponse(res, "Note not found.", 404);
      return;
    }

    const markdownContent = webPreviewContentOverrides.get(resolved.resolved)
      || fs.readFileSync(resolved.resolved, "utf8");
    writeHtmlResponse(res, renderPdfNotePage(resolved.normalized, markdownContent));
    return;
  }

  if (pathname.startsWith("/raw/")) {
    const relPath = normalizeToPosix(decodeUrlPath(pathname, "/raw/"));
    const resolved = resolveRelativeToNotesRoot(relPath);
    if (!resolved || !fs.existsSync(resolved.resolved) || fs.statSync(resolved.resolved).isDirectory()) {
      writeTextResponse(res, "Asset not found.", 404);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypeForFile(resolved.resolved),
      "Cache-Control": "no-store"
    });
    fs.createReadStream(resolved.resolved).pipe(res);
    return;
  }

  writeTextResponse(res, "Not found.", 404);
}

async function ensureWebPreviewServer() {
  if (webPreviewServer && webPreviewPort) {
    return `http://127.0.0.1:${webPreviewPort}`;
  }

  await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        handleWebPreviewRequest(req, res);
      } catch {
        writeTextResponse(res, "Unable to render website preview.", 500);
      }
    });

    server.once("error", (error) => {
      reject(error);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to determine web preview port."));
        return;
      }
      webPreviewServer = server;
      webPreviewPort = address.port;
      resolve();
    });
  });

  return `http://127.0.0.1:${webPreviewPort}`;
}

function tryOpenInChrome(targetUrl) {

  if (process.platform !== "win32") {
    return false;
  }

  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
  ].filter(Boolean);

  for (const chromePath of candidates) {
    if (!chromePath || !fs.existsSync(chromePath)) {
      continue;
    }

    try {
      const child = spawn(chromePath, ["--new-window", targetUrl], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return true;
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

function buildPdfExportMarkdown(document, options = {}) {
  const includeRawNotes = Boolean(options.includeRawNotes);
  const includeCleansed = Boolean(options.includeCleansed);
  const title = String(document?.title || path.basename(document?.filePath || "note", ".md") || "Note").trim() || "Note";

  const sections = [];
  if (includeRawNotes) {
    sections.push([
      "## Raw Notes",
      (document?.rawNotes || "").trim() || "_No raw notes captured yet._"
    ].join("\n\n"));
  }

  if (includeCleansed) {
    sections.push([
      "## Formal Notes",
      (document?.cleansed || "").trim() || "_No formal notes captured yet._"
    ].join("\n\n"));
  }

  return [
    `# ${title}`,
    "",
    sections.join("\n\n")
  ].filter(Boolean).join("\n");
}

function buildPdfExportHtml({ title, markdownContent, baseHref }) {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true
  });

  const bodyHtml = markdown.render(markdownContent || "");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="${baseHref}" />
    <title>${escapeHtml(title)}</title>
    <style>
${buildPdfStyles()}
    </style>
  </head>
  <body>
    <main class="markdown-body">
      ${bodyHtml}
    </main>
  </body>
</html>`;
}

function buildPdfStyles() {
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
      line-height: 1.65;
      font-size: 14px;
    }

    .markdown-body {
      max-width: 100%;
    }

    h1 {
      font-size: 24px;
      line-height: 1.2;
      margin: 0 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d7e0e6;
    }

    h2 {
      font-size: 17px;
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
      margin: 0 0 14px;
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
  `;
}

function listRootEntries(rootDir) {
  ensureDir(rootDir);
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isDirectory()) {
        return !entry.name.startsWith(".") && entry.name !== "images";
      }
      return entry.isFile() && entry.name.toLowerCase().endsWith(".md");
    })
    .map((entry) => {
      const entryPath = path.join(rootDir, entry.name);
      const stat = fs.statSync(entryPath);

      if (entry.isDirectory()) {
        return {
          entryType: "folder",
          slug: entry.name,
          filePath: entryPath,
          title: entry.name,
          metadata: {},
          updatedAt: stat.mtime.toISOString()
        };
      }

      const content = fs.readFileSync(entryPath, "utf8");
      const parsed = parseDocument(content, entryPath);
      return {
        entryType: "file",
        filePath: entryPath,
        fileName: parsed.fileName,
        title: parsed.title,
        metadata: parsed.metadata,
        updatedAt: stat.mtime.toISOString(),
        hash: parsed.hash
      };
    })
    .sort((a, b) => {
      if (a.entryType !== b.entryType) {
        return a.entryType === "folder" ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
}

function createDocumentInProject(rootDir, payload) {
  const requestedTitle = String(payload?.title || "").trim();
  if (!requestedTitle) {
    throw new Error("Note title is required.");
  }

  const safeBaseName = slugify(requestedTitle);
  let fileName = `${safeBaseName}.md`;
  let filePath = path.join(rootDir, fileName);
  let counter = 2;

  while (fs.existsSync(filePath)) {
    fileName = `${safeBaseName}-${counter}.md`;
    filePath = path.join(rootDir, fileName);
    counter += 1;
  }

  const initialContent = buildDocumentContent({
    header: `Title: ${requestedTitle}`,
    rawNotes: "",
    cleansed: ""
  });

  fs.writeFileSync(filePath, initialContent, "utf8");
  return parseDocument(initialContent, filePath);
}

function updateDocumentHeaderTitle(header, nextTitle) {
  const trimmedTitle = String(nextTitle || "").trim();
  const normalizedHeader = String(header || "").trim();

  if (!trimmedTitle) {
    return normalizedHeader;
  }

  if (!normalizedHeader) {
    return `Title: ${trimmedTitle}`;
  }

  if (/^title\s*:/im.test(normalizedHeader)) {
    return normalizedHeader.replace(/^title\s*:.*$/im, `Title: ${trimmedTitle}`);
  }

  return `Title: ${trimmedTitle}\n${normalizedHeader}`;
}

function renameDocumentFile(filePath, payload) {
  const resolved = path.resolve(String(filePath || ""));
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("Document file does not exist.");
  }

  const requestedTitle = String(payload?.title || "").trim();
  if (!requestedTitle) {
    throw new Error("Note title is required.");
  }

  const nextFileName = `${slugify(requestedTitle)}.md`;
  const nextResolved = path.join(path.dirname(resolved), nextFileName);
  const currentContent = fs.readFileSync(resolved, "utf8");
  const parsed = parseDocument(currentContent, resolved);
  const nextHeader = updateDocumentHeaderTitle(parsed.header, requestedTitle);
  const nextContent = buildDocumentContent({
    ...parsed,
    header: nextHeader,
  });

  const isSamePath = resolved.toLowerCase() === nextResolved.toLowerCase();
  if (!isSamePath && fs.existsSync(nextResolved)) {
    throw new Error("A note with that file name already exists.");
  }

  if (!isSamePath) {
    fs.renameSync(resolved, nextResolved);
    metadataStore.renameHistoryFilePath(resolved, nextResolved);
  }

  fs.writeFileSync(nextResolved, nextContent, "utf8");
  return parseDocument(nextContent, nextResolved);
}

class MetadataStore {
  constructor() {
    ensureDir(appDataDir);
    this.jsonPath = path.join(appDataDir, "app-state.json");
    this.dbPath = path.join(appDataDir, "app.sqlite");
    this.db = null;

    try {
      const { DatabaseSync } = require("node:sqlite");
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS history_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
      version_path TEXT NOT NULL,
          file_hash TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    } catch (error) {
      this.state = fs.existsSync(this.jsonPath)
        ? JSON.parse(fs.readFileSync(this.jsonPath, "utf8"))
        : { history: [] };
    }
  }

  addHistory(entry) {
    if (this.db) {
      this.db.prepare(`
        INSERT INTO history_entries (file_path, version_path, file_hash, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(entry.filePath, entry.versionPath, entry.fileHash, entry.reason, entry.createdAt);
      return;
    }

    this.state.history.push(entry);
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
  }

  getHistory(filePath) {
    if (this.db) {
      return this.db.prepare(`
        SELECT version_path AS versionPath, file_hash AS fileHash, reason, created_at AS createdAt
        FROM history_entries
        WHERE file_path = ?
        ORDER BY created_at DESC
      `).all(filePath);
    }

    return this.state.history
      .filter((entry) => entry.filePath === filePath)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  deleteHistoryVersion(filePath, versionPath) {
    if (this.db) {
      this.db.prepare(`
        DELETE FROM history_entries
        WHERE file_path = ? AND version_path = ?
      `).run(filePath, versionPath);
      return;
    }

    this.state.history = this.state.history.filter(
      (entry) => !(entry.filePath === filePath && entry.versionPath === versionPath)
    );
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
  }

  renameHistoryFilePath(previousFilePath, nextFilePath) {
    if (this.db) {
      this.db.prepare(`
        UPDATE history_entries
        SET file_path = ?
        WHERE file_path = ?
      `).run(nextFilePath, previousFilePath);
      return;
    }

    this.state.history = this.state.history.map((entry) => (
      entry.filePath === previousFilePath
        ? { ...entry, filePath: nextFilePath }
        : entry
    ));
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
  }
}

async function prepareDocumentPreview(filePath, content) {
  const resolved = path.resolve(String(filePath || ""));
  const isValidMarkdownPath =
    filePathWithin(notesRoot, resolved)
    && path.extname(resolved).toLowerCase() === ".md"
    && fs.existsSync(resolved)
    && filePathWithin(getWebPreviewScopeRoot(), resolved);

  if (!isValidMarkdownPath) {
    throw new Error("Invalid document path.");
  }

  if (typeof content === "string") {
    webPreviewContentOverrides.set(resolved, content);
  }

  webPreviewScopeRoot = getWebPreviewScopeRoot();
  webPreviewScopeLabel = getWebPreviewScopeLabel();

  const baseUrl = await ensureWebPreviewServer();
  return {
    resolved,
    previewUrl: `${baseUrl}/pdf/${encodePathForUrl(normalizeToPosix(path.relative(webPreviewScopeRoot, resolved)))}?section=cleansed`
  };
}

let metadataStore;

function sendMenuAction(win, action) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("app-menu:action", action);
}

function buildAppMenu(win, context = {}) {
  const screen = context?.screen === "document" ? "document" : "landing";
  const viewMode = context?.viewMode === "table" ? "table" : "tile";
  const dirty = Boolean(context?.dirty);

  const fileSubmenu = screen === "document"
    ? [
        {
          label: dirty ? "Save*" : "Save",
          accelerator: "CmdOrCtrl+S",
          enabled: dirty,
          click: () => sendMenuAction(win, "save-document")
        },
        {
          label: "Open in VS Code",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => sendMenuAction(win, "open-in-editor")
        },
        {
          label: "Back to Notes",
          accelerator: "Esc",
          click: () => sendMenuAction(win, "back-to-notes")
        },
        { type: "separator" },
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction(win, "new-note")
        },
        { type: "separator" },
        { role: "quit" }
      ]
    : [
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction(win, "new-note")
        },
        { type: "separator" },
        { role: "quit" }
      ];

  const viewSubmenu = screen === "document"
    ? [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" }
      ]
    : [
        {
          label: "Tile Notes",
          accelerator: "CmdOrCtrl+1",
          type: "radio",
          checked: viewMode === "tile",
          click: () => sendMenuAction(win, "view-tile")
        },
        {
          label: "Table Notes",
          accelerator: "CmdOrCtrl+2",
          type: "radio",
          checked: viewMode === "table",
          click: () => sendMenuAction(win, "view-table")
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" }
      ];

  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: fileSubmenu
    },
    {
      label: "View",
      submenu: viewSubmenu
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" }
      ]
    }
  ]);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#f5f3ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  let hasShown = false;

  const showWindow = () => {
    if (win.isDestroyed()) return;
    if (!hasShown) {
      hasShown = true;
      win.center();
      win.show();
    }
    win.focus();
  };

  win.once("ready-to-show", () => {
    win.center();
    showWindow();
  });

  // Fallback for packaged/runtime load timing issues where ready-to-show may not fire.
  setTimeout(() => {
    if (!hasShown) {
      showWindow();
    }
  }, 3000);

  win.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error("Renderer failed to load:", { code, desc, url });
    showWindow();
  });

  if (rendererUrl) {
    win.loadURL(rendererUrl);
  } else {
    win.loadFile(path.join(projectRoot, "dist", "index.html"));
  }

  win.__menuContext = { screen: "landing", viewMode: "tile", dirty: false };
  Menu.setApplicationMenu(buildAppMenu(win, win.__menuContext));
  mainWindow = win;

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  applyNotesRoot(resolveInitialNotesRoot());
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (webPreviewServer) {
    webPreviewServer.close();
    webPreviewServer = null;
    webPreviewPort = 0;
  }
  webPreviewContentOverrides.clear();
  webPreviewScopeRoot = "";
  webPreviewScopeLabel = "Project";
});

app.on("browser-window-focus", (_event, win) => {
  const context = win?.__menuContext || { screen: "landing", viewMode: "tile", dirty: false };
  Menu.setApplicationMenu(buildAppMenu(win, context));
});

ipcMain.on("app-menu:update-context", (event, context) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  win.__menuContext = {
    screen: context?.screen === "document" ? "document" : "landing",
    viewMode: context?.viewMode === "table" ? "table" : "tile",
    dirty: Boolean(context?.dirty)
  };

  Menu.setApplicationMenu(buildAppMenu(win, win.__menuContext));
});

ipcMain.handle("settings:get-notes-root", () => ({
  notesRoot,
  notesRootSource: process.env.NOTES_ROOT ? "env" : "config"
}));

ipcMain.handle("settings:pick-folder", async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Select notes folder"
  });

  if (result.canceled || !result.filePaths?.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("settings:set-notes-root", (_event, payload) => {
  const nextPath = String(payload?.notesRoot || "").trim();
  if (!nextPath) {
    throw new Error("Notes folder path is required.");
  }

  const resolved = path.resolve(nextPath);
  ensureDir(resolved);

  const settings = readUserSettings();
  settings.notesRoot = resolved;
  writeUserSettings(settings);

  if (!process.env.NOTES_ROOT) {
    applyNotesRoot(resolved);
  }

  return {
    notesRoot: resolved,
    restartRequired: Boolean(process.env.NOTES_ROOT),
    ignoredByEnv: Boolean(process.env.NOTES_ROOT)
  };
});

ipcMain.handle("projects:list", () => listProjectsState());

ipcMain.handle("projects:set-active", (_event, payload) => {
  const slug = String(payload?.slug || "").trim();
  const exists = listProjectsState().projects.some((item) => item.slug === slug);
  if (!exists) {
    throw new Error("Project not found.");
  }

  activeProjectSlug = slug;
  return listProjectsState();
});

ipcMain.handle("documents:list", () => {
  const activeProject = getActiveProject();
  if (activeProject?.isRoot) {
    return listRootEntries(notesRoot);
  }

  return listMarkdownFiles(activeProject.rootPath).map((entry) => ({
    ...entry,
    entryType: "file"
  }));
});

ipcMain.handle("documents:create", (_event, payload) => {
  const activeProject = getActiveProject();
  const rootDir = activeProject.rootPath;
  return createDocumentInProject(rootDir, payload);
});

ipcMain.handle("documents:rename", (_event, payload) => {
  return renameDocumentFile(payload?.filePath, payload);
});

ipcMain.handle("documents:read", (_event, filePath) => {
  const resolved = path.resolve(filePath);
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  return parseDocument(fs.readFileSync(resolved, "utf8"), resolved);
});

ipcMain.handle("documents:save", (_event, payload) => {
  const resolved = path.resolve(payload.filePath);
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }

  const saveReason = String(payload?.reason || "manual-save");
  const isAutoSave = saveReason === "autosave";

  const previous = fs.readFileSync(resolved, "utf8");

  const next = buildDocumentContent(payload);
  fs.writeFileSync(resolved, next, "utf8");

  if (!isAutoSave) {
    const slug = slugify(path.basename(resolved));
    const versionDir = path.join(versionsRoot, slug);
    ensureDir(versionDir);

    const stamp = nowStamp();
    const versionPath = path.join(versionDir, `${stamp}.md`);
    fs.writeFileSync(versionPath, previous, "utf8");

    metadataStore.addHistory({
      filePath: resolved,
      versionPath,
      fileHash: hashContent(previous),
      reason: saveReason,
      createdAt: new Date().toISOString()
    });
  }

  return parseDocument(next, resolved);
});

ipcMain.handle("documents:history", (_event, filePath) => {
  const resolved = path.resolve(filePath);
  return metadataStore.getHistory(resolved);
});

ipcMain.handle("documents:restore", (_event, payload) => {
  const resolved = path.resolve(payload.filePath);
  const versionPath = path.resolve(payload.versionPath);
  if (!filePathWithin(notesRoot, resolved) || !filePathWithin(versionsRoot, versionPath)) {
    throw new Error("Invalid restore path.");
  }

  const current = fs.readFileSync(resolved, "utf8");
  const rollbackDir = path.join(versionsRoot, slugify(path.basename(resolved)));
  ensureDir(rollbackDir);
  const rollbackPath = path.join(rollbackDir, `${nowStamp()}-before-restore.md`);
  fs.writeFileSync(rollbackPath, current, "utf8");

  const restored = fs.readFileSync(versionPath, "utf8");
  fs.writeFileSync(resolved, restored, "utf8");

  metadataStore.addHistory({
    filePath: resolved,
    versionPath: rollbackPath,
    fileHash: hashContent(current),
    reason: "before-restore",
    createdAt: new Date().toISOString()
  });

  return parseDocument(restored, resolved);
});

ipcMain.handle("documents:open-in-editor", async (_event, filePath) => {
  const resolved = path.resolve(filePath || "");
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("Document file does not exist.");
  }

  try {
    const vscodeUri = `vscode://file/${resolved.replace(/\\/g, "/")}`;
    await shell.openExternal(encodeURI(vscodeUri));
    return { openedWith: "vscode" };
  } catch {
    const fallbackResult = await shell.openPath(resolved);
    if (fallbackResult) {
      throw new Error(fallbackResult);
    }
    return { openedWith: "default" };
  }
});

ipcMain.handle("documents:open-web-view", async (_event, payload) => {
  let previewUrl = `${await ensureWebPreviewServer()}/`;
  if (payload?.filePath) {
    const prepared = await prepareDocumentPreview(payload.filePath, payload.content);
    previewUrl = prepared.previewUrl;
  }

  const openedWithChrome = tryOpenInChrome(previewUrl);

  if (!openedWithChrome) {
    await shell.openExternal(previewUrl);
  }

  return {
    openedWith: openedWithChrome ? "chrome" : "default",
    previewUrl
  };
});

ipcMain.handle("documents:download-pdf", async (_event, payload) => {
  const resolved = path.resolve(String(payload?.filePath || ""));
  if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }

  const includeRawNotes = Boolean(payload?.includeRawNotes);
  const includeCleansed = Boolean(payload?.includeCleansed);
  if (!includeRawNotes && !includeCleansed) {
    throw new Error("Select at least one section to export.");
  }

  const focusedWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  const defaultName = `${path.basename(resolved, ".md") || "note"}.pdf`;
  const saveResult = await dialog.showSaveDialog(focusedWindow, {
    title: "Save note as PDF",
    defaultPath: path.join(path.dirname(resolved), defaultName),
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "notely-pdf-"));
  const tempMarkdownPath = path.join(tempDir, `${slugify(path.basename(resolved))}-export.md`);
  const tempHtmlPath = path.join(tempDir, `${slugify(path.basename(resolved))}-export.html`);
  const markdownContent = buildPdfExportMarkdown(payload, { includeRawNotes, includeCleansed });
  fs.writeFileSync(tempMarkdownPath, markdownContent, "utf8");

  try {
    const baseHref = pathToFileURL(`${path.dirname(resolved)}${path.sep}`).href;
    const html = buildPdfExportHtml({
      title: payload?.title || path.basename(resolved, ".md"),
      markdownContent,
      baseHref
    });
    fs.writeFileSync(tempHtmlPath, html, "utf8");

    const pdfWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 1600,
      backgroundColor: "#ffffff",
      webPreferences: {
        backgroundThrottling: false
      }
    });

    try {
      await pdfWindow.loadFile(tempHtmlPath);
      await pdfWindow.webContents.executeJavaScript("document.fonts ? document.fonts.ready : Promise.resolve()");

      const pdfData = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true
      });

      fs.writeFileSync(saveResult.filePath, pdfData);
    } finally {
      if (!pdfWindow.isDestroyed()) {
        pdfWindow.close();
      }
    }

    return { canceled: false, filePath: saveResult.filePath };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures for temporary export files.
    }
  }
});

ipcMain.handle("documents:read-version", (_event, payload) => {
  const resolvedFilePath = path.resolve(payload?.filePath || "");
  const resolvedVersionPath = path.resolve(payload?.versionPath || "");

  if (!filePathWithin(notesRoot, resolvedFilePath) || path.extname(resolvedFilePath).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!filePathWithin(versionsRoot, resolvedVersionPath) || path.extname(resolvedVersionPath).toLowerCase() !== ".md") {
    throw new Error("Invalid version path.");
  }
  if (!fs.existsSync(resolvedVersionPath)) {
    throw new Error("Version file does not exist.");
  }

  return fs.readFileSync(resolvedVersionPath, "utf8");
});

ipcMain.handle("documents:delete-version", (_event, payload) => {
  const resolvedFilePath = path.resolve(payload?.filePath || "");
  const resolvedVersionPath = path.resolve(payload?.versionPath || "");

  if (!filePathWithin(notesRoot, resolvedFilePath) || path.extname(resolvedFilePath).toLowerCase() !== ".md") {
    throw new Error("Invalid document path.");
  }
  if (!filePathWithin(versionsRoot, resolvedVersionPath) || path.extname(resolvedVersionPath).toLowerCase() !== ".md") {
    throw new Error("Invalid version path.");
  }

  if (fs.existsSync(resolvedVersionPath)) {
    fs.unlinkSync(resolvedVersionPath);
  }
  metadataStore.deleteHistoryVersion(resolvedFilePath, resolvedVersionPath);
  return true;
});

ipcMain.handle("images:save", (_event, payload) => {
  const { fileName, base64Data } = payload || {};
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Invalid image filename.");
  }
  if (!base64Data || typeof base64Data !== "string" || !base64Data.includes(",")) {
    throw new Error("Invalid image payload.");
  }

  const imagesDir = path.join(notesRoot, "images");
  ensureDir(imagesDir);

  // Generate unique filename if it already exists
  const safeFileName = path.basename(fileName).replace(/[<>:"/\\|?*]+/g, "-");
  const ext = path.extname(safeFileName);
  const baseName = path.basename(safeFileName, ext) || "image";
  const finalExt = ext || ".png";
  let finalName = `${baseName}${finalExt}`;
  let counter = 1;

  while (fs.existsSync(path.join(imagesDir, finalName))) {
    finalName = `${baseName}-${counter}${finalExt}`;
    counter++;
  }

  const imagePath = path.join(imagesDir, finalName);
  const buffer = Buffer.from(base64Data.split(",")[1], "base64");
  if (!buffer.length) {
    throw new Error("Image data is empty.");
  }
  fs.writeFileSync(imagePath, buffer);

  // Return relative path for markdown insertion
  return `./images/${finalName}`;
});

ipcMain.handle("images:list", (_event, payload) => {
  const { basePath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }

  const resolvedBasePath = path.resolve(basePath).toLowerCase();
  const normalizedNotesRoot = path.resolve(notesRoot).toLowerCase();
  if (!resolvedBasePath.startsWith(normalizedNotesRoot)) {
    throw new Error("Invalid document path.");
  }

  const imagesDir = path.join(notesRoot, "images");
  if (!fs.existsSync(imagesDir)) return [];

  const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
  return fs.readdirSync(imagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => allowedExtensions.has(path.extname(name).toLowerCase()))
    .map((name) => `./images/${name}`);
});

function resolveImageAssetPath(basePath, assetPath) {
  const rawAsset = (assetPath || "").trim();
  if (!rawAsset) return null;

  let resolvedAssetPath = "";
  if (/^https?:/i.test(rawAsset)) {
    try {
      const url = new URL(rawAsset);
      let localPath = url.pathname || "";
      for (let i = 0; i < 5; i += 1) {
        try {
          const next = decodeURIComponent(localPath);
          if (next === localPath) break;
          localPath = next;
        } catch {
          break;
        }
      }
      if (/^\/images\//i.test(localPath)) {
        resolvedAssetPath = path.resolve(notesRoot, `.${localPath}`);
      } else {
        return null;
      }
    } catch {
      return null;
    }
  } else if (/^file:/i.test(rawAsset)) {
    try {
      const url = new URL(rawAsset);
      resolvedAssetPath = decodeURI(url.pathname);
      if (/^\/[A-Za-z]:\//.test(resolvedAssetPath)) {
        resolvedAssetPath = resolvedAssetPath.slice(1);
      }
    } catch {
      return null;
    }
  } else {
    let decodedAsset = rawAsset;
    for (let i = 0; i < 5; i += 1) {
      try {
        const next = decodeURIComponent(decodedAsset);
        if (next === decodedAsset) break;
        decodedAsset = next;
      } catch {
        break;
      }
    }
    const baseDir = path.dirname(path.resolve(basePath));
    const normalizedAsset = decodedAsset
      .replace(/^\.\//, "")
      .replace(/^[/\\]+images[/\\]/i, "images/");
    resolvedAssetPath = path.resolve(baseDir, normalizedAsset);
  }

  const normalizedNotesRoot = path.resolve(notesRoot).toLowerCase();
  const normalizedResolvedPath = path.resolve(resolvedAssetPath).toLowerCase();
  if (!normalizedResolvedPath.startsWith(normalizedNotesRoot)) {
    return null;
  }

  return path.resolve(resolvedAssetPath);
}

ipcMain.handle("images:delete", (_event, payload) => {
  const { basePath, assetPath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    return false;
  }

  fs.unlinkSync(resolvedAssetPath);
  return true;
});

ipcMain.handle("images:replace", (_event, payload) => {
  const { basePath, assetPath, base64Data } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }
  if (!base64Data || typeof base64Data !== "string" || !base64Data.includes(",")) {
    throw new Error("Invalid image payload.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    throw new Error("Image file not found.");
  }

  const buffer = Buffer.from(base64Data.split(",")[1], "base64");
  if (!buffer.length) {
    throw new Error("Image data is empty.");
  }

  fs.writeFileSync(resolvedAssetPath, buffer);
  return true;
});

ipcMain.handle("images:read", (_event, payload) => {
  const { basePath, assetPath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const rawAsset = assetPath.trim();
  if (/^(data:|blob:)/i.test(rawAsset)) {
    return assetPath;
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, rawAsset);
  if (!resolvedAssetPath) {
    return rawAsset;
  }
  if (!fs.existsSync(resolvedAssetPath)) {
    return rawAsset;
  }

  const ext = path.extname(resolvedAssetPath).toLowerCase();
  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  };
  const mimeType = mimeMap[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(resolvedAssetPath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
});
