

class WorkspaceMetadata {
  constructor(deps) {
    this.fs = deps.fs;
    this.path = deps.path;
    this.getAppDataDir = deps.getAppDataDir;
    this.getNotesRoot = deps.getNotesRoot;
    this.filePathWithin = deps.filePathWithin;
    this.normalizeToPosix = deps.normalizeToPosix;

    // We'll read state lazily to ensure appDataDir is resolved.
    this.state = null;
  }

  get jsonPath() {
    const appDataDir = this.getAppDataDir();
    return appDataDir ? this.path.join(appDataDir, "metadata.json") : null;
  }

  _load() {
    if (this.state) return;
    const p = this.jsonPath;
    if (!p) return;
    try {
      if (this.fs.existsSync(p)) {
        this.state = JSON.parse(this.fs.readFileSync(p, "utf8"));
      } else {
        this.state = { items: {} };
      }
    } catch {
      this.state = { items: {} };
    }
  }

  _save() {
    if (!this.state) return;
    const p = this.jsonPath;
    if (!p) return;
    try {
      this.fs.writeFileSync(p, JSON.stringify(this.state, null, 2), "utf8");
    } catch (e) {
      console.error("[WorkspaceMetadata] Save error:", e);
    }
  }

  _getRelativePath(absolutePath) {
    const root = this.getNotesRoot();
    if (!root) return null;
    const resolved = this.path.resolve(String(absolutePath || ""));
    if (!this.filePathWithin(root, resolved)) return null;
    
    // Use posix-style relative path as key for consistency
    const relative = this.path.relative(root, resolved);
    return this.normalizeToPosix(relative);
  }

  getMetadata(absolutePath) {
    this._load();
    const relPath = this._getRelativePath(absolutePath);
    if (!relPath) return {};
    return this.state.items[relPath] || {};
  }

  getAllMetadata() {
    this._load();
    return this.state?.items || {};
  }

  updateMetadata(absolutePath, { icon, color }) {
    this._load();
    const relPath = this._getRelativePath(absolutePath);
    if (!relPath) return false;

    if (!this.state.items[relPath]) {
      this.state.items[relPath] = {};
    }

    if (icon !== undefined) this.state.items[relPath].icon = icon;
    if (color !== undefined) this.state.items[relPath].color = color;

    // Cleanup if both are null/empty
    if (!this.state.items[relPath].icon && !this.state.items[relPath].color) {
      delete this.state.items[relPath];
    }

    this._save();
    return true;
  }
}

function createWorkspaceMetadata(deps) {
  return new WorkspaceMetadata(deps);
}

module.exports = { createWorkspaceMetadata };
