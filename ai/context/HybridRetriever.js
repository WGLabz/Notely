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
      for (const r of activeRelations) {
        if (r.to_path) {
          graphHits.push({ path: r.to_path, weight: r.weight || 1.0, depth: r.depth || 1 });
        }
      }
    }
    
    // Traverse from top semantic matches to find connected entities
    for (const match of semanticResults.slice(0, 3)) {
      if (match.note_path && !walkedNotes.has(match.note_path)) {
        walkedNotes.add(match.note_path);
        const rels = this.graphRetriever.traverse(match.note_path, 1);
        for (const r of rels) {
          if (r.to_path) {
            graphHits.push({ path: r.to_path, weight: r.weight || 1.0, depth: r.depth || 1 });
          }
        }
      }
    }

    // 3. Reciprocal Rank Fusion (RRF) with Depth Attenuation & Weighting
    const rrfScores = new Map(); // note_path -> score
    const k = 60; // standard RRF constant

    // Add semantic ranks
    semanticResults.forEach((res, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);
      rrfScores.set(res.note_path, score);
    });

    // Add weighted graph ranks
    const graphRankMap = new Map();
    graphHits.forEach((hit) => {
      const decay = 1 / (1 + (hit.depth || 1));
      const score = (hit.weight || 1.0) * decay;
      graphRankMap.set(hit.path, (graphRankMap.get(hit.path) || 0) + score);
    });
    
    // Sort graph hits by weighted connection score
    const sortedGraphHits = Array.from(graphRankMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    sortedGraphHits.forEach((path, index) => {
      const rank = index + 1;
      const baseRrf = 1 / (k + rank);
      const graphWeightBonus = graphRankMap.get(path) || 1.0;
      const score = baseRrf * (1 + 0.25 * graphWeightBonus);
      const existing = rrfScores.get(path) || 0;
      rrfScores.set(path, existing + score);
    });

    // Sort by merged RRF scores
    const merged = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    // Retrieve full contents for the final merged paths
    const results = [];
    for (const [notePath, score] of merged) {
      let content = '';
      const semMatch = semanticResults.find(r => r.note_path === notePath);
      if (semMatch) {
        content = semMatch.content;
      } else {
        try {
          const fs = require('fs');
          if (fs.existsSync(notePath) && fs.statSync(notePath).isFile()) {
            content = fs.readFileSync(notePath, 'utf8');
          }
        } catch (err) {
          log.warn(`Failed to read note during hybrid search fallback: ${err.message}`);
        }
      }

      // Attach graph relations & evidence triples for the matched note
      let graphTriples = [];
      if (this.graphRetriever) {
        try {
          const rels = this.graphRetriever.traverse(notePath, 1);
          graphTriples = (rels || []).map(r => {
            let line = `(${r.from_type || 'Entity'}) ${r.from_name || r.from_path} --[${r.relation}]--> (${r.to_type || 'Entity'}) ${r.to_name || r.to_path}`;
            if (r.evidence) {
              line += ` (Evidence: "${r.evidence}")`;
            }
            return line;
          });
        } catch { /* ignore graph lookup error */ }
      }

      results.push({
        note_path: notePath,
        content: content.slice(0, 4000), // budget preview limit
        score: score,
        graph_triples: graphTriples
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
        return results.map((r, i) => {
          let output = `[${i + 1}] ${r.note_path} (RRF score: ${r.score.toFixed(4)})\n${r.content}`;
          if (r.graph_triples && r.graph_triples.length) {
            output += `\n\nKnowledge Graph Connections:\n  * ` + r.graph_triples.slice(0, 10).join('\n  * ');
          }
          return output;
        }).join('\n\n---\n\n');
      }
    };
  }
}

module.exports = { HybridRetriever };
