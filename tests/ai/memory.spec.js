const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MemoryDB } = require('../../ai/memory/MemoryDB');
const { ConversationStore } = require('../../ai/memory/ConversationStore');

describe('MemoryDB & ConversationStore Tests', () => {
  let tempDir;
  let memoryDB;
  let store;

  beforeAll(() => {
    tempDir = path.join(__dirname, 'temp-memory-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    memoryDB = new MemoryDB(tempDir);
    memoryDB.initialize();
    store = new ConversationStore(memoryDB, null);
  });

  afterAll(() => {
    memoryDB.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create and retrieve conversations', () => {
    const conv = store.createConversation('Test Chat', 'creative');
    assert.ok(conv.id);
    assert.strictEqual(conv.title, 'Test Chat');
    assert.strictEqual(conv.persona, 'creative');

    const fetched = store.getConversation(conv.id);
    assert.strictEqual(fetched.title, 'Test Chat');
  });

  it('should support updating persona', () => {
    const conv = store.createConversation('Update Chat', 'default');
    store.setPersona(conv.id, 'technical');
    const fetched = store.getConversation(conv.id);
    assert.strictEqual(fetched.persona, 'technical');
  });

  it('should support adding and cascading messages', () => {
    const conv = store.createConversation('Msg Chat', 'default');
    const msg = store.addMessage(conv.id, 'user', 'Hello there');
    assert.strictEqual(msg.role, 'user');
    assert.strictEqual(msg.content, 'Hello there');

    const list = store.getMessages(conv.id);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].content, 'Hello there');

    store.deleteConversation(conv.id);
    const orphanMsgs = store.getMessages(conv.id);
    assert.strictEqual(orphanMsgs.length, 0);
  });

  it('should support candidate knowledge tracking', () => {
    const kid = store.addCandidateKnowledge('note.md', 'Berlin', 'capitalOf', 'Germany');
    assert.ok(kid);

    const pending = store.listPendingKnowledge();
    assert.ok(pending.some(k => k.id === kid));

    store.approveKnowledge(kid);
    const pendingAfter = store.listPendingKnowledge();
    assert.ok(!pendingAfter.some(k => k.id === kid));
  });
});


