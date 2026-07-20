/**
 * Notely AI Agent Initialization
 * Bootstrap file to initialize all AI components
 */

const DatabaseManager = require('./database/LegacyDBManager');
const LLMRegistry = require('./providers/LLMRegistry');
const Agent = require('./core/Agent');
const AIConfig = require('./core/AIConfig');
const { HuggingFaceEmbeddingProvider } = require('./providers/HuggingFaceEmbeddingProvider');

let aiAgent = null;
let aiConfig = null;

/**
 * Initialize AI agent system
 * @param {string} appDataDir
 * @param {string} workspaceRoot
 * @param {object|null} llmProvider   - { name, config } for text generation
 * @param {object|null} embeddingConfig - { token, model? } for HuggingFace embeddings
 */
async function initializeAISystem(appDataDir, workspaceRoot, llmProvider, embeddingConfig = null) {
  try {
    console.log('[AI System] Initializing...');

    aiConfig = new AIConfig();

    const databaseManager = new DatabaseManager(appDataDir);
    databaseManager.initialize();

    const llmRegistry = new LLMRegistry();
    aiAgent = new Agent(databaseManager, llmRegistry);

    // Initialize embedding provider independently of the text provider.
    const prefs = aiConfig.loadPreferences();
    const activeEmbProvider = prefs.embeddingProvider || 'internal';

    if (activeEmbProvider === 'huggingface' && embeddingConfig?.token) {
      try {
        const hfProvider = new HuggingFaceEmbeddingProvider(embeddingConfig.token, {
          model: embeddingConfig.model,
        });
        // Add timeout to prevent HF network requests from stalling startup
        await Promise.race([
          hfProvider.initialize(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('HuggingFace initialization timeout (5s)')), 5000)
          )
        ]);
        aiAgent.setEmbeddingProvider(hfProvider);
        console.log('[AI System] HuggingFace embedding provider ready');
      } catch (embErr) {
        // Non-fatal — text generation and other features still work.
        console.warn('[AI System] HuggingFace embedding provider skipped:', embErr.message);
      }
    } else if (activeEmbProvider === 'internal') {
      try {
        const ONNXEmbedder = require('./embeddings/ONNXEmbedder');
        const onnxProvider = new ONNXEmbedder(appDataDir);
        // ONNXEmbedder initializes session lazily on first generateEmbedding(), but check if model is downloaded
        const fs = require('fs');
        const path = require('path');
        const modelPath = path.join(appDataDir, 'notely', 'ai-model', 'model.onnx');
        if (fs.existsSync(modelPath)) {
          await onnxProvider.load();
          aiAgent.setEmbeddingProvider(onnxProvider);
          console.log('[AI System] Local ONNX BGE embedding provider ready');
        } else {
          console.log('[AI System] Local ONNX BGE model weights missing; downloader required.');
        }
      } catch (embErr) {
        console.warn('[AI System] Local ONNX embedding provider skipped:', embErr.message);
      }
    }

    const result = await aiAgent.initialize(workspaceRoot, llmProvider);

    // Boot local BGE embeddings SQLite database & offload worker queue to background process
    try {
      const workerManager = require('../electron/ai/workerManager.cjs');
      const hfToken = embeddingConfig?.token || null;
      workerManager.startWorker(workspaceRoot, appDataDir, hfToken);

      const EmbeddingDB = require("./embeddings/EmbeddingDB");
      aiAgent.embeddingDb = new EmbeddingDB(workspaceRoot);
      aiAgent.embeddingDb.initialize();

      console.log('[AI System] Embedding DB initialized locally; Index Worker offloaded to background');
    } catch (embBootErr) {
      console.warn('[AI System] Background Index Worker failed to boot:', embBootErr.message);
    }

    // Phase 5 — Context Engine subsystem
    try {
      const path = require('path');
      const { MemoryDB } = require('./memory/MemoryDB');
      const { PersonaDB } = require('./memory/PersonaDB');
      const { ConversationStore } = require('./memory/ConversationStore');
      const { SemanticRetriever } = require('./context/SemanticRetriever');
      const { GraphRetriever } = require('./context/GraphRetriever');
      const { HybridRetriever } = require('./context/HybridRetriever');
      const { ContextEngine } = require('./context/ContextEngine');

      const memoryDB = new MemoryDB(workspaceRoot);
      memoryDB.initialize();

      const personaDB = new PersonaDB(path.join(appDataDir, 'notely'));
      personaDB.initialize();

      const store = new ConversationStore(memoryDB, personaDB);
      aiAgent.conversationStore = store;
      aiAgent.personaDB = personaDB;

      if (aiAgent.embeddingDb && aiAgent.embeddingService) {
        const semanticRetriever = new SemanticRetriever(aiAgent.embeddingDb, aiAgent.embeddingService);
        const graphRetriever = new GraphRetriever(aiAgent.graphDb ?? aiAgent.db);
        const hybridRetriever = new HybridRetriever(semanticRetriever, graphRetriever);
        aiAgent.contextEngine = new ContextEngine(store, semanticRetriever, graphRetriever, hybridRetriever);
      }

      console.log('[AI System] Phase 5 Context Engine ready');
    } catch (p5Err) {
      console.warn('[AI System] Phase 5 Context Engine skipped:', p5Err.message);
    }

    console.log('[AI System] Initialized successfully');
    return { success: true, agent: aiAgent, ...result };
  } catch (error) {
    console.error('[AI System] Initialization failed:', error);
    throw error;
  }
}

/**
 * Get initialized agent
 */
function getAIAgent() {
  if (!aiAgent) {
    throw new Error('AI Agent not initialized');
  }
  return aiAgent;
}

/**
 * Get AI configuration
 */
function getAIConfig() {
  if (!aiConfig) {
    aiConfig = new AIConfig();
  }
  return aiConfig;
}

function shutdownAISystem() {
  if (aiAgent) {
    aiAgent.shutdown();
    aiAgent = null;
  }
  try {
    const workerManager = require('../electron/ai/workerManager.cjs');
    workerManager.shutdownWorker();
  } catch (err) {
    console.error('Failed to shutdown worker manager:', err.message);
  }
  console.log('[AI System] Shutdown complete');
}

module.exports = {
  initializeAISystem,
  getAIAgent,
  getAIConfig,
  shutdownAISystem,
  AIAgent: Agent,
  DatabaseManager,
  LLMRegistry,
  AIConfig
};
