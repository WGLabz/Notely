const { createLogger } = require('../core/logger');

const log = createLogger('HybridRetriever');

class HybridRetriever {
  constructor(semanticRetriever, graphRetriever) {
    this.semanticRetriever = semanticRetriever;
    this.graphRetriever = graphRetriever;
  }

  async search(query, activeNotePath = null, topK = 5) {
    const startTime = performance.now();
    
    // 1. Run semantic search
    const semanticResults = await this.semanticRetriever.search(query, topK * 2);
    
    // 2. Walk the graph relations
    const graphHits = [];
    const walkedNotes = new Set();
    
    // Traverse from active note path if provided
    if (activeNotePath) {
      walkedNotes.add(activeNotePath);
      const activeRelations = this.graphRetriever.traverse(activeNotePath, 2);
      graphHits.push(...activeRelations.map(r => r.to_path));
    }
    
    // Traverse from top semantic matches to find connected entities
    for (const match of semanticResults.slice(0, 3)) {
      if (!walkedNotes.has(match.note_path)) {
        walkedNotes.add(match.note_path);
        const rels = this.graphRetriever.traverse(match.note_path, 1);
        graphHits.push(...rels.map(r => r.to_path));
      }
    }

    // 3. Reciprocal Rank Fusion (RRF)
    const rrfScores = new Map(); // note_path -> score
    const k = 60; // standard RRF constant

    // Add semantic ranks
    semanticResults.forEach((res, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);
      rrfScores.set(res.note_path, score);
    });

    // Add graph ranks (frequency of relations counts as ranking factor)
    const graphRankMap = new Map();
    graphHits.forEach((path) => {
      graphRankMap.set(path, (graphRankMap.get(path) || 0) + 1);
    });
    
    // Sort graph hits by connection frequency
    const sortedGraphHits = Array.from(graphRankMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    sortedGraphHits.forEach((path, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);
      rrfScores.set(path, (rrfScores.get(path) || 0) + score);
    });

    // Sort by merged RRF scores
    const merged = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    // Retrieve full contents for the final merged paths
    const results = [];
    for (const [notePath, score] of merged) {
      // Find content from semantic results, otherwise load from disk
      let content = '';
      const semMatch = semanticResults.find(r => r.note_path === notePath);
      if (semMatch) {
        content = semMatch.content;
      } else {
        try {
          const fs = require('fs');
          if (fs.existsSync(notePath)) {
            content = fs.readFileSync(notePath, 'utf8');
          }
        } catch (err) {
          log.warn(`Failed to read note during hybrid search fallback: ${err.message}`);
        }
      }

      results.push({
        note_path: notePath,
        content: content.slice(0, 4000), // budget preview limit
        score: score
      });
    }

    const duration = performance.now() - startTime;
    log.info(`Hybrid search completed in ${duration.toFixed(2)}ms. Merged ${results.length} documents.`);
    return results;
  }

  toTool() {
    return {
      description: 'Search workspace notes using a hybrid algorithm combining semantic vector search and knowledge graph traversal. Highly recommended to use this for general queries.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search phrase or question to find relevant note content for.' },
          activeNotePath: { type: 'string', description: 'Optional path to the currently active note to traverse relations from.' },
          topK: { type: 'number', description: 'Number of results to return (default 5).', default: 5 }
        },
        required: ['query']
      },
      execute: async ({ query, activeNotePath = null, topK = 5 }) => {
        const results = await this.search(query, activeNotePath, topK);
        if (!results.length) return 'No relevant note content found.';
        return results.map((r, i) =>
          `[${i + 1}] ${r.note_path} (RRF score: ${r.score.toFixed(4)})\n${r.content}`
        ).join('\n\n');
      }
    };
  }
}

module.exports = { HybridRetriever };
