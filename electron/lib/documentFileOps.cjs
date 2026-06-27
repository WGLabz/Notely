function createDocumentFileOps(deps) {
  const {
    fs,
    path,
    slugify,
    ensureDir,
    filePathWithin,
    parseDocument,
    buildDocumentContent,
    moveFileToRemoved,
    getNotesRoot,
    getMetadataStore,
    shouldHideDirectory,
  } = deps;

  function createDocumentInProject(rootDir, payload) {
    const requestedTitle = String(payload?.title || "").trim();
    if (!requestedTitle) {
      throw new Error("Note title is required.");
    }

    const resolvedRoot = path.resolve(rootDir);
    const requestedParentPath = String(payload?.parentPath || "").trim();
    const targetDir = path.resolve(requestedParentPath || resolvedRoot);
    if (!filePathWithin(resolvedRoot, targetDir)) {
      throw new Error("Invalid target folder path.");
    }

    ensureDir(targetDir);

    const safeBaseName = slugify(requestedTitle);
    let fileName = `${safeBaseName}.md`;
    let filePath = path.join(targetDir, fileName);
    let counter = 2;

    while (fs.existsSync(filePath)) {
      fileName = `${safeBaseName}-${counter}.md`;
      filePath = path.join(targetDir, fileName);
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

  function createFolderInProject(rootDir, payload) {
    const folderName = String(payload?.name || "").trim();
    if (!folderName) {
      throw new Error("Folder name is required.");
    }
    if (folderName === "." || folderName === "..") {
      throw new Error("Invalid folder name.");
    }
    if (/[/\\]/.test(folderName)) {
      throw new Error("Use a single folder name without slashes.");
    }
    if (folderName.startsWith(".")) {
      throw new Error("Hidden folder names are not allowed.");
    }
    if (shouldHideDirectory(folderName)) {
      throw new Error("This folder name is reserved.");
    }

    const requestedParentPath = String(payload?.parentPath || "").trim();
    const resolvedRoot = path.resolve(rootDir);
    const parentPath = path.resolve(requestedParentPath || resolvedRoot);
    if (!filePathWithin(resolvedRoot, parentPath)) {
      throw new Error("Invalid parent folder path.");
    }

    ensureDir(parentPath);

    const nextFolderPath = path.join(parentPath, folderName);
    if (!filePathWithin(resolvedRoot, nextFolderPath)) {
      throw new Error("Invalid folder path.");
    }
    if (fs.existsSync(nextFolderPath)) {
      throw new Error("A file or folder with that name already exists.");
    }

    fs.mkdirSync(nextFolderPath, { recursive: false });
    const stat = fs.statSync(nextFolderPath);

    return {
      entryType: "folder",
      filePath: nextFolderPath,
      title: folderName,
      metadata: {},
      updatedAt: stat.mtime.toISOString(),
      previewImages: []
    };
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
    const notesRoot = getNotesRoot();
    if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error("Document file not found.");
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
      const metadataStore = getMetadataStore();
      metadataStore?.renameHistoryFilePath(resolved, nextResolved);
    }

    fs.writeFileSync(nextResolved, nextContent, "utf8");
    return parseDocument(nextContent, nextResolved);
  }

  function deleteDocumentFile(filePath) {
    const resolved = path.resolve(String(filePath || ""));
    const notesRoot = getNotesRoot();
    if (!filePathWithin(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
      throw new Error("Invalid document path.");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error("Document file does not exist.");
    }

    const movedPath = moveFileToRemoved(resolved, "notes");
    const metadataStore = getMetadataStore();
    metadataStore?.renameHistoryFilePath(resolved, movedPath);
    return { movedPath };
  }

  return {
    createDocumentInProject,
    createFolderInProject,
    renameDocumentFile,
    deleteDocumentFile,
  };
}

module.exports = { createDocumentFileOps };
