/**
 * GraphAnalyzer - Advanced graph analysis and relationship discovery
 */

class GraphAnalyzer {
  constructor(relationshipService, documentService) {
    this.relationships = relationshipService;
    this.documents = documentService;
  }

  /**
   * Find document clusters
   */
  findClusters(minClusterSize = 2, maxDistance = 0.7) {
    const clusters = [];
    const docs = this.documents.getAllDocuments();
    const visited = new Set();

    for (const doc of docs) {
      if (visited.has(doc.path)) continue;

      const cluster = this._buildCluster(doc.path, visited, maxDistance);

      if (cluster.length >= minClusterSize) {
        clusters.push({
          documents: cluster,
          size: cluster.length,
          density: this._calculateClusterDensity(cluster)
        });
      }
    }

    return clusters.sort((a, b) => b.size - a.size);
  }

  /**
   * Build a cluster using BFS
   * @private
   */
  _buildCluster(startDoc, visited, maxDistance) {
    const cluster = [startDoc];
    visited.add(startDoc);
    const queue = [startDoc];

    while (queue.length > 0) {
      const current = queue.shift();
      const related = this.relationships.getRelatedDocuments(current, null, maxDistance);

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
   * Calculate cluster density
   * @private
   */
  _calculateClusterDensity(cluster) {
    if (cluster.length < 2) return 0;

    let connections = 0;
    const maxConnections = (cluster.length * (cluster.length - 1)) / 2;

    for (const doc of cluster) {
      const related = this.relationships.getRelatedDocuments(doc);
      const inCluster = related.filter(r => cluster.includes(r.target_file)).length;
      connections += inCluster;
    }

    return connections / maxConnections;
  }

  /**
   * Find central/hub documents
   */
  findHubs(limit = 10) {
    const docs = this.documents.getAllDocuments();
    const hubs = [];

    for (const doc of docs) {
      const related = this.relationships.getRelatedDocuments(doc.path, null, 0.3);
      const avgStrength = related.length > 0
        ? related.reduce((sum, r) => sum + r.strength, 0) / related.length
        : 0;

      hubs.push({
        document: doc.path,
        connectionCount: related.length,
        averageStrength: avgStrength,
        hubScore: related.length * avgStrength
      });
    }

    return hubs
      .sort((a, b) => b.hubScore - a.hubScore)
      .slice(0, limit);
  }

  /**
   * Find orphan documents (no relationships)
   */
  findOrphans() {
    const docs = this.documents.getAllDocuments();
    const orphans = [];

    for (const doc of docs) {
      const related = this.relationships.getRelatedDocuments(doc.path);

      if (related.length === 0) {
        orphans.push(doc.path);
      }
    }

    return orphans;
  }

  /**
   * Calculate network statistics
   */
  getNetworkStats() {
    const docs = this.documents.getAllDocuments();
    const allRelationships = [];

    for (const doc of docs) {
      const related = this.relationships.getRelatedDocuments(doc.path, null, 0);
      allRelationships.push(...related);
    }

    const avgConnections = docs.length > 0
      ? allRelationships.length / docs.length
      : 0;

    const strengths = allRelationships.map(r => r.strength);
    const avgStrength = strengths.length > 0
      ? strengths.reduce((a, b) => a + b, 0) / strengths.length
      : 0;

    return {
      documentCount: docs.length,
      totalRelationships: allRelationships.length,
      averageConnectionsPerDoc: avgConnections,
      averageRelationshipStrength: avgStrength,
      networkDensity: docs.length > 1
        ? (2 * allRelationships.length) / (docs.length * (docs.length - 1))
        : 0
    };
  }

  /**
   * Find shortest path between two documents
   */
  findShortestPath(fromDoc, toDoc) {
    if (fromDoc === toDoc) return [fromDoc];

    const queue = [[fromDoc]];
    const visited = new Set([fromDoc]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      const related = this.relationships.getRelatedDocuments(current);

      for (const rel of related) {
        if (rel.target_file === toDoc) {
          return [...path, toDoc];
        }

        if (!visited.has(rel.target_file)) {
          visited.add(rel.target_file);
          queue.push([...path, rel.target_file]);
        }
      }
    }

    return null; // No path found
  }

  /**
   * Find all paths within distance
   */
  findNearbyDocuments(startDoc, maxDistance = 3) {
    const nearby = new Map();
    const queue = [[startDoc, 0]];
    const visited = new Set([startDoc]);

    while (queue.length > 0) {
      const [current, distance] = queue.shift();

      if (distance > 0 && distance <= maxDistance) {
        nearby.set(current, distance);
      }

      if (distance < maxDistance) {
        const related = this.relationships.getRelatedDocuments(current);

        for (const rel of related) {
          if (!visited.has(rel.target_file)) {
            visited.add(rel.target_file);
            queue.push([rel.target_file, distance + 1]);
          }
        }
      }
    }

    return Array.from(nearby.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([doc, dist]) => ({ document: doc, distance: dist }));
  }

  /**
   * Visualize graph data for UI
   */
  getGraphVisualization(limit = 50) {
    const docs = this.documents.getAllDocuments().slice(0, limit);
    const nodes = docs.map(doc => ({
      id: doc.path,
      label: doc.path.split('/').pop(),
      size: 10
    }));

    const edges = [];
    const edgeSet = new Set();

    for (const doc of docs) {
      const related = this.relationships.getRelatedDocuments(doc.path, null, 0.3);

      for (const rel of related) {
        const edgeId = [doc.path, rel.target_file].sort().join('|');

        if (!edgeSet.has(edgeId) && docs.some(d => d.path === rel.target_file)) {
          edgeSet.add(edgeId);
          edges.push({
            source: doc.path,
            target: rel.target_file,
            weight: rel.strength,
            type: rel.relationship_type
          });
        }
      }
    }

    return { nodes, edges };
  }
}

module.exports = GraphAnalyzer;
