/**
 * KnowledgeApplicationService.cjs
 * Application service for Search and Knowledge capabilities.
 * Encapsulates Graph DB, Vector DB, and Search operations behind typed business interfaces.
 */

const fs = require('fs');
const path = require('path');
const { collectMarkdownFiles, assertPathInWorkspace } = require('./NoteApplicationService.cjs');

class KnowledgeApplicationService {
  constructor(agentInstance = null) {
    this.agentInstance = agentInstance;
  }

  setAgentInstance(agentInstance) {
    this.agentInstance = agentInstance;
  }

  /**
   * Search notes across workspace using full-text keyword matching.
   */
  async searchNotes({ workspaceRoot, query, limit = 10 }) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }
    const cleanQuery = query.trim().toLowerCase();
    const files = collectMarkdownFiles(workspaceRoot);
    const matches = [];

    for (const filePath of files) {
      try {
        const text = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);
        if (fileName.toLowerCase().includes(cleanQuery) || text.toLowerCase().includes(cleanQuery)) {
          const lowerText = text.toLowerCase();
          const matchIdx = lowerText.indexOf(cleanQuery);
          const start = Math.max(0, matchIdx - 40);
          const end = Math.min(text.length, matchIdx + cleanQuery.length + 60);
          const snippet = matchIdx !== -1 ? text.slice(start, end).replace(/\s+/g, ' ') : text.slice(0, 100);

          matches.push({
            path: filePath,
            title: fileName,
            score: fileName.toLowerCase().includes(cleanQuery) ? 1.0 : 0.7,
            snippet: snippet ? `...${snippet}...` : ''
          });
        }
      } catch {
        // skip unreadable
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, Math.min(limit, 50));
  }

  /**
   * Vector semantic search for similar notes.
   */
  async searchSimilar({ workspaceRoot, notePath, text, topK = 5 }) {
    if (this.agentInstance && this.agentInstance.embeddingService) {
      try {
        const targetText = text || (notePath ? fs.readFileSync(assertPathInWorkspace(notePath, workspaceRoot), 'utf8') : '');
        if (!targetText) return [];
        
        const results = await this.agentInstance.embeddingService.findSimilarDocuments(targetText, topK);
        return (results || []).map(item => ({
          path: item.path || item.documentPath,
          similarity: item.similarity || item.score || 0,
          snippet: item.snippet || ''
        }));
      } catch (err) {
        console.warn('[KnowledgeService] Embedding search error:', err.message);
      }
    }

    // Fallback search if vector service unavailable
    return this.searchNotes({ workspaceRoot, query: text || path.basename(notePath || ''), limit: topK });
  }

  /**
   * Hybrid search combining full-text search and graph/vector results.
   */
  async searchHybrid({ workspaceRoot, query, limit = 10 }) {
    const ftsResults = await this.searchNotes({ workspaceRoot, query, limit });
    const similarResults = await this.searchSimilar({ workspaceRoot, text: query, topK: limit });

    const combinedMap = new Map();

    for (const item of ftsResults) {
      combinedMap.set(item.path, {
        path: item.path,
        compositeScore: item.score * 0.6,
        snippet: item.snippet
      });
    }

    for (const item of similarResults) {
      const existing = combinedMap.get(item.path);
      if (existing) {
        existing.compositeScore += item.similarity * 0.4;
      } else {
        combinedMap.set(item.path, {
          path: item.path,
          compositeScore: item.similarity * 0.4,
          snippet: item.snippet
        });
      }
    }

    const sorted = Array.from(combinedMap.values()).sort((a, b) => b.compositeScore - a.compositeScore);
    return sorted.slice(0, Math.min(limit, 50));
  }

  /**
   * Get knowledge graph connections and related topics.
   */
  async getRelatedTopics({ workspaceRoot, notePath, maxDepth = 2 }) {
    if (this.agentInstance && this.agentInstance.graphService) {
      try {
        const validPath = assertPathInWorkspace(notePath, workspaceRoot);
        const related = await this.agentInstance.graphService.getRelatedNotes(validPath, maxDepth);
        return {
          sourcePath: validPath,
          nodes: (related || []).map(r => ({ path: r.path || r, title: path.basename(r.path || r) })),
          edges: []
        };
      } catch (err) {
        console.warn('[KnowledgeService] Graph Service error:', err.message);
      }
    }

    return {
      sourcePath: notePath,
      nodes: [],
      edges: []
    };
  }

  /**
   * Find semantic topic clusters across workspace.
   */
  async findClusters({ workspaceRoot: _workspaceRoot, minSize = 2 }) {
    if (this.agentInstance && this.agentInstance.clusteringService) {
      try {
        const clusters = await this.agentInstance.clusteringService.getClusters(minSize);
        return clusters || [];
      } catch (err) {
        console.warn('[KnowledgeService] Clustering error:', err.message);
      }
    }
    return [];
  }

  /**
   * Get overall status of Knowledge indexing engines.
   */
  async getKnowledgeStatus({ workspaceRoot }) {
    const files = collectMarkdownFiles(workspaceRoot);
    const graphActive = Boolean(this.agentInstance && this.agentInstance.graphDb);
    const vectorActive = Boolean(this.agentInstance && this.agentInstance.embeddingService);

    return {
      totalNotes: files.length,
      graphActive,
      vectorActive,
      indexingComplete: true
    };
  }

  /**
   * Trigger reindex of Knowledge services.
   */
  async reindexKnowledge({ workspaceRoot, force: _force = false }) {
    if (this.agentInstance && this.agentInstance.graphBuilder) {
      try {
        await this.agentInstance.graphBuilder.rebuildGraph();
      } catch (err) {
        console.warn('[KnowledgeService] Reindex graph error:', err.message);
      }
    }
    return {
      workspaceRoot,
      reindexed: true,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  KnowledgeApplicationService
};
