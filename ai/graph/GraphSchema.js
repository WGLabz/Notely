/**
 * SQL Schema definitions for the SQLite-backed Knowledge Graph
 * Property Graph + Evidence Store + Entity Aliasing
 */

const CREATE_ENTITIES_TABLE = `
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    canonical_name TEXT,
    type TEXT NOT NULL DEFAULT 'Entity',
    note_path TEXT,
    properties TEXT,
    extractor TEXT DEFAULT 'gliner',
    model_version TEXT DEFAULT '2.1',
    confidence REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
`;

const CREATE_ENTITY_ALIASES_TABLE = `
CREATE TABLE IF NOT EXISTS entity_aliases (
    alias TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    confidence REAL DEFAULT 1.0
);
`;

const CREATE_EVIDENCE_TABLE = `
CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    extractor TEXT NOT NULL,
    subject_text TEXT NOT NULL,
    subject_span_start INTEGER,
    subject_span_end INTEGER,
    predicate_text TEXT,
    object_text TEXT,
    object_span_start INTEGER,
    object_span_end INTEGER,
    raw_sentence TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now'))
);
`;

const CREATE_RELATIONSHIPS_TABLE = `
CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    confidence REAL DEFAULT 1.0,
    extractor TEXT DEFAULT 'glirel',
    model_version TEXT DEFAULT '1.0',
    metadata TEXT,
    evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, target_id, type)
);
`;

const CREATE_GRAPH_QUEUE_TABLE = `
CREATE TABLE IF NOT EXISTS graph_queue (
    id TEXT PRIMARY KEY,
    note_path TEXT NOT NULL,
    priority INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    retries INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);
`;

const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id);`,
  `CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id);`,
  `CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(type);`,
  `CREATE INDEX IF NOT EXISTS idx_rel_evidence ON relationships(evidence_id);`,
  `CREATE INDEX IF NOT EXISTS idx_rel_confidence ON relationships(confidence);`,
  `CREATE INDEX IF NOT EXISTS idx_rel_weight ON relationships(weight);`,
  `CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);`,
  `CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);`,
  `CREATE INDEX IF NOT EXISTS idx_entities_note ON entities(note_path);`,
  `CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);`,
  `CREATE INDEX IF NOT EXISTS idx_aliases_entity ON entity_aliases(entity_id);`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source_id);`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_extractor ON evidence(extractor);`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_span ON evidence(source_id, subject_span_start);`,
  `CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON graph_queue(status, priority DESC);`
];

module.exports = {
  CREATE_ENTITIES_TABLE,
  CREATE_ENTITY_ALIASES_TABLE,
  CREATE_EVIDENCE_TABLE,
  CREATE_RELATIONSHIPS_TABLE,
  CREATE_GRAPH_QUEUE_TABLE,
  CREATE_INDEXES
};

