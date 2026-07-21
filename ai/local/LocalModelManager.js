const path = require('path');
const fs = require('fs');
const { createLogger } = require('../core/logger');

const log = createLogger('LocalModelManager');

class LocalModelManager {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model');
    this.modelPath = path.join(this.modelDir, 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf');
    this.llama = null;
    this.model = null;
    this.isLoaded = false;
  }

  async load() {
    if (this.isLoaded) return;
    try {
      const { LlamaModel } = await import('node-llama-cpp');

      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`Qwen model file not found at: ${this.modelPath}`);
      }

      log.info(`Loading GGUF model: ${this.modelPath}`);
      this.model = new LlamaModel({
        modelPath: this.modelPath
      });
      this.isLoaded = true;
      log.info('Local model loaded successfully');
    } catch (err) {
      log.error('Failed to load local model', err);
      this.isLoaded = false;
      this.model = null;
      throw err;
    }
  }

  getModel() {
    return this.model;
  }

  isReady() {
    return this.isLoaded && this.model !== null;
  }

  close() {
    this.model = null;
    this.llama = null;
    this.isLoaded = false;
    log.info('Local model manager closed');
  }
}

module.exports = LocalModelManager;
