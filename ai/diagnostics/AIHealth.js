/**
 * AIHealth - Diagnostics and health check metrics aggregator for the AI subsystem
 */

const { aiService } = require('../core/AIService');


function getSubsystemHealth() {
  const isEnabled = aiService.isEnabled();
  const agent = aiService.agent;
  const isInitialized = Boolean(agent?.isInitialized);

  // DB file checks
  let dbStatus = 'uninitialized';
  let memoryDBPath = 'none';
  let personaDBPath = 'none';
  let embeddingDBPath = 'none';
  let graphDBPath = 'none';
  let totalPersonas = 0;
  let totalConversations = 0;
  let totalChunks = 0;
  let totalRelations = 0;

  if (isInitialized) {
    dbStatus = 'connected';
    try {
      if (agent.conversationStore) {
        memoryDBPath = agent.conversationStore.dbPath || 'none';
        // Count conversations
        const convs = agent.conversationStore.listConversations();
        totalConversations = convs ? convs.length : 0;
      }
      if (agent.personaDB) {
        personaDBPath = agent.personaDB.dbPath || 'none';
        const personas = agent.personaDB.list();
        totalPersonas = personas ? personas.length : 0;
      }
      if (agent.embeddingDb) {
        embeddingDBPath = agent.embeddingDb.dbPath || 'none';
        const countRes = agent.embeddingDb.db.prepare("SELECT COUNT(*) as count FROM chunks").get();
        totalChunks = countRes ? countRes.count : 0;
      }
      if (agent.graphDb) {
        graphDBPath = agent.graphDb.dbPath || 'none';
        const relsRes = agent.graphDb.db.prepare("SELECT COUNT(*) as count FROM relationships").get();
        totalRelations = relsRes ? relsRes.count : 0;
      }
    } catch (err) {
      console.error('[AI Health] Failed to gather detailed database stats:', err);
      dbStatus = 'degraded';
    }
  }

  const activeProvider = isInitialized ? (agent.llmRegistry?.getActiveProvider()?.name || 'none') : 'none';

  let isPaused = true;
  let isIndexing = false;
  try {
    const workerManager = require('../../electron/ai/workerManager.cjs');
    isPaused = workerManager.isPaused === true;
    isIndexing = workerManager.isWorking === true;
  } catch (err) {
    console.error('[AI Health] Failed to load workerManager:', err.message);
  }

  return {
    enabled: isEnabled,
    initialized: isInitialized,
    activeProvider,
    isPaused,
    isIndexing,
    database: {
      status: dbStatus,
      memoryDBPath,
      personaDBPath,
      embeddingDBPath,
      graphDBPath,
      totalPersonas,
      totalConversations,
      totalChunks,
      totalRelations
    },
    systemStats: {
      requestsCount: isInitialized ? (agent.llmRegistry?.getActiveProvider()?.getUsageStats()?.requestsTotal || 0) : 0,
      tokensUsed: isInitialized ? (agent.llmRegistry?.getActiveProvider()?.getUsageStats()?.tokensUsedTotal || 0) : 0
    }
  };
}

module.exports = { getSubsystemHealth };
