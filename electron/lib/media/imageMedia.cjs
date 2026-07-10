const { assertTrustedIpcSender } = require("../ipc/ipcSecurity.cjs");
const hljs = require("highlight.js");

function createImageMedia(deps) {
  const {
    BrowserWindow,
    shell,
    fs,
    path,
    crypto,
    nativeImage,
    pathToFileURL,
    MarkdownIt,
    getMarkdownIt,
    buildPdfStyles,
    escapeHtml,
    safeDecode,
    filePathWithin,
    normalizeToPosix,
    ensureDir,
    getActiveProject,
    walkFiles,
    WALK_EXCLUDE_DIRS,
    moveFileToRemoved,
    getUniquePath,
    getNotesRoot,
    getAppDataDir,
    emitLocalP2PSyncEvent,
    hashContent
  } = deps;

  const THUMBNAIL_DIR_NAME = "thumbnails";
  const ORIGINAL_IMAGE_DIR_NAME = "image-originals";
  const THUMBNAIL_MAX_WIDTH = 360;
  const THUMBNAIL_JPEG_QUALITY = 72;
  const RASTER_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".ico"]);

function getOriginalImageBackupPath(imagePath) {
  if (!imagePath) return "";
  const relativeImagePath = path.relative(getNotesRoot(), path.resolve(imagePath));
  return path.join(getAppDataDir(), ORIGINAL_IMAGE_DIR_NAME, relativeImagePath);
}

function hasOriginalImageBackup(imagePath) {
  const backupPath = getOriginalImageBackupPath(imagePath);
  return Boolean(backupPath && fs.existsSync(backupPath));
}

function ensureOriginalImageBackup(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath) || hasOriginalImageBackup(imagePath)) {
    return hasOriginalImageBackup(imagePath);
  }

  const backupPath = getOriginalImageBackupPath(imagePath);
  ensureDir(path.dirname(backupPath));
  fs.copyFileSync(imagePath, backupPath);
  return true;
}

function removeOriginalImageBackup(imagePath) {
  const backupPath = getOriginalImageBackupPath(imagePath);
  if (!backupPath || !fs.existsSync(backupPath)) return;

  try {
    fs.unlinkSync(backupPath);
  } catch {
    return;
  }

  let currentDir = path.dirname(backupPath);
  const backupRoot = path.join(getAppDataDir(), ORIGINAL_IMAGE_DIR_NAME);
  while (currentDir && currentDir.startsWith(backupRoot) && currentDir !== backupRoot) {
    try {
      if (fs.readdirSync(currentDir).length > 0) break;
      fs.rmdirSync(currentDir);
      currentDir = path.dirname(currentDir);
    } catch {
      break;
    }
  }
}

function moveOriginalImageBackup(fromImagePath, toImagePath) {
  const fromBackupPath = getOriginalImageBackupPath(fromImagePath);
  if (!fromBackupPath || !fs.existsSync(fromBackupPath)) return;

  const toBackupPath = getOriginalImageBackupPath(toImagePath);
  ensureDir(path.dirname(toBackupPath));
  fs.renameSync(fromBackupPath, toBackupPath);
  removeOriginalImageBackup(fromImagePath);
}

function emitImageSyncFromDisk(filePath, options = {}) {
  if (typeof emitLocalP2PSyncEvent !== "function" || typeof hashContent !== "function") {
    return;
  }

  const { op = "update", baseHash = null } = options;
  const resolved = path.resolve(String(filePath || ""));
  if (!resolved || !filePathWithin(getNotesRoot(), resolved)) {
    return;
  }

  if (op === "delete") {
    emitLocalP2PSyncEvent({
      op: "delete",
      filePath: resolved,
      baseHash,
      newHash: null,
      content: null,
      contentBase64: null,
      contentEncoding: "base64"
    });
    return;
  }

  if (!fs.existsSync(resolved)) {
    return;
  }

  const contentBase64 = fs.readFileSync(resolved).toString("base64");
  emitLocalP2PSyncEvent({
    op,
    filePath: resolved,
    baseHash,
    newHash: hashContent(contentBase64),
    content: null,
    contentBase64,
    contentEncoding: "base64"
  });
}

function buildPdfExportHtml({ title, markdownContent, baseHref, sourceDir, downsampleImages = false, pdfQualityPreset = "full" }) {
  const MarkdownItCtor = MarkdownIt || (typeof getMarkdownIt === "function" ? getMarkdownIt() : null);
  if (!MarkdownItCtor) {
    throw new Error("Markdown renderer is unavailable.");
  }

  const markdown = new MarkdownItCtor({
    html: false,
    linkify: true,
    typographer: true
  });

  const escapeCodeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const highlightCode = (code, language) => {
    const source = String(code || "");
    const lang = String(language || "").trim().toLowerCase();
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(source).value;
    } catch {
      return escapeCodeHtml(source);
    }
  };

  const getLanguageDisplayLabel = (language) => {
    const normalized = String(language || "").trim().toLowerCase();
    if (!normalized) return "text";

    const aliases = {
      js: "JavaScript",
      jsx: "JSX",
      ts: "TypeScript",
      tsx: "TSX",
      py: "Python",
      sh: "Shell",
      bash: "Bash",
      zsh: "Zsh",
      ps1: "PowerShell",
      csharp: "C#",
      cs: "C#",
      cpp: "C++",
      yml: "YAML",
      md: "Markdown",
      html: "HTML",
      css: "CSS",
      json: "JSON",
      sql: "SQL",
      xml: "XML",
      plaintext: "text",
      text: "text",
    };

    return aliases[normalized] || normalized;
  };

  markdown.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = String(token.info || "").trim();
    const language = (info.split(/\s+/)[0] || "").toLowerCase();
    const languageLabel = getLanguageDisplayLabel(language);
    const rawCode = String(token.content || "").replace(/\n$/, "");
    const highlighted = highlightCode(rawCode, language);
    const highlightedLines = highlighted.split(/\r?\n/);

    const numberedHtml = highlightedLines
      .map((line, lineIndex) => {
        const lineContent = line || "&nbsp;";
        return `<span class="markdown-code-line"><span class="markdown-code-line-number">${lineIndex + 1}</span><span class="markdown-code-line-content">${lineContent}</span></span>`;
      })
      .join("");

    return `<figure class="markdown-code-block"><figcaption class="markdown-code-header"><span class="markdown-code-lang">${escapeCodeHtml(languageLabel)}</span></figcaption><pre class="markdown-code-pre"><code class="hljs${language ? ` language-${escapeCodeHtml(language)}` : ""}">${numberedHtml}</code></pre></figure>`;
  };

  const defaultImage = markdown.renderer.rules.image
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
    const srcIndex = tokens[idx].attrIndex("src");
    let annotation = null;
    if (srcIndex >= 0) {
      const rawSrc = String(tokens[idx].attrs[srcIndex][1] || "").trim();
      if (rawSrc && !/^(https?:|data:|blob:)/i.test(rawSrc)) {
        const pathPart = rawSrc.split(/[?#]/)[0];
        annotation = getImageAnnotationForMarkdownAsset(path.join(sourceDir || getNotesRoot(), "__notely_export__.md"), pathPart);

        const normalizedSrc = safeDecode(pathPart.replace(/\\/g, "/"));
        const resolvedImagePath = resolveImageAssetPath(
          path.join(sourceDir || getNotesRoot(), "__notely_export__.md"),
          normalizedSrc
        );

        if (resolvedImagePath && fs.existsSync(resolvedImagePath)) {
          tokens[idx].attrs[srcIndex][1] = pathToFileURL(resolvedImagePath).href;
        }

        if (downsampleImages && resolvedImagePath && filePathWithin(getNotesRoot(), resolvedImagePath) && fs.existsSync(resolvedImagePath) && isRasterImagePath(resolvedImagePath)) {
          const thumbnailPath = ensureImageThumbnail(resolvedImagePath);
            if (thumbnailPath) {
              tokens[idx].attrs[srcIndex][1] = pathToFileURL(thumbnailPath).href;
            }
        }
      }
    }

    return renderImageHtmlWithAnnotation(defaultImage(tokens, idx, options, env, self), annotation);
  };

  const bodyHtml = markdown.render(markdownContent || "");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="${baseHref}" />
    <title>${escapeHtml(title)}</title>
    <style>
  ${buildPdfStyles({ compact: pdfQualityPreset === "compact" })}
    </style>
  </head>
  <body>
    <main class="markdown-body">
      ${bodyHtml}
    </main>
  </body>
</html>`;
}


function collectImageUsage(basePath) {
  const resolvedBasePath = path.resolve(String(basePath || ""));
  if (!filePathWithin(getNotesRoot(), resolvedBasePath)) {
    throw new Error("Invalid document path.");
  }

  const activeProject = getActiveProject();
  const scopeRoot = path.resolve(activeProject?.rootPath || getNotesRoot());
  const markdownFiles = walkFiles(scopeRoot, { excludeDirs: Array.from(WALK_EXCLUDE_DIRS) })
    .filter((item) => path.extname(item).toLowerCase() === ".md");
  const markdownMediaPattern = /(?:!\[[^\]]*\]|\[[^\]]*\])\((<[^>]+>|[^)]+)\)/g;
  const usageByAssetPath = {};

  for (const markdownFile of markdownFiles) {
    const content = fs.readFileSync(markdownFile, "utf8");
    const seenInDocument = new Set();
    let match;

    while ((match = markdownMediaPattern.exec(content))) {
      const rawPath = String(match[1] || "").trim();
      const assetPath = rawPath.startsWith("<") && rawPath.endsWith(">")
        ? rawPath.slice(1, -1)
        : rawPath;
      const resolvedAssetPath = resolveImageAssetPath(markdownFile, assetPath);
      if (!resolvedAssetPath) continue;

      const resolved = path.resolve(resolvedAssetPath);
      const baseDir = path.dirname(resolvedBasePath);
      const root = getNotesRoot();

      const localImagesDir = path.join(baseDir, "images").toLowerCase();
      const rootImagesDir = path.join(root, "images").toLowerCase();
      const rootMediaImagesDir = path.join(root, "media", "images").toLowerCase();
      const rootMediaDocsDir = path.join(root, "media", "docs").toLowerCase();

      const resolvedDir = path.dirname(resolved).toLowerCase();
      const fileName = path.basename(resolved);

      let relativeAssetPath = "";
      if (resolvedDir === localImagesDir) {
        relativeAssetPath = `./images/${fileName}`;
      } else if (resolvedDir === rootImagesDir) {
        relativeAssetPath = `/images/${fileName}`;
      } else if (resolvedDir === rootMediaImagesDir) {
        relativeAssetPath = `/media/images/${fileName}`;
      } else if (resolvedDir === rootMediaDocsDir) {
        relativeAssetPath = `/media/docs/${fileName}`;
      } else {
        relativeAssetPath = normalizeToPosix(path.relative(baseDir, resolved));
      }

      if (seenInDocument.has(relativeAssetPath)) continue;
      seenInDocument.add(relativeAssetPath);

      const entry = usageByAssetPath[relativeAssetPath] || {
        referenceCount: 0,
        documents: [],
      };
      entry.referenceCount += 1;
      entry.documents.push({
        filePath: markdownFile,
        fileName: path.basename(markdownFile),
        title: path.basename(markdownFile, ".md"),
      });
      usageByAssetPath[relativeAssetPath] = entry;
    }
  }

  return usageByAssetPath;
}

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
      if (/^\/(images|media)\//i.test(localPath)) {
        resolvedAssetPath = path.resolve(getNotesRoot(), `.${localPath}`);
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
    const isWorkspaceImageLink = /^[/\\]+(images|media)[/\\]/i.test(decodedAsset);
    const normalizedAsset = decodedAsset
      .replace(/^\.\//, "")
      .replace(/^[/\\]+(images|media)[/\\]/i, "$1/");
    const legacyDiagramMatch = normalizedAsset.match(/^(?:\.notes-app[\\/])?excali-diagrams[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/]diagram\.png$/i);
    const sluglessDiagramMatch = normalizedAsset.match(/^(?:\.notes-app[\\/])?excali-diagrams[\\/]([^\\/]+)[\\/]diagram\.png$/i);

    // For asset paths like "./images/foo.jpg", try the markdown file's own
    // sibling folder first (most common case for per-note images/), then fall
    // back to the workspace-level getNotesRoot()/images. For any other relative
    // path, resolve from the markdown file directory.
    const candidates = [];
    if (isWorkspaceImageLink) {
      candidates.push(path.resolve(getNotesRoot(), normalizedAsset));
    } else if (/^(images|media)[\\/]/i.test(normalizedAsset)) {
      candidates.push(path.resolve(baseDir, normalizedAsset));
      candidates.push(path.resolve(getNotesRoot(), normalizedAsset));
    } else {
      candidates.push(path.resolve(baseDir, normalizedAsset));
      if (sluglessDiagramMatch && !/^\.notes-app[\\/]/i.test(normalizedAsset)) {
        const [, diagramId] = sluglessDiagramMatch;
        candidates.push(path.resolve(baseDir, `.notes-app/excali-diagrams/${diagramId}/diagram.png`));
      }
      // Backward compatibility for legacy Excalidraw paths:
      // excali-diagrams/<doc-slug>/<diagram-id>/diagram.png
      // Current storage is: .notes-app/excali-diagrams/<diagram-id>/diagram.png
      if (legacyDiagramMatch) {
        const [, _legacyDocSlug, diagramId] = legacyDiagramMatch;
        candidates.push(path.resolve(baseDir, `.notes-app/excali-diagrams/${diagramId}/diagram.png`));
        candidates.push(path.resolve(baseDir, `excali-diagrams/${diagramId}/diagram.png`));
      }
    }

    resolvedAssetPath = candidates.find((candidate) => {
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    }) || candidates[0];
  }

  if (!filePathWithin(getNotesRoot(), resolvedAssetPath)) {
    return null;
  }

  return path.resolve(resolvedAssetPath);
}

function isRasterImagePath(filePath) {
  return RASTER_IMAGE_EXTENSIONS.has(path.extname(filePath || "").toLowerCase());
}

function getThumbnailDirForImage(imagePath) {
  if (!imagePath) return "";
  const relativeImagePath = path.relative(getNotesRoot(), path.resolve(imagePath));
  const relativeDir = path.dirname(relativeImagePath);
  return path.join(getAppDataDir(), THUMBNAIL_DIR_NAME, relativeDir);
}

function getThumbnailPathForImage(imagePath) {
  const stat = fs.statSync(imagePath);
  const ext = path.extname(imagePath);
  const baseName = path.basename(imagePath, ext).replace(/[<>:"/\\|?*]+/g, "-") || "image";
  const cacheKey = crypto
    .createHash("sha1")
    .update(`${path.resolve(imagePath)}:${stat.size}:${Math.round(stat.mtimeMs)}`)
    .digest("hex")
    .slice(0, 12);
  const thumbnailDir = getThumbnailDirForImage(imagePath);
  return path.join(thumbnailDir, `${baseName}-${cacheKey}.jpg`);
}

function ensureImageThumbnail(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath) || !isRasterImagePath(imagePath)) {
    return null;
  }

  const thumbnailPath = getThumbnailPathForImage(imagePath);
  if (fs.existsSync(thumbnailPath)) {
    return thumbnailPath;
  }

  // Clear any existing stale thumbnails for this image before generating a new one
  clearThumbnailCacheForImage(imagePath);

  ensureDir(path.dirname(thumbnailPath));
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) {
    return null;
  }

  const size = image.getSize();
  const width = Math.min(THUMBNAIL_MAX_WIDTH, Math.max(1, size.width || THUMBNAIL_MAX_WIDTH));
  const resized = image.resize({ width, quality: "good" });
  fs.writeFileSync(thumbnailPath, resized.toJPEG(THUMBNAIL_JPEG_QUALITY));
  return thumbnailPath;
}

function clearThumbnailCacheForImage(imagePath) {
  if (!imagePath) return;
  const thumbnailDir = getThumbnailDirForImage(imagePath);
  if (!thumbnailDir || !fs.existsSync(thumbnailDir)) return;

  const ext = path.extname(imagePath);
  const baseName = path.basename(imagePath, ext).replace(/[<>:"/\\|?*]+/g, "-") || "image";
  for (const entry of fs.readdirSync(thumbnailDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith(`${baseName}-`) && entry.name.toLowerCase().endsWith(".jpg")) {
      try {
        fs.unlinkSync(path.join(thumbnailDir, entry.name));
      } catch {
        // Cache cleanup is best-effort.
      }
    }
  }
}

function getImageAnnotationsPath() {
  return path.join(getAppDataDir(), "image-annotations.json");
}

function getImageAnnotationKey(resolvedAssetPath) {
  return normalizeToPosix(path.relative(getNotesRoot(), path.resolve(resolvedAssetPath))).toLowerCase();
}

function readImageAnnotations() {
  const annotationsPath = getImageAnnotationsPath();
  if (!fs.existsSync(annotationsPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(annotationsPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeImageAnnotations(annotations) {
  ensureDir(path.dirname(getImageAnnotationsPath()));
  fs.writeFileSync(getImageAnnotationsPath(), JSON.stringify(annotations || {}, null, 2), "utf8");
}

function normalizeImageAnnotation(annotation) {
  const text = String(annotation?.text || "").trim().slice(0, 80);
  return text ? { text, position: "top-left" } : null;
}

function getImageAnnotationForMarkdownAsset(basePath, assetPath) {
  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath) return null;
  const annotations = readImageAnnotations();
  return normalizeImageAnnotation(annotations[getImageAnnotationKey(resolvedAssetPath)]);
}

function renderImageHtmlWithAnnotation(imageHtml, annotation) {
  const normalized = normalizeImageAnnotation(annotation);
  if (!normalized) return imageHtml;
  return `<span class="notely-image-frame">${imageHtml}<span class="notely-image-annotation">${escapeHtml(normalized.text)}</span></span>`;
}

function removeImageReferencesForAsset(resolvedAssetPath, options = {}) {
  const normalizedTarget = path.resolve(resolvedAssetPath).toLowerCase();
  const normalizedBasePath = options.basePath
    ? path.resolve(options.basePath).toLowerCase()
    : "";
  const removeAllReferences = Boolean(options.removeAllReferences);
  const activeProject = getActiveProject();
  const scopeRoot = path.resolve(activeProject?.rootPath || getNotesRoot());
  const markdownFiles = walkFiles(scopeRoot, { excludeDirs: Array.from(WALK_EXCLUDE_DIRS) })
    .filter((item) => path.extname(item).toLowerCase() === ".md");
  const markdownImagePattern = /!\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g;
  let referencesFound = 0;
  let referencesRemoved = 0;
  let remainingReferences = 0;
  const documentsUpdated = [];

  for (const markdownFile of markdownFiles) {
    const content = fs.readFileSync(markdownFile, "utf8");
    let removedInDocument = 0;
    const normalizedMarkdownFile = path.resolve(markdownFile).toLowerCase();
    const nextContent = content.replace(markdownImagePattern, (match, rawPath) => {
      const assetPath = String(rawPath || "").trim();
      const unwrapped = assetPath.startsWith("<") && assetPath.endsWith(">")
        ? assetPath.slice(1, -1)
        : assetPath;
      const resolved = resolveImageAssetPath(markdownFile, unwrapped);
      if (!resolved || path.resolve(resolved).toLowerCase() !== normalizedTarget) {
        return match;
      }

      referencesFound += 1;
      const shouldRemoveReference = removeAllReferences || normalizedMarkdownFile === normalizedBasePath;
      if (!shouldRemoveReference) {
        remainingReferences += 1;
        return match;
      }

      removedInDocument += 1;
      referencesRemoved += 1;
      return "";
    });

    if (removedInDocument > 0 && nextContent !== content) {
      fs.writeFileSync(markdownFile, nextContent, "utf8");
      documentsUpdated.push({
        filePath: markdownFile,
        fileName: path.basename(markdownFile),
        title: path.basename(markdownFile, ".md"),
        removed: removedInDocument,
      });
    }
  }

  return { referencesFound, referencesRemoved, remainingReferences, documentsUpdated };
}


  function registerIpcHandlers(ipcMain) {
function registerTrustedHandler(channel, handler) {
  ipcMain.handle(channel, (event, payload) => {
    assertTrustedIpcSender(BrowserWindow, event, channel);
    return handler(event, payload);
  });
}

registerTrustedHandler("images:save", (_event, payload) => {
  const { fileName, base64Data } = payload || {};
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Invalid media filename.");
  }
  if (!base64Data || typeof base64Data !== "string" || !base64Data.includes(",")) {
    throw new Error("Invalid media payload.");
  }

  const safeFileName = path.basename(fileName).replace(/[<>:"/\\|?*]+/g, "-");
  const ext = path.extname(safeFileName).toLowerCase();
  const baseName = path.basename(safeFileName, ext) || "file";
  const finalExt = ext || ".bin";

  const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".ico", ".gif", ".svg"]);
  const isImage = imageExtensions.has(finalExt);
  
  const subFolder = isImage ? "images" : "docs";
  const mediaDir = path.join(getNotesRoot(), "media", subFolder);
  ensureDir(mediaDir);

  let finalName = `${baseName}${finalExt}`;
  let counter = 1;

  while (fs.existsSync(path.join(mediaDir, finalName))) {
    finalName = `${baseName}-${counter}${finalExt}`;
    counter++;
  }

  const mediaFilePath = path.join(mediaDir, finalName);
  const buffer = Buffer.from(base64Data.split(",")[1], "base64");
  if (!buffer.length) {
    throw new Error("File data is empty.");
  }
  fs.writeFileSync(mediaFilePath, buffer);
  
  if (isImage) {
    ensureImageThumbnail(mediaFilePath);
  }
  emitImageSyncFromDisk(mediaFilePath, { op: "create" });

  return `/media/${subFolder}/${finalName}`;
});

registerTrustedHandler("images:list", (_event, payload) => {
  const { basePath, includeAnnotations = false, includeOriginalStatus = false } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }

  const resolvedBasePath = path.resolve(basePath);
  if (!filePathWithin(getNotesRoot(), resolvedBasePath)) {
    throw new Error("Invalid document path.");
  }

  const readImagesIn = (dir) => {
    if (!fs.existsSync(dir)) return [];

    const files = [];
    const queue = [""];

    while (queue.length > 0) {
      const relativeDir = queue.shift();
      const absoluteDir = relativeDir ? path.join(dir, relativeDir) : dir;

      let entries;
      try {
        entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const relativePath = relativeDir
          ? path.posix.join(relativeDir.replace(/\\/g, "/"), entry.name)
          : entry.name;

        if (entry.isDirectory()) {
          if (entry.name === THUMBNAIL_DIR_NAME || entry.name === ORIGINAL_IMAGE_DIR_NAME) {
            continue;
          }
          queue.push(relativePath);
          continue;
        }

        if (!entry.isFile()) continue;
        files.push(relativePath.replace(/\\/g, "/"));
      }
    }

    return files;
  };

  const baseDir = path.dirname(path.resolve(basePath));
  const localImagesDir = path.join(baseDir, "images");
  const rootImagesDir = path.join(getNotesRoot(), "images");
  const mediaImagesDir = path.join(getNotesRoot(), "media", "images");
  const mediaDocsDir = path.join(getNotesRoot(), "media", "docs");

  const localNames = readImagesIn(localImagesDir);
  const seen = new Set(localNames.map((name) => name.toLowerCase()));
  
  const rootNames = readImagesIn(rootImagesDir).filter((name) => !seen.has(name.toLowerCase()));
  rootNames.forEach(name => seen.add(name.toLowerCase()));

  const mediaImagesNames = readImagesIn(mediaImagesDir).filter((name) => !seen.has(name.toLowerCase()));
  mediaImagesNames.forEach(name => seen.add(name.toLowerCase()));

  const mediaDocsNames = readImagesIn(mediaDocsDir).filter((name) => !seen.has(name.toLowerCase()));

  const paths = [
    ...localNames.map((name) => `./images/${name}`),
    ...rootNames.map((name) => `/images/${name}`),
    ...mediaImagesNames.map((name) => `/media/images/${name}`),
    ...mediaDocsNames.map((name) => `/media/docs/${name}`),
  ];

  if (!includeAnnotations && !includeOriginalStatus) return paths;

  const annotations = readImageAnnotations();
  return paths.map((assetPath) => {
    const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
    const annotation = resolvedAssetPath
      ? normalizeImageAnnotation(annotations[getImageAnnotationKey(resolvedAssetPath)])
      : null;
    const hasOriginal = resolvedAssetPath ? hasOriginalImageBackup(resolvedAssetPath) : false;
    return {
      path: assetPath,
      annotation: includeAnnotations ? annotation : null,
      hasOriginal: includeOriginalStatus ? hasOriginal : false,
    };
  });
});

registerTrustedHandler("images:usage", (_event, payload) => {
  const { basePath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }

  return collectImageUsage(basePath);
});

registerTrustedHandler("images:get-annotation", (_event, payload) => {
  const { basePath, assetPath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath) return null;
  const annotations = readImageAnnotations();
  return normalizeImageAnnotation(annotations[getImageAnnotationKey(resolvedAssetPath)]);
});

registerTrustedHandler("images:set-annotation", (_event, payload) => {
  const { basePath, assetPath, annotation } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath) {
    throw new Error("Image file not found.");
  }

  const annotations = readImageAnnotations();
  const key = getImageAnnotationKey(resolvedAssetPath);
  const normalized = normalizeImageAnnotation(annotation);
  if (normalized) {
    annotations[key] = normalized;
  } else {
    delete annotations[key];
  }
  writeImageAnnotations(annotations);
  return normalized;
});

registerTrustedHandler("images:get-original-status", (_event, payload) => {
  const { basePath, assetPath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    return { hasOriginal: false };
  }

  return {
    hasOriginal: hasOriginalImageBackup(resolvedAssetPath),
  };
});

registerTrustedHandler("images:restore-original", (_event, payload) => {
  const { basePath, assetPath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    throw new Error("Image file not found.");
  }

  const backupPath = getOriginalImageBackupPath(resolvedAssetPath);
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error("Original image backup not found.");
  }

  clearThumbnailCacheForImage(resolvedAssetPath);
  fs.copyFileSync(backupPath, resolvedAssetPath);
  ensureImageThumbnail(resolvedAssetPath);
  emitImageSyncFromDisk(resolvedAssetPath, { op: "update" });
  return { restored: true };
});

registerTrustedHandler("images:delete", (_event, payload) => {
  const { basePath, assetPath, removeAllReferences } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    return { deletedFile: false, referencesRemoved: 0, documentsUpdated: [] };
  }
  const existingBase64 = fs.readFileSync(resolvedAssetPath).toString("base64");
  const existingHash = hashContent(existingBase64);

  const referenceResult = removeImageReferencesForAsset(resolvedAssetPath, {
    basePath,
    removeAllReferences,
  });
  const shouldDeleteFile = referenceResult.remainingReferences === 0;
  let movedPath = null;
  if (shouldDeleteFile) {
    clearThumbnailCacheForImage(resolvedAssetPath);
    removeOriginalImageBackup(resolvedAssetPath);
    const annotations = readImageAnnotations();
    delete annotations[getImageAnnotationKey(resolvedAssetPath)];
    writeImageAnnotations(annotations);
    movedPath = moveFileToRemoved(resolvedAssetPath, "images");
    emitImageSyncFromDisk(resolvedAssetPath, { op: "delete", baseHash: existingHash });
  }

  return {
    deletedFile: Boolean(movedPath),
    movedPath,
    referencesFound: referenceResult.referencesFound,
    referencesRemoved: referenceResult.referencesRemoved,
    remainingReferences: referenceResult.remainingReferences,
    documentsUpdated: referenceResult.documentsUpdated,
    keptFileBecauseReferencedElsewhere: !shouldDeleteFile,
  };
});

registerTrustedHandler("images:replace", (_event, payload) => {
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

  ensureOriginalImageBackup(resolvedAssetPath);
  clearThumbnailCacheForImage(resolvedAssetPath);
  fs.writeFileSync(resolvedAssetPath, buffer);
  ensureImageThumbnail(resolvedAssetPath);
  emitImageSyncFromDisk(resolvedAssetPath, { op: "update" });
  return true;
});

registerTrustedHandler("images:rename", (_event, payload) => {
  const { basePath, assetPath, nextFileName } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }
  if (!nextFileName || typeof nextFileName !== "string") {
    throw new Error("Invalid image filename.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    throw new Error("Image file not found.");
  }

  const imagesDir = path.resolve(path.join(getNotesRoot(), "images"));
  if (!filePathWithin(imagesDir, resolvedAssetPath)) {
    throw new Error("Image path must be inside notes/images.");
  }

  const currentExt = path.extname(resolvedAssetPath);
  const rawName = path.basename(String(nextFileName || "").trim()).replace(/[<>:"/\\|?*]+/g, "-");
  const desiredExt = path.extname(rawName) || currentExt || ".png";
  const desiredBase = path.basename(rawName, path.extname(rawName)) || "image";
  const candidatePath = path.join(path.dirname(resolvedAssetPath), `${desiredBase}${desiredExt}`);

  const normalizedCurrent = path.resolve(resolvedAssetPath);
  const previousBase64 = fs.readFileSync(normalizedCurrent).toString("base64");
  const previousHash = hashContent(previousBase64);
  const normalizedCandidate = path.resolve(candidatePath);
  let finalPath = normalizedCandidate;
  if (normalizedCandidate.toLowerCase() !== normalizedCurrent.toLowerCase()) {
    finalPath = getUniquePath(normalizedCandidate);
    fs.renameSync(normalizedCurrent, finalPath);
  }

  const annotations = readImageAnnotations();
  const oldAnnotationKey = getImageAnnotationKey(normalizedCurrent);
  const nextAnnotation = annotations[oldAnnotationKey];
  if (nextAnnotation) {
    delete annotations[oldAnnotationKey];
    annotations[getImageAnnotationKey(finalPath)] = nextAnnotation;
    writeImageAnnotations(annotations);
  }

  moveOriginalImageBackup(normalizedCurrent, finalPath);
  if (normalizedCandidate.toLowerCase() !== normalizedCurrent.toLowerCase()) {
    emitImageSyncFromDisk(normalizedCurrent, { op: "delete", baseHash: previousHash });
    emitImageSyncFromDisk(finalPath, { op: "create" });
  }

  return `./images/${path.basename(finalPath)}`;
});

registerTrustedHandler("images:read", (_event, payload) => {
  const { basePath, assetPath, thumbnail } = payload || {};
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

  const fileToRead = thumbnail ? (ensureImageThumbnail(resolvedAssetPath) || resolvedAssetPath) : resolvedAssetPath;
  const ext = path.extname(fileToRead).toLowerCase();
  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogv": "video/ogg",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".rtf": "application/rtf",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".csv": "text/csv",
    ".json": "application/json",
    ".xml": "application/xml",
    ".zip": "application/zip",
    ".7z": "application/x-7z-compressed",
    ".rar": "application/vnd.rar"
  };
  const mimeType = mimeMap[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(fileToRead);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
});

registerTrustedHandler("images:open-default-app", async (_event, payload) => {
  const { basePath, assetPath } = payload || {};
  if (!basePath || typeof basePath !== "string") {
    throw new Error("Invalid base path.");
  }
  if (!assetPath || typeof assetPath !== "string") {
    throw new Error("Invalid asset path.");
  }

  const resolvedAssetPath = resolveImageAssetPath(basePath, assetPath);
  if (!resolvedAssetPath || !fs.existsSync(resolvedAssetPath)) {
    throw new Error("Media file not found.");
  }

  const openResult = await shell.openPath(resolvedAssetPath);
  if (openResult) {
    throw new Error(openResult);
  }
  return true;
});

  }

  return {
    buildPdfExportHtml,
    getImageAnnotationForMarkdownAsset,
    renderImageHtmlWithAnnotation,
    ensureImageThumbnail,
    registerIpcHandlers,
  };
}

module.exports = { createImageMedia };
