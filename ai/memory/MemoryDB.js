const fs = require('fs');
const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('MemoryDB');

class MemoryDB {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.dbPath = path.join(workspaceRoot, '.notes-app', 'ai-memory.db');
    this.db = null;
  }

  initialize() {
    try {
      const parentDir = path.dirname(this.dbPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(this.dbPath);

      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');
      this.db.exec('PRAGMA foreign_keys = ON');

      this._createTables();
      log.info(`MemoryDB initialized at: ${this.dbPath}`);
      return true;
    } catch (err) {
      log.error('Failed to initialize MemoryDB', err);
      throw err;
    }
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        persona TEXT DEFAULT 'default',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS candidate_knowledge (
        id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        entity TEXT NOT NULL,
        relation TEXT NOT NULL,
        target TEXT NOT NULL,
        extracted_at TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_ck_status ON candidate_knowledge(status);
    `);

    // Migration: add metadata column if it doesn't exist yet (existing DBs)
    try {
      this.db.exec('ALTER TABLE messages ADD COLUMN metadata TEXT DEFAULT NULL');
    } catch {
      // Column already exists — safe to ignore
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = { MemoryDB };
