/* global module */
/**
 * ipcProtocol.js - IPC channel events and request/response protocol wrappers for Notely AI
 */

const IPC_EVENTS = {
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

class AIQueryRequest {
  constructor(query, context = {}) {
    this.query = query;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

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
