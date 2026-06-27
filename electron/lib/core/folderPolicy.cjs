const RESERVED_WORKSPACE_DIRS = new Set(["images", "removed"]);

function shouldHideDirectory(name) {
  const lowerName = String(name || "").toLowerCase();
  return lowerName.startsWith(".") || RESERVED_WORKSPACE_DIRS.has(lowerName);
}

module.exports = {
  RESERVED_WORKSPACE_DIRS,
  shouldHideDirectory,
};
