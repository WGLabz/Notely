/**
 * GraphDB - SQLite handler for workspace-scoped Knowledge Graph database
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { createLogger } = require('../core/logger');
const {
  CREATE_ENTITIES_TABLE,
  CREATE_RELATIONSHIPS_TABLE,
  CREATE_INDEXES
} = require('./GraphSchema');

const log = createLogger('GraphDB');

class GraphDB {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.dbDir = path.join(workspaceRoot, '.notes-app');
    this.dbPath = path.join(this.dbDir, 'ai-graph.db');
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Graph database and tables
   */
  initialize() {
    try {
      if (!this.workspaceRoot) {
        throw new Error('workspaceRoot is required to initialize GraphDB');
      }

      // Ensure .notes-app directory exists
      if (!fs.existsSync(this.dbDir)) {
        fs.mkdirSync(this.dbDir, { recursive: true });
      }

      log.info(`Initializing graph database at: ${this.dbPath}`);
      this.db = new DatabaseSync(this.dbPath);

      // Optimizations
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');

      // Create tables
      this.db.exec(CREATE_ENTITIES_TABLE);
      this.db.exec(CREATE_RELATIONSHIPS_TABLE);

      // Create indexes
      for (const idxQuery of CREATE_INDEXES) {
        this.db.exec(idxQuery);
      }

      this.isInitialized = true;
      log.info('GraphDB initialized successfully');
      return true;
    } catch (err) {
      log.error('Failed to initialize GraphDB:', err);
      throw err;
    }
  }

  /**
   * Close connection
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        this.isInitialized = false;
        log.info('GraphDB closed');
      } catch (err) {
        log.error('Error closing GraphDB:', err);
      }
    }
  }

  /**
   * Clear all graph data
   */
  clear() {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('DELETE FROM relationships;');
    this.db.exec('DELETE FROM entities;');
    log.info('GraphDB cleared');
  }

  /**
   * Upsert an entity
   */
  upsertEntity({ id, type, name, note_path = null, properties = {} }) {
    if (!this.db) throw new Error('Database not initialized');
    
    const query = `
      INSERT INTO entities (id, type, name, note_path, properties, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        note_path = excluded.note_path,
        properties = excluded.properties,
        updated_at = datetime('now');
    `;
    
    const propertiesJson = typeof properties === 'string' ? properties : JSON.stringify(properties);
    const stmt = this.db.prepare(query);
    stmt.run(id, type, name, note_path, propertiesJson);
  }

  /**
   * Delete an entity by ID
   */
  deleteEntity(id) {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('DELETE FROM entities WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Delete note entity and all associated incoming/outgoing relationships
   */
  deleteNoteEntityAndRelationships(notePath) {
    if (!this.db) return;
    try {
      const path = require('path');
      const noteName = path.basename(notePath, '.md');
      const entityId = noteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM relationships WHERE source_id = ? OR target_id = ?').run(entityId, entityId);
        this.db.prepare('DELETE FROM entities WHERE id = ?').run(entityId);
        this.db.exec('COMMIT');
        log.info(`Deleted note graph data for entity: ${entityId}`);
      } catch (txnErr) {
        this.db.exec('ROLLBACK');
        throw txnErr;
      }
    } catch (err) {
      log.error(`Failed to delete note entity and relationships for ${notePath}:`, err.message);
    }
  }

  /**
   * Upsert a relationship
   */
  upsertRelationship({ source_id, target_id, type, weight = 1.0, metadata = {} }) {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT INTO relationships (source_id, target_id, type, weight, metadata)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_id, target_id, type) DO UPDATE SET
        weight = excluded.weight,
        metadata = excluded.metadata;
    `;

    const metadataJson = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    const stmt = this.db.prepare(query);
    stmt.run(source_id, target_id, type, weight, metadataJson);
  }

  /**
   * Get total status stats
   */
  getStatus() {
    if (!this.db) return { nodeCount: 0, edgeCount: 0, sizeBytes: 0 };
    
    const nodeCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM entities');
    const edgeCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM relationships');
    
    const nodeCount = nodeCountStmt.get().count;
    const edgeCount = edgeCountStmt.get().count;
    
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(this.dbPath).size;
    } catch (err) {
      log.debug('Failed to get database file stats:', err.message);
    }

    return { nodeCount, edgeCount, sizeBytes };
  }

  /**
   * Purge all entities and relationships
   */
  clearAllData() {
    if (!this.db) return;
    try {
      this.db.exec('BEGIN; DELETE FROM relationships; DELETE FROM entities; COMMIT;');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore rollback error */ }
      log.error('Failed to clear graph database:', err.message);
    }
  }

  /**
   * Get all entities & relationships (entire graph)
   */
  getAll() {
    if (!this.db) throw new Error('Database not initialized');

    const entitiesQuery = this.db.prepare('SELECT * FROM entities');
    const relsQuery = this.db.prepare('SELECT * FROM relationships');

    const entities = entitiesQuery.all().map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));

    const relationships = relsQuery.all().map(r => ({
      ...r,
      metadata: JSON.parse(r.metadata || '{}')
    }));

    return { entities, relationships };
  }

  /**
   * Recursive CTE neighbor search up to depth N (default 3)
   */
  getNeighbors(entityId, maxDepth = 3) {
    if (!this.db) throw new Error('Database not initialized');

    const cteQuery = `
      WITH RECURSIVE connected(id, depth) AS (
        SELECT ? as id, 0 as depth
        UNION
        SELECT r.target_id, c.depth + 1
        FROM relationships r JOIN connected c ON r.source_id = c.id
        WHERE c.depth < ?
        UNION
        SELECT r.source_id, c.depth + 1
        FROM relationships r JOIN connected c ON r.target_id = c.id
        WHERE c.depth < ?
      )
      SELECT DISTINCT e.*, c.depth 
      FROM entities e 
      JOIN connected c ON e.id = c.id;
    `;

    const stmt = this.db.prepare(cteQuery);
    const nodes = stmt.all(entityId, maxDepth, maxDepth).map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));

    // Fetch relationships between these nodes
    if (nodes.length === 0) return { nodes: [], edges: [] };

    const nodeIds = nodes.map(n => n.id);
    const placeholders = nodeIds.map(() => '?').join(',');
    const relsQuery = `
      SELECT * FROM relationships 
      WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders});
    `;

    const relsStmt = this.db.prepare(relsQuery);
    const edges = relsStmt.all(...nodeIds, ...nodeIds).map(r => ({
      ...r,
      metadata: JSON.parse(r.metadata || '{}')
    }));

    return { nodes, edges };
  }

  /**
   * Pathfinder recursive CTE between source and target
   */
  findPath(sourceId, targetId, maxDepth = 5) {
    if (!this.db) throw new Error('Database not initialized');

    const cteQuery = `
      WITH RECURSIVE paths(id, path_str, depth) AS (
        SELECT ? as id, ? as path_str, 0 as depth
        UNION ALL
        SELECT r.target_id, p.path_str || ',' || r.target_id, p.depth + 1
        FROM relationships r JOIN paths p ON r.source_id = p.id
        WHERE p.depth < ? AND p.path_str NOT LIKE '%' || r.target_id || '%'
      )
      SELECT path_str FROM paths WHERE id = ? ORDER BY depth ASC LIMIT 1;
    `;

    const stmt = this.db.prepare(cteQuery);
    const result = stmt.get(sourceId, sourceId, maxDepth, targetId);
    
    if (!result) return null;
    return result.path_str.split(',');
  }

  getNoteRelationshipCount(notePath) {
    if (!this.db) return 0;
    try {
      const path = require('path');
      const noteName = path.basename(notePath, '.md');
      const entityId = noteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      const relCountRow = this.db.prepare('SELECT COUNT(*) as count FROM relationships WHERE source_id = ? OR target_id = ?').get(entityId, entityId);
      return relCountRow?.count || 0;
    } catch (err) {
      log.error('Failed to get relationship count for note:', err.message);
      return 0;
    }
  }
}

module.exports = GraphDB;
