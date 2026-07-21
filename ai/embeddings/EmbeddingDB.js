const fs = require('fs');
const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('EmbeddingDB');

class EmbeddingDB {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.dbPath = path.join(workspaceRoot, '.notes-app', 'ai-embeddings.db');
    this.db = null;
    this.vectorCache = [];
  }

  initialize() {
    try {
      const parentDir = path.dirname(this.dbPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(this.dbPath);

      // WAL mode for fast concurrency
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');

      this.createTables();
      this.preloadCache();
      log.info(`EmbeddingDB initialized successfully at: ${this.dbPath}`);
      return true;
    } catch (err) {
      log.error(`Failed to initialize EmbeddingDB at: ${this.dbPath}`, err);
      throw err;
    }
  }

  preloadCache() {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare('SELECT id, note_path, embedding, embedding_model FROM chunks WHERE embedding IS NOT NULL');
      const rows = stmt.all();
      this.vectorCache = rows.map(r => {
        const buf = r.embedding instanceof Buffer ? r.embedding : Buffer.from(r.embedding);
        const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        return {
          id: r.id,
          note_path: r.note_path,
          embedding: Array.from(arr),
          embedding_model: r.embedding_model
        };
      });
      log.info(`Preloaded vector cache with ${this.vectorCache.length} vectors`);
    } catch (err) {
      log.error('Failed to preload vector cache', err);
    }
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        note_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        chunk_type TEXT,
        start_line INTEGER,
        end_line INTEGER,
        embedding BLOB,
        embedding_model TEXT,
        indexed_at TEXT,
        UNIQUE(note_path, chunk_index)
      );

      CREATE TABLE IF NOT EXISTS note_hashes (
        note_path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        chunk_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS indexing_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_path TEXT NOT NULL UNIQUE,
        priority INTEGER DEFAULT 0,
        queued_at TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        retries INTEGER DEFAULT 0,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS indexing_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_path TEXT,
        event TEXT,
        detail TEXT,
        ts TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_note ON chunks(note_path);
      CREATE INDEX IF NOT EXISTS idx_queue_status ON indexing_queue(status, priority DESC);
    `);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      log.info('EmbeddingDB closed');
    }
  }

  // --- Operations ---
  
  getNoteHash(notePath) {
    const stmt = this.db.prepare('SELECT content_hash FROM note_hashes WHERE note_path = ?');
    const row = stmt.get(notePath);
    return row ? row.content_hash : null;
  }

  upsertNoteHash(notePath, contentHash, chunkCount) {
    const stmt = this.db.prepare(`
      INSERT INTO note_hashes (note_path, content_hash, indexed_at, chunk_count)
      VALUES (?, ?, datetime('now'), ?)
      ON CONFLICT(note_path) DO UPDATE SET
        content_hash = excluded.content_hash,
        indexed_at = excluded.indexed_at,
        chunk_count = excluded.chunk_count
    `);
    stmt.run(notePath, contentHash, chunkCount);
  }

  deleteNoteData(notePath) {
    const deleteChunks = this.db.prepare('DELETE FROM chunks WHERE note_path = ?');
    const deleteHash = this.db.prepare('DELETE FROM note_hashes WHERE note_path = ?');
    
    this.db.exec('BEGIN');
    try {
      deleteChunks.run(notePath);
      deleteHash.run(notePath);
      this.db.exec('COMMIT');
      this.vectorCache = this.vectorCache.filter(v => v.note_path !== notePath);
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  upsertChunk(chunk) {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, note_path, chunk_index, content, content_hash, chunk_type, start_line, end_line, embedding, embedding_model, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        content_hash = excluded.content_hash,
        chunk_type = excluded.chunk_type,
        start_line = excluded.start_line,
        end_line = excluded.end_line,
        embedding = excluded.embedding,
        embedding_model = excluded.embedding_model,
        indexed_at = excluded.indexed_at
    `);
    stmt.run(
      chunk.id,
      chunk.note_path,
      chunk.chunk_index,
      chunk.content,
      chunk.content_hash,
      chunk.chunk_type || 'paragraph',
      chunk.start_line || null,
      chunk.end_line || null,
      chunk.embedding ? Buffer.from(new Float32Array(chunk.embedding).buffer) : null,
      chunk.embedding_model || 'local',
    );

    if (chunk.embedding) {
      const floatArr = Array.isArray(chunk.embedding) ? chunk.embedding : Array.from(chunk.embedding);
      const existingIdx = this.vectorCache.findIndex(v => v.id === chunk.id);
      const cachedItem = {
        id: chunk.id,
        note_path: chunk.note_path,
        embedding: floatArr,
        embedding_model: chunk.embedding_model || 'local'
      };
      if (existingIdx !== -1) {
        this.vectorCache[existingIdx] = cachedItem;
      } else {
        this.vectorCache.push(cachedItem);
      }
    }
  }

  getChunks(notePath) {
    const stmt = this.db.prepare('SELECT * FROM chunks WHERE note_path = ? ORDER BY chunk_index ASC');
    const rows = stmt.all(notePath);
    return rows.map(r => ({
      ...r,
      embedding: r.embedding ? Array.from(new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)) : null
    }));
  }

  getAllChunks(searchQuery = '', limit = 100, offset = 0) {
    let sql = 'SELECT id, note_path, chunk_index, chunk_type, content, start_line, end_line, indexed_at FROM chunks';
    const params = [];
    if (searchQuery) {
      sql += ' WHERE content LIKE ?';
      params.push(`%${searchQuery}%`);
    }
    sql += ' ORDER BY indexed_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  getChunkCount() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM chunks');
    return stmt.get().count;
  }

  getIndexedNotesCount() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM note_hashes');
    return stmt.get().count;
  }

  // --- Queue ---

  enqueue(notePath, priority = 0) {
    const stmt = this.db.prepare(`
      INSERT INTO indexing_queue (note_path, priority, queued_at, status)
      VALUES (?, ?, datetime('now'), 'pending')
      ON CONFLICT(note_path) DO UPDATE SET
        priority = MAX(priority, excluded.priority),
        status = 'pending',
        queued_at = datetime('now')
    `);
    stmt.run(notePath, priority);
  }

  dequeue() {
    const nextJob = this.db.prepare(`
      SELECT * FROM indexing_queue 
      WHERE status = 'pending' 
      ORDER BY priority DESC, queued_at ASC 
      LIMIT 1
    `).get();

    if (!nextJob) return null;

    this.db.prepare("UPDATE indexing_queue SET status = 'processing' WHERE id = ?").run(nextJob.id);
    return nextJob;
  }

  updateJobStatus(id, status, error = null) {
    const stmt = this.db.prepare(`
      UPDATE indexing_queue 
      SET status = ?, error = ?, retries = CASE WHEN ? IS NOT NULL THEN retries + 1 ELSE retries END 
      WHERE id = ?
    `);
    stmt.run(status, error, error, id);
  }

  getQueueSize() {
    const pending = this.db.prepare("SELECT COUNT(*) as count FROM indexing_queue WHERE status = 'pending'").get().count;
    const total = this.db.prepare("SELECT COUNT(*) as count FROM indexing_queue").get().count;
    return { pending, total };
  }

  clearQueue() {
    this.db.prepare("DELETE FROM indexing_queue").run();
  }

  // --- Logs ---

  logEvent(notePath, event, detail = '') {
    const stmt = this.db.prepare('INSERT INTO indexing_log (note_path, event, detail, ts) VALUES (?, ?, ?, datetime(\'now\'))');
    stmt.run(notePath, event, detail);
  }

  getLogs(limit = 50) {
    const stmt = this.db.prepare('SELECT * FROM indexing_log ORDER BY ts DESC LIMIT ?');
    return stmt.all(limit);
  }

  getNoteChunkCount(notePath) {
    try {
      const normPath = notePath.replace(/\\/g, '/').toLowerCase();
      const stmt = this.db.prepare('SELECT note_path, COUNT(*) as count FROM chunks GROUP BY note_path');
      const rows = stmt.all();
      const match = rows.find(r => r.note_path && r.note_path.replace(/\\/g, '/').toLowerCase() === normPath);
      return match ? match.count : 0;
    } catch (err) {
      log.error('Failed to get chunk count:', err.message);
      return 0;
    }
  }

  searchTextFallback(query, topK = 5) {
    try {
      const stmt = this.db.prepare(`
        SELECT note_path, content 
        FROM chunks 
        WHERE content LIKE ? 
        LIMIT ?
      `);
      const results = stmt.all(`%${query}%`, topK);
      return results.map(r => ({
        note_path: r.note_path,
        content: r.content,
        score: 0.5
      }));
    } catch (err) {
      log.error('Text search fallback failed:', err.message);
      return [];
    }
  }

  verifyModelDimensions(_activeModelName) {
    if (!this.db) return;
    try {
      // Check stored vector byte length to verify 384-dim size
      const row = this.db.prepare('SELECT embedding FROM chunks WHERE embedding IS NOT NULL LIMIT 1').get();
      if (row && row.embedding) {
        const buf = row.embedding instanceof Buffer ? row.embedding : Buffer.from(row.embedding);
        const storedDim = buf.byteLength / 4;
        const expectedDim = 384;
        if (storedDim > 0 && storedDim !== expectedDim) {
          log.warn(`Embedding vector dimension mismatch: stored ${storedDim}, expected ${expectedDim}. Database will remain intact.`);
        }
      }
    } catch (err) {
      log.error('Failed to verify model dimensions in database:', err.message);
    }
  }

  clearAllData() {
    this.db.exec(`
      DELETE FROM chunks;
      DELETE FROM note_hashes;
      DELETE FROM indexing_queue;
      DELETE FROM indexing_log;
      VACUUM;
    `);
    this.vectorCache = [];
  }
}

module.exports = EmbeddingDB;
