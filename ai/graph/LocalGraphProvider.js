const { createLogger } = require('../core/logger');
const { GBNF } = require('./GraphGrammar');

const log = createLogger('LocalGraphProvider');

class LocalGraphProvider {
  constructor(modelManager) {
    this.modelManager = modelManager;
    this.context = null;
    this.grammar = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    try {
      if (!this.modelManager || !this.modelManager.isReady()) {
        throw new Error('LocalModelManager is not ready or not loaded');
      }

      log.info('Initializing LocalGraphProvider context and grammar...');
      const model = this.modelManager.getModel();
      
      this.context = await model.createContext();

      const { LlamaGrammar } = await import('node-llama-cpp');
      // Create GBNF grammar
      this.grammar = await LlamaGrammar.getFor(model.llama || model._llama || await (async () => {
        const { getLlama } = await import('node-llama-cpp');
        return getLlama();
      })(), GBNF);

      this.isInitialized = true;
      log.info('LocalGraphProvider initialized successfully');
    } catch (err) {
      log.error('Failed to initialize LocalGraphProvider', err);
      this.isInitialized = false;
      throw err;
    }
  }

  isReady() {
    return this.isInitialized && this.context !== null && this.modelManager.isReady();
  }

  async extractGraph(content, filePath) {
    if (!this.isReady()) {
      throw new Error('LocalGraphProvider is not ready');
    }

    try {
      const path = require('path');
      const noteName = path.basename(filePath, '.md');
      const noteId = noteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const systemPrompt = `You are an AI assistant designed to extract knowledge graphs from markdown text.
Extract all relevant entities (e.g., 'Person', 'Project', 'Technology', 'Company', 'Concept', 'Task') and relationships (e.g., 'REFERENCES', 'USES', 'DEPENDS_ON', 'MENTIONS', 'RELATED_TO') from the provided note text.

Return ONLY a valid JSON object matching the schema.
The note itself is always an entity of type "Note" (the ID is the normalized note path slug: "${noteId}"). Link other extracted entities back to this Note entity using MENTIONS, REFERENCES, etc.`;

      const prompt = `Extract entities and relationships from this note.
Note Path: ${filePath}
Note Contents:
---
${content}
---`;

      log.info(`Generating local graph extraction for: ${filePath}`);

      const { LlamaChatSession, LlamaText } = await import('node-llama-cpp');
      const session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        systemPrompt: systemPrompt
      });

      const response = await session.prompt(LlamaText([prompt]), {
        grammar: this.grammar,
        temperature: 0.1,
        maxTokens: 2048
      });

      log.info('Successfully generated local graph response');
      return JSON.parse(response.trim());
    } catch (err) {
      log.error('Local graph extraction failed', err);
      throw err;
    }
  }
}

module.exports = LocalGraphProvider;
