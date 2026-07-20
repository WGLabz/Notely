const assert = require('assert');
const fs = require('fs');
const path = require('path');
const EmbeddingDB = require('../../ai/embeddings/EmbeddingDB');
const IndexQueue = require('../../ai/queue/IndexQueue');
const IndexWorker = require('../../ai/queue/IndexWorker');

describe('IndexWorker Tests', () => {
  let tempDir;
  let db;
  let queue;
  let worker;
  let mockEmbedder;

  beforeAll(() => {
    tempDir = path.join(__dirname, 'temp-worker-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    db = new EmbeddingDB(tempDir);
    db.initialize();
    queue = new IndexQueue(db);

    mockEmbedder = {
      isAvailable: () => true,
      generateVector: async () => [0.1, 0.2, 0.3],
      getActiveModelName: () => 'mock-bge'
    };

    worker = new IndexWorker(db, queue, mockEmbedder);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should process index jobs in queue and generate chunk vectors', async () => {
    const testFile = path.join(tempDir, 'test-note.md');
    fs.writeFileSync(testFile, '# Testing Heading\nThis is a paragraph that will be processed.', 'utf8');

    queue.enqueue(testFile, 1);
    assert.strictEqual(queue.size().pending, 1);

    // Run job processing
    await worker.processNextJob();

    assert.strictEqual(queue.size().pending, 0);
    const chunks = db.db.prepare('SELECT * FROM chunks').all();
    assert.ok(chunks.length >= 1);
    assert.strictEqual(chunks[0].embedding_model, 'mock-bge');
  });
});
