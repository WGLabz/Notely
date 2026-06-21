/**
 * AI Configuration - API key management and settings
 */

const path = require('path');
const fs = require('fs');
const { app, safeStorage } = require('electron');

class AIConfig {
  constructor() {
    this.appDataDir = app.getPath('appData');
    this.configDir = path.join(this.appDataDir, 'notely');
    this.configPath = path.join(this.configDir, 'ai-config.json');
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * Save API key securely
   */
  saveAPIKey(provider, apiKey) {
    try {
      let config = {};

      if (fs.existsSync(this.configPath)) {
        config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }

      // Encrypt using Electron's safeStorage
      const encrypted = safeStorage.encryptString(apiKey);
      config[provider] = encrypted.toString('latin1');

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error('[AIConfig] Failed to save API key:', error.message);
      throw error;
    }
  }

  /**
   * Get API key
   */
  getAPIKey(provider) {
    try {
      if (!fs.existsSync(this.configPath)) {
        return null;
      }

      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));

      if (!config[provider]) {
        return null;
      }

      try {
        // Decrypt using Electron's safeStorage
        const encrypted = Buffer.from(config[provider], 'latin1');
        const decrypted = safeStorage.decryptString(encrypted);
        return decrypted;
      } catch (decryptError) {
        // Auto-clean invalid/stale ciphertext so UI can recover without repeated failures.
        delete config[provider];
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        console.warn(
          `[AIConfig] Removed invalid API key for provider "${provider}":`,
          decryptError.message
        );
        return null;
      }
    } catch (error) {
      console.error('[AIConfig] Failed to get API key:', error.message);
      return null;
    }
  }

  /**
   * Check if API key is configured
   */
  hasAPIKey(provider) {
    return this.getAPIKey(provider) !== null;
  }

  /**
   * Remove API key
   */
  removeAPIKey(provider) {
    try {
      if (!fs.existsSync(this.configPath)) {
        return true;
      }

      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      delete config[provider];

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error('[AIConfig] Failed to remove API key:', error.message);
      throw error;
    }
  }

  /**
   * Get all configured providers
   */
  getConfiguredProviders() {
    try {
      if (!fs.existsSync(this.configPath)) {
        return [];
      }

      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      return Object.keys(config);
    } catch (error) {
      console.error('[AIConfig] Failed to get configured providers:', error.message);
      return [];
    }
  }

  /**
   * Save user preferences
   */
  savePreferences(preferences) {
    try {
      const prefsPath = path.join(this.configDir, 'ai-preferences.json');
      fs.writeFileSync(prefsPath, JSON.stringify(preferences, null, 2));
      return true;
    } catch (error) {
      console.error('[AIConfig] Failed to save preferences:', error.message);
      throw error;
    }
  }

  /**
   * Load user preferences
   */
  loadPreferences() {
    try {
      const prefsPath = path.join(this.configDir, 'ai-preferences.json');

      if (!fs.existsSync(prefsPath)) {
        return {
          enablePatternLearning: true,
          enableEmbeddings: true,
          enableRelationshipDiscovery: true,
          maxTokensPerQuery: 2048,
          temperature: 0.7
        };
      }

      return JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    } catch (error) {
      console.error('[AIConfig] Failed to load preferences:', error.message);
      return {};
    }
  }
}

module.exports = AIConfig;
