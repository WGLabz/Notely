/**
 * Database migrations for AI agent features
 * Extends the existing app.sqlite with vector embeddings, relationships, and learning tables
 */

const MIGRATIONS = [
  {
    version: 1,
    name: 'create_ai_document_embeddings',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_document_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE,
        content_hash TEXT NOT NULL,
        embedding_vector BLOB,
        embedding_model TEXT DEFAULT 'gemini-embedding-001',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (file_path) REFERENCES history_entries(file_path)
      );
      CREATE INDEX idx_ai_embeddings_file_path ON ai_document_embeddings(file_path);
      CREATE INDEX idx_ai_embeddings_created_at ON ai_document_embeddings(created_at);
    `
  },
  {
    version: 2,
    name: 'create_ai_document_relationships',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_document_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file TEXT NOT NULL,
        target_file TEXT NOT NULL,
        relationship_type TEXT NOT NULL CHECK(relationship_type IN ('references', 'related', 'sibling', 'dependency', 'parent', 'child')),
        strength REAL DEFAULT 0.5 CHECK(strength >= 0 AND strength <= 1),
        metadata TEXT,
        detected_at TEXT NOT NULL,
        UNIQUE(source_file, target_file, relationship_type),
        FOREIGN KEY (source_file) REFERENCES history_entries(file_path),
        FOREIGN KEY (target_file) REFERENCES history_entries(file_path)
      );
      CREATE INDEX idx_ai_relationships_source ON ai_document_relationships(source_file);
      CREATE INDEX idx_ai_relationships_target ON ai_document_relationships(target_file);
      CREATE INDEX idx_ai_relationships_type ON ai_document_relationships(relationship_type);
    `
  },
  {
    version: 3,
    name: 'create_ai_interactions',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        response TEXT,
        file_context TEXT,
        workspace_root TEXT NOT NULL,
        interaction_type TEXT DEFAULT 'query' CHECK(interaction_type IN ('query', 'refactor', 'format', 'summarize', 'search')),
        model_used TEXT,
        tokens_used INTEGER,
        timestamp TEXT NOT NULL,
        helpful_rating INTEGER CHECK(helpful_rating IN (-1, 0, 1)),
        rated_at TEXT
      );
      CREATE INDEX idx_ai_interactions_workspace ON ai_interactions(workspace_root);
      CREATE INDEX idx_ai_interactions_timestamp ON ai_interactions(timestamp);
      CREATE INDEX idx_ai_interactions_type ON ai_interactions(interaction_type);
    `
  },
  {
    version: 4,
    name: 'create_ai_patterns',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_root TEXT NOT NULL,
        pattern_type TEXT NOT NULL CHECK(pattern_type IN ('editing_style', 'favorite_formats', 'common_queries', 'refactor_preferences', 'documentation_style')),
        pattern_name TEXT NOT NULL,
        pattern_data TEXT NOT NULL,
        frequency INTEGER DEFAULT 1,
        confidence REAL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        UNIQUE(workspace_root, pattern_type, pattern_name)
      );
      CREATE INDEX idx_ai_patterns_workspace ON ai_patterns(workspace_root);
      CREATE INDEX idx_ai_patterns_type ON ai_patterns(pattern_type);
    `
  },
  {
    version: 5,
    name: 'create_ai_context_cache',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_context_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_root TEXT NOT NULL,
        context_key TEXT NOT NULL,
        context_value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        UNIQUE(workspace_root, context_key),
        FOREIGN KEY (workspace_root) REFERENCES ai_interactions(workspace_root)
      );
      CREATE INDEX idx_ai_cache_workspace ON ai_context_cache(workspace_root);
      CREATE INDEX idx_ai_cache_expires ON ai_context_cache(expires_at);
    `
  },
  {
    version: 6,
    name: 'create_ai_migrations_log',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_migrations_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_version INTEGER NOT NULL UNIQUE,
        migration_name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        status TEXT DEFAULT 'applied' CHECK(status IN ('applied', 'rolled_back'))
      );
    `
  }
];

/**
 * Get all pending migrations
 * @param {number} currentVersion - Current schema version
 * @returns {Array} Pending migrations
 */
function getPendingMigrations(currentVersion = 0) {
  return MIGRATIONS.filter(m => m.version > currentVersion);
}

/**
 * Get migration by version
 * @param {number} version - Migration version
 * @returns {Object|null} Migration object or null
 */
function getMigration(version) {
  return MIGRATIONS.find(m => m.version === version) || null;
}

module.exports = {
  MIGRATIONS,
  getPendingMigrations,
  getMigration
};
