export function normalizeImageAssetKey(value) {
  let next = String(value || "").trim().replace(/\\/g, "/");
  for (let index = 0; index < 5; index += 1) {
    try {
      const decoded = decodeURIComponent(next);
      if (decoded === next) break;
      next = decoded;
    } catch {
      break;
    }
  }
  return next.replace(/^\.\//, "").toLowerCase();
}

export function removeImageReferenceFromMarkdown(source, assetPath) {
  const target = normalizeImageAssetKey(assetPath);
  if (!target) return source;

  return String(source || "").replace(/!\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g, (match, rawPath) => {
    const unwrapped = String(rawPath || "").trim();
    const current = unwrapped.startsWith("<") && unwrapped.endsWith(">")
      ? unwrapped.slice(1, -1)
      : unwrapped;
    return normalizeImageAssetKey(current) === target ? "" : match;
  });
}

export function toComparableAssetPath(value, _basePath = "") {
  if (!value) return "";
  const cleaned = String(value)
    .trim()
    .replace(/^<|>$/g, "")
    .split(/\s+/)[0]
    .split(/[?#]/)[0]
    .replace(/^(?:https?|file|app|atom):\/\/(?:[^/]+\/)?/i, "");

  return normalizeImageAssetKey(cleaned);
}

export function replaceFirstImageReferenceWithDiagram(content, targetAssetPath, replacementMarkdown, basePath = "") {
  const source = String(content || "");
  const targetComparable = toComparableAssetPath(targetAssetPath, basePath);
  
  const safeDecode = (str) => {
    if (!str) return "";
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  };

  const getCleanFilename = (p) => {
    if (!p) return "";
    const raw = p.split(/[\\/]/).pop() || "";
    return safeDecode(raw).toLowerCase().split(/[?#]/)[0].trim();
  };

  const targetFilename = getCleanFilename(targetAssetPath);

  const isMatch = (pathA, pathB) => {
    if (!pathA || !pathB) return false;
    const normA = safeDecode(pathA).toLowerCase();
    const normB = safeDecode(pathB).toLowerCase();
    if (normA === normB) return true;
    if (normA.endsWith("/" + normB) || normB.endsWith("/" + normA)) return true;
    const nameA = normA.split("/").pop();
    const nameB = normB.split("/").pop();
    return Boolean(nameA && nameB && nameA === nameB && (normA.includes(normB) || normB.includes(normA)));
  };

  const imageRegex = /!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)(\s*\{[^}]*\})?/g;
  let replaced = false;
  let originalAlt = "";

  // Tier 1 & 2: Match by relative path comparison or filename match
  let nextContent = source.replace(imageRegex, (match, alt, rawPath) => {
    if (replaced) return match;
    const cleanedPath = String(rawPath || "").trim().replace(/^<|>$/g, "").split(/\s+/)[0];
    const comparablePath = toComparableAssetPath(cleanedPath, basePath);
    const cleanedFilename = getCleanFilename(cleanedPath);

    const pathMatches = targetComparable && isMatch(comparablePath, targetComparable);
    const filenameMatches = targetFilename && cleanedFilename && targetFilename === cleanedFilename;

    if (!pathMatches && !filenameMatches) return match;

    replaced = true;
    originalAlt = String(alt || "").trim();
    return replacementMarkdown;
  });

  // Fallback Tier 2: Match HTML <img> element matching target asset path or filename
  if (!replaced) {
    const htmlImgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/gi;
    nextContent = source.replace(htmlImgRegex, (match, srcAttr) => {
      if (replaced) return match;
      const comparablePath = toComparableAssetPath(srcAttr, basePath);
      const srcFilename = getCleanFilename(srcAttr);

      const pathMatches = targetComparable && isMatch(comparablePath, targetComparable);
      const filenameMatches = targetFilename && srcFilename && targetFilename === srcFilename;

      if (!pathMatches && !filenameMatches) return match;
      replaced = true;
      return replacementMarkdown;
    });
  }

  return { nextContent, replaced, originalAlt };
}