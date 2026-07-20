const assert = require('assert');
const fs = require('fs');
const path = require('path');
const EmbeddingDB = require('../../ai/embeddings/EmbeddingDB');

describe('EmbeddingDB Tests', () => {
  let tempDir;
  let db;

  beforeAll(() => {
    tempDir = path.join(__dirname, 'temp-embeddings-db-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    db = new EmbeddingDB(tempDir);
    db.initialize();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should save and retrieve chunks with embedding vectors', () => {
    const chunk = {
      id: 'test-note#chunk-0',
      note_path: 'test-note.md',
      chunk_index: 0,
      content: 'Hello testing world',
      chunk_type: 'paragraph',
      start_line: 1,
      end_line: 2,
      content_hash: 'abc',
      embedding: [0.1, 0.2, 0.3],
      embedding_model: 'bge-small'
    };

    db.upsertChunk(chunk);
    const savedList = db.getChunks('test-note.md');
    assert.strictEqual(savedList.length, 1);
    assert.strictEqual(savedList[0].content, 'Hello testing world');
    
    // Support both direct JavaScript Arrays and raw SQLite binary BLOB buffers
    const blob = savedList[0].embedding;
    let arr;
    if (Array.isArray(blob)) {
      arr = blob;
    } else {
      const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
      arr = new Float32Array(buf.length / 4);
      for (let i = 0; i < arr.length; i++) {
        arr[i] = buf.readFloatLE(i * 4);
      }
    }
    
    assert.ok(Math.abs(arr[0] - 0.1) < 1e-6);
  });
});
