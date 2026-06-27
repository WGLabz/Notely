class MetadataStore {
  constructor(deps) {
    this.fs = deps.fs;
    this.path = deps.path;
    this.ensureDir = deps.ensureDir;
    this.getAppDataDir = deps.getAppDataDir;
    this.getNotesRoot = deps.getNotesRoot;
    this.filePathWithin = deps.filePathWithin;
    this.pruneVersionHistory = deps.pruneVersionHistory;

    const appDataDir = this.getAppDataDir();
    this.ensureDir(appDataDir);
    this.jsonPath = this.path.join(appDataDir, "app-state.json");
    this.dbPath = this.path.join(appDataDir, "app.sqlite");
    this.db = null;

    try {
      const { DatabaseSync } = require("node:sqlite");
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS history_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
          version_path TEXT NOT NULL,
          file_hash TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    } catch {
      this.state = this.fs.existsSync(this.jsonPath)
        ? JSON.parse(this.fs.readFileSync(this.jsonPath, "utf8"))
        : { history: [] };
    }
  }

  addHistory(entry) {
    if (this.db) {
      this.db.prepare(`
        INSERT INTO history_entries (file_path, version_path, file_hash, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(entry.filePath, entry.versionPath, entry.fileHash, entry.reason, entry.createdAt);
      this.pruneVersionHistory(entry.filePath);
      return;
    }

    this.state.history.push(entry);
    this.fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
    this.pruneVersionHistory(entry.filePath);
  }

  getHistory(filePath) {
    if (this.db) {
      return this.db.prepare(`
        SELECT version_path AS versionPath, file_hash AS fileHash, reason, created_at AS createdAt
        FROM history_entries
        WHERE file_path = ?
        ORDER BY created_at DESC
      `).all(filePath);
    }

    return this.state.history
      .filter((entry) => entry.filePath === filePath)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getWorkspaceActivity(workspaceRoot, limit = 200) {
    const notesRoot = this.getNotesRoot();
    const resolvedRoot = this.path.resolve(String(workspaceRoot || notesRoot));
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));

    if (this.db) {
      const prefix = `${resolvedRoot.toLowerCase()}%`;
      return this.db.prepare(`
        SELECT file_path AS filePath, version_path AS versionPath, file_hash AS fileHash, reason, created_at AS createdAt
        FROM history_entries
        WHERE lower(file_path) LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(prefix, safeLimit);
    }

    return this.state.history
      .filter((entry) => this.filePathWithin(resolvedRoot, entry.filePath))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit)
      .map((entry) => ({
        filePath: entry.filePath,
        versionPath: entry.versionPath,
        fileHash: entry.fileHash,
        reason: entry.reason,
        createdAt: entry.createdAt
      }));
  }

  deleteHistoryVersion(filePath, versionPath) {
    if (this.db) {
      this.db.prepare(`
        DELETE FROM history_entries
        WHERE file_path = ? AND version_path = ?
      `).run(filePath, versionPath);
      return;
    }

    this.state.history = this.state.history.filter(
      (entry) => !(entry.filePath === filePath && entry.versionPath === versionPath)
    );
    this.fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
  }

  renameHistoryFilePath(previousFilePath, nextFilePath) {
    if (this.db) {
      this.db.prepare(`
        UPDATE history_entries
        SET file_path = ?
        WHERE file_path = ?
      `).run(nextFilePath, previousFilePath);
      return;
    }

    this.state.history = this.state.history.map((entry) => (
      entry.filePath === previousFilePath
        ? { ...entry, filePath: nextFilePath }
        : entry
    ));
    this.fs.writeFileSync(this.jsonPath, JSON.stringify(this.state, null, 2));
  }
}

function createMetadataStore(deps) {
  return new MetadataStore(deps);
}

module.exports = { createMetadataStore };
