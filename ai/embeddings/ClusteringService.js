/**
 * SemanticClusteringService - Analyzes document content semantic similarity
 * and groups related notes into clusters for workspace graph visualization.
 *
 * Uses cosine similarity on embeddings to discover thematic relationships
 * beyond explicit links (wiki links, markdown links).
 */

class SemanticClusteringService {
  /**
   * @param {EmbeddingService} embeddingService
   * @param {number} similarityThreshold - Min cosine similarity to cluster (0-1, default 0.65)
   */
  constructor(embeddingService, similarityThreshold = 0.65) {
    this.embeddingService = embeddingService;
    this.similarityThreshold = similarityThreshold;
    this.clusterCache = new Map(); // filePath → clusterId
  }

  /**
   * Compute cosine similarity between two vectors
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB);
    return mag === 0 ? 0 : dot / mag;
  }

  /**
   * Analyze documents and compute semantic clusters
   *
   * @param {Array} documents - Array of {id, label, filePath, content}
   * @returns {Promise<{clusters: Array, similarities: Map, clusterMap: Map}>}
   *   clusters: [{id, members: [nodeId], strength: avgSimilarity}]
   *   similarities: Map of "nodeId1|||nodeId2" → similarity
   *   clusterMap: Map of nodeId → clusterId
   */
  async analyzeDocuments(documents) {
    if (!this.embeddingService.isAvailable()) {
      throw new Error('Semantic clustering requires embeddings provider. Configure HuggingFace token.');
    }

    console.log(`[SemanticClustering] Analyzing ${documents.length} documents...`);

    // Step 1: Generate embeddings for all documents
    const embeddings = new Map();
    for (const doc of documents) {
      try {
        const vectors = await this.embeddingService.embeddingProvider.generateEmbeddings([doc.content]);
        const vector = Array.isArray(vectors) ? vectors[0] : vectors;
        embeddings.set(doc.id, vector);
      } catch (err) {
        console.warn(`[SemanticClustering] Failed to embed ${doc.id}:`, err.message);
      }
    }

    if (embeddings.size < 2) {
      console.log('[SemanticClustering] Not enough documents with embeddings for clustering');
      return { clusters: [], similarities: new Map(), clusterMap: new Map() };
    }

    // Step 2: Compute pairwise similarity
    const similarities = new Map();
    const docIds = Array.from(embeddings.keys());

    for (let i = 0; i < docIds.length; i++) {
      for (let j = i + 1; j < docIds.length; j++) {
        const id1 = docIds[i];
        const id2 = docIds[j];
        const sim = this.cosineSimilarity(embeddings.get(id1), embeddings.get(id2));
        const key = [id1, id2].sort().join('|||');
        similarities.set(key, sim);
      }
    }

    // Step 3: Cluster using threshold-based union-find
    const clusters = this._clusterByThreshold(docIds, similarities);

    // Step 4: Build clusterMap for quick lookup
    const clusterMap = new Map();
    clusters.forEach((cluster, idx) => {
      cluster.members.forEach((memberId) => {
        clusterMap.set(memberId, idx);
      });
    });

    console.log(`[SemanticClustering] Found ${clusters.length} clusters`);
    return { clusters, similarities, clusterMap };
  }

  /**
   * Cluster documents using threshold on similarity
   * Simpler than k-means but effective for workspace clustering
   */
  _clusterByThreshold(docIds, similarities) {
    const parent = new Map();
    docIds.forEach((id) => parent.set(id, id));

    const find = (x) => {
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)));
      }
      return parent.get(x);
    };

    const union = (x, y) => {
      const px = find(x);
      const py = find(y);
      if (px !== py) {
        parent.set(py, px);
      }
    };

    // Union documents with high similarity
    for (const [key, sim] of similarities) {
      if (sim >= this.similarityThreshold) {
        const [id1, id2] = key.split('|||');
        union(id1, id2);
      }
    }

    // Group by root
    const groups = new Map();
    docIds.forEach((id) => {
      const root = find(id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(id);
    });

    // Convert to cluster objects with strength metric
    const clusters = [];
    for (const [, members] of groups) {
      if (members.length > 1) {
        // Compute average similarity within cluster
        let totalSim = 0, count = 0;
        for (let i = 0; i < members.length; i++) {
          for (let j = i + 1; j < members.length; j++) {
            const key = [members[i], members[j]].sort().join('|||');
            const sim = similarities.get(key) || 0;
            totalSim += sim;
            count++;
          }
        }
        const strength = count > 0 ? totalSim / count : 0;
        clusters.push({
          id: `cluster-${clusters.length}`,
          members,
          strength,
        });
      }
    }

    return clusters;
  }

  /**
   * Get similarity score between two nodes
   */
  getSimilarity(_nodeId1, _nodeId2) {
    // This would be populated from analyzeDocuments results
    return 0;
  }

  /**
   * Clear cache
   */
  clear() {
    this.clusterCache.clear();
  }
}

module.exports = SemanticClusteringService;
