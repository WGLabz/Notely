/**
 * LLMProvider - Abstract base class for LLM integrations
 * Implements pluggable architecture for Gemini, OpenAI, local LLMs, etc.
 */

class LLMProvider {
  constructor(config = {}) {
    this.config = config;
    this.isInitialized = false;
    this.name = 'LLMProvider';
  }

  /**
   * Initialize the provider
   * @throws {Error} If initialization fails
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Generate text completion
   * @param {string} prompt - The input prompt
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} { text, tokensUsed, model }
   */
  async generateText(prompt, options = {}) {
    throw new Error('generateText() must be implemented by subclass');
  }

  /**
   * Generate embeddings for text
   * @param {string|Array<string>} texts - Text(s) to embed
   * @returns {Promise<Array<number>|Array<Array<number>>>} Embedding vector(s)
   */
  async generateEmbeddings(texts) {
    throw new Error('generateEmbeddings() must be implemented by subclass');
  }

  /**
   * Generate chat completion (conversation mode)
   * @param {Array} messages - Message history [{ role, content }]
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} { text, tokensUsed, model }
   */
  async generateChatCompletion(messages, options = {}) {
    throw new Error('generateChatCompletion() must be implemented by subclass');
  }

  /**
   * Validate that provider is properly configured
   * @returns {boolean} True if valid, throws otherwise
   */
  validate() {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Get provider capabilities
   * @returns {Object} { supportsEmbeddings, supportsChatCompletion, supportsCaching, etc. }
   */
  getCapabilities() {
    return {
      supportsEmbeddings: false,
      supportsChatCompletion: false,
      supportsCaching: false,
      supportsStreaming: false,
      maxTokens: 4096
    };
  }

  /**
   * Check if provider is available (has API key, network, etc.)
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return this.isInitialized;
  }

  /**
   * Get current usage stats
   * @returns {Object} { tokensUsedTotal, requestsTotal, cacheHits }
   */
  getUsageStats() {
    return {
      tokensUsedTotal: 0,
      requestsTotal: 0,
      cacheHits: 0
    };
  }
}

module.exports = LLMProvider;
