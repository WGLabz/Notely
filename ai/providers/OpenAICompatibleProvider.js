/**
 * OpenAICompatibleProvider - Reusable base for OpenAI-compatible APIs using Vercel AI SDK
 */

const LLMProvider = require('./ProviderBase');
const { createLogger } = require('../core/logger');

class OpenAICompatibleProvider extends LLMProvider {
  constructor(apiKey, config = {}) {
    super(config);
    if (!config.baseUrl) throw new Error('OpenAICompatibleProvider requires config.baseUrl');
    if (!config.model)   throw new Error('OpenAICompatibleProvider requires config.model');

    this.apiKey  = apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model   = config.model;
    this.log     = createLogger(this.name || 'OpenAICompatibleProvider');

    this.usageStats = { tokensUsedTotal: 0, requestsTotal: 0 };
  }

  async initialize() {
    this.validate();
    this.isInitialized = true;
    this.log.info('Initialized successfully');
    return true;
  }

  async getModelInstance() {
    if (this.baseUrl.includes('api.groq.com')) {
      const { createGroq } = await import('@ai-sdk/groq');
      const client = createGroq({ apiKey: this.apiKey });
      return client(this.model);
    }
    const { createOpenAI } = await import('@ai-sdk/openai');
    const client = createOpenAI({ apiKey: this.apiKey, baseURL: this.baseUrl });
    return client(this.model);
  }

  validate() {
    if (!this.apiKey || typeof this.apiKey !== 'string' || !this.apiKey.trim()) {
      throw new Error(`${this.name}: API key is required`);
    }
    return true;
  }

  async isAvailable() {
    try {
      this.validate();
      const { generateText } = await import('ai');
      const modelInstance = await this.getModelInstance();
      await generateText({
        model: modelInstance,
        prompt: 'test',
        maxTokens: 5,
      });
      return { available: true };
    } catch (err) {
      this.log.error('isAvailable test failed:', err);
      return { available: false, error: err.message };
    }
  }

  async generateText(prompt, options = {}) {
    if (!this.isInitialized) throw new Error(`${this.name}: provider not initialized`);
    const { temperature = 0.7, maxTokens = 1024, systemPrompt = '' } = options;

    try {
      const { generateText } = await import('ai');
      const modelInstance = await this.getModelInstance();

      const result = await generateText({
        model: modelInstance,
        prompt,
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
        model: this.model,
        finishReason: result.finishReason
      };
    } catch (error) {
      this.log.error('generateText error', error);
      throw error;
    }
  }

  async generateChatCompletion(messages, options = {}) {
    if (!this.isInitialized) throw new Error(`${this.name}: provider not initialized`);
    const { temperature = 0.7, maxTokens = 2048, systemPrompt = '' } = options;

    try {
      const { generateText } = await import('ai');
      const modelInstance = await this.getModelInstance();

      const coreMessages = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));

      const result = await generateText({
        model: modelInstance,
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
        model: this.model,
        finishReason: result.finishReason
      };
    } catch (error) {
      this.log.error('generateChatCompletion error', error);
      throw error;
    }
  }

  async generateEmbeddings(_texts) {
    throw new Error(`${this.name} does not support embeddings. Use Gemini or another embeddings-capable provider.`);
  }

  getCapabilities() {
    return {
      supportsEmbeddings: false,
      supportsChatCompletion: true,
      supportsCaching: false,
      supportsStreaming: true,
      maxTokens: 4096
    };
  }

  getUsageStats() {
    return { ...this.usageStats };
  }
}

module.exports = OpenAICompatibleProvider;
