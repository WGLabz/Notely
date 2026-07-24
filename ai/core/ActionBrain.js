/**
 * ActionBrain - Execution gatekeeper & permission validator for Notely AI
 * Strictly enforces zero-edit / read-only safety for existing notes.
 */

const fs = require('fs');
const path = require('path');

class ActionBrain {
  constructor(agent) {
    this.agent = agent;
    this.forbiddenActions = new Set([
      'update_note',
      'edit_note',
      'delete_note',
      'move_note',
      'rename_note',
      'overwrite_note'
    ]);
  }

  /**
   * Validate action request before execution
   * @param {string} actionName
   * @param {object} params
   * @returns {{ allowed: boolean, reason?: string }}
   */
  validateAction(actionName, params = {}) {
    const normalizedName = String(actionName || '').toLowerCase().trim();

    if (this.forbiddenActions.has(normalizedName)) {
      return {
        allowed: false,
        reason: `Action '${actionName}' is strictly prohibited. AI is restricted from modifying, moving, or deleting existing workspace notes.`
      };
    }

    if (normalizedName === 'create_note') {
      const title = String(params.title || params.note_title || params.name || 'Untitled').trim();
      const fileName = title.endsWith('.md') ? title : `${title}.md`;
      const targetDir = params.subfolder ? path.join(this.agent.workspaceRoot, params.subfolder) : this.agent.workspaceRoot;
      const fullPath = path.join(targetDir, fileName);

      if (fs.existsSync(fullPath)) {
        return {
          allowed: false,
          reason: `Note '${fileName}' already exists. Overwriting existing notes is strictly disabled.`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Execute validated action
   * @param {string} actionName
   * @param {object} params
   * @param {Function} runner
   */
  async execute(actionName, params, runner) {
    const validation = this.validateAction(actionName, params);
    if (!validation.allowed) {
      throw new Error(`[ActionBrain Gate Error]: ${validation.reason}`);
    }
    return runner(params);
  }
}

module.exports = ActionBrain;
