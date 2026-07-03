const { pathToFileURL } = require("node:url");
const { ZipFile } = require("yazl");
const { assertTrustedIpcSender } = require("../ipc/ipcSecurity.cjs");

const DEFAULT_EXPORT_MODE = "raw";
const DEFAULT_CONTENT_MODE = "combined";

function getExportType(mode) {
  if (mode === "pdf") return "pdf";
  if (mode === "web") return "html";
  return "docs";
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildDatedExportBaseName(mode, now = new Date()) {
  const exportType = getExportType(mode);
  const day = pad2(now.getDate());
  const month = pad2(now.getMonth() + 1);
  const year = now.getFullYear();
  return `_${exportType}_${day}_${month}_${year}`;
}

function normalizeMode(value) {
  return ["raw", "pdf", "web"].includes(value) ? value : DEFAULT_EXPORT_MODE;
}

function normalizeContentMode(value) {
  return ["combined", "separate", "raw", "cleansed"].includes(value)
    ? value
    : DEFAULT_CONTENT_MODE;
}

function normalizeZipFileName(value) {
  const fallback = "workspace-export.zip";
  const raw = String(value || "").trim() || fallback;
  const cleaned = raw.replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim() || fallback;
  return cleaned.toLowerCase().endsWith(".zip") ? cleaned : `${cleaned}.zip`;
}

function normalizeArchiveRootFolderName(value, fallback = "workspace") {
  const raw = String(value || "").trim();
  const cleaned = raw
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[._\s]+$/, "");
  return cleaned || fallback;
}

function ensureUniquePath(fs, path, targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;

  const ext = path.extname(targetPath);
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath, ext);
  let counter = 1;

  while (true) {
    const candidate = path.join(dir, `${base}-${counter}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    counter += 1;
  }
}

function walkFiles(fs, path, rootDir, options = {}) {
  const exclude = new Set(options.excludeDirs || []);
  const files = [];

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (exclude.has(entry.name)) continue;
        visit(nextPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  }

  visit(rootDir);
  return files;
}

function copyDirectoryRecursive(fs, path, sourceRoot, targetRoot, options = {}) {
  const exclude = new Set(options.excludeDirs || []);

  function copyDir(currentSource, currentTarget) {
    fs.mkdirSync(currentTarget, { recursive: true });
    const entries = fs.readdirSync(currentSource, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && exclude.has(entry.name)) continue;
      const sourcePath = path.join(currentSource, entry.name);
      const targetPath = path.join(currentTarget, entry.name);

      if (entry.isDirectory()) {
        copyDir(sourcePath, targetPath);
        continue;
      }

      if (entry.isFile()) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  copyDir(sourceRoot, targetRoot);
}

function zipDirectory(fs, path, sourceDir, zipPath, options = {}) {
  const files = walkFiles(fs, path, sourceDir);
  const zipFile = new ZipFile();
  const rootFolderName = String(options.rootFolderName || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    output.on("error", fail);
    zipFile.outputStream.on("error", fail);
    output.on("close", () => {
      if (settled) return;
      settled = true;
      resolve({ entryCount: files.length });
    });

    zipFile.outputStream.pipe(output);

    for (const absolutePath of files) {
      const relativePath = path.relative(sourceDir, absolutePath).replace(/\\/g, "/");
      const archivedPath = rootFolderName ? `${rootFolderName}/${relativePath}` : relativePath;
      zipFile.addFile(absolutePath, archivedPath);
    }

    zipFile.end();
  });
}

function buildExportMarkdown(parsedDocument, buildPdfExportMarkdown, includeRawNotes, includeCleansed, fallbackSource = "") {
  if (!parsedDocument?.hasRawNotes && !parsedDocument?.hasCleansed) {
    return String(fallbackSource || "");
  }

  return buildPdfExportMarkdown(parsedDocument, {
    includeRawNotes: Boolean(includeRawNotes),
    includeCleansed: Boolean(includeCleansed),
  });
}

function getStructuredSectionPlans(parsedDocument, contentMode) {
  const hasRaw = Boolean(parsedDocument?.hasRawNotes);
  const hasCleansed = Boolean(parsedDocument?.hasCleansed);

  if (!hasRaw && !hasCleansed) {
    return [{ key: "combined", includeRaw: true, includeCleansed: true, suffix: "" }];
  }

  if (contentMode === "raw") {
    if (hasRaw) return [{ key: "raw", includeRaw: true, includeCleansed: false, suffix: ".raw" }];
    return [{ key: "combined", includeRaw: true, includeCleansed: true, suffix: "" }];
  }

  if (contentMode === "cleansed") {
    if (hasCleansed) return [{ key: "cleansed", includeRaw: false, includeCleansed: true, suffix: ".cleansed" }];
    return [{ key: "combined", includeRaw: true, includeCleansed: true, suffix: "" }];
  }

  if (contentMode === "separate") {
    const plans = [];
    if (hasRaw) plans.push({ key: "raw", includeRaw: true, includeCleansed: false, suffix: ".raw" });
    if (hasCleansed) plans.push({ key: "cleansed", includeRaw: false, includeCleansed: true, suffix: ".cleansed" });
    return plans.length ? plans : [{ key: "combined", includeRaw: true, includeCleansed: true, suffix: "" }];
  }

  return [{ key: "combined", includeRaw: true, includeCleansed: true, suffix: "" }];
}

async function exportPdfWorkspace({
  BrowserWindow,
  fs,
  path,
  notesRoot,
  stagingRoot,
  buildPdfExportHtml,
  buildPdfExportMarkdown,
  parseDocument,
  contentMode,
}) {
  const markdownFiles = walkFiles(fs, path, notesRoot, {
    excludeDirs: [".notes-app", "node_modules", ".git", ".artifacts", "dist", "build"],
  }).filter((filePath) => path.extname(filePath).toLowerCase() === ".md");

  const tempHtmlDir = path.join(stagingRoot, "_pdf-html");
  fs.mkdirSync(tempHtmlDir, { recursive: true });

  const outputRoot = path.join(stagingRoot, "pdf");
  fs.mkdirSync(outputRoot, { recursive: true });

  for (const markdownPath of markdownFiles) {
    const content = fs.readFileSync(markdownPath, "utf8");
    const parsed = parseDocument(content, markdownPath);
    const relativeMdPath = path.relative(notesRoot, markdownPath);
    const sectionPlans = getStructuredSectionPlans(parsed, contentMode);

    for (const sectionPlan of sectionPlans) {
      const markdownContent = buildExportMarkdown(
        parsed,
        buildPdfExportMarkdown,
        sectionPlan.includeRaw,
        sectionPlan.includeCleansed,
        content
      );

      const html = buildPdfExportHtml({
        title: parsed.title || path.basename(markdownPath, ".md"),
        markdownContent,
        baseHref: pathToFileURL(`${path.dirname(markdownPath)}${path.sep}`).href,
        sourceDir: path.dirname(markdownPath),
        downsampleImages: false,
        pdfQualityPreset: "full",
      });

      const relativePdfPath = relativeMdPath.replace(/\.md$/i, `${sectionPlan.suffix}.pdf`);
      const htmlTempPath = path.join(tempHtmlDir, `${relativePdfPath.replace(/[\\/]/g, "__")}.html`);
      const pdfOutputPath = path.join(outputRoot, relativePdfPath);

      fs.mkdirSync(path.dirname(pdfOutputPath), { recursive: true });
      fs.writeFileSync(htmlTempPath, html, "utf8");

      const pdfWindow = new BrowserWindow({
        show: false,
        width: 1280,
        height: 1600,
        backgroundColor: "#ffffff",
        webPreferences: {
          backgroundThrottling: false,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
        },
      });

      try {
        await pdfWindow.loadFile(htmlTempPath);
        await pdfWindow.webContents.executeJavaScript("document.fonts ? document.fonts.ready : Promise.resolve()", true);

        const pdfData = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
        });

        fs.writeFileSync(pdfOutputPath, pdfData);
      } finally {
        if (!pdfWindow.isDestroyed()) {
          pdfWindow.close();
        }
      }
    }
  }
}

function createMarkdownRenderer(getMarkdownIt, path, mdToHtmlMap) {
  const MarkdownItCtor = getMarkdownIt();
  const markdown = new MarkdownItCtor({ html: false, linkify: true, typographer: true });

  const defaultLinkOpen = markdown.renderer.rules.link_open
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const hrefIndex = tokens[idx].attrIndex("href");
    if (hrefIndex >= 0) {
      const rawHref = String(tokens[idx].attrs[hrefIndex][1] || "").trim();
      if (rawHref && !/^(https?:|mailto:|tel:|#|javascript:|data:|blob:)/i.test(rawHref)) {
        const [pathPart, hashPart = ""] = rawHref.split("#");
        const normalizedPath = pathPart.replace(/\\/g, "/");
        if (/\.md$/i.test(normalizedPath)) {
          const fromRelMd = String(env?.relMdPath || "").replace(/\\/g, "/");
          const resolvedMd = normalizedPath.startsWith("/")
            ? path.posix.normalize(normalizedPath.slice(1))
            : path.posix.normalize(path.posix.join(path.posix.dirname(fromRelMd), normalizedPath));

          const targetHtml = mdToHtmlMap.get(resolvedMd);
          if (targetHtml) {
            const currentHtml = mdToHtmlMap.get(fromRelMd) || "index.html";
            const relativeHref = path.posix.relative(path.posix.dirname(currentHtml), targetHtml) || targetHtml;
            tokens[idx].attrs[hrefIndex][1] = hashPart ? `${relativeHref}#${hashPart}` : relativeHref;
          }
        }
      }
    }

    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return markdown;
}

function buildWebPageHtml(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${String(title || "Notely")}</title>
    <style>
      body { margin: 0; padding: 28px; font-family: "Segoe UI", Arial, sans-serif; color: #12323a; background: #f5f8f8; }
      .page { max-width: 980px; margin: 0 auto; background: #ffffff; border: 1px solid #d9e3e4; border-radius: 12px; padding: 24px; }
      h1, h2, h3 { color: #163e46; }
      pre { background: #11242b; color: #e3f2f2; border-radius: 8px; padding: 12px; overflow-x: auto; }
      code { font-family: Consolas, "Cascadia Code", monospace; }
      img { max-width: 100%; height: auto; }
      a { color: #0f5f76; }
      ul { padding-left: 20px; }
    </style>
  </head>
  <body>
    <main class="page">
      ${bodyHtml}
    </main>
  </body>
</html>`;
}

function exportWebWorkspace({ fs, path, notesRoot, stagingRoot, getMarkdownIt, parseDocument, buildPdfExportMarkdown, contentMode }) {
  const allFiles = walkFiles(fs, path, notesRoot, {
    excludeDirs: [".notes-app", "node_modules", ".git", ".artifacts", "dist", "build"],
  });
  const markdownFiles = allFiles.filter((filePath) => path.extname(filePath).toLowerCase() === ".md");
  const nonMarkdownFiles = allFiles.filter((filePath) => path.extname(filePath).toLowerCase() !== ".md");

  const webRoot = path.join(stagingRoot, "web");
  fs.mkdirSync(webRoot, { recursive: true });

  const mdToHtmlMap = new Map();
  const htmlBuildJobs = [];

  for (const markdownPath of markdownFiles) {
    const relMdPath = path.relative(notesRoot, markdownPath).replace(/\\/g, "/");
    const content = fs.readFileSync(markdownPath, "utf8");
    const parsed = parseDocument(content, markdownPath);
    const sectionPlans = getStructuredSectionPlans(parsed, contentMode);

    const outputVariants = sectionPlans.map((plan) => ({
      relHtmlPath: relMdPath.replace(/\.md$/i, `${plan.suffix}.html`),
      plan,
      parsed,
      content,
    }));

    const primaryVariant = outputVariants[0]?.relHtmlPath || relMdPath.replace(/\.md$/i, ".html");
    mdToHtmlMap.set(relMdPath, primaryVariant);

    for (const variant of outputVariants) {
      htmlBuildJobs.push({
        markdownPath,
        relMdPath,
        relHtmlPath: variant.relHtmlPath,
        sectionPlan: variant.plan,
        parsed: variant.parsed,
        content: variant.content,
      });
    }
  }

  const markdown = createMarkdownRenderer(getMarkdownIt, path, mdToHtmlMap);
  const indexLinks = [];

  for (const job of htmlBuildJobs) {
    const relMdPath = job.relMdPath;
    const relHtmlPath = job.relHtmlPath;
    const htmlPath = path.join(webRoot, relHtmlPath);
    const renderedMarkdown = buildExportMarkdown(
      job.parsed,
      buildPdfExportMarkdown,
      job.sectionPlan.includeRaw,
      job.sectionPlan.includeCleansed,
      job.content
    );
    const rendered = markdown.render(renderedMarkdown, { relMdPath });
    const title = path.basename(job.markdownPath, ".md");
    const pageHtml = buildWebPageHtml(title, `<h1>${title}</h1>${rendered}`);

    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, pageHtml, "utf8");
    if (relHtmlPath === mdToHtmlMap.get(relMdPath)) {
      indexLinks.push({ title, href: relHtmlPath });
    }
  }

  for (const assetPath of nonMarkdownFiles) {
    const relPath = path.relative(notesRoot, assetPath);
    const targetPath = path.join(webRoot, relPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(assetPath, targetPath);
  }

  indexLinks.sort((left, right) => left.title.localeCompare(right.title));
  const indexHtml = buildWebPageHtml(
    "Notely Workspace Export",
    `<h1>Workspace Notes</h1><ul>${indexLinks
      .map((entry) => `<li><a href="${entry.href}">${entry.title}</a></li>`)
      .join("")}</ul>`
  );
  fs.writeFileSync(path.join(webRoot, "index.html"), indexHtml, "utf8");
}

function registerWorkspaceExportIpcHandlers(ipcMain, deps) {
  const {
    BrowserWindow,
    dialog,
    fs,
    os,
    path,
    ensureDir,
    filePathWithin,
    getMarkdownIt,
    readUserSettings,
    writeUserSettings,
    getNotesRoot,
    getActiveProject,
    parseDocument,
    buildPdfExportMarkdown,
    buildPdfExportHtml,
  } = deps;

  function registerTrustedHandler(channel, handler) {
    ipcMain.handle(channel, (event, payload) => {
      assertTrustedIpcSender(BrowserWindow, event, channel);
      return handler(event, payload);
    });
  }

  function getDefaultDestinationPath() {
    const settings = readUserSettings();
    const lastPath = typeof settings.lastWorkspaceExportPath === "string"
      ? settings.lastWorkspaceExportPath.trim()
      : "";

    if (lastPath) {
      const resolved = path.resolve(lastPath);
      if (fs.existsSync(resolved)) return resolved;
    }

    const activeProject = getActiveProject();
    return path.resolve(activeProject?.rootPath || getNotesRoot());
  }

  function rememberExportPath(destinationPath) {
    const settings = readUserSettings();
    settings.lastWorkspaceExportPath = path.resolve(destinationPath);
    writeUserSettings(settings);
  }

  registerTrustedHandler("workspace-export:get-defaults", () => {
    const mode = DEFAULT_EXPORT_MODE;
    const notesRoot = path.resolve(getNotesRoot());
    const workspaceName = normalizeArchiveRootFolderName(path.basename(notesRoot), "workspace");
    return {
      destinationPath: getDefaultDestinationPath(),
      fileName: normalizeZipFileName(`${workspaceName}${buildDatedExportBaseName(mode)}.zip`),
      includeMetadata: false,
      mode,
      contentMode: DEFAULT_CONTENT_MODE,
    };
  });

  registerTrustedHandler("workspace-export:browse-destination", async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    const result = await dialog.showOpenDialog(focusedWindow, {
      title: "Select export destination",
      defaultPath: getDefaultDestinationPath(),
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true };
    }

    const destinationPath = path.resolve(result.filePaths[0]);
    rememberExportPath(destinationPath);
    return { canceled: false, destinationPath };
  });

  registerTrustedHandler("workspace-export:run", async (_event, payload) => {
    const event = _event;
    const notesRoot = path.resolve(getNotesRoot());
    const destinationPath = path.resolve(String(payload?.destinationPath || "").trim() || getDefaultDestinationPath());
    const includeMetadata = Boolean(payload?.includeMetadata);
    const mode = normalizeMode(payload?.mode);
    const contentMode = normalizeContentMode(payload?.contentMode);
    const archiveRootName = normalizeArchiveRootFolderName(path.basename(notesRoot), "workspace");
    const requestedFileName = typeof payload?.fileName === "string" ? payload.fileName.trim() : "";
    const fileName = normalizeZipFileName(requestedFileName || `${archiveRootName}${buildDatedExportBaseName(mode)}.zip`);

    if (!destinationPath) {
      throw new Error("Choose an export destination first.");
    }

    ensureDir(destinationPath);
    if (!filePathWithin(destinationPath, destinationPath)) {
      throw new Error("Invalid export destination path.");
    }

    const start = Date.now();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "notely-workspace-export-"));
    const stagingRoot = path.join(tempRoot, "staging");
    ensureDir(stagingRoot);
    const sendProgress = (progressPayload) => {
      try {
        event?.sender?.send("workspace-export:progress", {
          phase: "Preparing export",
          percent: 0,
          ...(progressPayload || {}),
        });
      } catch {
        // Best effort progress updates.
      }
    };

    try {
      sendProgress({ phase: "Preparing export", percent: 5 });
      if (mode === "raw") {
        sendProgress({ phase: "Collecting workspace files", percent: 20 });
        copyDirectoryRecursive(fs, path, notesRoot, stagingRoot, {
          excludeDirs: includeMetadata ? [] : [".notes-app"],
        });
        sendProgress({ phase: "Workspace files staged", percent: 70 });
      } else if (mode === "pdf") {
        sendProgress({ phase: "Rendering PDF files", percent: 15 });
        await exportPdfWorkspace({
          BrowserWindow,
          fs,
          path,
          notesRoot,
          stagingRoot,
          buildPdfExportHtml,
          buildPdfExportMarkdown,
          parseDocument,
          contentMode,
        });
        sendProgress({ phase: "PDF files rendered", percent: 75 });

        if (includeMetadata) {
          const metadataPath = path.join(notesRoot, ".notes-app");
          if (fs.existsSync(metadataPath)) {
            sendProgress({ phase: "Adding metadata", percent: 80 });
            copyDirectoryRecursive(fs, path, metadataPath, path.join(stagingRoot, ".notes-app"));
          }
        }
      } else {
        sendProgress({ phase: "Rendering web pages", percent: 15 });
        exportWebWorkspace({
          fs,
          path,
          notesRoot,
          stagingRoot,
          getMarkdownIt,
          parseDocument,
          buildPdfExportMarkdown,
          contentMode,
        });
        sendProgress({ phase: "Web pages rendered", percent: 75 });

        if (includeMetadata) {
          const metadataPath = path.join(notesRoot, ".notes-app");
          if (fs.existsSync(metadataPath)) {
            sendProgress({ phase: "Adding metadata", percent: 80 });
            copyDirectoryRecursive(fs, path, metadataPath, path.join(stagingRoot, ".notes-app"));
          }
        }
      }

      const outputPath = ensureUniquePath(fs, path, path.join(destinationPath, fileName));
      sendProgress({ phase: "Compressing zip", percent: 88 });
      const zipResult = await zipDirectory(fs, path, stagingRoot, outputPath, { rootFolderName: archiveRootName });

      rememberExportPath(destinationPath);
      sendProgress({ phase: "Export complete", percent: 100, done: true, filePath: outputPath });

      return {
        canceled: false,
        filePath: outputPath,
        mode,
        contentMode,
        includeMetadata,
        entryCount: zipResult.entryCount,
        elapsedMs: Date.now() - start,
      };
    } finally {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // Best effort temporary cleanup.
      }
    }
  });
}

module.exports = { registerWorkspaceExportIpcHandlers };