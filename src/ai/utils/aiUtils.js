/**
 * Utility functions for AI agent
 */

const crypto = require('crypto');

/**
 * Count tokens in text (rough estimation)
 * More accurate counting would require tokenizer library
 */
function estimateTokens(text) {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Build prompt with context
 */
function buildContextualPrompt(systemPrompt, context, userQuery) {
  let prompt = systemPrompt + '\n\n';

  if (context.fileContext) {
    prompt += `Current Document: ${context.fileContext.filePath}\n`;
    prompt += `Content Preview:\n${context.fileContext.contentPreview}\n\n`;
  }

  if (context.relatedDocuments && context.relatedDocuments.length > 0) {
    prompt += 'Related Documents:\n';
    context.relatedDocuments.forEach((doc, idx) => {
      prompt += `${idx + 1}. ${doc.path} (relevance: ${(doc.relevance * 100).toFixed(0)}%)\n`;
    });
    prompt += '\n';
  }

  prompt += `User Query: ${userQuery}`;

  return prompt;
}

/**
 * Truncate text to fit token budget
 */
function truncateToTokenBudget(text, maxTokens) {
  const estimatedTokens = estimateTokens(text);

  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // Truncate to approximately fit budget
  const targetChars = Math.floor(text.length * (maxTokens / estimatedTokens));
  return text.substring(0, targetChars) + '...';
}

/**
 * Hash content for change detection
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Format response for display
 */
function formatResponse(response) {
  if (typeof response !== 'string') {
    response = JSON.stringify(response, null, 2);
  }

  // Limit display length
  if (response.length > 10000) {
    return response.substring(0, 10000) + '\n\n[Response truncated...]';
  }

  return response;
}

/**
 * Parse command from query
 */
function parseCommand(query) {
  const commands = ['summarize', 'analyze', 'format', 'search', 'generate', 'refactor', 'find-related'];

  for (const cmd of commands) {
    if (query.toLowerCase().includes(cmd)) {
      return cmd;
    }
  }

  return null;
}

/**
 * Create structured error response
 */
function createErrorResponse(error, context = {}) {
  return {
    success: false,
    error: {
      message: error.message || String(error),
      code: error.code || 'UNKNOWN_ERROR',
      context
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Create structured success response
 */
function createSuccessResponse(data, metadata = {}) {
  return {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata
    }
  };
}

module.exports = {
  estimateTokens,
  buildContextualPrompt,
  truncateToTokenBudget,
  hashContent,
  formatResponse,
  parseCommand,
  createErrorResponse,
  createSuccessResponse
};
