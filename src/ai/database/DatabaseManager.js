/**
 * DatabaseManager - SQLite database handler for AI agent
 * Manages schema initialization, migrations, and query execution
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { getPendingMigrations, getMigration } = require('./migrations');
const { createLogger } = require('../utils/logger');

const log = createLogger('DatabaseManager');

class DatabaseManager {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
    this.dbPath = path.join(appDataDir, 'app.sqlite');
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database connection and run migrations
   */
  initialize() {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.appDataDir)) {
        fs.mkdirSync(this.appDataDir, { recursive: true });
      }

      // Open or create database
      this.db = new DatabaseSync(this.dbPath);
      
      // Enable foreign keys
      this.db.exec('PRAGMA foreign_keys = ON');

      // Write-Ahead Logging improves concurrency and crash durability;
      // synchronous=NORMAL is the recommended pairing for WAL.
      try {
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA synchronous = NORMAL');
        this.db.exec('PRAGMA busy_timeout = 5000');
      } catch (pragmaError) {
        log.warn('Could not enable WAL mode', pragmaError);
      }
      
      // Run pending migrations
      this._runMigrations();
      
      this.isInitialized = true;
      log.info('Initialized', { dbPath: this.dbPath });
      return true;
    } catch (error) {
      log.error('Initialization failed', error);
      throw error;
    }
  }

  /**
   * Run a function inside a database transaction, rolling back on error.
   * The callback must be synchronous (node:sqlite is synchronous).
   */
  transaction(fn) {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch (rollbackError) {
        log.error('Rollback failed', rollbackError);
      }
      throw error;
    }
  }

  /**
   * Run pending database migrations
   * @private
   */
  _runMigrations() {
    // Create migrations log table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_migrations_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_version INTEGER NOT NULL UNIQUE,
        migration_name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        status TEXT DEFAULT 'applied'
      )
    `);

    // Get current version
    const result = this.db.prepare(`
      SELECT MAX(migration_version) as version FROM ai_migrations_log
      WHERE status = 'applied'
    `).get();
    
    const currentVersion = result?.version || 0;
    const pending = getPendingMigrations(currentVersion);

    if (pending.length === 0) {
      log.debug('Schema up-to-date');
      return;
    }

    log.info(`Running ${pending.length} migrations`);

    pending.forEach(migration => {
      try {
        // Apply the migration DDL and record it atomically so a crash can't
        // leave the schema changed but unlogged (or vice versa).
        this.transaction(() => {
          this.db.exec(migration.sql);

          this.db.prepare(`
            INSERT INTO ai_migrations_log (migration_version, migration_name, applied_at)
            VALUES (?, ?, ?)
          `).run(
            migration.version,
            migration.name,
            new Date().toISOString()
          );
        });

        log.info(`Applied migration ${migration.version}: ${migration.name}`);
      } catch (error) {
        log.error(`Migration ${migration.version} failed`, error);
        throw error;
      }
    });
  }

  /**
   * Insert or update document embedding
   */
  saveEmbedding(filePath, embedding, contentHash, model = 'gemini-embedding-001') {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const embeddingBlob = Buffer.from(JSON.stringify(embedding));

    this.db.prepare(`
      INSERT INTO ai_document_embeddings 
        (file_path, content_hash, embedding_vector, embedding_model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        content_hash = excluded.content_hash,
        embedding_vector = excluded.embedding_vector,
        updated_at = excluded.updated_at
    `).run(filePath, contentHash, embeddingBlob, model, now, now);
  }

  /**
   * Get embedding for file
   */
  getEmbedding(filePath) {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.prepare(`
      SELECT embedding_vector, content_hash, embedding_model FROM ai_document_embeddings
      WHERE file_path = ?
    `).get(filePath);

    if (!result) return null;

    return {
      vector: JSON.parse(result.embedding_vector.toString()),
      contentHash: result.content_hash,
      model: result.embedding_model
    };
  }

  /**
   * Add document relationship
   */
  addRelationship(sourceFile, targetFile, type, strength = 0.5, metadata = null) {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare(`
      INSERT INTO ai_document_relationships 
        (source_file, target_file, relationship_type, strength, metadata, detected_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_file, target_file, relationship_type) DO UPDATE SET
        strength = excluded.strength,
        metadata = excluded.metadata
    `).run(
      sourceFile,
      targetFile,
      type,
      strength,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString()
    );
  }

  /**
   * Get related documents
   */
  getRelatedDocuments(filePath, relationshipType = null, minStrength = 0) {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT target_file, relationship_type, strength, metadata
      FROM ai_document_relationships
      WHERE source_file = ? AND strength >= ?
    `;
    
    const params = [filePath, minStrength];

    if (relationshipType) {
      query += ' AND relationship_type = ?';
      params.push(relationshipType);
    }

    query += ' ORDER BY strength DESC';

    return this.db.prepare(query).all(...params);
  }

  /**
   * Record interaction
   */
  recordInteraction(query, response, filePath, workspaceRoot, type = 'query', model = null, tokensUsed = 0) {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare(`
      INSERT INTO ai_interactions 
        (query, response, file_context, workspace_root, interaction_type, model_used, tokens_used, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      query,
      response,
      filePath,
      workspaceRoot,
      type,
      model,
      tokensUsed,
      new Date().toISOString()
    );
  }

  /**
   * Rate interaction
   */
  rateInteraction(interactionId, rating) {
    if (!this.db) throw new Error('Database not initialized');
    if (![1, 0, -1].includes(rating)) throw new Error('Rating must be -1, 0, or 1');

    this.db.prepare(`
      UPDATE ai_interactions 
      SET helpful_rating = ?, rated_at = ?
      WHERE id = ?
    `).run(rating, new Date().toISOString(), interactionId);
  }

  /**
   * Get recent interactions
   */
  getRecentInteractions(workspaceRoot, limit = 50, type = null) {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT * FROM ai_interactions
      WHERE workspace_root = ?
    `;
    
    const params = [workspaceRoot];

    if (type) {
      query += ' AND interaction_type = ?';
      params.push(type);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Add or update pattern
   */
  addPattern(workspaceRoot, type, name, data, confidence = 0.5) {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO ai_patterns 
        (workspace_root, pattern_type, pattern_name, pattern_data, confidence, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_root, pattern_type, pattern_name) DO UPDATE SET
        frequency = frequency + 1,
        confidence = excluded.confidence,
        last_seen = excluded.last_seen
    `).run(
      workspaceRoot,
      type,
      name,
      JSON.stringify(data),
      confidence,
      now,
      now
    );
  }

  /**
   * Get patterns by type
   */
  getPatterns(workspaceRoot, type, minConfidence = 0.3) {
    if (!this.db) throw new Error('Database not initialized');

    return this.db.prepare(`
      SELECT pattern_name, pattern_data, frequency, confidence
      FROM ai_patterns
      WHERE workspace_root = ? AND pattern_type = ? AND confidence >= ?
      ORDER BY frequency DESC, confidence DESC
    `).all(workspaceRoot, type, minConfidence);
  }

  /**
   * Cache context value
   */
  cacheContext(workspaceRoot, key, value, expiresInMs = 3600000) {
    if (!this.db) throw new Error('Database not initialized');

    const expiresAt = new Date(Date.now() + expiresInMs).toISOString();

    this.db.prepare(`
      INSERT INTO ai_context_cache 
        (workspace_root, context_key, context_value, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_root, context_key) DO UPDATE SET
        context_value = excluded.context_value,
        expires_at = excluded.expires_at
    `).run(workspaceRoot, key, JSON.stringify(value), new Date().toISOString(), expiresAt);
  }

  /**
   * Get cached context
   */
  getCachedContext(workspaceRoot, key) {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.prepare(`
      SELECT context_value, expires_at
      FROM ai_context_cache
      WHERE workspace_root = ? AND context_key = ?
    `).get(workspaceRoot, key);

    if (!result) return null;

    // Check expiration
    if (result.expires_at && new Date(result.expires_at) < new Date()) {
      this.db.prepare('DELETE FROM ai_context_cache WHERE workspace_root = ? AND context_key = ?')
        .run(workspaceRoot, key);
      return null;
    }

    return JSON.parse(result.context_value);
  }

  /**
   * Clean expired cache
   */
  cleanExpiredCache() {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const result = this.db.prepare(`
      DELETE FROM ai_context_cache
      WHERE expires_at IS NOT NULL AND expires_at < ?
    `).run(now);

    return result.changes;
  }

  /**
   * Execute raw query (use with caution)
   */
  query(sql, params = []) {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get database info
   */
  getInfo() {
    if (!this.db) throw new Error('Database not initialized');

    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%'
    `).all();

    return {
      path: this.dbPath,
      initialized: this.isInitialized,
      tables: tables.map(t => t.name)
    };
  }
}

module.exports = DatabaseManager;
