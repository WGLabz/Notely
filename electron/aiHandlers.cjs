/**
 * AI Agent IPC Handlers for Electron Main Process
 * Handles communication between React frontend and AI agent backend
 */

const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

let IPC_EVENTS, AIQueryRequest, AIQueryResponse;

try {
  const distProtocolPath = path.join(__dirname, '..', 'dist', 'ai', 'utils', 'ipcProtocol.js');
  const srcProtocolPath = path.join(__dirname, '..', 'src', 'ai', 'utils', 'ipcProtocol.js');
  const ipcProtocolPath = fs.existsSync(distProtocolPath) ? distProtocolPath : srcProtocolPath;
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
    AI_STATUS: 'ai:status',
    AI_GENERATE_EMBEDDINGS: 'ai:embeddings:generate',
    AI_BUILD_GRAPH: 'ai:graph:build',
    AI_DETECT_PATTERNS: 'ai:patterns:detect',
    AI_SET_API_KEY: 'ai:config:set-api-key',
    AI_GET_API_KEY: 'ai:config:get-api-key',
    AI_SHUTDOWN: 'ai:shutdown'
  };
  AIQueryRequest = class {
    constructor(query, context = {}) {
      this.query = query;
      this.context = context;
      this.timestamp = new Date().toISOString();
    }
  };
  AIQueryResponse = class {
    constructor(success, data = {}, error = null) {
      this.success = success;
      this.data = data;
      this.error = error;
      this.timestamp = new Date().toISOString();
    }
  };
}

let aiAgent = null;
let aiInitialized = false;
let handlersRegistered = false;

// --- Input validation & sender trust guards -------------------------------

const MAX_QUERY_LENGTH = 8000;
const MAX_CONTEXT_BYTES = 200000;
const MAX_API_KEY_LENGTH = 512;
const MIN_API_KEY_LENGTH = 8;
const ALLOWED_PROVIDERS = new Set(['gemini']);

/**
 * Only accept IPC originating from a top-level application BrowserWindow frame.
 * Rejects calls from subframes / detached / unknown senders.
 */
function isTrustedSender(event) {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return false;
    }
    const frame = event.senderFrame;
    // A top frame has no parent; reject any embedded frame.
    if (frame && frame.parent) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function assertProvider(provider) {
  const name = String(provider || '').trim().toLowerCase();
  if (!ALLOWED_PROVIDERS.has(name)) {
    throw new Error('Unsupported AI provider.');
  }
  return name;
}

function assertApiKey(apiKey) {
  if (typeof apiKey !== 'string') {
    throw new Error('Invalid API key.');
  }
  const trimmed = apiKey.trim();
  if (trimmed.length < MIN_API_KEY_LENGTH || trimmed.length > MAX_API_KEY_LENGTH) {
    throw new Error('Invalid API key length.');
  }
  return trimmed;
}

function sanitizeQueryPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const query = typeof source.query === 'string' ? source.query : '';
  if (!query.trim()) {
    throw new Error('Query must be a non-empty string.');
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error('Query is too long.');
  }

  let context = source.context && typeof source.context === 'object' ? source.context : {};
  try {
    if (JSON.stringify(context).length > MAX_CONTEXT_BYTES) {
      throw new Error('Context payload is too large.');
    }
  } catch {
    // Non-serializable context is dropped rather than forwarded.
    context = {};
  }

  return { query, context };
}

function registerHandler(channel, handler) {
  if (!channel || typeof channel !== 'string') {
    throw new Error(`Invalid AI IPC channel: ${channel}`);
  }
  ipcMain.handle(channel, async (event, payload) => {
    if (!isTrustedSender(event)) {
      console.warn(`[AI IPC] Rejected untrusted sender on channel: ${channel}`);
      return new AIQueryResponse(false, null, 'Untrusted IPC sender rejected.');
    }
    return handler(event, payload);
  });
}

/**
 * Initialize IPC handlers
 */
function initializeAIHandlers(electronApp, agent) {
  aiAgent = agent;
  aiInitialized = Boolean(agent?.isInitialized);

  if (handlersRegistered) {
    console.log('[AI IPC] Handlers already initialized; updated agent reference');
    return;
  }

  // AI Initialization
  registerHandler(IPC_EVENTS.AI_INIT, handleInitialize);

  // AI Query
  registerHandler(IPC_EVENTS.AI_QUERY, handleQuery);

  // Status
  registerHandler(IPC_EVENTS.AI_STATUS, handleStatus);

  // Embeddings
  registerHandler(IPC_EVENTS.AI_GENERATE_EMBEDDINGS, handleGenerateEmbeddings);

  // Relationship graph
  registerHandler(IPC_EVENTS.AI_BUILD_GRAPH, handleBuildGraph);

  // Pattern detection
  registerHandler(IPC_EVENTS.AI_DETECT_PATTERNS, handleDetectPatterns);

  // Configuration
  registerHandler(IPC_EVENTS.AI_SET_API_KEY, handleSetAPIKey);
  registerHandler(IPC_EVENTS.AI_GET_API_KEY, handleGetAPIKey);
  registerHandler('ai:config:get-preferences', handleGetPreferences);
  registerHandler('ai:config:set-preferences', handleSetPreferences);
  registerHandler('ai:config:test-connection', handleTestConnection);
  registerHandler('ai:config:clear-data', handleClearData);

  // Shutdown
  registerHandler(IPC_EVENTS.AI_SHUTDOWN, handleShutdown);

  handlersRegistered = true;
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

    const { query, context } = sanitizeQueryPayload(payload);
    const request = new AIQueryRequest(query, context);
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
async function handleStatus(_event, _payload) {
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
async function handleBuildGraph(_event, _payload) {
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
async function handleDetectPatterns(_event, _payload) {
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
    const provider = assertProvider(payload?.provider);
    const apiKey = assertApiKey(payload?.apiKey);

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
    const provider = assertProvider(payload?.provider);

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
async function handleGetPreferences(_event, _payload) {
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
    const preferences = payload?.preferences;
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      throw new Error('Invalid preferences payload.');
    }
    const AIConfig = require('../src/ai/utils/AIConfig');
    const config = new AIConfig();
    config.savePreferences(preferences);
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

    const providerName = assertProvider(payload?.provider || 'gemini');
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
async function handleClearData(_event, _payload) {
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
async function handleShutdown(_event, _payload) {
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
