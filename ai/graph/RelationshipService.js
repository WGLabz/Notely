/**
 * RelationshipService - Analyzes and manages document relationships
 */

class RelationshipService {
  constructor(databaseManager, embeddingService, documentService) {
    this.db = databaseManager;
    this.embeddingService = embeddingService;
    this.documentService = documentService;
    this.relationshipCache = new Map();
  }

  /**
   * Discover relationships between documents
   */
  async discoverRelationships(sourceFile, topK = 10) {
    try {
      // Get similar documents
      const similar = await this.embeddingService.findSimilarDocuments(sourceFile, topK);

      // Get explicit relationships from links
      const sourceMetadata = this.documentService.getDocumentMetadata(sourceFile);
      const links = sourceMetadata?.links || [];

      const relationships = [];

      // Add semantic relationships
      for (const sim of similar) {
        relationships.push({
          targetFile: sim.filePath,
          type: 'related',
          strength: sim.similarity,
          source: 'semantic'
        });
      }

      // Add link-based relationships
      for (const link of links) {
        if (link.href.endsWith('.md')) {
          relationships.push({
            targetFile: link.href,
            type: 'references',
            strength: 0.9,
            source: 'explicit'
          });
        }
      }

      return relationships;
    } catch (error) {
      console.error('[RelationshipService] discoverRelationships failed:', error.message);
      return [];
    }
  }

  /**
   * Build relationship graph for workspace
   */
  async buildRelationshipGraph(workspaceDocuments) {
    console.log('[RelationshipService] Building relationship graph...');

    const edges = [];

    for (const doc of workspaceDocuments) {
      const relationships = await this.discoverRelationships(doc.path, 5);

      for (const rel of relationships) {
        // Store in database
        this.db.addRelationship(
          doc.path,
          rel.targetFile,
          rel.type,
          rel.strength,
          { source: rel.source }
        );

        edges.push(rel);
      }
    }

    console.log(`[RelationshipService] Built graph with ${edges.length} relationships`);
    return edges;
  }

  /**
   * Get related documents
   */
  getRelatedDocuments(filePath, relationshipType = null, minStrength = 0) {
    // Check cache first
    const cacheKey = `${filePath}:${relationshipType}:${minStrength}`;
    if (this.relationshipCache.has(cacheKey)) {
      return this.relationshipCache.get(cacheKey);
    }

    // Query database
    const relations = this.db.getRelatedDocuments(filePath, relationshipType, minStrength);

    // Cache result
    this.relationshipCache.set(cacheKey, relations);

    return relations;
  }

  /**
   * Get document clusters (groups of related documents)
   */
  getClusters(minClusterSize = 3) {
    try {
      const allDocs = this.documentService.getAllDocuments();
      const clusters = [];
      const visited = new Set();

      for (const doc of allDocs) {
        if (visited.has(doc.path)) continue;

        const cluster = this._buildCluster(doc.path, visited, minClusterSize);
        if (cluster.length >= minClusterSize) {
          clusters.push(cluster);
        }
      }

      return clusters;
    } catch (error) {
      console.error('[RelationshipService] getClusters failed:', error.message);
      return [];
    }
  }

  /**
   * Build a cluster of related documents
   * @private
   */
  _buildCluster(startPath, visited, minStrength = 0.5) {
    const cluster = [startPath];
    visited.add(startPath);
    const queue = [startPath];

    while (queue.length > 0) {
      const current = queue.shift();
      const related = this.getRelatedDocuments(current, null, minStrength);

      for (const rel of related) {
        if (!visited.has(rel.target_file)) {
          visited.add(rel.target_file);
          cluster.push(rel.target_file);
          queue.push(rel.target_file);
        }
      }
    }

    return cluster;
  }

  /**
   * Find most central documents
   */
  findCentralDocuments(limit = 10) {
    try {
      const allDocs = this.documentService.getAllDocuments();
      const centrality = [];

      for (const doc of allDocs) {
        const related = this.getRelatedDocuments(doc.path, null, 0.3);
        centrality.push({
          filePath: doc.path,
          score: related.length,
          relatedCount: related.length
        });
      }

      return centrality
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      console.error('[RelationshipService] findCentralDocuments failed:', error.message);
      return [];
    }
  }

  /**
   * Clear relationship cache
   */
  clearCache() {
    this.relationshipCache.clear();
  }
}

module.exports = RelationshipService;
