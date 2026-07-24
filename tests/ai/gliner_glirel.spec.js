const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const GraphDB = require('../../ai/graph/GraphDB');
const GLiNERExtractor = require('../../ai/graph/GLiNERExtractor');
const GLiRELExtractor = require('../../ai/graph/GLiRELExtractor');
const GLiNERGLiRELPipeline = require('../../ai/graph/GLiNERGLiRELPipeline');
const GraphModelDownloader = require('../../ai/graph/GraphModelDownloader');
const GraphService = require('../../ai/graph/GraphService');

describe('GLiNER + GLiREL Model-Driven Pipeline Tests', () => {
  let tmpDir;
  let graphDb;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gliner-test-'));
    graphDb = new GraphDB(tmpDir);
    graphDb.initialize();
  });

  afterEach(() => {
    if (graphDb) graphDb.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should initialize GLiNERExtractor and segment sentences', () => {
    const gliner = new GLiNERExtractor(tmpDir);
    const sentences = gliner.segmentSentences('React is a JavaScript framework. Node.js is a runtime.');
    assert.ok(sentences.length >= 2);
  });

  it('should extract entities dynamically using GLiNERExtractor', async () => {
    const gliner = new GLiNERExtractor(tmpDir);
    const text = 'React is a popular framework developed by Facebook.';
    const labels = ['React', 'Facebook', 'framework'];
    
    const entities = await gliner.extractEntities(text, labels, { confidenceThreshold: 0.60 });
    assert.ok(entities.length >= 1);
    assert.strictEqual(entities[0].name, 'React');
  });

  it('should extract Person entities and author relationships from note body text', async () => {
    const pipeline = new GLiNERGLiRELPipeline(tmpDir);
    const text = 'Bikash Panda created the architecture for Notely. Hari Mohan reviewed the system.';
    const ast = {
      sections: [{ title: 'Overview' }],
      keyTerms: [{ term: 'Bikash Panda' }, { term: 'Hari Mohan' }, { term: 'Notely' }],
      tags: [],
      links: []
    };

    const results = await pipeline.extractEntitiesAndRelations(text, ast, { confidenceThreshold: 0.50 });
    const personEnt = results.entities.find(e => e.name === 'Bikash Panda' || e.name === 'Hari Mohan');
    assert.ok(personEnt, 'Should detect person entity from note text');
  });

  it('should extract relations between entity pairs using GLiRELExtractor', async () => {
    const glirel = new GLiRELExtractor(tmpDir);
    const text = 'React depends on JavaScript.';
    const sentences = [{ text, index: 0, length: text.length }];
    const entities = [
      { name: 'React', type: 'Technology', spanStart: 0, spanEnd: 5 },
      { name: 'JavaScript', type: 'Technology', spanStart: 17, spanEnd: 27 }
    ];

    const relations = await glirel.extractRelations(text, sentences, entities, { confidenceThreshold: 0.60 });
    assert.ok(relations.length >= 1);
    assert.strictEqual(relations[0].source_name, 'React');
    assert.strictEqual(relations[0].target_name, 'JavaScript');
    assert.strictEqual(relations[0].type, 'depends_on');
  });

  it('should execute full GLiNERGLiRELPipeline with dynamic AST label discovery', async () => {
    const pipeline = new GLiNERGLiRELPipeline(tmpDir);
    const text = '# Overview\nReact depends on JavaScript. Tagged #webdev.';
    const ast = {
      tags: [{ name: 'webdev' }],
      sections: [{ title: 'Overview' }],
      keyTerms: [{ term: 'React' }, { term: 'JavaScript' }],
      links: []
    };

    const results = await pipeline.extractEntitiesAndRelations(text, ast, { confidenceThreshold: 0.50 });
    assert.ok(results);
    assert.ok(Array.isArray(results.entities));
    assert.ok(Array.isArray(results.relationships));
  });

  it('should report correct status in GraphModelDownloader', () => {
    const downloader = new GraphModelDownloader(tmpDir);
    const status = downloader.getStatus();
    assert.strictEqual(status.downloaded, false);
    assert.strictEqual(status.isDownloading, false);
    assert.strictEqual(status.progress, 0);
  });

  it('should process note end-to-end in GraphService using GLiNER/GLiREL pipeline', async () => {
    const service = new GraphService({ appDataDir: tmpDir }, graphDb);
    const notePath = path.join(tmpDir, 'test-note.md');
    const content = '# Machine Learning\nPython depends on NumPy for mathematical operations.';

    await service.processNote(notePath, content);

    const stats = graphDb.getStatus();
    assert.ok(stats.nodeCount > 0);
  });

  it('should extract entities and expected relationships from a large paragraph', async () => {
    const pipeline = new GLiNERGLiRELPipeline(tmpDir);
    const bigParagraph = `
# Artificial Intelligence Systems
Modern artificial intelligence applications rely heavily on **Python** as their primary programming language.
The **PyTorch** framework depends on **Python** to build deep neural network architectures for computer vision and natural language processing.
Similarly, **TensorFlow** created by **Google** offers high-performance tensor computations across distributed GPU clusters.
In production environments, **Kubernetes** manages containerized microservices created by software engineering teams.
Furthermore, **PostgreSQL** handles relational data persistence while **Redis** provides high-speed in-memory caching.
    `;

    const ast = {
      sections: [{ title: 'Artificial Intelligence Systems' }],
      keyTerms: [
        { term: 'Python' },
        { term: 'PyTorch' },
        { term: 'TensorFlow' },
        { term: 'Google' },
        { term: 'Kubernetes' },
        { term: 'PostgreSQL' },
        { term: 'Redis' }
      ],
      tags: [{ name: 'ai' }, { name: 'infrastructure' }],
      links: []
    };

    const results = await pipeline.extractEntitiesAndRelations(bigParagraph, ast, { confidenceThreshold: 0.50 });
    
    assert.ok(results.entities.length >= 5, `Expected at least 5 entities, found ${results.entities.length}`);
    assert.ok(results.relationships.length >= 3, `Expected at least 3 relationships, found ${results.relationships.length}`);

    const extractedEntityNames = results.entities.map(e => e.name);
    assert.ok(extractedEntityNames.includes('Python'), 'Entities should contain Python');
    assert.ok(extractedEntityNames.includes('PyTorch'), 'Entities should contain PyTorch');
    assert.ok(extractedEntityNames.includes('Google'), 'Entities should contain Google');

    const hasPyTorchRel = results.relationships.some(r => 
      (r.source_name === 'PyTorch' && r.target_name === 'Python') || 
      (r.source_name === 'Python' && r.target_name === 'PyTorch')
    );
    assert.ok(hasPyTorchRel, 'Should find relationship between PyTorch and Python');

    const hasTensorFlowRel = results.relationships.some(r => 
      (r.source_name === 'TensorFlow' && r.target_name === 'Google') || 
      (r.source_name === 'Google' && r.target_name === 'TensorFlow')
    );
    assert.ok(hasTensorFlowRel, 'Should find relationship between TensorFlow and Google');
  });

  it('should ignore system section headings like # Cleansed and # RawNotes during extraction', async () => {
    const pipeline = new GLiNERGLiRELPipeline(tmpDir);
    const text = '# RawNotes\nReact relies on JavaScript.\n# Cleansed\nReact is structured.';
    const ast = {
      sections: [{ title: 'RawNotes' }, { title: 'Cleansed' }, { title: 'React Overview' }],
      keyTerms: [{ term: 'React' }, { term: 'JavaScript' }],
      tags: [],
      links: []
    };

    const results = await pipeline.extractEntitiesAndRelations(text, ast, { confidenceThreshold: 0.50 });
    const entityNames = results.entities.map(e => e.name.toLowerCase());
    assert.strictEqual(entityNames.includes('rawnotes'), false, 'rawnotes should not be an entity');
    assert.strictEqual(entityNames.includes('cleansed'), false, 'cleansed should not be an entity');
  });
});
