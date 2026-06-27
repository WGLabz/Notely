/**
 * GeminiProvider - Google Gemini API integration
 */

const LLMProvider = require('../LLMProvider');
const { createLogger } = require('../../utils/logger');

const log = createLogger('GeminiProvider');

class GeminiProvider extends LLMProvider {
  constructor(apiKey, config = {}) {
    super(config);
    this.name = 'Gemini';
    this.apiKey = apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.models = {
      text: 'gemini-2.0-flash',
      embedding: 'text-embedding-004'
    };
    this.usageStats = {
      tokensUsedTotal: 0,
      requestsTotal: 0,
      cacheHits: 0
    };
    this.requestTimeoutMs = Number(config.requestTimeoutMs) || 30000;
    this.maxRetries = Number.isInteger(config.maxRetries) ? config.maxRetries : 2;
  }

  /**
   * Fetch with an abort-based timeout and exponential backoff retries.
   * Retries network errors, timeouts, HTTP 429 and 5xx responses. Honors a
   * Retry-After header when present. Non-retryable responses are returned as-is
   * so callers can inspect response.ok.
   * @private
   */
  async _fetchWithRetry(url, init = {}, { retries = this.maxRetries, timeoutMs = this.requestTimeoutMs } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          await this._delay(this._backoffDelay(attempt, response));
          continue;
        }
        return response;
      } catch (error) {
        clearTimeout(timer);
        lastError = error?.name === 'AbortError'
          ? new Error(`Gemini request timed out after ${timeoutMs}ms`)
          : error;
        if (attempt < retries) {
          await this._delay(this._backoffDelay(attempt));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error('Gemini request failed');
  }

  /**
   * Compute backoff delay (ms), honoring Retry-After when provided.
   * @private
   */
  _backoffDelay(attempt, response) {
    if (response && typeof response.headers?.get === 'function') {
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        return Math.min(retryAfter * 1000, 20000);
      }
    }
    const base = Math.min(1000 * 2 ** attempt, 8000);
    return base + Math.floor(Math.random() * 250);
  }

  /**
   * @private
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Initialize Gemini provider
   */
  async initialize() {
    try {
      this.validate();
      
      // Test API connectivity
      await this._testConnection();
      
      this.isInitialized = true;
      log.info('Initialized successfully');
      return true;
    } catch (error) {
      log.error('Initialization failed', error);
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  validate() {
    if (!this.apiKey) {
      throw new Error('Gemini API key is required');
    }
    if (typeof this.apiKey !== 'string' || this.apiKey.length === 0) {
      throw new Error('Invalid Gemini API key format');
    }
    return true;
  }

  /**
   * Test API connection
   * @private
   */
  async _testConnection() {
    try {
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/${this.models.text}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'test' }] }]
          })
        },
        { timeoutMs: 15000, retries: 1 }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`API Error: ${error.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Generate text completion
   */
  async generateText(prompt, options = {}) {
    if (!this.isInitialized) throw new Error('Provider not initialized');

    const {
      temperature = 0.7,
      maxTokens = 1024,
      topP = 0.95,
      systemPrompt = ''
    } = options;

    try {
      const contents = [];

      // Add system prompt if provided
      if (systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: systemPrompt }]
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Understood. I will follow these instructions.' }]
        });
      }

      // Add user prompt
      contents.push({
        role: 'user',
        parts: [{ text: prompt }]
      });

      const response = await this._fetchWithRetry(
        `${this.baseUrl}/${this.models.text}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              topP,
              candidateCount: 1
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini API Error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response from Gemini');
      }

      const text = data.candidates[0].content.parts[0].text;
      const tokensUsed = data.usageMetadata?.totalTokenCount || 0;

      this.usageStats.tokensUsedTotal += tokensUsed;
      this.usageStats.requestsTotal += 1;

      return {
        text,
        tokensUsed,
        model: this.models.text,
        finishReason: data.candidates[0].finishReason
      };
    } catch (error) {
      log.error('generateText error', error);
      throw error;
    }
  }

  /**
   * Generate embeddings
   */
  async generateEmbeddings(texts) {
    if (!this.isInitialized) throw new Error('Provider not initialized');

    const textArray = Array.isArray(texts) ? texts : [texts];

    try {
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/${this.models.embedding}:batchEmbedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: textArray.map(text => ({
              model: `models/${this.models.embedding}`,
              content: { parts: [{ text }] }
            }))
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini Embeddings Error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();

      if (!data.embeddings || data.embeddings.length === 0) {
        throw new Error('No embeddings returned');
      }

      const embeddings = data.embeddings.map(e => e.values);

      this.usageStats.requestsTotal += 1;

      return Array.isArray(texts) ? embeddings : embeddings[0];
    } catch (error) {
      log.error('generateEmbeddings error', error);
      throw error;
    }
  }

  /**
   * Generate chat completion
   */
  async generateChatCompletion(messages, options = {}) {
    if (!this.isInitialized) throw new Error('Provider not initialized');

    const {
      temperature = 0.7,
      maxTokens = 2048,
      systemPrompt = ''
    } = options;

    try {
      // Convert to Gemini format
      const contents = [];

      if (systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: systemPrompt }]
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Understood.' }]
        });
      }

      messages.forEach((msg) => {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      });

      const response = await this._fetchWithRetry(
        `${this.baseUrl}/${this.models.text}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              candidateCount: 1
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini API Error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response from Gemini');
      }

      const text = data.candidates[0].content.parts[0].text;
      const tokensUsed = data.usageMetadata?.totalTokenCount || 0;

      this.usageStats.tokensUsedTotal += tokensUsed;
      this.usageStats.requestsTotal += 1;

      return {
        text,
        tokensUsed,
        model: this.models.text,
        finishReason: data.candidates[0].finishReason
      };
    } catch (error) {
      log.error('generateChatCompletion error', error);
      throw error;
    }
  }

  /**
   * Get capabilities
   */
  getCapabilities() {
    return {
      supportsEmbeddings: true,
      supportsChatCompletion: true,
      supportsCaching: true,
      supportsStreaming: false,
      maxTokens: 32768,
      embeddingDimensions: 768
    };
  }

  /**
   * Get usage stats
   */
  getUsageStats() {
    return { ...this.usageStats };
  }
}

module.exports = GeminiProvider;
