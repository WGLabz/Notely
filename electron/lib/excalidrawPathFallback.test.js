import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const MarkdownIt = require("markdown-it");
const { createWebsiteRenderer } = require("./web/websiteRenderer.cjs");
const { createImageMedia } = require("./media/imageMedia.cjs");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "notely-excalidraw-fallback-"));
}

function filePathWithin(root, candidate) {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(candidate);
  const rel = path.relative(rootResolved, targetResolved);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function normalizeToPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function safeDecode(value) {
  let output = String(value || "");
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(output);
      if (next === output) break;
      output = next;
    } catch {
      break;
    }
  }
  return output;
}

function encodePathForUrl(value) {
  return normalizeToPosix(value)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

describe("Excalidraw legacy path fallbacks", () => {
  const dirsToCleanup = [];

  afterEach(() => {
    while (dirsToCleanup.length) {
      const dir = dirsToCleanup.pop();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup.
      }
    }
  });

  it("rewrites website image src to slugless Excalidraw asset when legacy slugged file is missing", () => {
    const notesRoot = makeTempDir();
    dirsToCleanup.push(notesRoot);

    const markdownPath = path.join(notesRoot, "note.md");
    const diagramId = "abc123ef";
    const legacyAsset = `excali-diagrams/my-note/${diagramId}/diagram.png`;
    const sluglessAsset = `.notes-app/excali-diagrams/${diagramId}/diagram.png`;

    fs.mkdirSync(path.join(notesRoot, ".notes-app", "excali-diagrams", diagramId), { recursive: true });
    fs.writeFileSync(path.join(notesRoot, ".notes-app", "excali-diagrams", diagramId, "diagram.png"), Buffer.from("png-data"));

    const markdown = `![Excalidraw Diagram](${legacyAsset})`;
    fs.writeFileSync(markdownPath, markdown, "utf8");

    const renderer = createWebsiteRenderer({
      path,
      fs,
      MarkdownIt,
      escapeHtml: (value) => String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
      encodePathForUrl,
      normalizeToPosix,
      safeDecode,
      walkFiles: () => [markdownPath],
      parseDocument: (raw) => ({
        title: "note",
        header: "",
        rawNotes: "",
        cleansed: "",
        hasRawNotes: false,
        hasCleansed: false,
        hash: "test",
      }),
      getImageAnnotationForMarkdownAsset: () => null,
      renderImageHtmlWithAnnotation: (html) => html,
      buildWebsiteHtml: ({ bodyHtml }) => `<html><body>${bodyHtml}</body></html>`,
      WALK_EXCLUDE_DIRS: new Set(),
      getScopeRoot: () => notesRoot,
      getScopeLabel: () => "Project",
      getNotesRoot: () => notesRoot,
    });

    const html = renderer.renderMarkdownWebsitePage("note.md", markdown, { section: "cleansed" });

    expect(html).toContain(`/raw/${encodePathForUrl(sluglessAsset)}`);
    expect(html).not.toContain(`/raw/${encodePathForUrl(legacyAsset)}`);
  });

  it("resolves legacy slugged Excalidraw path in images:read and serves thumbnail data", async () => {
    const notesRoot = makeTempDir();
    dirsToCleanup.push(notesRoot);

    const basePath = path.join(notesRoot, "meeting.md");
    const diagramId = "f00dbabe";
    const legacyAsset = `excali-diagrams/meeting/${diagramId}/diagram.png`;
    const sluglessFile = path.join(notesRoot, ".notes-app", "excali-diagrams", diagramId, "diagram.png");

    fs.writeFileSync(basePath, "# Meeting", "utf8");
    fs.mkdirSync(path.dirname(sluglessFile), { recursive: true });
    fs.writeFileSync(sluglessFile, Buffer.from("png-data"));

    const handlers = new Map();
    const ipcMain = {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    };

    const imageMedia = createImageMedia({
      BrowserWindow: {
        fromWebContents() {
          return { isDestroyed: () => false };
        },
      },
      shell: { openPath: async () => "" },
      fs,
      path,
      crypto,
      nativeImage: {
        createFromPath() {
          return {
            isEmpty: () => false,
            getSize: () => ({ width: 128, height: 64 }),
            resize: () => ({ toJPEG: () => Buffer.from("thumb-jpg") }),
          };
        },
      },
      pathToFileURL,
      MarkdownIt,
      buildPdfStyles: () => "",
      escapeHtml: (value) => String(value || ""),
      safeDecode,
      filePathWithin,
      normalizeToPosix,
      ensureDir: (dir) => fs.mkdirSync(dir, { recursive: true }),
      getActiveProject: () => null,
      walkFiles: () => [],
      WALK_EXCLUDE_DIRS: new Set(),
      moveFileToRemoved: () => null,
      getUniquePath: (value) => value,
      getNotesRoot: () => notesRoot,
      getAppDataDir: () => notesRoot,
    });

    imageMedia.registerIpcHandlers(ipcMain);

    const readHandler = handlers.get("images:read");
    expect(typeof readHandler).toBe("function");

    const event = { sender: {}, senderFrame: null };
    const response = await readHandler(event, {
      basePath,
      assetPath: legacyAsset,
      thumbnail: true,
    });

    expect(response.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("rewrites legacy slugged Excalidraw path to a local file URL in PDF export html", () => {
    const notesRoot = makeTempDir();
    dirsToCleanup.push(notesRoot);

    const documentPath = path.join(notesRoot, "meeting.md");
    const diagramId = "cafef00d";
    const legacyAsset = `excali-diagrams/meeting/${diagramId}/diagram.png`;
    const sluglessFile = path.join(notesRoot, ".notes-app", "excali-diagrams", diagramId, "diagram.png");

    fs.writeFileSync(documentPath, "# Meeting", "utf8");
    fs.mkdirSync(path.dirname(sluglessFile), { recursive: true });
    fs.writeFileSync(sluglessFile, Buffer.from("png-data"));

    const imageMedia = createImageMedia({
      BrowserWindow: {
        fromWebContents() {
          return { isDestroyed: () => false };
        },
      },
      shell: { openPath: async () => "" },
      fs,
      path,
      crypto,
      nativeImage: {
        createFromPath() {
          return {
            isEmpty: () => false,
            getSize: () => ({ width: 128, height: 64 }),
            resize: () => ({ toJPEG: () => Buffer.from("thumb-jpg") }),
          };
        },
      },
      pathToFileURL,
      MarkdownIt,
      buildPdfStyles: () => "",
      escapeHtml: (value) => String(value || ""),
      safeDecode,
      filePathWithin,
      normalizeToPosix,
      ensureDir: (dir) => fs.mkdirSync(dir, { recursive: true }),
      getActiveProject: () => null,
      walkFiles: () => [],
      WALK_EXCLUDE_DIRS: new Set(),
      moveFileToRemoved: () => null,
      getUniquePath: (value) => value,
      getNotesRoot: () => notesRoot,
      getAppDataDir: () => notesRoot,
    });

    const html = imageMedia.buildPdfExportHtml({
      title: "meeting",
      markdownContent: `![Excalidraw Diagram](${legacyAsset})`,
      baseHref: pathToFileURL(`${notesRoot}${path.sep}`).href,
      sourceDir: notesRoot,
      downsampleImages: false,
      pdfQualityPreset: "full",
    });

    expect(html).toContain(pathToFileURL(sluglessFile).href);
    expect(html).not.toContain(`src="${legacyAsset}"`);
  });
});
