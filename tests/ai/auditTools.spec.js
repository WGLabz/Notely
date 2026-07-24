const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getTools } = require('../../ai/tools/ToolRegistry');
const EmbeddingDB = require('../../ai/embeddings/EmbeddingDB');
const GraphDB = require('../../ai/graph/GraphDB');

describe('AI Subsystem Technical Audit Tests', () => {
  let tempDir;
  let db;
  let graphDb;

  beforeAll(() => {
    tempDir = path.join(__dirname, `temp-audit-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    db = new EmbeddingDB(tempDir);
    db.initialize();

    graphDb = new GraphDB(tempDir);
    graphDb.initialize();
  });

  afterAll(() => {
    db?.close?.();
    graphDb?.close?.();
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_err) {
        // Ignore ephemeral Windows file lock cleanup error
      }
    }
  });

  it('should correctly cap read_note length and resolve ranges', async () => {
    const testFile = path.join(tempDir, 'test-cap.md');
    const lines = [];
    for (let i = 1; i <= 200; i++) {
      lines.push(`Line content number ${i}`);
    }
    const fullText = lines.join('\n');
    fs.writeFileSync(testFile, fullText, 'utf8');

    const tools = await getTools({ workspaceRoot: tempDir });
    const readNoteTool = tools.read_note;

    // Test line range slice
    const sliced = await readNoteTool.execute({
      file_path: testFile,
      start_line: 5,
      end_line: 10
    });
    assert.strictEqual(sliced, lines.slice(4, 10).join('\n'));

    // Test relative path resolution
    const relativeSliced = await readNoteTool.execute({
      file_path: 'test-cap.md',
      start_line: 5,
      end_line: 10
    });
    assert.strictEqual(relativeSliced, lines.slice(4, 10).join('\n'));

    // Test default cap
    const longFile = path.join(tempDir, 'test-long.md');
    // Generate text longer than 10,000 characters
    const longText = 'A'.repeat(12000);
    fs.writeFileSync(longFile, longText, 'utf8');

    const readDefault = await readNoteTool.execute({ file_path: longFile });
    assert.ok(readDefault.length < 11000);
    assert.ok(readDefault.includes('truncated'));
  });

  it('should return keyword fallback search results in EmbeddingDB', () => {
    const notePath = path.join(tempDir, 'test-fallback.md');
    db.upsertNoteHash(notePath, 'hash-1', 1);
    
    // Add custom chunks to database manually to simulate indexing
    db.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, note_path, chunk_index, content, content_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run('chunk-1', notePath, 0, 'Unique fallback secret word', 'hash-1');

    const results = db.searchTextFallback('secret');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].note_path, notePath);
    assert.strictEqual(results[0].content, 'Unique fallback secret word');
  });

  it('should retrieve note stats counts correctly', () => {
    const notePath = path.join(tempDir, 'test-stats.md');
    const entityId = 'test-stats';
    
    // Add chunk stats
    db.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, note_path, chunk_index, content, content_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run('chunk-stats-1', notePath, 0, 'some content', 'hash-stats');

    const chunkCount = db.getNoteChunkCount(notePath);
    assert.strictEqual(chunkCount, 1);

    // Add graph entity and relationship stats
    graphDb.upsertEntity({ id: entityId, type: 'Document', name: 'Stats doc', note_path: notePath, properties: { title: 'Stats doc' } });
    graphDb.upsertEntity({ id: 'entity-2', type: 'Document', name: 'Related doc', note_path: 'related.md', properties: { title: 'Related doc' } });
    graphDb.upsertRelationship({ source_id: entityId, target_id: 'entity-2', type: 'links', weight: 1.0, metadata: {} });

    const relationshipCount = graphDb.getNoteRelationshipCount(notePath);
    assert.strictEqual(relationshipCount, 1);
  });

  it('should support create_note for new notes and block overwriting existing notes', async () => {
    const queryTools = require('../../ai/core/QueryTools');
    const mockAgent = { workspaceRoot: tempDir, graphDb };

    // 1. create_note for brand new note
    const createRes = await queryTools.runTool(mockAgent, 'create_note', {
      title: 'Agent New Note',
      content: '# Agent Created Note\nInitial text.'
    });
    assert.ok(createRes.includes('Created new note'));
    const createdPath = path.join(tempDir, 'Agent New Note.md');
    assert.ok(fs.existsSync(createdPath));

    // 2. verify existing notes cannot be overwritten
    const overwriteRes = await queryTools.runTool(mockAgent, 'create_note', {
      title: 'Agent New Note',
      content: 'Overwriting content attempt'
    });
    assert.ok(overwriteRes.includes('already exists'));
    assert.ok(fs.readFileSync(createdPath, 'utf8').includes('Initial text.'));
  });
});
