function isValidSyncRelativePath(normalizeToPosix, relativePath) {
  const normalized = normalizeToPosix(String(relativePath || "").trim());
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    return false;
  }
  return normalized.toLowerCase().endsWith(".md");
}

function createSyncConflictCopy(deps, filePath, peerId, incomingContent) {
  const { path, slugify, nowStamp, getUniquePath, fs } = deps;

  const ext = path.extname(filePath) || ".md";
  const baseName = path.basename(filePath, ext);
  const conflictName = `${baseName}.sync-conflict-${slugify(peerId || "peer")}-${nowStamp()}${ext}`;
  const conflictPath = getUniquePath(path.join(path.dirname(filePath), conflictName));
  fs.writeFileSync(conflictPath, incomingContent, "utf8");
  return conflictPath;
}

function tryMergeSection(baseValue, localValue, remoteValue) {
  if (localValue === remoteValue) return localValue;
  if (localValue === baseValue) return remoteValue;
  if (remoteValue === baseValue) return localValue;
  return null;
}

function tryMergeDocumentContent(deps, { filePath, baseContent, localContent, remoteContent }) {
  const { parseDocument, buildDocumentContent } = deps;

  if (typeof baseContent !== "string") {
    return null;
  }

  const baseDoc = parseDocument(baseContent, filePath);
  const localDoc = parseDocument(localContent, filePath);
  const remoteDoc = parseDocument(remoteContent, filePath);

  const mergedHeader = tryMergeSection(baseDoc.header, localDoc.header, remoteDoc.header);
  const mergedRaw = tryMergeSection(baseDoc.rawNotes, localDoc.rawNotes, remoteDoc.rawNotes);
  const mergedCleansed = tryMergeSection(baseDoc.cleansed, localDoc.cleansed, remoteDoc.cleansed);

  if (mergedHeader === null || mergedRaw === null || mergedCleansed === null) {
    return null;
  }

  return buildDocumentContent({
    header: mergedHeader,
    rawNotes: mergedRaw,
    cleansed: mergedCleansed
  });
}

function buildNoteDelta(parseDocument, { filePath, previousContent, nextContent }) {
  const previousDoc = parseDocument(String(previousContent || ""), filePath);
  const nextDoc = parseDocument(String(nextContent || ""), filePath);
  const delta = {};

  if (previousDoc.header !== nextDoc.header) {
    delta.header = nextDoc.header;
  }
  if (previousDoc.rawNotes !== nextDoc.rawNotes) {
    delta.rawNotes = nextDoc.rawNotes;
  }
  if (previousDoc.cleansed !== nextDoc.cleansed) {
    delta.cleansed = nextDoc.cleansed;
  }

  return delta;
}

function applyNoteDelta(deps, { filePath, baseContent, delta }) {
  const { parseDocument, buildDocumentContent } = deps;

  const baseDoc = parseDocument(String(baseContent || ""), filePath);
  return buildDocumentContent({
    header: typeof delta?.header === "string" ? delta.header : baseDoc.header,
    rawNotes: typeof delta?.rawNotes === "string" ? delta.rawNotes : baseDoc.rawNotes,
    cleansed: typeof delta?.cleansed === "string" ? delta.cleansed : baseDoc.cleansed
  });
}

module.exports = {
  isValidSyncRelativePath,
  createSyncConflictCopy,
  tryMergeDocumentContent,
  buildNoteDelta,
  applyNoteDelta,
};
