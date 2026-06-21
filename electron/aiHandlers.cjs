/**
 * AI Agent IPC Handlers for Electron Main Process
 * Handles communication between React frontend and AI agent backend
 */

const { ipcMain } = require('electron');
const path = require('path');

let IPC_EVENTS, AIQueryRequest, AIQueryResponse;

try {
  // In packaged app: electron/ and dist/ are siblings in app.asar
  // In dev: electron/ and src/ are siblings, but we use dist which is created by build
  const ipcProtocolPath = path.join(__dirname, '..', 'dist', 'ai', 'utils', 'ipcProtocol.js');
  console.log('[AI] Attempting to load ipcProtocol from:', ipcProtocolPath);
  ({ IPC_EVENTS, AIQueryRequest, AIQueryResponse } = require(ipcProtocolPath));
  console.log('[AI] Successfully loaded ipcProtocol');
} catch (err) {
  console.error('[AI] Failed to load ipcProtocol:', err.message);
  console.error('[AI] Stack:', err.stack);
  // Fallback: define minimal IPC_EVENTS to prevent complete crash
  IPC_EVENTS = {
    AI_INIT: 'ai:init',
    AI_QUERY: 'ai:query',
    AI_DESTROY: 'ai:destroy'
  };
  AIQueryRequest = class {};
  AIQueryResponse = class {};
}

let aiAgent = null;
let aiInitialized = false;

/**
 * Initialize IPC handlers
 */
function initializeAIHandlers(electronApp, agent) {
  aiAgent = agent;
  aiInitialized = Boolean(agent?.isInitialized);

  // AI Initialization
  ipcMain.handle(IPC_EVENTS.AI_INIT, handleInitialize);

  // AI Query
  ipcMain.handle(IPC_EVENTS.AI_QUERY, handleQuery);

  // Status
  ipcMain.handle(IPC_EVENTS.AI_STATUS, handleStatus);

  // Embeddings
  ipcMain.handle(IPC_EVENTS.AI_GENERATE_EMBEDDINGS, handleGenerateEmbeddings);

  // Relationship graph
  ipcMain.handle(IPC_EVENTS.AI_BUILD_GRAPH, handleBuildGraph);

  // Pattern detection
  ipcMain.handle(IPC_EVENTS.AI_DETECT_PATTERNS, handleDetectPatterns);

  // Configuration
  ipcMain.handle(IPC_EVENTS.AI_SET_API_KEY, handleSetAPIKey);
  ipcMain.handle(IPC_EVENTS.AI_GET_API_KEY, handleGetAPIKey);
  ipcMain.handle('ai:config:get-preferences', handleGetPreferences);
  ipcMain.handle('ai:config:set-preferences', handleSetPreferences);
  ipcMain.handle('ai:config:test-connection', handleTestConnection);
  ipcMain.handle('ai:config:clear-data', handleClearData);

  // Shutdown
  ipcMain.handle(IPC_EVENTS.AI_SHUTDOWN, handleShutdown);

  console.log('[AI IPC] Handlers initialized');
}

/**
 * Handle agent initialization
 */
async function handleInitialize(event, payload) {
  try {
    if (aiInitialized && aiAgent?.isInitialized) {
      return new AIQueryResponse(true, { message: 'Already initialized' });
    }

    const { workspaceRoot, llmProvider } = payload;

    if (!aiAgent) {
      throw new Error('Agent not available');
    }

    const result = await aiAgent.initialize(workspaceRoot, llmProvider);
    aiInitialized = true;

    return new AIQueryResponse(true, result);
  } catch (error) {
    console.error('[AI IPC] Initialization failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle AI query
 */
async function handleQuery(event, payload) {
  try {
    if (!aiInitialized || !aiAgent?.isInitialized) {
      throw new Error('AI agent not initialized');
    }

    const request = new AIQueryRequest(payload.query, payload.context);
    const result = await aiAgent.query(request.query, request.context);

    return new AIQueryResponse(result.success, result);
  } catch (error) {
    console.error('[AI IPC] Query handling failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle status request
 */
async function handleStatus(event, payload) {
  try {
    if (!aiAgent) {
      return new AIQueryResponse(true, { initialized: false });
    }

    const status = aiAgent.getStatus();
    return new AIQueryResponse(true, status);
  } catch (error) {
    console.error('[AI IPC] Status request failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle embeddings generation
 */
async function handleGenerateEmbeddings(event, payload) {
  try {
    if (!aiInitialized || !aiAgent?.isInitialized) {
      throw new Error('AI agent not initialized');
    }

    const result = await aiAgent.generateEmbeddings(payload?.forceRefresh || false);
    return new AIQueryResponse(true, result);
  } catch (error) {
    console.error('[AI IPC] Embeddings generation failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle relationship graph building
 */
async function handleBuildGraph(event, payload) {
  try {
    if (!aiInitialized || !aiAgent?.isInitialized) {
      throw new Error('AI agent not initialized');
    }

    const result = await aiAgent.buildRelationshipGraph();
    return new AIQueryResponse(true, result);
  } catch (error) {
    console.error('[AI IPC] Graph building failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle pattern detection
 */
async function handleDetectPatterns(event, payload) {
  try {
    if (!aiInitialized || !aiAgent?.isInitialized) {
      throw new Error('AI agent not initialized');
    }

    const result = aiAgent.detectPatterns();
    return new AIQueryResponse(true, result);
  } catch (error) {
    console.error('[AI IPC] Pattern detection failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle API key configuration
 */
async function handleSetAPIKey(event, payload) {
  try {
    const { provider, apiKey } = payload;

    if (!provider || !apiKey) {
      throw new Error('Provider and API key required');
    }

    // Store API key securely using Electron's safeStorage
    const { app, safeStorage } = require('electron');
    const appDataDir = app.getPath('appData');
    const fs = require('fs');
    const path = require('path');

    const configPath = path.join(appDataDir, 'notely', 'ai-config.json');
    const configDir = path.dirname(configPath);

    // Ensure directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Read existing config
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Encrypt and store API key
    const encrypted = safeStorage.encryptString(apiKey);
    config[provider] = encrypted.toString('latin1');

    // Write config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    if (aiAgent?.isInitialized) {
      try {
        await aiAgent.llmRegistry.activateProvider(provider, { apiKey });
      } catch (activationError) {
        console.warn('[AI IPC] Provider activation after key save failed:', activationError.message);
      }
    }

    return new AIQueryResponse(true, { message: 'API key saved successfully' });
  } catch (error) {
    console.error('[AI IPC] API key setting failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle API key retrieval
 */
async function handleGetAPIKey(event, payload) {
  try {
    const { provider } = payload;

    if (!provider) {
      throw new Error('Provider required');
    }

    const AIConfig = require('../src/ai/utils/AIConfig');
    const config = new AIConfig();
    const apiKey = config.getAPIKey(provider);

    return new AIQueryResponse(true, { apiKey: apiKey || null });
  } catch (error) {
    console.error('[AI IPC] API key retrieval failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle get preferences
 */
async function handleGetPreferences(event, payload) {
  try {
    const AIConfig = require('../src/ai/utils/AIConfig');
    const config = new AIConfig();
    const prefs = config.loadPreferences();
    return new AIQueryResponse(true, prefs);
  } catch (error) {
    console.error('[AI IPC] Get preferences failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle set preferences
 */
async function handleSetPreferences(event, payload) {
  try {
    const AIConfig = require('../src/ai/utils/AIConfig');
    const config = new AIConfig();
    config.savePreferences(payload.preferences);
    return new AIQueryResponse(true, { message: 'Preferences saved' });
  } catch (error) {
    console.error('[AI IPC] Set preferences failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle connection test
 */
async function handleTestConnection(event, payload) {
  try {
    if (!aiAgent?.isInitialized) {
      throw new Error('AI agent not initialized');
    }

    const providerName = String(payload?.provider || 'gemini');
    const AIConfig = require('../src/ai/utils/AIConfig');
    const config = new AIConfig();
    const apiKey = config.getAPIKey(providerName);

    if (!apiKey) {
      throw new Error(`No API key configured for ${providerName}`);
    }

    const provider = await aiAgent.llmRegistry.activateProvider(providerName, { apiKey });
    aiInitialized = Boolean(aiAgent?.isInitialized);
    const isAvailable = await provider.isAvailable();

    if (isAvailable) {
      return new AIQueryResponse(true, { message: 'Connected successfully' });
    } else {
      throw new Error('Provider is not available');
    }
  } catch (error) {
    console.error('[AI IPC] Connection test failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle clear data
 */
async function handleClearData(event, payload) {
  try {
    if (!aiAgent) {
      throw new Error('AI agent not available');
    }

    // Clear session memory
    aiAgent.memoryManager.clearSession();

    // Clear caches
    aiAgent.contextManager.clearCache();
    aiAgent.embeddingService.clearCache();
    aiAgent.relationshipService.clearCache();

    // Clean database
    aiAgent.db.cleanExpiredCache();

    return new AIQueryResponse(true, { message: 'All AI data cleared' });
  } catch (error) {
    console.error('[AI IPC] Clear data failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

/**
 * Handle shutdown
 */
async function handleShutdown(event, payload) {
  try {
    if (aiAgent) {
      aiAgent.shutdown();
      aiInitialized = false;
    }
    return new AIQueryResponse(true, { message: 'Shutdown complete' });
  } catch (error) {
    console.error('[AI IPC] Shutdown failed:', error);
    return new AIQueryResponse(false, null, error.message);
  }
}

module.exports = {
  initializeAIHandlers
};
