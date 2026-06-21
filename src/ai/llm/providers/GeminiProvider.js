/**
 * GeminiProvider - Google Gemini API integration
 */

const LLMProvider = require('../LLMProvider');

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
      console.log('[GeminiProvider] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[GeminiProvider] Initialization failed:', error.message);
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
      const response = await fetch(
        `${this.baseUrl}/${this.models.text}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'test' }] }]
          })
        }
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

      const response = await fetch(
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
      console.error('[GeminiProvider] generateText error:', error);
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
      const response = await fetch(
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
      console.error('[GeminiProvider] generateEmbeddings error:', error);
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

      messages.forEach((msg, idx) => {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      });

      const response = await fetch(
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
      console.error('[GeminiProvider] generateChatCompletion error:', error);
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
