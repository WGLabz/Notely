/**
 * GraphDB - SQLite handler for workspace-scoped Knowledge Graph database
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { createLogger } = require('../core/logger');
const {
  CREATE_ENTITIES_TABLE,
  CREATE_ENTITY_ALIASES_TABLE,
  CREATE_EVIDENCE_TABLE,
  CREATE_RELATIONSHIPS_TABLE,
  CREATE_GRAPH_QUEUE_TABLE,
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
      this.db.exec(CREATE_ENTITY_ALIASES_TABLE);
      this.db.exec(CREATE_EVIDENCE_TABLE);
      this.db.exec(CREATE_RELATIONSHIPS_TABLE);
      this.db.exec(CREATE_GRAPH_QUEUE_TABLE);

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

  clear() {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('DELETE FROM relationships;');
    this.db.exec('DELETE FROM evidence;');
    this.db.exec('DELETE FROM entity_aliases;');
    this.db.exec('DELETE FROM entities;');
    log.info('GraphDB cleared');
  }

  /**
   * Execute callback inside a single SQLite transaction
   */
  runTransaction(fn) {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('BEGIN;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try { this.db.exec('ROLLBACK;'); } catch { /* ignore rollback errors */ }
      throw err;
    }
  }

  /**
   * Upsert an entity into property graph
   */
  upsertEntity({ id, type = 'Entity', name, canonical_name = null, note_path = null, properties = {} }) {
    if (!this.db) throw new Error('Database not initialized');

    const canonical = canonical_name || name;
    const query = `
      INSERT INTO entities (id, name, canonical_name, type, note_path, properties, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        canonical_name = excluded.canonical_name,
        type = excluded.type,
        note_path = excluded.note_path,
        properties = excluded.properties,
        updated_at = datetime('now');
    `;

    const propertiesJson = typeof properties === 'string' ? properties : JSON.stringify(properties);
    const stmt = this.db.prepare(query);
    stmt.run(id, name, canonical, type, note_path, propertiesJson);
  }

  deleteEntity(id) {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('DELETE FROM entities WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Delete note entity, associated evidence, and incoming/outgoing relationships
   */
  deleteNoteEntityAndRelationships(notePath) {
    if (!this.db) return;
    try {
      const crypto = require('crypto');
      const normPath = String(notePath || '').trim().toLowerCase();
      const entityId = `ent-${crypto.createHash('sha256').update(`note:${normPath}`).digest('hex').slice(0, 16)}`;

      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM relationships WHERE source_id = ? OR target_id = ?').run(entityId, entityId);
        this.db.prepare('DELETE FROM evidence WHERE source_id = ?').run(notePath);
        this.db.prepare('DELETE FROM entities WHERE id = ? OR note_path = ?').run(entityId, notePath);
        this.db.exec('COMMIT');
        log.info(`Deleted note graph data for entity: ${entityId}`);
      } catch (txnErr) {
        this.db.exec('ROLLBACK');
        throw txnErr;
      }
    } catch (err) {
      log.error(`Failed to delete note graph data for ${notePath}:`, err.message);
    }
  }

  /**
   * Check if a note's graph representation is up to date based on file modification timestamp
   */
  isNoteUpToDate(notePath, mtimeMs) {
    if (!this.db || !notePath) return false;
    try {
      const normPath = String(notePath || '').trim();
      const row = this.db.prepare('SELECT updated_at FROM entities WHERE note_path = ? OR LOWER(note_path) = LOWER(?) LIMIT 1').get(normPath, normPath);
      if (!row || !row.updated_at) return false;

      // SQLite datetime('now') stores UTC string 'YYYY-MM-DD HH:MM:SS'
      const utcString = row.updated_at.includes('T') ? row.updated_at : row.updated_at.replace(' ', 'T') + 'Z';
      const dbTime = new Date(utcString).getTime();
      if (isNaN(dbTime)) return false;

      return dbTime >= (mtimeMs - 1000); // 1-second tolerance
    } catch {
      return false;
    }
  }

  /**
   * Alias for deleteNoteEntityAndRelationships (used by background worker)
   */
  deleteNoteData(notePath) {
    this.deleteNoteEntityAndRelationships(notePath);
  }

  /**
   * Upsert a relationship with confidence and optional evidence linkage
   */
  upsertRelationship({ source_id, target_id, type, weight = 1.0, confidence = 1.0, metadata = {}, evidence_id = null }) {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT INTO relationships (source_id, target_id, type, weight, confidence, metadata, evidence_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, target_id, type) DO UPDATE SET
        weight = excluded.weight,
        confidence = excluded.confidence,
        metadata = excluded.metadata,
        evidence_id = COALESCE(excluded.evidence_id, relationships.evidence_id);
    `;

    const metadataJson = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    const stmt = this.db.prepare(query);
    stmt.run(source_id, target_id, type, weight, confidence, metadataJson, evidence_id);
  }

  getStatus() {
    if (!this.db) return { nodeCount: 0, edgeCount: 0, sizeBytes: 0 };

    const nodeCount = this.getNodeCount();
    const edgeCount = this.getEdgeCount();

    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(this.dbPath).size;
    } catch (err) {
      log.debug('Failed to get database file stats:', err.message);
    }

    return { nodeCount, edgeCount, sizeBytes };
  }

  getNodeCount() {
    if (!this.db) return 0;
    try {
      return this.db.prepare('SELECT COUNT(*) as count FROM entities').get()?.count || 0;
    } catch {
      return 0;
    }
  }

  getEdgeCount() {
    if (!this.db) return 0;
    try {
      return this.db.prepare('SELECT COUNT(*) as count FROM relationships').get()?.count || 0;
    } catch {
      return 0;
    }
  }

  clearAllData() {
    if (!this.db) return;
    try {
      this.db.exec('BEGIN; DELETE FROM relationships; DELETE FROM evidence; DELETE FROM entity_aliases; DELETE FROM entities; COMMIT;');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      log.error('Failed to clear graph database:', err.message);
    }
  }

  getAll() {
    if (!this.db) throw new Error('Database not initialized');

    const entities = this.db.prepare('SELECT * FROM entities').all().map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));

    const relationships = this.db.prepare('SELECT * FROM relationships').all().map(r => ({
      ...r,
      metadata: JSON.parse(r.metadata || '{}')
    }));

    return { entities, relationships };
  }

  /**
   * Find entity by note path
   */
  getEntityByPath(notePath) {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare('SELECT * FROM entities WHERE note_path = ? OR LOWER(note_path) = LOWER(?) LIMIT 1');
      const row = stmt.get(notePath, notePath);
      if (!row) return null;
      return { ...row, properties: JSON.parse(row.properties || '{}') };
    } catch {
      return null;
    }
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
   * Traversal by note path or entity ID/name with evidence context
   */
  traversePathOrId(identifier, maxDepth = 2) {
    if (!this.db || !identifier) return [];
    let startEntity = this.getEntityByPath(identifier);
    if (!startEntity) {
      try {
        const stmt = this.db.prepare('SELECT * FROM entities WHERE LOWER(name) = LOWER(?) OR id = ? LIMIT 1');
        startEntity = stmt.get(String(identifier).trim(), identifier);
      } catch (__err) {
        /* ignore lookup error */
      }
    }
    if (!startEntity) {
      try {
        const stmt = this.db.prepare('SELECT * FROM entities WHERE LOWER(name) LIKE LOWER(?) LIMIT 1');
        startEntity = stmt.get(`%${String(identifier).trim()}%`);
      } catch (__err) {
        /* ignore lookup error */
      }
    }
    if (!startEntity) return [];

    const { nodes, edges } = this.getNeighbors(startEntity.id, maxDepth);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    return edges.map(e => {
      const srcNode = nodeMap.get(e.source_id);
      const tgtNode = nodeMap.get(e.target_id);
      let evidenceText = null;
      if (e.evidence_id) {
        try {
          const ev = this.db.prepare('SELECT raw_sentence FROM evidence WHERE id = ?').get(e.evidence_id);
          evidenceText = ev?.raw_sentence || null;
        } catch (__err) {
          /* ignore evidence lookup error */
        }
      }
      return {
        from_id: e.source_id,
        from_name: srcNode?.name || e.source_id,
        from_type: srcNode?.type || 'Entity',
        from_path: srcNode?.note_path || srcNode?.name || e.source_id,
        relation: e.type,
        to_id: e.target_id,
        to_name: tgtNode?.name || e.target_id,
        to_type: tgtNode?.type || 'Entity',
        to_path: tgtNode?.note_path || tgtNode?.name || e.target_id,
        weight: e.weight || 1.0,
        confidence: e.confidence || 1.0,
        evidence: evidenceText
      };
    });
  }

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
      let entityId = notePath;
      const row = this.db.prepare('SELECT id FROM entities WHERE note_path = ? OR LOWER(note_path) = LOWER(?) OR id = ? LIMIT 1').get(notePath, notePath, notePath);
      if (row && row.id) {
        entityId = row.id;
      } else {
        const path = require('path');
        const noteName = path.basename(notePath, '.md');
        entityId = noteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
      
      const relCountRow = this.db.prepare('SELECT COUNT(*) as count FROM relationships WHERE source_id = ? OR target_id = ?').get(entityId, entityId);
      return relCountRow?.count || 0;
    } catch (err) {
      log.error('Failed to get relationship count for note:', err.message);
      return 0;
    }
  }

  /**
   * Calculate degree centrality, node colors, and rich visualization payload for UI graph view
   */
  getRichGraphVisualization(limit = 150) {
    if (!this.db) return { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0, networkDensity: 0 } };

    try {
      const rawEntities = this.db.prepare('SELECT * FROM entities LIMIT ?').all(limit);
      const rawRelationships = this.db.prepare('SELECT * FROM relationships LIMIT ?').all(limit * 3);

      // Compute degree centrality (incoming + outgoing connections per node)
      const degreeMap = new Map();
      rawRelationships.forEach(r => {
        degreeMap.set(r.source_id, (degreeMap.get(r.source_id) || 0) + 1);
        degreeMap.set(r.target_id, (degreeMap.get(r.target_id) || 0) + 1);
      });

      // Dynamic color generation via string hashing (zero hardcoded entity types)
      const getTypeColor = (typeStr) => {
        const str = String(typeStr || 'Entity').trim();
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = (str.charCodeAt(i) + ((hash << 5) - hash)) | 0;
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 50%)`;
      };

      const validNodeIds = new Set(rawEntities.map(e => e.id));

      const nodes = rawEntities.map(e => {
        const degree = degreeMap.get(e.id) || 0;
        const color = getTypeColor(e.type);
        return {
          id: e.id,
          label: e.name || e.canonical_name || e.id,
          type: e.type || 'Entity',
          note_path: e.note_path,
          degree,
          size: Math.min(36, 10 + degree * 3),
          color,
          properties: JSON.parse(e.properties || '{}')
        };
      });

      const edges = [];
      const seenEdgeKeys = new Set();

      rawRelationships.forEach(r => {
        if (validNodeIds.has(r.source_id) && validNodeIds.has(r.target_id)) {
          const key = `${r.source_id}:${r.target_id}:${r.type}`;
          if (!seenEdgeKeys.has(key)) {
            seenEdgeKeys.add(key);
            edges.push({
              id: r.id,
              source: r.source_id,
              target: r.target_id,
              type: r.type,
              weight: r.weight || 1.0,
              confidence: r.confidence || 1.0
            });
          }
        }
      });

      const totalNodes = nodes.length;
      const totalEdges = edges.length;
      const networkDensity = totalNodes > 1 ? (2 * totalEdges) / (totalNodes * (totalNodes - 1)) : 0;

      const hubs = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 5).map(n => ({ id: n.id, label: n.label, degree: n.degree }));

      return {
        nodes,
        edges,
        stats: {
          totalNodes,
          totalEdges,
          networkDensity: parseFloat(networkDensity.toFixed(4)),
          hubNodes: hubs
        }
      };
    } catch (err) {
      log.error('Failed to generate rich graph visualization:', err.message);
      return { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0, networkDensity: 0 } };
    }
  }
}

module.exports = GraphDB;
