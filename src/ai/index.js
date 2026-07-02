/**
 * Notely AI Agent Initialization
 * Bootstrap file to initialize all AI components
 */

const DatabaseManager = require('./database/DatabaseManager');
const LLMRegistry = require('./llm/LLMRegistry');
const Agent = require('./core/Agent');
const AIConfig = require('./utils/AIConfig');
const { HuggingFaceEmbeddingProvider } = require('./llm/providers/HuggingFaceEmbeddingProvider');

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
    if (embeddingConfig?.token) {
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
    }

    const result = await aiAgent.initialize(workspaceRoot, llmProvider);

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

/**
 * Shutdown AI system
 */
function shutdownAISystem() {
  if (aiAgent) {
    aiAgent.shutdown();
    aiAgent = null;
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
