const assert = require('assert');
const fs = require('fs');
const path = require('path');
const EmbeddingDB = require('../../ai/embeddings/EmbeddingDB');
const EmbeddingService = require('../../ai/embeddings/EmbeddingService');
const { SemanticRetriever } = require('../../ai/context/SemanticRetriever');

describe('Semantic Search Tests', () => {
  let tempDir;
  let db;
  let service;
  let retriever;
  let mockProvider;

  beforeAll(() => {
    tempDir = path.join(__dirname, 'temp-search-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    db = new EmbeddingDB(tempDir);
    db.initialize();

    mockProvider = {
      isInitialized: true,
      model: 'mock-model',
      generateEmbeddings: async (text) => {
        if (text.includes('apple')) return [1.0, 0.0, 0.0];
        if (text.includes('fruit')) return [0.9, 0.1, 0.0];
        return [0.0, 1.0, 0.0];
      }
    };

    service = new EmbeddingService(db, mockProvider);
    retriever = new SemanticRetriever(db, service);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should calculate cosine similarity correctly and find closest matching vectors', async () => {
    db.upsertChunk({
      id: 'chunk-1',
      note_path: 'apple.md',
      chunk_index: 0,
      content: 'This note mentions apples',
      chunk_type: 'paragraph',
      start_line: 1,
      end_line: 2,
      content_hash: 'h1',
      embedding: [1.0, 0.0, 0.0],
      embedding_model: 'mock-model'
    });

    db.upsertChunk({
      id: 'chunk-2',
      note_path: 'sky.md',
      chunk_index: 0,
      content: 'This note is about the blue sky',
      chunk_type: 'paragraph',
      start_line: 1,
      end_line: 2,
      content_hash: 'h2',
      embedding: [0.0, 1.0, 0.0],
      embedding_model: 'mock-model'
    });

    // Query for "fruit" (vector [0.9, 0.1, 0.0] should be closer to apple than sky)
    const matches = await retriever.search('fruit', 1);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].note_path, 'apple.md');
    assert.ok(matches[0].score > 0.8);
  });
});
