const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const GraphDB = require('../../ai/graph/GraphDB');
const MarkdownASTParser = require('../../ai/graph/MarkdownASTParser');
const EvidenceStore = require('../../ai/graph/EvidenceStore');
const EntityResolver = require('../../ai/graph/EntityResolver');
const GraphService = require('../../ai/graph/GraphService');
const GraphMaintenance = require('../../ai/graph/GraphMaintenance');

describe('Knowledge Graph Architecture Tests', () => {
  let tmpDir;
  let graphDb;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notely-kg-test-'));
    graphDb = new GraphDB(tmpDir);
    graphDb.initialize();
  });

  afterEach(() => {
    if (graphDb) graphDb.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should parse markdown structure without semantic hardcoding', () => {
    const parser = new MarkdownASTParser();
    const markdown = `# Architecture Overview\nThis is a test note linking to [[Database]] and tagged #architecture.\nHere is an image ![diagram](arch.png) and code block:\n\`\`\`javascript\nconst x = 1;\n\`\`\``;
    
    const ast = parser.parse('/test/arch.md', markdown);
    assert.strictEqual(ast.rootEntity.name, 'arch');
    assert.strictEqual(ast.links.length, 1);
    assert.strictEqual(ast.links[0].targetName, 'Database');
    assert.strictEqual(ast.tags.length, 1);
    assert.strictEqual(ast.tags[0].tagName, '#architecture');
    assert.strictEqual(ast.media.length, 1);
    assert.strictEqual(ast.codeBlocks.length, 1);
    assert.strictEqual(ast.codeBlocks[0].language, 'javascript');
  });

  it('should parse YAML frontmatter and header metadata (Tags, Name, Location, Time)', () => {
    const parser = new MarkdownASTParser();
    const markdown = `---\nTags: meeting, hello\n  - guide\n  - diagrams\n---\nName: Hari Mohan, Bikash panda\nTime: 09:57, 24 Jul 2026 to 09:57, 25 Jul 2026\nLocation: Delhi\n# Discussion\nContent text here.`;

    const ast = parser.parse('/test/meeting.md', markdown);
    assert.ok(ast.tags.some(t => t.name === 'meeting'));
    assert.ok(ast.tags.some(t => t.name === 'hello'));
    assert.ok(ast.tags.some(t => t.name === 'guide'));
    assert.ok(ast.metadataEntities.some(e => e.name === 'Hari Mohan' && e.type === 'Person'));
    assert.ok(ast.metadataEntities.some(e => e.name === 'Bikash panda' && e.type === 'Person'));
    assert.ok(ast.metadataEntities.some(e => e.name === 'Delhi' && e.type === 'Location'));
    assert.strictEqual(ast.rootEntity.properties.metadata.location, 'Delhi');
  });

  it('should save and query raw sentence evidence in EvidenceStore', () => {
    const store = new EvidenceStore(graphDb);
    const evId = store.addEvidence({
      sourceId: '/test/note.md',
      extractor: 'test_ner',
      subjectText: 'ModernBERT',
      subjectSpanStart: 10,
      subjectSpanEnd: 20,
      rawSentence: 'We rely on ModernBERT for offline extraction.',
      confidence: 0.95
    });

    assert.ok(evId);
    const ev = store.getEvidence(evId);
    assert.strictEqual(ev.subject_text, 'ModernBERT');
    assert.strictEqual(ev.confidence, 0.95);
  });

  it('should generate deterministic entity IDs and resolve aliases', () => {
    const resolver = new EntityResolver(graphDb);
    const id1 = resolver.generateEntityId('JavaScript', 'Technology');
    const id2 = resolver.generateEntityId('javascript', 'Technology');
    assert.strictEqual(id1, id2);

    graphDb.upsertEntity({ id: id1, name: 'JavaScript', type: 'Technology' });
    resolver.addAlias(id1, 'JS');

    const resolved = resolver.resolveMention('JS');
    assert.ok(resolved);
    assert.strictEqual(resolved.id, id1);
    assert.strictEqual(resolved.canonical_name, 'JavaScript');
  });

  it('should perform recursive CTE neighbor traversal over Property Graph', async () => {
    const service = new GraphService({ appDataDir: tmpDir }, graphDb);
    const notePath = path.join(tmpDir, 'main.md');
    const noteContent = `# Main Note\nConnecting to [[System Architecture]] and tagged #core.`;

    await service.processNote(notePath, noteContent);

    const { GraphRetriever } = require('../../ai/context/GraphRetriever');
    const retriever = new GraphRetriever(graphDb);
    const rows = retriever.traverse(notePath, 2);
    assert.ok(rows.length >= 2);
  });

  it('should support GraphRAG multi-hop query tool with sentence evidence', async () => {
    const service = new GraphService({ appDataDir: tmpDir }, graphDb);
    const notePath = path.join(tmpDir, 'graphrag-note.md');
    fs.writeFileSync(notePath, '# AI Note\nDiscussion with Bikash Panda regarding GraphRAG.');

    const evStore = new EvidenceStore(graphDb);
    const evId = evStore.addEvidence({
      sourceId: notePath,
      extractor: 'glirel_onnx',
      subjectText: 'Bikash Panda',
      rawSentence: 'Discussion with Bikash Panda regarding GraphRAG.',
      confidence: 0.96
    });

    const noteId = service.entityResolver.generateEntityId('graphrag-note', 'Note');
    const personId = service.entityResolver.generateEntityId('Bikash Panda', 'Person');

    graphDb.upsertEntity({ id: noteId, name: 'graphrag-note', type: 'Note', note_path: notePath });
    graphDb.upsertEntity({ id: personId, name: 'Bikash Panda', type: 'Person' });
    graphDb.upsertRelationship({
      source_id: noteId,
      target_id: personId,
      type: 'has_person',
      confidence: 0.96,
      evidence_id: evId
    });

    const queryTools = require('../../ai/core/QueryTools');
    const result = await queryTools.runTool({ graphDb }, 'explore_graph', { identifier: 'Bikash Panda' });

    assert.ok(result.includes('Bikash Panda'), 'Should include searched entity name');
    assert.ok(result.includes('has_person'), 'Should include relationship type');
    assert.ok(result.includes('Evidence:'), 'Should include evidence tag');
    assert.ok(result.includes('Discussion with Bikash Panda regarding GraphRAG.'), 'Should include exact evidence sentence');
  });

  it('should execute orphan cleanup in GraphMaintenance', () => {
    graphDb.upsertEntity({ id: 'ent-orphan', name: 'Orphan Entity', type: 'Concept' });
    const maintenance = new GraphMaintenance(graphDb, new EntityResolver(graphDb));
    
    const count = maintenance.purgeOrphans();
    assert.strictEqual(count, 1);
    assert.strictEqual(graphDb.getNodeCount(), 0);
  });
});
