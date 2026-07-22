/**
 * ToolRegistry.js
 * AI Engine bridge to the central Application Tool Registry.
 * Translates Vercel AI SDK getTools calls to applicationToolRegistry capabilities.
 * Direct filesystem/DB access is strictly prohibited in this layer.
 */

const { applicationToolRegistry } = require('../../electron/tools/ApplicationToolRegistry.cjs');
const { createLogger } = require('../core/logger');

const log = createLogger('ToolRegistry');

async function getTools(agentInstance) {
  try {
    log.info('Binding Agent instance to Application Tool Registry');
    if (agentInstance) {
      applicationToolRegistry.setAgentInstance(agentInstance);
    }

    const context = {
      workspaceRoot: agentInstance?.workspaceRoot || null,
      caller: 'internal_ai'
    };

    return await applicationToolRegistry.toVercelTools(context);
  } catch (err) {
    log.error('Failed to initialize tools from ApplicationToolRegistry:', err.message);
    return {};
  }
}

module.exports = { getTools };
