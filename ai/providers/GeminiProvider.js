/**
 * GeminiProvider - Google Gemini API integration using Vercel AI SDK
 */

const LLMProvider = require('./ProviderBase');
const { createLogger } = require('../core/logger');

const log = createLogger('GeminiProvider');

class GeminiProvider extends LLMProvider {
  constructor(apiKey, config = {}) {
    super(config);
    this.name = 'Gemini';
    this.apiKey = apiKey;
    let modelName = config.model || 'gemini-2.0-flash';
    if (modelName.startsWith('models/')) {
      modelName = modelName.substring('models/'.length);
    }
    this.models = {
      text: modelName,
      embedding: 'text-embedding-004'
    };
    this.usageStats = {
      tokensUsedTotal: 0,
      requestsTotal: 0,
      cacheHits: 0
    };
  }

  async initialize() {
    try {
      this.validate();
      this.isInitialized = true;
      log.info('Initialized successfully');
      return true;
    } catch (error) {
      log.error('Initialization failed', error);
      throw error;
    }
  }

  async getModelInstance() {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const google = createGoogleGenerativeAI({ apiKey: this.apiKey });
    return google(this.models.text);
  }

  validate() {
    if (!this.apiKey) {
      throw new Error('Gemini API key is required');
    }
    if (typeof this.apiKey !== 'string' || this.apiKey.length === 0) {
      throw new Error('Invalid Gemini API key format');
    }
    return true;
  }

  async isAvailable() {
    try {
      this.validate();
      const { generateText } = await import('ai');
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey: this.apiKey });
      const model = google(this.models.text);
      await generateText({
        model,
        prompt: 'test',
        maxTokens: 5,
      });
      return { available: true };
    } catch (err) {
      log.error('isAvailable test failed:', err);
      return { available: false, error: err.message };
    }
  }

  async generateText(prompt, options = {}) {
    if (!this.isInitialized) throw new Error('Provider not initialized');

    const {
      temperature = 0.7,
      maxTokens = 1024,
      topP = 0.95,
      systemPrompt = ''
    } = options;

    try {
      const { generateText } = await import('ai');
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey: this.apiKey });
      const model = google(this.models.text);

      const result = await generateText({
        model,
        prompt,
        temperature,
        maxTokens,
        topP,
        system: systemPrompt || undefined,
      });

      const tokensUsed = result.usage?.totalTokens || 0;
      this.usageStats.tokensUsedTotal += tokensUsed;
      this.usageStats.requestsTotal += 1;

      return {
        text: result.text,
        tokensUsed,
        model: this.models.text,
        finishReason: result.finishReason
      };
    } catch (error) {
      log.error('generateText error', error);
      throw error;
    }
  }

  async generateEmbeddings(texts) {
    if (!this.isInitialized) throw new Error('Provider not initialized');

    const textArray = Array.isArray(texts) ? texts : [texts];

    try {
      const { embed, embedMany } = await import('ai');
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey: this.apiKey });
      const model = google.textEmbeddingModel(this.models.embedding);

      this.usageStats.requestsTotal += 1;

      if (textArray.length === 1) {
        const { embedding } = await embed({
          model,
          value: textArray[0],
        });
        return Array.isArray(texts) ? [embedding] : embedding;
      } else {
        const { embeddings } = await embedMany({
          model,
          values: textArray,
        });
        return embeddings;
      }
    } catch (error) {
      log.error('generateEmbeddings error', error);
      throw error;
    }
  }

  async generateChatCompletion(messages, options = {}) {
    if (!this.isInitialized) throw new Error('Provider not initialized');

    const {
      temperature = 0.7,
      maxTokens = 2048,
      systemPrompt = ''
    } = options;

    try {
      const { generateText } = await import('ai');
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey: this.apiKey });
      const model = google(this.models.text);

      // Convert messages to Vercel AI SDK core message format
      const coreMessages = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));

      const result = await generateText({
        model,
        messages: coreMessages,
        temperature,
        maxTokens,
        system: systemPrompt || undefined,
      });

      const tokensUsed = result.usage?.totalTokens || 0;
      this.usageStats.tokensUsedTotal += tokensUsed;
      this.usageStats.requestsTotal += 1;

      return {
        text: result.text,
        tokensUsed,
        model: this.models.text,
        finishReason: result.finishReason
      };
    } catch (error) {
      log.error('generateChatCompletion error', error);
      throw error;
    }
  }

  getCapabilities() {
    return {
      supportsEmbeddings: true,
      supportsChatCompletion: true,
      supportsCaching: true,
      supportsStreaming: true,
      maxTokens: 32768,
      embeddingDimensions: 768
    };
  }

  getUsageStats() {
    return { ...this.usageStats };
  }
}

module.exports = GeminiProvider;
