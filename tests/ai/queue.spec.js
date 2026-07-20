const assert = require('assert');
const fs = require('fs');
const path = require('path');
const EmbeddingDB = require('../../ai/embeddings/EmbeddingDB');
const IndexQueue = require('../../ai/queue/IndexQueue');

describe('IndexQueue Tests', () => {
  let tempDir;
  let db;
  let queue;

  beforeAll(() => {
    tempDir = path.join(__dirname, 'temp-queue-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    db = new EmbeddingDB(tempDir);
    db.initialize();
    queue = new IndexQueue(db);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should enqueue and dequeue jobs based on priority', () => {
    queue.enqueue('low-priority.md', 1);
    queue.enqueue('high-priority.md', 5);

    assert.strictEqual(queue.size().pending, 2);

    const first = queue.dequeue();
    // High priority (5) should be dequeued first
    assert.strictEqual(first.note_path, 'high-priority.md');

    const second = queue.dequeue();
    assert.strictEqual(second.note_path, 'low-priority.md');
    assert.strictEqual(queue.size().pending, 0);
  });
});
