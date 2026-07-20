const { createLogger } = require('../core/logger');

const log = createLogger('GraphRetriever');

/**
 * GraphRetriever � recursive CTE traversal over ai-graph.db
 * Exposed as an LLM tool via ContextEngine.
 */
class GraphRetriever {
  /**
   * @param {{ db: object }} graphDB - any object exposing a DatabaseSync .db property
   */
  constructor(graphDB) {
    this.graphDB = graphDB;
    this.cache = new Map();
  }

  /**
   * Traverse all relations linked to a given note path (up to maxDepth hops).
   * @param {string} notePath
   * @param {number} maxDepth
   * @returns {Array<{from_path: string, relation: string, to_path: string, depth: number}>}
   */
  traverse(notePath, maxDepth = 2) {
    const startTime = performance.now();
    const now = Date.now();
    const cacheKey = `${notePath}:${maxDepth}`;
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.timestamp < 60000) {
      log.info(`Graph traversal hit cache in ${(performance.now() - startTime).toFixed(2)}ms.`);
      return cached.rows;
    }
    try {
      const db = this.graphDB.db;
      // Recursive CTE: walk outbound links from the anchor note
      const rows = db.prepare(`
        WITH RECURSIVE graph_walk(from_path, relation, to_path, depth) AS (
          SELECT from_path, relation, to_path, 1
          FROM document_relations
          WHERE from_path = ?
          UNION ALL
          SELECT dr.from_path, dr.relation, dr.to_path, gw.depth + 1
          FROM document_relations dr
          JOIN graph_walk gw ON dr.from_path = gw.to_path
          WHERE gw.depth < ?
        )
        SELECT DISTINCT from_path, relation, to_path, depth
        FROM graph_walk
        ORDER BY depth ASC
        LIMIT 50
      `).all(notePath, maxDepth);

      this.cache.set(cacheKey, { timestamp: now, rows });
      const duration = performance.now() - startTime;
      log.info(`Graph traversal completed in ${duration.toFixed(2)}ms. Found ${rows.length} relations.`);
      return rows;
    } catch (err) {
      log.warn('Graph traversal failed (graph may not be built yet)', err.message);
      return [];
    }
  }

  /**
   * Vercel AI SDK tool definition for this retriever.
   */
  toTool() {
    return {
      description: 'Explore how a note is connected to other notes in the workspace knowledge graph. Use when the user asks about related topics, linked documents, or note relationships.',
      parameters: {
        type: 'object',
        properties: {
          notePath: { type: 'string', description: 'The full path of the note to start graph traversal from.' },
          maxDepth: { type: 'number', description: 'Maximum traversal hops (default 2).', default: 2 }
        },
        required: ['notePath']
      },
      execute: async ({ notePath, maxDepth = 2 }) => {
        const rows = this.traverse(notePath, maxDepth);
        if (!rows.length) return `No graph relations found for: ${notePath}`;
        return rows.map(r =>
          `[depth ${r.depth}] ${r.from_path} --[${r.relation}]--> ${r.to_path}`
        ).join('\n');
      }
    };
  }
}

module.exports = { GraphRetriever };
