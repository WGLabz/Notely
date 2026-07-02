// Website & search preview renderers, extracted verbatim from main.cjs.
// Pure HTML/JSON builders; all environment access is injected via `deps`.
function createWebsiteRenderer(deps) {
  const {
    path,
    fs,
    MarkdownIt,
    getMarkdownIt,
    escapeHtml,
    encodePathForUrl,
    normalizeToPosix,
    safeDecode,
    walkFiles,
    parseDocument,
    getImageAnnotationForMarkdownAsset,
    renderImageHtmlWithAnnotation,
    buildWebsiteHtml,
    WALK_EXCLUDE_DIRS,
    getScopeRoot,
    getScopeLabel,
    getNotesRoot
  } = deps;

function listMarkdownRelativePaths() {
  const scopeRoot = getScopeRoot();
  return walkFiles(scopeRoot, { excludeDirs: Array.from(WALK_EXCLUDE_DIRS) })
    .filter((item) => path.extname(item).toLowerCase() === ".md")
    .map((item) => normalizeToPosix(path.relative(scopeRoot, item)))
    .sort((a, b) => a.localeCompare(b));
}

function buildWebsiteMarkdownRenderer() {
  const MarkdownItCtor = MarkdownIt || (typeof getMarkdownIt === "function" ? getMarkdownIt() : null);
  if (!MarkdownItCtor) {
    throw new Error("Markdown renderer is unavailable.");
  }

  const markdown = new MarkdownItCtor({
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
    let resolved = normalizedPath.startsWith("/")
      ? path.posix.normalize(normalizedPath.slice(1))
      : path.posix.normalize(path.posix.join(path.posix.dirname(fromRelMd), normalizedPath));

    const legacyDiagramMatch = resolved.match(/^(.*?excali-diagrams\/)[^/]+\/([^/]+\/diagram\.png)$/i);
    if (legacyDiagramMatch) {
      const scopeRoot = path.resolve(getScopeRoot());
      const legacyResolved = `${legacyDiagramMatch[1]}${legacyDiagramMatch[2]}`;
      const currentResolved = `.notes-app/${legacyResolved}`;
      const currentAbsPath = path.resolve(scopeRoot, resolved.replace(/\//g, path.sep));
      const legacyAbsPath = path.resolve(scopeRoot, legacyResolved.replace(/\//g, path.sep));
      const newAbsPath = path.resolve(scopeRoot, currentResolved.replace(/\//g, path.sep));
      if (!fs.existsSync(currentAbsPath) && fs.existsSync(newAbsPath)) {
        resolved = currentResolved;
      } else if (!fs.existsSync(currentAbsPath) && fs.existsSync(legacyAbsPath)) {
        resolved = legacyResolved;
      }
    }

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
    let annotation = null;
    if (srcIndex >= 0) {
      const src = String(tokens[idx].attrs[srcIndex][1] || "").trim();
      if (src && !/^(https?:|data:|blob:)/i.test(src)) {
        const [pathPart, queryPart = ""] = src.split("?");
        annotation = getImageAnnotationForMarkdownAsset(path.resolve(getNotesRoot(), env?.relMdPath || "__notely__.md"), pathPart);
        const rewritten = rewriteAssetPath(pathPart, env);
        tokens[idx].attrs[srcIndex][1] = queryPart ? `${rewritten}?${queryPart}` : rewritten;
      }
    }

    return renderImageHtmlWithAnnotation(defaultImage(tokens, idx, options, env, self), annotation);
  };

  return markdown;
}

function buildNavigationHtml(activeRelPath = "") {
  const docs = listMarkdownRelativePaths();
  const treeRoot = {
    folders: new Map(),
    files: [],
  };

  docs.forEach((docPath) => {
    const normalized = normalizeToPosix(docPath).replace(/^\/+/, "");
    const parts = normalized.split("/").filter(Boolean);
    if (!parts.length) return;

    const fileName = parts.pop();
    let cursor = treeRoot;
    for (const folder of parts) {
      if (!cursor.folders.has(folder)) {
        cursor.folders.set(folder, { folders: new Map(), files: [] });
      }
      cursor = cursor.folders.get(folder);
    }

    cursor.files.push({
      docPath: normalized,
      title: path.basename(fileName || normalized, ".md"),
    });
  });

  const renderNode = (node, pathPrefix = "") => {
    const folderEntries = Array.from(node.folders.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const fileEntries = [...node.files].sort((a, b) => a.title.localeCompare(b.title));

    const folderHtml = folderEntries.map(([folderName, childNode]) => {
      const folderPath = pathPrefix ? `${pathPrefix}/${folderName}` : folderName;
      return `<li class="nav-folder-item">
        <div class="nav-folder-label" title="${escapeHtml(folderPath)}">${escapeHtml(folderName)}</div>
        <ul class="nav-list nav-sublist">${renderNode(childNode, folderPath)}</ul>
      </li>`;
    }).join("");

    const fileHtml = fileEntries.map((entry) => {
      const href = `/view/${encodePathForUrl(entry.docPath)}`;
      const activeClass = entry.docPath === activeRelPath ? " class=\"active\"" : "";
      return `<li><a${activeClass} href="${href}" title="${escapeHtml(entry.docPath)}">${escapeHtml(entry.title)}</a></li>`;
    }).join("");

    return `${folderHtml}${fileHtml}`;
  };

  const links = renderNode(treeRoot);

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
        <h1>${escapeHtml(getScopeLabel())}</h1>
        <p>${docs.length} note${docs.length !== 1 ? "s" : ""} in this project</p>
      </div>
    </div>
    <div class="doc-body">
      ${docs.length ? `<div class="note-grid">${cards}</div>` : "<p class=\"tab-empty\">No markdown files were found in this project folder.</p>"}
    </div>`;

  return buildWebsiteHtml({
    title: `${getScopeLabel()} \u2014 Notely`,
    bodyHtml: body,
    navigationHtml: buildNavigationHtml(""),
    scopeLabel: getScopeLabel()
  });
}

function renderMarkdownWebsitePage(relMdPath, rawContent, options = {}) {
  const markdown = buildWebsiteMarkdownRenderer();
  const parsed = parseDocument(rawContent, relMdPath);
  const hasTabbedSections = parsed.hasRawNotes || parsed.hasCleansed;
  const requestedSection = options.section === "raw" ? "raw" : "cleansed";

  let activeSection = requestedSection;
  if (activeSection === "cleansed" && !parsed.hasCleansed && parsed.hasRawNotes) {
    activeSection = "raw";
  } else if (activeSection === "raw" && !parsed.hasRawNotes && parsed.hasCleansed) {
    activeSection = "cleansed";
  }

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
            <button class="tab-btn${activeSection === "cleansed" ? " active" : ""}" type="button" role="tab" data-tab-target="cleansed">Cleansed</button>
            <button class="tab-btn${activeSection === "raw" ? " active" : ""}" type="button" role="tab" data-tab-target="raw">Raw Notes</button>
          </div>
          <section class="tab-panel prose${activeSection === "cleansed" ? " active" : ""}" data-tab-panel="cleansed">
            ${cleansedHtml}
          </section>
          <section class="tab-panel prose${activeSection === "raw" ? " active" : ""}" data-tab-panel="raw">
            ${rawHtml}
          </section>
        </section>
      </div>
    `;
  }

  return buildWebsiteHtml({
    title: path.basename(relMdPath, ".md"),
    bodyHtml,
    navigationHtml: buildNavigationHtml(relMdPath),
    scopeLabel: getScopeLabel()
  });
}

function renderPdfNotePage(relMdPath, markdownContent, options = {}) {
  const markdown = buildWebsiteMarkdownRenderer();
  const parsed = parseDocument(markdownContent || "", relMdPath);
  const hasStructuredSections = parsed.hasRawNotes || parsed.hasCleansed;
  const section = options.section === "raw" ? "raw" : "cleansed";

  let contentToRender = markdownContent || "";
  if (hasStructuredSections) {
    contentToRender = section === "raw" ? parsed.rawNotes : parsed.cleansed;
  }

  const title = path.basename(relMdPath, ".md") || "Note";
  const emptyMessage = section === "raw"
    ? "No raw notes captured yet."
    : "No cleansed notes captured yet.";

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
      .notely-image-frame { position: relative; display: inline-block; max-width: 100%; vertical-align: top; }
      .notely-image-frame img { margin: 12px 0; }
      .notely-image-annotation { position: absolute; z-index: 2; max-width: min(60%, 420px); padding: 6px 9px; border-radius: 4px; background: rgba(10, 23, 27, 0.72); color: #ffffff; font-size: 12px; font-weight: 700; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .notely-image-annotation { left: 10px; top: 22px; }
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
        ${contentToRender ? markdown.render(contentToRender, { relMdPath }) : `<p class="empty">${emptyMessage}</p>`}
      </article>
    </main>
  </body>
</html>`;
}

function buildSearchIndex() {
  const scopeRoot = getScopeRoot();
  return listMarkdownRelativePaths().map((relMdPath) => {
    try {
      const resolved = path.resolve(scopeRoot, relMdPath);
      const raw = fs.readFileSync(resolved, "utf8");
      const parsed = parseDocument(raw, resolved);
      const text = [parsed.header || "", parsed.rawNotes || "", parsed.cleansed || ""]
        .join(" ").replace(/[#*_`>[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
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
    navigationHtml: buildNavigationHtml(""),
    scopeLabel: getScopeLabel()
  }).replace("</body>", injection + "\n  </body>");
}

  return {
    listMarkdownRelativePaths,
    buildNavigationHtml,
    buildWebsiteMarkdownRenderer,
    renderRootWebsitePage,
    renderMarkdownWebsitePage,
    renderPdfNotePage,
    buildSearchIndex,
    renderSearchPage
  };
}

module.exports = { createWebsiteRenderer };
