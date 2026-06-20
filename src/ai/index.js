/**
 * Notely AI Agent Initialization
 * Bootstrap file to initialize all AI components
 */

const DatabaseManager = require('./database/DatabaseManager');
const LLMRegistry = require('./llm/LLMRegistry');
const Agent = require('./core/Agent');
const AIConfig = require('./utils/AIConfig');

let aiAgent = null;
let aiConfig = null;

/**
 * Initialize AI agent system
 */
async function initializeAISystem(appDataDir, workspaceRoot, llmProvider) {
  try {
    console.log('[AI System] Initializing...');

    // Initialize configuration
    aiConfig = new AIConfig();

    // Initialize database
    const databaseManager = new DatabaseManager(appDataDir);
    databaseManager.initialize();

    // Initialize LLM registry
    const llmRegistry = new LLMRegistry();

    // Create agent
    aiAgent = new Agent(databaseManager, llmRegistry);

    // Initialize agent
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
