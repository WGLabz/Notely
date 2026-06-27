const { escapeHtml } = require("./utils.cjs");

function buildWebsiteHtml({ title, bodyHtml, navigationHtml = "", scopeLabel = "Project" }) {
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

      .notely-image-frame {
        position: relative;
        display: inline-block;
        max-width: 100%;
        vertical-align: top;
      }

      .notely-image-frame img {
        margin: 12px 0;
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

      .notely-image-annotation { left: 10px; top: 22px; }

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
        <span class="topbar-scope">${escapeHtml(scopeLabel)}</span>
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

module.exports = { buildWebsiteHtml };
