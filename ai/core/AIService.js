/**
 * AIService - Central coordinator for the backend AI subsystem
 */

const AIConfig = require('./AIConfig');
const { createLogger } = require('./logger');

const log = createLogger('AIService');

class AIService {
  constructor() {
    this.agent = null;
    this.config = new AIConfig();
    this.enabled = true;
    this.workspaceRoot = null;
    this.appDataDir = null;
    this.loadState();
  }

  loadState() {
    try {
      const prefs = this.config.loadPreferences();
      this.enabled = prefs.aiEnabled !== false; // default to true
    } catch (err) {
      log.error('Failed to load state:', err.message);
      this.enabled = true;
    }
  }

  async initialize(appDataDir, workspaceRoot, llmProvider, embeddingConfig = null) {
    this.appDataDir = appDataDir;
    this.workspaceRoot = workspaceRoot;

    if (!this.enabled) {
      log.info('AI is disabled by master switch. Skipping initialization.');
      return { success: true, message: 'AI is disabled' };
    }

    try {
      log.info('Initializing AI Service...');
      // Dynamic require of index.js bootstrap to initialize the agent
      const { initializeAISystem } = require('../index.js');
      const result = await initializeAISystem(appDataDir, workspaceRoot, llmProvider, embeddingConfig);
      const { getAIAgent } = require('../index.js');
      this.agent = getAIAgent();
      log.info('AI Service successfully initialized');
      return result;
    } catch (error) {
      log.error('Failed to initialize AI Service:', error.message);
      throw error;
    }
  }

  isEnabled() {
    return this.enabled;
  }

  async enableAI() {
    if (this.enabled) return;
    this.enabled = true;
    log.info('AI master switch toggled: ENABLED');
    
    // Save state
    const prefs = this.config.loadPreferences();
    prefs.aiEnabled = true;
    this.config.savePreferences(prefs);

    // If we have paths, trigger full initialization
    if (this.appDataDir && this.workspaceRoot) {
      const { PROVIDER_REGISTRY } = require('../providers/ProviderRegistry');
      const activeProviderName = prefs.aiProvider || 'gemini';
      
      let llmProvider = null;
      const activeApiKey = this.config.getAPIKey(activeProviderName);

      if (activeApiKey) {
        const savedModel = this.config.getProviderModel(activeProviderName);
        const entry = PROVIDER_REGISTRY[activeProviderName];
        llmProvider = {
          name: activeProviderName,
          config: { apiKey: activeApiKey, model: savedModel || entry?.defaultModel },
        };
      } else {
        for (const entry of Object.values(PROVIDER_REGISTRY)) {
          if (!entry.available) continue;
          const apiKey = this.config.getAPIKey(entry.id);
          if (apiKey) {
            const savedModel = this.config.getProviderModel(entry.id);
            llmProvider = {
              name: entry.id,
              config: { apiKey, model: savedModel || entry.defaultModel },
            };
            break;
          }
        }
      }
      const hfToken = this.config.getAPIKey('huggingface');
      const embeddingConfig = hfToken ? { token: hfToken } : null;

      await this.initialize(this.appDataDir, this.workspaceRoot, llmProvider, embeddingConfig);
    }
  }

  async disableAI() {
    if (!this.enabled) return;
    this.enabled = false;
    log.info('AI master switch toggled: DISABLED');

    // Save state
    const prefs = this.config.loadPreferences();
    prefs.aiEnabled = false;
    this.config.savePreferences(prefs);

    // Shutdown running subsystems
    const { shutdownAISystem } = require('../index.js');
    shutdownAISystem();
    this.agent = null;
  }

  shutdown() {
    const { shutdownAISystem } = require('../index.js');
    shutdownAISystem();
    this.agent = null;
    log.info('AI Service shut down');
  }

  /**
   * Note save hook - enqueues embeddings indexing and triggers incremental graph update
   */
  onNoteSave(filePath) {
    if (!this.enabled || !this.agent) return;

    // 1. Enqueue in background embeddings index via workerManager
    try {
      const workerManager = require('../../electron/ai/workerManager.cjs');
      workerManager.enqueueNote(filePath, 0);
    } catch (err) {
      log.error(`Failed to enqueue note for background embedding indexing: ${filePath}`, err.message);
    }

    // 2. Trigger background graph relationship extraction
    if (this.agent.graphService) {
      const fs = require('fs');
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          this.agent.graphService.processNote(filePath, content).catch(err => {
            log.error(`Incremental graph extraction failed for ${filePath}:`, err.message);
          });
        } catch (err) {
          log.error(`Failed to read file for graph extraction: ${filePath}`, err.message);
        }
      }
    }
  }

  /**
   * Note delete hook - purges note chunks and graph relationships
   */
  onNoteDelete(filePath) {
    if (!this.enabled || !this.agent) return;

    // 1. Purge embedding DB chunks via workerManager
    try {
      const workerManager = require('../../electron/ai/workerManager.cjs');
      workerManager.deleteNoteData(filePath);
      log.info(`Deleted note embeddings from background index for: ${filePath}`);
    } catch (err) {
      log.error(`Failed to delete background note embeddings: ${filePath}`, err.message);
    }

    // 2. Purge knowledge graph nodes & relationships
    if (this.agent.graphDb) {
      try {
        const path = require('path');
        const noteName = path.basename(filePath, '.md');
        const noteId = noteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        this.agent.graphDb.deleteEntity(noteId);
        log.info(`Deleted note from Knowledge Graph: ${noteId}`);
      } catch (err) {
        log.error(`Failed to delete note from Knowledge Graph: ${filePath}`, err.message);
      }
    }
  }

  /**
   * Note rename hook - updates note path mappings in both DBs
   */
  onNoteRename(oldPath, newPath) {
    if (!this.enabled || !this.agent) return;

    // 1. Update embedding DB tables via workerManager
    try {
      const workerManager = require('../../electron/ai/workerManager.cjs');
      workerManager.renameNoteData(oldPath, newPath);
      log.info(`Triggered note paths rename in background embedding DB from ${oldPath} to ${newPath}`);
    } catch (err) {
      log.error(`Failed to rename note paths in background embedding DB:`, err.message);
    }

    // 2. Update knowledge graph entities
    if (this.agent.graphDb && this.agent.graphDb.db) {
      try {
        const path = require('path');
        const db = this.agent.graphDb.db;
        const newName = path.basename(newPath, '.md');

        db.prepare('UPDATE entities SET note_path = ?, name = ?, updated_at = datetime(\'now\') WHERE note_path = ?')
          .run(newPath, newName, oldPath);
        log.info(`Renamed note path in GraphDB from ${oldPath} to ${newPath}`);
      } catch (err) {
        log.error(`Failed to rename note path in GraphDB:`, err.message);
      }
    }
  }

  async chat(message, context = {}) {
    if (!this.enabled || !this.agent) {
      throw new Error('AI is currently disabled or uninitialized.');
    }
    
    // Wire call directly into current Agent orchestrator
    return this.agent.query(message, context);
  }

  /**
   * Main chat query streaming wrapper
   */
  async stream(message, context = {}, onChunk, abortSignal) {
    if (!this.enabled || !this.agent) {
      throw new Error('AI is currently disabled or uninitialized.');
    }
    
    return this.agent.queryExecutor.stream(message, context, onChunk, abortSignal);
  }
}

const aiServiceInstance = new AIService();

module.exports = {
  aiService: aiServiceInstance
};
