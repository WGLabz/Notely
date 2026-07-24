/**
 * WorkspaceBrain - Factual retrieval and state aggregator for Notely AI
 * Responsible for gathering context, search results, vector embeddings, and knowledge graph relations.
 */

class WorkspaceBrain {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * Gather structured workspace facts for a user query
   * @param {string} query
   * @param {object} context - { activeNotePath, activeNoteContent }
   * @returns {Promise<object>} - Normalized WorkspaceFacts payload
   */
  async getWorkspaceFacts(query, context = {}) {
    const facts = {
      activeNote: null,
      keywordResults: [],
      semanticResults: [],
      graphRelations: [],
      tasks: []
    };

    const activePath = context.activeNotePath || context.currentFile || null;

    // 1. Capture active open note context
    if (activePath) {
      let activeContent = context.activeNoteContent || null;
      if (!activeContent && this.agent.documentService) {
        try {
          activeContent = this.agent.documentService.getDocumentContent(activePath);
        } catch {
          // Non-fatal if unreadable
        }
      }
      facts.activeNote = {
        path: activePath,
        content: activeContent ? (activeContent.length > 4000 ? activeContent.slice(0, 4000) + '\n...(truncated)' : activeContent) : null
      };
    }

    // 2. Query Hybrid/Semantic Retriever if available
    if (this.agent.contextEngine?.hybridRetriever) {
      try {
        const hybridRes = await this.agent.contextEngine.hybridRetriever.search(query, activePath, 5);
        if (hybridRes && Array.isArray(hybridRes)) {
          facts.semanticResults = hybridRes.map(r => ({
            filePath: r.note_path || r.filePath || r.path,
            snippet: r.snippet || r.content || '',
            score: r.score
          }));
        }
      } catch (err) {
        console.warn('[WorkspaceBrain] ContextEngine hybrid retrieval skipped:', err.message);
      }
    }

    // 3. Query Knowledge Graph relation hops if available
    if (this.agent.contextEngine?.graphRetriever && query) {
      try {
        const relations = this.agent.contextEngine.graphRetriever.traverse(query, 2);
        if (relations && Array.isArray(relations)) {
          facts.graphRelations = relations.map(rel => ({
            source: rel.from_path || rel.source_id,
            target: rel.to_path || rel.target_id,
            type: rel.relation || rel.type,
            evidence: rel.raw_sentence || null
          }));
        }
      } catch (err) {
        console.warn('[WorkspaceBrain] Graph traversal skipped:', err.message);
      }
    }

    return facts;
  }
}

module.exports = WorkspaceBrain;
