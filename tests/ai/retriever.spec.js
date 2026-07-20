const assert = require('assert');
const { SemanticRetriever } = require('../../ai/context/SemanticRetriever');
const { GraphRetriever } = require('../../ai/context/GraphRetriever');

describe('Semantic & Graph Retrievers Tests', () => {
  it('should format tool parameters and return fallbacks if dependencies are absent', async () => {
    // Stub service unavailable state
    const mockEmbDB = { db: { prepare: () => ({ all: () => [] }) } };
    const mockEmbService = { isAvailable: () => false };
    const retriever = new SemanticRetriever(mockEmbDB, mockEmbService);

    const results = await retriever.search('test query');
    assert.strictEqual(results.length, 0);

    const tool = retriever.toTool();
    assert.ok(tool.description);
    assert.ok(tool.parameters.properties.query);

    const response = await tool.execute({ query: 'testing' });
    assert.strictEqual(response, 'No relevant note content found.');
  });

  it('should format graph traversal tool output properly', async () => {
    const mockGraphDB = {
      db: {
        prepare: () => ({
          all: () => [
            { from_path: 'a.md', relation: 'links', to_path: 'b.md', depth: 1 }
          ]
        })
      }
    };

    const retriever = new GraphRetriever(mockGraphDB);
    const rows = retriever.traverse('a.md');
    assert.strictEqual(rows.length, 1);

    const tool = retriever.toTool();
    const response = await tool.execute({ notePath: 'a.md' });
    assert.ok(response.includes('[depth 1] a.md --[links]--> b.md'));
  });
});


