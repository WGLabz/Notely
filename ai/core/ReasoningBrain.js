/**
 * ReasoningBrain - Pure reasoning & synthesis engine for Notely AI
 * Consumes normalized WorkspaceFacts evidence payloads from WorkspaceBrain.
 * Holds ZERO direct storage, database, or filesystem dependencies.
 */

class ReasoningBrain {
  constructor(llmRegistry) {
    this.llmRegistry = llmRegistry;
  }

  /**
   * Format facts into clean evidence prompt context
   * @param {object} facts
   * @returns {string}
   */
  formatEvidenceContext(facts) {
    if (!facts) return '';
    let contextStr = '';

    if (facts.activeNote) {
      contextStr += `\n[ACTIVE NOTE: ${facts.activeNote.path}]\n${facts.activeNote.content || '(empty note)'}\n`;
    }

    if (facts.semanticResults && facts.semanticResults.length > 0) {
      contextStr += `\n[RELEVANT WORKSPACE CHUNKS]:\n`;
      facts.semanticResults.forEach((item, i) => {
        contextStr += `${i + 1}. Note: [${item.filePath}](file:///${item.filePath.replace(/\\/g, '/')})\nContent: ${item.snippet}\n\n`;
      });
    }

    if (facts.graphRelations && facts.graphRelations.length > 0) {
      contextStr += `\n[KNOWLEDGE GRAPH RELATIONS]:\n`;
      facts.graphRelations.forEach(rel => {
        contextStr += `- ${rel.source} ${rel.type} ${rel.target}${rel.evidence ? ` (Evidence: "${rel.evidence}")` : ''}\n`;
      });
    }

    return contextStr;
  }

  /**
   * Synthesize natural language answer using provided evidence
   * @param {string} userQuery
   * @param {object} facts - WorkspaceFacts from WorkspaceBrain
   * @param {string} systemPrompt
   * @returns {Promise<object>}
   */
  async synthesize(userQuery, facts, systemPrompt) {
    const evidenceText = this.formatEvidenceContext(facts);
    const fullSystemPrompt = `${systemPrompt}\n\n[RETRIEVED WORKSPACE EVIDENCE]:\n${evidenceText || 'No workspace evidence found.'}`;

    const provider = this.llmRegistry.getActiveProvider();
    if (!provider) {
      throw new Error('No active LLM provider configured.');
    }

    const messages = [{ role: 'user', content: userQuery }];
    const result = await provider.generateText({
      system: fullSystemPrompt,
      messages
    });

    return {
      text: result.text,
      tokensUsed: result.usage?.totalTokens || 0,
      evidenceUsed: Boolean(evidenceText)
    };
  }
}

module.exports = ReasoningBrain;
