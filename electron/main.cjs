const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
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

function listMarkdownRelativePaths() {
  const scopeRoot = webPreviewScopeRoot || getWebPreviewScopeRoot();
  return walkFiles(scopeRoot, { excludeDirs: [".notes-app"] })
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
    <style>
      :root {
        color: #1b2a2f;
        background: #eff4f2;
        font-family: "Segoe UI", "SF Pro Text", Tahoma, sans-serif;
        --accent: #0f5f78;
        --accent-soft: #e6f3f8;
        --ink-soft: #546870;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: radial-gradient(circle at top right, #d7e7e1 0%, #eff4f2 38%, #f9fbfa 100%);
      }

      .layout {
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr);
        min-height: 100vh;
      }

      .sidebar {
        border-right: 1px solid #d5e0dc;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(248, 251, 249, 0.95) 100%);
        padding: 16px 14px;
        overflow: auto;
      }

      .scope-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        border: 1px solid #cfe0e8;
        border-radius: 999px;
        background: #f1f7fa;
        color: #305662;
        padding: 0 10px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .brand {
        margin: 0 0 6px;
        font-size: 20px;
        color: #0d2a32;
        letter-spacing: 0.01em;
      }

      .brand-subtle {
        margin: 0 0 14px;
        color: var(--ink-soft);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .nav-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .nav-list a {
        display: block;
        text-decoration: none;
        color: #1d4953;
        padding: 8px 9px;
        border-radius: 8px;
        font-size: 13px;
        overflow-wrap: anywhere;
        border: 1px solid transparent;
        transition: all 0.18s ease;
      }

      .nav-list a:hover,
      .nav-list a.active {
        background: #e8f4f7;
        border-color: #cae2eb;
        color: #0f4c60;
      }

      .content {
        padding: 22px 26px;
      }

      .content-topbar {
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .content-topbar h2 {
        margin: 0;
        font-size: 14px;
        color: #3f636d;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .page {
        width: min(980px, 100%);
        margin: 0;
        background: #ffffff;
        border: 1px solid #d4dfe3;
        border-radius: 14px;
        box-shadow: 0 18px 42px rgba(16, 39, 46, 0.11);
        padding: 28px 30px;
      }

      h1, h2, h3, h4, h5, h6 {
        color: #123943;
        scroll-margin-top: 24px;
      }

      p, li {
        line-height: 1.65;
      }

      a {
        color: var(--accent);
      }

      code {
        background: #edf4f7;
        border: 1px solid #d5e4ea;
        border-radius: 4px;
        padding: 1px 5px;
      }

      pre {
        background: #0f2227;
        color: #e7f2ef;
        border-radius: 8px;
        padding: 14px;
        overflow: auto;
      }

      pre code {
        background: transparent;
        border: 0;
        padding: 0;
        color: inherit;
      }

      img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
      }

      blockquote {
        margin: 0;
        padding-left: 12px;
        border-left: 4px solid #b9d6e0;
        color: #49626a;
      }

      .doc-hero {
        padding-bottom: 12px;
        border-bottom: 1px solid #e5ecef;
        margin-bottom: 16px;
      }

      .doc-hero h1 {
        margin: 0;
        font-size: 28px;
      }

      .doc-path {
        margin: 8px 0 0;
        color: var(--ink-soft);
        font-size: 13px;
      }

      .doc-meta {
        margin-bottom: 16px;
        padding: 12px 14px;
        border: 1px solid #dbe7eb;
        border-radius: 10px;
        background: #f8fbfc;
      }

      .doc-meta p:last-child {
        margin-bottom: 0;
      }

      .tab-switcher {
        display: inline-flex;
        gap: 6px;
        padding: 5px;
        border-radius: 10px;
        border: 1px solid #d3e0e6;
        background: #f2f7f9;
      }

      .tab-btn {
        border: 1px solid transparent;
        border-radius: 8px;
        min-height: 34px;
        padding: 0 14px;
        color: #2a4e59;
        background: transparent;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .tab-btn.active {
        border-color: #c5dce6;
        background: #ffffff;
        color: #0f4c60;
      }

      .tab-panel {
        display: none;
        margin-top: 16px;
      }

      .tab-panel.active {
        display: block;
      }

      .tab-empty {
        margin: 16px 0;
        color: var(--ink-soft);
        font-style: italic;
      }

      @media (max-width: 980px) {
        .layout {
          grid-template-columns: 1fr;
        }

        .sidebar {
          max-height: 220px;
          border-right: 0;
          border-bottom: 1px solid #d5e0dc;
        }

        .content {
          padding: 14px;
        }

        .page {
          padding: 20px 16px;
        }
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <aside class="sidebar">
        <span class="scope-chip">Scoped Website</span>
        <h1 class="brand">Notely Web</h1>
        <p class="brand-subtle">${escapeHtml(webPreviewScopeLabel)} Website</p>
        ${navigationHtml}
      </aside>
      <main class="content">
        <div class="content-topbar">
          <h2>Knowledge Site</h2>
        </div>
        <article class="page">
          ${bodyHtml}
        </article>
      </main>
    </div>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base" });
      const blocks = Array.from(document.querySelectorAll("pre code.language-mermaid"));
      for (const block of blocks) {
        const source = block.textContent || "";
        const container = document.createElement("div");
        container.className = "mermaid";
        container.textContent = source;
        block.parentElement.replaceWith(container);
      }
      await mermaid.run({ querySelector: ".mermaid" });

      const tabGroups = Array.from(document.querySelectorAll("[data-tabs]"));
      for (const group of tabGroups) {
        const buttons = Array.from(group.querySelectorAll("[data-tab-target]"));
        const panels = Array.from(group.querySelectorAll("[data-tab-panel]"));
        buttons.forEach((button) => {
          button.addEventListener("click", () => {
            const target = button.getAttribute("data-tab-target") || "";
            buttons.forEach((item) => item.classList.toggle("active", item === button));
            panels.forEach((panel) => {
              panel.classList.toggle("active", panel.getAttribute("data-tab-panel") === target);
            });
          });
        });
      }
    </script>
  </body>
</html>`;
}

function buildNavigationHtml(activeRelPath = "") {
  const docs = listMarkdownRelativePaths();
  const links = docs.map((docPath) => {
    const href = `/view/${encodePathForUrl(docPath)}`;
    const activeClass = docPath === activeRelPath ? " class=\"active\"" : "";
    return `<li><a${activeClass} href="${href}">${escapeHtml(docPath)}</a></li>`;
  }).join("");

  return `<ul class="nav-list"><li><a href="/">Home</a></li>${links}</ul>`;
}

function renderRootWebsitePage() {
  const docs = listMarkdownRelativePaths();
  const body = docs.length
    ? `<div class="doc-hero"><h1>Notes Website</h1><p class="doc-path">Select a note from the left navigation, or use one of the quick links below.</p></div><ul>${docs
      .slice(0, 25)
      .map((docPath) => `<li><a href="/view/${encodePathForUrl(docPath)}">${escapeHtml(docPath)}</a></li>`)
      .join("")}</ul>`
    : "<div class=\"doc-hero\"><h1>Notes Website</h1><p class=\"doc-path\">No markdown files were found in this project folder.</p></div>";

  return buildWebsiteHtml({
    title: "Notely Website",
    bodyHtml: body,
    navigationHtml: buildNavigationHtml("")
  });
}

function renderMarkdownWebsitePage(relMdPath, rawContent) {
  const markdown = buildWebsiteMarkdownRenderer();
  const parsed = parseDocument(rawContent, relMdPath);
  const hasTabbedSections = parsed.hasRawNotes || parsed.hasCleansed;

  let bodyHtml = markdown.render(rawContent, { relMdPath });
  if (hasTabbedSections) {
    const headerHtml = parsed.header
      ? `<section class="doc-meta">${markdown.render(parsed.header, { relMdPath })}</section>`
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
        <p class="doc-path">${escapeHtml(relMdPath)}</p>
      </div>
      ${headerHtml}
      <section data-tabs>
        <div class="tab-switcher" role="tablist" aria-label="Note sections">
          <button class="tab-btn active" type="button" role="tab" data-tab-target="raw">Raw Notes</button>
          <button class="tab-btn" type="button" role="tab" data-tab-target="cleansed">Cleansed</button>
        </div>
        <section class="tab-panel active" data-tab-panel="raw">
          ${rawHtml}
        </section>
        <section class="tab-panel" data-tab-panel="cleansed">
          ${cleansedHtml}
        </section>
      </section>
    `;
  }

  return buildWebsiteHtml({
    title: path.basename(relMdPath, ".md"),
    bodyHtml,
    navigationHtml: buildNavigationHtml(relMdPath)
  });
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
  const canCreateFolder = Boolean(context?.canCreateFolder);

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
        {
          label: "New Folder",
          accelerator: "CmdOrCtrl+Shift+N",
          enabled: false
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
        {
          label: "New Folder",
          accelerator: "CmdOrCtrl+Shift+N",
          enabled: canCreateFolder,
          click: () => sendMenuAction(win, "new-project")
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

  win.__menuContext = { screen: "landing", viewMode: "tile", dirty: false, canCreateFolder: true };
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
  const context = win?.__menuContext || { screen: "landing", viewMode: "tile", dirty: false, canCreateFolder: true };
  Menu.setApplicationMenu(buildAppMenu(win, context));
});

ipcMain.on("app-menu:update-context", (event, context) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  win.__menuContext = {
    screen: context?.screen === "document" ? "document" : "landing",
    viewMode: context?.viewMode === "table" ? "table" : "tile",
    dirty: Boolean(context?.dirty),
    canCreateFolder: Boolean(context?.canCreateFolder)
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

ipcMain.handle("projects:create", (_event, payload) => {
  const activeProject = getActiveProject();
  if (!activeProject?.isRoot) {
    throw new Error("New folders can be created only in root.");
  }

  const requestedName = String(payload?.name || "").trim();
  if (!requestedName) {
    throw new Error("Folder name is required.");
  }

  const safeName = requestedName
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/[.\s]+$/g, "")
    .trim();

  if (!safeName) {
    throw new Error("Folder name is invalid.");
  }

  const folderPath = path.join(notesRoot, safeName);
  if (fs.existsSync(folderPath)) {
    throw new Error("A folder with this name already exists.");
  }

  ensureDir(folderPath);
  activeProjectSlug = safeName;
  return listProjectsState();
});

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
  if (activeProject?.isRoot) {
    throw new Error("Cannot create notes in root. Open a project folder first.");
  }

  const rootDir = activeProject.rootPath;
  return createDocumentInProject(rootDir, payload);
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

  const previous = fs.readFileSync(resolved, "utf8");
  const slug = slugify(path.basename(resolved));
  const versionDir = path.join(versionsRoot, slug);
  ensureDir(versionDir);

  const stamp = nowStamp();
  const versionPath = path.join(versionDir, `${stamp}.md`);
  fs.writeFileSync(versionPath, previous, "utf8");

  const next = buildDocumentContent(payload);
  fs.writeFileSync(resolved, next, "utf8");

  metadataStore.addHistory({
    filePath: resolved,
    versionPath,
    fileHash: hashContent(previous),
    reason: payload.reason || "manual-save",
    createdAt: new Date().toISOString()
  });

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
  webPreviewScopeRoot = getWebPreviewScopeRoot();
  webPreviewScopeLabel = getWebPreviewScopeLabel();

  let relPath = "";
  if (payload?.filePath) {
    const resolved = path.resolve(String(payload.filePath || ""));
    const isValidMarkdownPath =
      filePathWithin(notesRoot, resolved)
      && path.extname(resolved).toLowerCase() === ".md"
      && fs.existsSync(resolved)
      && filePathWithin(webPreviewScopeRoot, resolved);

    if (isValidMarkdownPath) {
      if (typeof payload?.content === "string") {
        webPreviewContentOverrides.set(resolved, payload.content);
      }

      relPath = normalizeToPosix(path.relative(webPreviewScopeRoot, resolved));
    }
  }

  const baseUrl = await ensureWebPreviewServer();
  const previewUrl = relPath
    ? `${baseUrl}/?note=${encodeURIComponent(relPath)}`
    : `${baseUrl}/`;
  const openedWithChrome = tryOpenInChrome(previewUrl);

  if (!openedWithChrome) {
    await shell.openExternal(previewUrl);
  }

  return {
    openedWith: openedWithChrome ? "chrome" : "default",
    previewUrl
  };
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
