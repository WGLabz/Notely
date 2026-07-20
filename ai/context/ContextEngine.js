const { createLogger } = require('../core/logger');

const log = createLogger('ContextEngine');

const DEFAULT_PERSONA_ID = 'default';
// Max chars of note content to include in system context (rough token budget guard)
const NOTE_CONTEXT_LIMIT = 4000;

/**
 * ContextEngine - assembles the full context payload for every LLM call.
 *
 * Provides:
 *  - System prompt from the active persona (.md file or DB fallback)
 *  - Active note text (truncated to token budget)
 *  - Recent conversation history
 *  - Tool definitions: SemanticRetriever + GraphRetriever + HybridRetriever
 */
class ContextEngine {
  /**
   * @param {import('../memory/ConversationStore').ConversationStore} store
   * @param {import('./SemanticRetriever').SemanticRetriever} semanticRetriever
   * @param {import('./GraphRetriever').GraphRetriever} graphRetriever
   * @param {import('./HybridRetriever').HybridRetriever} hybridRetriever
   */
  constructor(store, semanticRetriever, graphRetriever, hybridRetriever = null) {
    this.store = store;
    this.semanticRetriever = semanticRetriever;
    this.graphRetriever = graphRetriever;
    this.hybridRetriever = hybridRetriever;
  }

  /**
   * Build a complete context bundle for the AI SDK streamText / generateText call.
   *
   * @param {object} opts
   * @param {string} opts.conversationId
   * @param {string} [opts.activeNotePath]
   * @param {string} [opts.activeNoteContent]
   * @param {number} [opts.historyLimit=20]  Max messages from history to include
   * @returns {{ system: string, messages: object[], tools: object }}
   */
  buildContext({ conversationId, activeNotePath, activeNoteContent, historyLimit = 20 }) {
    const conversation = this.store.getConversation(conversationId);
    const personaId = conversation?.persona ?? DEFAULT_PERSONA_ID;
    const persona = this.store.getPersona(personaId) ?? this.store.getPersona(DEFAULT_PERSONA_ID);

    // System prompt from persona
    let system = persona?.prompt ?? 'You are a helpful assistant.';

    // Append active note context to system block (not user message)
    if (activeNotePath && activeNoteContent) {
      const preview = activeNoteContent.length > NOTE_CONTEXT_LIMIT
        ? activeNoteContent.slice(0, NOTE_CONTEXT_LIMIT) + '\n...[truncated]'
        : activeNoteContent;
      system += `\n\n---\nCURRENT NOTE (${activeNotePath}):\n${preview}`;
    }

    // Conversation history (newest historyLimit messages)
    const allMessages = this.store.getMessages(conversationId);
    const messages = allMessages.slice(-historyLimit).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Tool definitions for the LLM to call dynamically
    const tools = {
      searchNotes: this.semanticRetriever.toTool(),
      exploreGraph: this.graphRetriever.toTool()
    };

    if (this.hybridRetriever) {
      tools.hybridSearchNotes = this.hybridRetriever.toTool();
    }

    log.info(`Context built for conversation=${conversationId} persona=${personaId} msgs=${messages.length}`);

    return { system, messages, tools };
  }
}

module.exports = { ContextEngine };
