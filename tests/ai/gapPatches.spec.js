const assert = require('assert');
const fs = require('fs');
const path = require('path');
const GraphDB = require('../../ai/graph/GraphDB');
const EmbeddingDB = require('../../ai/embeddings/EmbeddingDB');
const ONNXEmbedder = require('../../ai/embeddings/ONNXEmbedder');

describe('AI Subsystem Gap Patches Tests', () => {
  let tempDir;
  let graphDb;
  let embeddingDb;

  beforeAll(() => {
    tempDir = path.join(__dirname, 'temp-gap-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    graphDb = new GraphDB(tempDir);
    graphDb.initialize();

    embeddingDb = new EmbeddingDB(tempDir);
    embeddingDb.initialize();
  });

  afterAll(() => {
    graphDb.close();
    embeddingDb.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should delete note entity and all associated relationships in GraphDB', () => {
    const notePath = path.join(tempDir, 'delete-target.md');
    const noteId = 'delete-target';

    // Insert note entity and another entity
    graphDb.upsertEntity({ id: noteId, type: 'Note', name: 'Delete Target', note_path: notePath });
    graphDb.upsertEntity({ id: 'related-concept', type: 'Concept', name: 'Related Concept' });

    // Insert relationship linking them
    graphDb.upsertRelationship({ source_id: noteId, target_id: 'related-concept', type: 'RELATED_TO', weight: 1.0 });

    // Verify they exist in DB
    let entity = graphDb.db.prepare('SELECT * FROM entities WHERE id = ?').get(noteId);
    assert.ok(entity);
    let rel = graphDb.db.prepare('SELECT * FROM relationships WHERE source_id = ?').get(noteId);
    assert.ok(rel);

    // Call deleteNoteEntityAndRelationships
    graphDb.deleteNoteEntityAndRelationships(notePath);

    // Verify both entity and relationship are gone
    entity = graphDb.db.prepare('SELECT * FROM entities WHERE id = ?').get(noteId);
    assert.strictEqual(entity, undefined);
    rel = graphDb.db.prepare('SELECT * FROM relationships WHERE source_id = ? OR target_id = ?').get(noteId, noteId);
    assert.strictEqual(rel, undefined);
  });

  it('should clear chunks cache when embedding model name changes', () => {
    const notePath = path.join(tempDir, 'test-mismatch.md');
    
    // Insert a chunk with a specific embedding model name
    embeddingDb.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, note_path, chunk_index, content, content_hash, embedding_model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('chunk-mismatch', notePath, 0, 'test content', 'hash-1', 'old-model-name');

    // Verify it is inserted
    let chunk = embeddingDb.db.prepare('SELECT * FROM chunks WHERE id = ?').get('chunk-mismatch');
    assert.ok(chunk);

    // Verify with same model name does NOT clear it
    embeddingDb.verifyModelDimensions('old-model-name');
    chunk = embeddingDb.db.prepare('SELECT * FROM chunks WHERE id = ?').get('chunk-mismatch');
    assert.ok(chunk);

    // Verify with different model name DOES clear it
    embeddingDb.verifyModelDimensions('new-model-name');
    chunk = embeddingDb.db.prepare('SELECT * FROM chunks WHERE id = ?').get('chunk-mismatch');
    assert.strictEqual(chunk, undefined);
  });

  it('should pre-tokenize punctuation and symbols robustly in ONNXEmbedder', () => {
    const embedder = new ONNXEmbedder(tempDir);
    // Stub vocab for testing tokenize method directly without model file
    embedder.vocab = ['cls', 'sep', 'unk', 'ai', 'and', 'search', '[', ']'];

    const tokens = embedder.tokenize('[[AI and Search]]');
    
    // BGE / BERT vocab map index checking:
    // [101] (CLS) is prefix, [102] (SEP) is suffix.
    // Punctuation like '[' and ']' should match their vocab indices if present, or fallback to unk (100).
    assert.ok(tokens.length > 2);
    assert.strictEqual(tokens[0], 101); // CLS
    assert.strictEqual(tokens[tokens.length - 1], 102); // SEP
  });
});
