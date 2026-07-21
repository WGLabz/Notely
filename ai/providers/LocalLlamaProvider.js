const LLMProvider = require('./ProviderBase');
const { createLogger } = require('../core/logger');

const log = createLogger('LocalLlamaProvider');

class LocalLlamaProvider extends LLMProvider {
  constructor(modelManager, config = {}) {
    super(config);
    this.modelManager = modelManager;
    this.context = null;
    this.name = 'Local (Qwen2.5-0.5B)';
  }

  async initialize() {
    if (this.isInitialized) return;
    try {
      if (!this.modelManager || !this.modelManager.isReady()) {
        throw new Error('LocalModelManager is not ready or not loaded');
      }

      log.info('Initializing LocalLlamaProvider context...');
      const model = this.modelManager.getModel();
      this.context = await model.createContext();
      this.isInitialized = true;
      log.info('LocalLlamaProvider initialized successfully');
    } catch (err) {
      log.error('Failed to initialize LocalLlamaProvider', err);
      this.isInitialized = false;
      throw err;
    }
  }

  async generateText(prompt, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const { LlamaChatSession, LlamaText } = await import('node-llama-cpp');
      const session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        systemPrompt: options.systemPrompt || 'You are a helpful assistant.'
      });

      log.info('Generating text completion locally...');
      const response = await session.prompt(LlamaText([prompt]), {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048
      });

      return {
        text: response,
        tokensUsed: 0, // In local, tokens are free, mock or set to 0
        model: 'qwen2.5-0.5b-instruct'
      };
    } catch (err) {
      log.error('Local text generation failed', err);
      throw err;
    }
  }

  async generateChatCompletion(messages, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const { LlamaChatSession, LlamaText } = await import('node-llama-cpp');
      
      // Map message history
      const history = [];
      let systemPrompt = options.systemPrompt || 'You are a helpful assistant.';

      for (const msg of messages) {
        if (msg.role === 'system') {
          systemPrompt = msg.content;
        } else if (msg.role === 'user') {
          history.push({
            author: 'user',
            text: LlamaText([msg.content])
          });
        } else if (msg.role === 'assistant') {
          history.push({
            author: 'model',
            text: [msg.content]
          });
        }
      }

      // Pop last user message to prompt session
      let lastPrompt = '';
      if (history.length > 0 && history[history.length - 1].author === 'user') {
        const lastUserMsg = history.pop();
        // Since LlamaText might wrap it, we extract the text representation
        lastPrompt = lastUserMsg.text.values ? lastUserMsg.text.values.join(' ') : String(lastUserMsg.text);
      }

      const session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        systemPrompt: systemPrompt
      });
      session.setChatHistory(history);

      log.info('Generating chat completion locally...');
      const response = await session.prompt(LlamaText([lastPrompt]), {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048
      });

      return {
        text: response,
        tokensUsed: 0,
        model: 'qwen2.5-0.5b-instruct'
      };
    } catch (err) {
      log.error('Local chat completion failed', err);
      throw err;
    }
  }

  validate() {
    if (!this.modelManager || !this.modelManager.isReady()) {
      throw new Error('Local Qwen model is not downloaded or loaded. Please download it first.');
    }
    return true;
  }

  getCapabilities() {
    return {
      supportsEmbeddings: false,
      supportsChatCompletion: true,
      supportsCaching: false,
      supportsStreaming: false,
      maxTokens: 4096
    };
  }

  async isAvailable() {
    return this.isInitialized && this.modelManager && this.modelManager.isReady();
  }
}

module.exports = LocalLlamaProvider;
