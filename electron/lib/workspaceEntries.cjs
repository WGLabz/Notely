const DEFAULT_WALK_EXCLUDE_DIRS = new Set([
  ".notes-app", ".versions", "node_modules", ".git", ".svn", ".hg",
  "dist", "build", ".artifacts", ".cache", "__pycache__", "removed",
  ".venv", "venv", ".next", ".nuxt", "coverage"
]);

function createWorkspaceEntries(deps) {
  const {
    fs,
    path,
    ensureDir,
    parseDocument,
    walkExcludeDirs = DEFAULT_WALK_EXCLUDE_DIRS,
  } = deps;

  function shouldHideDirectory(name) {
    const lowerName = String(name || "").toLowerCase();
    return lowerName.startsWith(".") || lowerName === "images" || lowerName === "removed";
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

  function extractPreviewImagesFromMarkdown(content, sourceFilePath, limit = 4) {
    const markdownImagePattern = /!\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g;
    const images = [];
    const seen = new Set();
    let match;

    while (images.length < limit && (match = markdownImagePattern.exec(String(content || "")))) {
      const rawPath = String(match[1] || "").trim();
      const assetPath = rawPath.startsWith("<") && rawPath.endsWith(">")
        ? rawPath.slice(1, -1)
        : rawPath;
      if (!assetPath || /^(https?:|data:|blob:)/i.test(assetPath)) continue;

      const key = `${sourceFilePath}:${assetPath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      images.push({
        path: assetPath,
        sourceFilePath,
        name: path.basename(assetPath.split(/[?#]/)[0] || assetPath)
      });
    }

    return images;
  }

  function collectFolderPreviewImages(folderPath, limit = 4) {
    const images = [];
    const markdownFiles = walkFiles(folderPath, { excludeDirs: Array.from(walkExcludeDirs) })
      .filter((item) => path.extname(item).toLowerCase() === ".md");

    for (const markdownFile of markdownFiles) {
      if (images.length >= limit) break;
      try {
        const content = fs.readFileSync(markdownFile, "utf8");
        images.push(...extractPreviewImagesFromMarkdown(content, markdownFile, limit - images.length));
      } catch {
        // Folder thumbnails are best-effort.
      }
    }

    return images.slice(0, limit);
  }

  function listDirectoryEntries(rootDir, options = {}) {
    ensureDir(rootDir);
    const { includeProjectSlug = false } = options;

    return fs.readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => {
        if (entry.isDirectory()) {
          return !shouldHideDirectory(entry.name);
        }
        return entry.isFile() && entry.name.toLowerCase().endsWith(".md");
      })
      .map((entry) => {
        const entryPath = path.join(rootDir, entry.name);
        const stat = fs.statSync(entryPath);

        if (entry.isDirectory()) {
          return {
            entryType: "folder",
            slug: includeProjectSlug ? entry.name : undefined,
            filePath: entryPath,
            title: entry.name,
            metadata: {},
            updatedAt: stat.mtime.toISOString(),
            previewImages: collectFolderPreviewImages(entryPath)
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
          previewImages: extractPreviewImagesFromMarkdown(content, entryPath),
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

  function listRootEntries(rootDir) {
    return listDirectoryEntries(rootDir, { includeProjectSlug: true });
  }

  return {
    WALK_EXCLUDE_DIRS: walkExcludeDirs,
    shouldHideDirectory,
    walkFiles,
    listDirectoryEntries,
    listRootEntries,
  };
}

module.exports = { createWorkspaceEntries, DEFAULT_WALK_EXCLUDE_DIRS };
