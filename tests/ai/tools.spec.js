const assert = require('assert');
const { getTools } = require('../../ai/tools/ToolRegistry');

describe('ToolRegistry Tests', () => {
  let mockAgent;

  beforeAll(() => {
    mockAgent = {
      workspaceRoot: 'mock/workspace',
      db: {
        getWorkspaceFiles: () => []
      }
    };
  });

  it('should return all tool registrations for LLM query execution', async () => {
    const tools = await getTools(mockAgent);
    assert.ok(tools.read_note);
    assert.ok(tools.search_notes);
    assert.strictEqual(typeof tools.read_note.execute, 'function');
  });
});
