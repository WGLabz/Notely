/**
 * LLMRegistry - Central registry for LLM providers
 * Manages provider instantiation and selection
 */

const GeminiProvider = require('./providers/GeminiProvider');

class LLMRegistry {
  constructor() {
    this.providers = new Map();
    this.activeProvider = null;
    this._registerBuiltInProviders();
  }

  /**
   * Register built-in providers
   * @private
   */
  _registerBuiltInProviders() {
    this.register('gemini', (config) => new GeminiProvider(config.apiKey, config));
  }

  /**
   * Register a provider factory
   */
  register(name, factory) {
    this.providers.set(name.toLowerCase(), factory);
    console.log(`[LLMRegistry] Registered provider: ${name}`);
  }

  /**
   * Initialize and activate a provider
   */
  async activateProvider(name, config) {
    const factory = this.providers.get(name.toLowerCase());
    
    if (!factory) {
      throw new Error(`Provider not found: ${name}. Available: ${Array.from(this.providers.keys()).join(', ')}`);
    }

    try {
      const provider = factory(config);
      await provider.initialize();
      this.activeProvider = provider;
      console.log(`[LLMRegistry] Activated provider: ${name}`);
      return provider;
    } catch (error) {
      console.error(`[LLMRegistry] Failed to activate ${name}:`, error.message);
      throw error;
    }
  }

  /**
   * Get active provider
   */
  getActiveProvider() {
    if (!this.activeProvider) {
      throw new Error('No active LLM provider. Call activateProvider() first.');
    }
    return this.activeProvider;
  }

  /**
   * Get provider by name (without activation)
   */
  getProvider(name) {
    const factory = this.providers.get(name.toLowerCase());
    if (!factory) {
      throw new Error(`Provider not found: ${name}`);
    }
    return factory;
  }

  /**
   * List available providers
   */
  listProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if provider exists
   */
  hasProvider(name) {
    return this.providers.has(name.toLowerCase());
  }
}

module.exports = LLMRegistry;
