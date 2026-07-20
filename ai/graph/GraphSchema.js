/**
 * SQL Schema definitions for the SQLite-backed Knowledge Graph
 */

const CREATE_ENTITIES_TABLE = `
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,       -- 'Note', 'Person', 'Project', 'Technology', 'Company', 'Concept', 'Task'
    name TEXT NOT NULL,
    note_path TEXT,           -- file path if representing a note
    properties TEXT,          -- JSON string storing type-specific metadata
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
`;

const CREATE_RELATIONSHIPS_TABLE = `
CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    type TEXT NOT NULL,       -- 'REFERENCES', 'USES', 'DEPENDS_ON', 'MENTIONS', 'RELATED_TO'
    weight REAL DEFAULT 1.0,
    metadata TEXT,            -- JSON string storing extra attributes
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, target_id, type)
);
`;

const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id);`,
  `CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id);`,
  `CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(type);`,
  `CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);`,
  `CREATE INDEX IF NOT EXISTS idx_entities_note ON entities(note_path);`
];

module.exports = {
  CREATE_ENTITIES_TABLE,
  CREATE_RELATIONSHIPS_TABLE,
  CREATE_INDEXES
};
