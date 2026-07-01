function createWebPreview(deps) {
  const {
    fs,
    path,
    http,
    spawn,
    process,
    filePathWithin,
    normalizeToPosix,
    encodePathForUrl,
    decodeUrlPath,
    contentTypeForFile,
    walkExcludeDirs,
    getNotesRoot,
    getActiveProject,
    getRenderers,
  } = deps;

  let webPreviewServer = null;
  let webPreviewPort = 0;
  const webPreviewContentOverrides = new Map();
  let webPreviewScopeRoot = "";
  let webPreviewScopeLabel = "Project";

  function getWebPreviewScopeRoot() {
    const activeProject = getActiveProject();
    if (activeProject?.rootPath) {
      return path.resolve(activeProject.rootPath);
    }
    return path.resolve(getNotesRoot());
  }

  function getWebPreviewScopeLabel() {
    const activeProject = getActiveProject();
    if (!activeProject) return "Project";
    return activeProject.isRoot ? "Root" : activeProject.name;
  }

  function resolveRelativeToNotesRoot(relPath, options = {}) {
    const allowExcludedDirs = options.allowExcludedDirs === true;
    const scopeRoot = webPreviewScopeRoot || getWebPreviewScopeRoot();
    const normalized = normalizeToPosix(String(relPath || "")).replace(/^\/+/, "");
    const resolved = path.resolve(scopeRoot, normalized);
    if (!filePathWithin(scopeRoot, resolved)) {
      return null;
    }

    const relNorm = normalizeToPosix(path.relative(scopeRoot, resolved));
    if (!allowExcludedDirs && relNorm.split("/").some((part) => walkExcludeDirs.has(part))) {
      return null;
    }

    return {
      normalized,
      resolved
    };
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
    const {
      renderRootWebsitePage,
      renderMarkdownWebsitePage,
      renderPdfNotePage,
      buildSearchIndex,
      renderSearchPage
    } = getRenderers() || {};

    if (
      typeof renderRootWebsitePage !== "function"
      || typeof renderMarkdownWebsitePage !== "function"
      || typeof renderPdfNotePage !== "function"
      || typeof buildSearchIndex !== "function"
      || typeof renderSearchPage !== "function"
    ) {
      writeTextResponse(res, "Website preview renderer unavailable.", 500);
      return;
    }

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
      const section = requestUrl.searchParams.get("section") === "raw" ? "raw" : "cleansed";
      const resolved = resolveRelativeToNotesRoot(relMdPath);
      if (!resolved || path.extname(resolved.resolved).toLowerCase() !== ".md" || !fs.existsSync(resolved.resolved)) {
        writeTextResponse(res, "Note not found.", 404);
        return;
      }

      const rawContent = webPreviewContentOverrides.get(resolved.resolved)
        || fs.readFileSync(resolved.resolved, "utf8");
      writeHtmlResponse(res, renderMarkdownWebsitePage(resolved.normalized, rawContent, { section }));
      return;
    }

    if (pathname.startsWith("/pdf/")) {
      const relMdPath = normalizeToPosix(decodeUrlPath(pathname, "/pdf/"));
      const resolved = resolveRelativeToNotesRoot(relMdPath);
      const section = requestUrl.searchParams.get("section") === "raw" ? "raw" : "cleansed";
      if (!resolved || path.extname(resolved.resolved).toLowerCase() !== ".md" || !fs.existsSync(resolved.resolved)) {
        writeTextResponse(res, "Note not found.", 404);
        return;
      }

      const markdownContent = webPreviewContentOverrides.get(resolved.resolved)
        || fs.readFileSync(resolved.resolved, "utf8");
      writeHtmlResponse(res, renderPdfNotePage(resolved.normalized, markdownContent, { section }));
      return;
    }

    if (pathname.startsWith("/raw/")) {
      const relPath = normalizeToPosix(decodeUrlPath(pathname, "/raw/"));
      const resolved = resolveRelativeToNotesRoot(relPath, { allowExcludedDirs: true });
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

  async function prepareDocumentPreview(filePath, content) {
    const resolved = path.resolve(String(filePath || ""));
    const scopeRoot = getWebPreviewScopeRoot();
    const isValidMarkdownPath =
      filePathWithin(getNotesRoot(), resolved)
      && path.extname(resolved).toLowerCase() === ".md"
      && fs.existsSync(resolved)
      && filePathWithin(scopeRoot, resolved);

    if (!isValidMarkdownPath) {
      throw new Error("Invalid document path.");
    }

    if (typeof content === "string") {
      webPreviewContentOverrides.set(resolved, content);
    } else if (content && typeof content === "object") {
      const header = typeof content.header === "string" ? content.header.trim() : "";
      const rawNotes = typeof content.rawNotes === "string" ? content.rawNotes.trim() : "";
      const cleansed = typeof content.cleansed === "string" ? content.cleansed.trim() : "";
      const overrideContent = [
        header,
        "# RawNotes",
        rawNotes,
        "# Cleansed",
        cleansed
      ].join("\n\n").trim();

      webPreviewContentOverrides.set(resolved, overrideContent);
    }

    webPreviewScopeRoot = scopeRoot;
    webPreviewScopeLabel = getWebPreviewScopeLabel();

    const baseUrl = await ensureWebPreviewServer();
    return {
      resolved,
      previewUrl: `${baseUrl}/view/${encodePathForUrl(normalizeToPosix(path.relative(webPreviewScopeRoot, resolved)))}?section=cleansed`
    };
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

  function dispose() {
    if (webPreviewServer) {
      webPreviewServer.close();
      webPreviewServer = null;
      webPreviewPort = 0;
    }

    webPreviewContentOverrides.clear();
    webPreviewScopeRoot = "";
    webPreviewScopeLabel = "Project";
  }

  return {
    ensureWebPreviewServer,
    prepareDocumentPreview,
    tryOpenInChrome,
    dispose,
    getScopeRoot: () => webPreviewScopeRoot || getWebPreviewScopeRoot(),
    getScopeLabel: () => webPreviewScopeLabel,
  };
}

module.exports = { createWebPreview };
