/**
 * GroqProvider - Groq cloud inference (free tier).
 *
 * Groq uses the OpenAI API format, so this is a thin configuration layer
 * on top of OpenAICompatibleProvider. The only things that differ from
 * another OpenAI-compatible provider are the base URL and the default model.
 *
 * Groq does NOT offer an embeddings endpoint; embedding-dependent features
 * (semantic search, relationship discovery) will gracefully degrade when
 * Groq is the active provider.
 *
 * Free-tier limits (as of 2025): generous daily request quota, no credit card.
 * API key obtained at: https://console.groq.com
 */

const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');

// Groq-hosted models available on the free tier.
const GROQ_MODELS = {
  // Default — fast, capable, large context.
  default: 'llama-3.3-70b-versatile',
  // Lighter option for lower latency / higher throughput.
  fast: 'llama3-8b-8192',
  // Google's open model via Groq.
  gemma: 'gemma2-9b-it',
};

class GroqProvider extends OpenAICompatibleProvider {
  /**
   * @param {string} apiKey  - Groq API key (gsk_…)
   * @param {Object} [config]
   * @param {string} [config.model]           - Override default model
   * @param {number} [config.requestTimeoutMs]
   * @param {number} [config.maxRetries]
   */
  constructor(apiKey, config = {}) {
    super(apiKey, {
      ...config,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: config.model || GROQ_MODELS.default,
    });
    this.name = 'Groq';
  }

  getCapabilities() {
    return {
      supportsEmbeddings: false,
      supportsChatCompletion: true,
      supportsCaching: false,
      supportsStreaming: false,
      // llama-3.3-70b-versatile has a 128k context window on Groq.
      maxTokens: 128000,
    };
  }
}

module.exports = { GroqProvider, GROQ_MODELS };
