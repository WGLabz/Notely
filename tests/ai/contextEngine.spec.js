const assert = require('assert');
const { ContextEngine } = require('../../ai/context/ContextEngine');

describe('ContextEngine Tests', () => {
  it('should build systems parameters, message arrays, and retrieve system instruction overlays', () => {
    const mockStore = {
      getConversation: () => ({ persona: 'default' }),
      getPersona: () => ({ prompt: 'You are custom prompt.' }),
      getMessages: () => [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' }
      ]
    };
    const mockSemantic = { toTool: () => ({}) };
    const mockGraph = { toTool: () => ({}) };

    const engine = new ContextEngine(mockStore, mockSemantic, mockGraph);
    const context = engine.buildContext({
      conversationId: '123',
      activeNotePath: 'note.md',
      activeNoteContent: 'Some content here'
    });

    assert.ok(context.system.includes('You are custom prompt.'));
    assert.ok(context.system.includes('CURRENT NOTE (note.md)'));
    assert.strictEqual(context.messages.length, 2);
    assert.strictEqual(context.messages[0].role, 'user');
    assert.ok(context.tools.searchNotes);
    assert.ok(context.tools.exploreGraph);
  });
});


