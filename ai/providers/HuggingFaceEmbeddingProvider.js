/**
 * HuggingFaceEmbeddingProvider - Embeddings via the HuggingFace Inference API.
 *
 * WHY THIS EXISTS
 * ---------------
 * Groq (and most fast-inference providers) do not expose an embeddings endpoint.
 * Gemini does, but it requires the user to have a Gemini API key. We want
 * embeddings to work for *any* combination of text provider and hardware, without
 * expecting a powerful local machine.
 *
 * The HuggingFace Inference API solves this:
 *   - Free tier: no credit card, generous daily quota (~1 000 req/day)
 *   - Cloud inference: no GPU/RAM requirements on the user's machine
 *   - Simple token: one HF account, one token, all models
 *
 * MODEL
 * -----
 * Default: sentence-transformers/all-MiniLM-L6-v2
 *   - 384-dimensional vectors
 *   - Excellent semantic quality for document similarity
 *   - Small and fast on HF shared infrastructure
 *
 * INTERFACE
 * ---------
 * This class deliberately does NOT extend LLMProvider/OpenAICompatibleProvider
 * because it is embedding-only — it has no generateText / generateChatCompletion.
 * EmbeddingService is injected with this provider directly and calls only
 * generateEmbeddings().
 */

const HttpClient = require('../HttpClient');
const { createLogger } = require('../core/logger');

const log = createLogger('HuggingFaceEmbeddingProvider');

const HF_API_BASE = 'https://api-inference.huggingface.co/pipeline/feature-extraction';
const DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

// HF cold-start on shared infra can take ~20s for the first request.
const HF_TIMEOUT_MS = 30000;

class HuggingFaceEmbeddingProvider {
  /**
   * @param {string} token  - HuggingFace API token (hf_…)
   * @param {Object} [config]
   * @param {string} [config.model]  - Override embedding model
   */
  constructor(token, config = {}) {
    this.name = 'HuggingFace';
    this.token = token;
    this.model = config.model || DEFAULT_MODEL;
    this.http = new HttpClient({ requestTimeoutMs: HF_TIMEOUT_MS, maxRetries: 2 });
    this.isInitialized = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize() {
    this._validate();
    await this._testConnection();
    this.isInitialized = true;
    log.info(`Initialized with model: ${this.model}`);
    return true;
  }

  _validate() {
    if (!this.token || typeof this.token !== 'string' || !this.token.trim()) {
      throw new Error('HuggingFace API token is required');
    }
  }

  async isAvailable() {
    return this.isInitialized;
  }

  // ── Embeddings ─────────────────────────────────────────────────────────────

  /**
   * Generate embedding vector(s) for one or more texts.
   *
   * HF feature-extraction returns:
   *   single string  → float[]          (1-D vector)
   *   string[]       → float[][]        (one vector per input)
   *
   * We normalise both cases so callers always get what they asked for.
   *
   * @param {string|string[]} texts
   * @returns {Promise<number[]|number[][]>}
   */
  async generateEmbeddings(texts) {
    if (!this.isInitialized) throw new Error('HuggingFace provider not initialized');

    const isArray = Array.isArray(texts);
    const inputs = isArray ? texts : [String(texts)];

    // HF expects { inputs: string | string[] }
    const response = await this.http.fetchWithRetry(
      `${HF_API_BASE}/${encodeURIComponent(this.model)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error || response.statusText;

      // HF returns 503 when the model is loading (cold start).
      if (response.status === 503) {
        throw new Error(`HuggingFace model is loading — retry in a moment. (${msg})`);
      }
      throw new Error(`HuggingFace API error ${response.status}: ${msg}`);
    }

    const data = await response.json();

    // Normalise: HF may return float[][] (one vector per input) or a nested
    // array when inputs is a single string. Flatten to match what was requested.
    const vectors = this._normaliseResponse(data, inputs.length);

    return isArray ? vectors : vectors[0];
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /**
   * Normalise HF response to always be an array of flat number vectors.
   * @private
   */
  _normaliseResponse(data, expectedCount) {
    // If data is already float[][] of the right length — use as-is.
    if (Array.isArray(data) && data.length === expectedCount && Array.isArray(data[0]) && typeof data[0][0] === 'number') {
      return data;
    }

    // Single vector returned as float[] — wrap in array.
    if (Array.isArray(data) && typeof data[0] === 'number') {
      return [data];
    }

    // Some models return [[float[]]] (extra nesting from mean-pooling).
    if (Array.isArray(data) && Array.isArray(data[0]) && Array.isArray(data[0][0])) {
      return data.map((item) => item[0]);
    }

    throw new Error(`Unexpected HuggingFace embedding response shape: ${JSON.stringify(data).slice(0, 120)}`);
  }

  /**
   * Minimal connectivity check — embed a short string and verify we get a vector back.
   * @private
   */
  async _testConnection() {
    try {
      const result = await this.generateEmbeddings('test');
      if (!Array.isArray(result) || result.length === 0) {
        throw new Error('Empty embedding vector returned');
      }
    } catch (error) {
      throw new Error(`HuggingFace connection test failed: ${error.message}`);
    }
  }

  getCapabilities() {
    return {
      supportsEmbeddings: true,
      supportsChatCompletion: false,
      model: this.model,
      dimensions: 384, // all-MiniLM-L6-v2 default
    };
  }
}

module.exports = { HuggingFaceEmbeddingProvider, HF_API_BASE, DEFAULT_MODEL };
