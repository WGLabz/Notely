/**
 * IPC Protocol - Types and handlers for AI agent communication
 */

const IPC_EVENTS = {
  // Query events
  AI_QUERY: 'ai:query',
  AI_QUERY_RESPONSE: 'ai:query:response',

  // Agent initialization
  AI_INIT: 'ai:init',
  AI_INIT_RESPONSE: 'ai:init:response',

  // Status and info
  AI_STATUS: 'ai:status',
  AI_STATUS_RESPONSE: 'ai:status:response',

  // Embeddings
  AI_GENERATE_EMBEDDINGS: 'ai:embeddings:generate',
  AI_EMBEDDINGS_RESPONSE: 'ai:embeddings:response',

  // Relationships
  AI_BUILD_GRAPH: 'ai:graph:build',
  AI_GRAPH_RESPONSE: 'ai:graph:response',

  // Learning
  AI_DETECT_PATTERNS: 'ai:patterns:detect',
  AI_PATTERNS_RESPONSE: 'ai:patterns:response',

  // Settings
  AI_SET_API_KEY: 'ai:config:set-api-key',
  AI_GET_API_KEY: 'ai:config:get-api-key',
  AI_CONFIG_RESPONSE: 'ai:config:response',

  // Shutdown
  AI_SHUTDOWN: 'ai:shutdown'
};

/**
 * Request format for AI queries
 */
class AIQueryRequest {
  constructor(query, context = {}) {
    this.query = query;
    this.context = {
      currentFile: context.currentFile || null,
      workspaceRoot: context.workspaceRoot || null,
      selectedText: context.selectedText || null,
      ...context
    };
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Response format for AI queries
 */
class AIQueryResponse {
  constructor(success, data = {}, error = null) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.timestamp = new Date().toISOString();
  }
}

module.exports = {
  IPC_EVENTS,
  AIQueryRequest,
  AIQueryResponse
};
