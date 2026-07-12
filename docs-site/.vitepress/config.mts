import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    title: "Notely",
    description:
      "Documentation for Notely — the desktop Markdown notes app with Git version control, AI assistance, and P2P sync.",
    base: "/",
    srcDir: "../docs",
    outDir: "../docs-site-dist",

    appearance: false,

    head: [
      [
        "link",
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
      ],
      [
        "link",
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
      ],
      [
        "link",
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
        },
      ],
      ["meta", { name: "theme-color", content: "#2f5d62" }],
    ],

    themeConfig: {
      logo: "/assets/icon.png",
      siteTitle: "Notely",

      socialLinks: [
        { icon: "github", link: "https://github.com/WGLabz/notely" },
      ],

      nav: [
        { text: "Home", link: "/" },
        { text: "Getting Started", link: "/getting-started/" },
        { text: "Editor", link: "/editor/" },
        { text: "Git", link: "/git/" },
        { text: "AI", link: "/ai/" },
        {
          text: "Download",
          link: "https://github.com/WGLabz/notely/releases/latest",
        },
      ],

      sidebar: [
        {
          text: "Getting Started",
          collapsed: false,
          items: [
            { text: "Overview", link: "/getting-started/" },
            { text: "Your First Note", link: "/getting-started/first-note" },
          ],
        },
        {
          text: "Editor",
          collapsed: false,
          items: [
            { text: "Editor Overview", link: "/editor/" },
            { text: "Markdown Guide", link: "/editor/markdown-guide" },
            { text: "Toolbar Reference", link: "/editor/markdown-toolbar" },
            { text: "Code Blocks", link: "/editor/code-blocks" },
            { text: "Tables", link: "/editor/tables" },
            { text: "Diagrams", link: "/editor/diagrams" },
            { text: "Focus Mode & Outline", link: "/editor/focus-mode" },
          ],
        },
        {
          text: "Search",
          collapsed: true,
          items: [{ text: "Search", link: "/search" }],
        },
        {
          text: "Workspace",
          collapsed: false,
          items: [
            { text: "Workspace Overview", link: "/workspace/" },
            { text: "Tasks", link: "/workspace/tasks" },
            { text: "Media", link: "/workspace/media" },
            { text: "Screen Capture", link: "/workspace/screen-capture" },
            { text: "Workspace Graph", link: "/workspace/graph" },
            { text: "Export", link: "/workspace/export" },
          ],
        },
        {
          text: "Git Version Control",
          collapsed: false,
          items: [
            { text: "Git Overview", link: "/git/" },
            { text: "Setup & Repository", link: "/git/setup" },
            { text: "Commit & Stage", link: "/git/commit" },
            { text: "History & Restore", link: "/git/history" },
            { text: "Branches & Remote", link: "/git/branches" },
          ],
        },
        {
          text: "AI Features",
          collapsed: false,
          items: [
            { text: "AI Overview", link: "/ai/" },
            { text: "AI Setup", link: "/ai/setup" },
            { text: "AI Features", link: "/ai/features" },
          ],
        },
        {
          text: "Sync",
          collapsed: true,
          items: [{ text: "P2P Sync", link: "/sync/" }],
        },
        {
          text: "Reference",
          collapsed: false,
          items: [
            { text: "Settings", link: "/settings-reference" },
            { text: "Keyboard Shortcuts", link: "/keyboard-shortcuts" },
            { text: "Feature Availability", link: "/feature-availability" },
          ],
        },
        {
          text: "Help",
          collapsed: false,
          items: [
            { text: "Troubleshooting", link: "/troubleshooting" },
            { text: "FAQ", link: "/faq" },
            { text: "Release Notes", link: "/release-notes" },
          ],
        },
        {
          text: "Developer",
          collapsed: true,
          items: [
            { text: "Developer Docs", link: "/developer/" },
            { text: "License", link: "/license" },
          ],
        },
      ],



      search: {
        provider: "local",
        options: {
          miniSearch: {
            options: {
              tokenize: (text) => text.split(/[\s\-_/]+/).filter(Boolean),
            },
            searchOptions: {
              fuzzy: 0.2,
              prefix: true,
              boost: { title: 4, text: 2, titles: 1 },
            },
          },
          detailedView: true,
        },
      },

      editLink: {
        pattern:
          "https://github.com/WGLabz/notely/edit/main/docs/:path",
        text: "Edit this page on GitHub",
      },

      footer: {
        message:
          "Released under the <a href='/license'>CC-BY-NC-4.0 License</a>.",
        copyright: "Copyright © 2026 WGLabz",
      },

      lastUpdated: {
        text: "Last updated",
        formatOptions: {
          dateStyle: "medium",
        },
      },

      docFooter: {
        prev: "← Previous",
        next: "Next →",
      },

      outline: {
        level: [2, 3],
        label: "On this page",
      },
    },

    mermaid: {
      // Mermaid theme inherits from VitePress dark/light mode
    },

    markdown: {
      lineNumbers: true,
      container: {
        tipLabel: "Tip",
        warningLabel: "Warning",
        dangerLabel: "Danger",
        infoLabel: "Info",
        detailsLabel: "Details",
      },
      theme: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  })
);
