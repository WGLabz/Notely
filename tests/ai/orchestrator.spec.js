const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ContextOrchestrator = require('../../ai/core/ContextOrchestrator');

describe('ContextOrchestrator Multi-Tool Planning & Context Aggregation Tests', () => {
  let mockAgent;

  beforeEach(() => {
    mockAgent = {
      workspaceBrain: {
        getWorkspaceFacts: async (query) => [
          { source: 'WorkspaceBrain', filePath: 'note1.md', content: 'Architecture discussion notes.', score: 0.9 }
        ]
      }
    };
  });

  it('should execute internal planning, parallel tool execution, and context consolidation', async () => {
    const orchestrator = new ContextOrchestrator(mockAgent);
    const res = await orchestrator.orchestrate('What is our architecture timeline?', {}, { targetConfidence: 0.75 });

    assert.ok(res.evidence.length > 0);
    assert.ok(res.confidence > 0.70);
    assert.ok(res.aggregatedContext.includes('Evidence #1'));
  });

  it('should deduplicate overlapping evidence snippets across tools', () => {
    const orchestrator = new ContextOrchestrator(mockAgent);
    const duplicateItems = [
      { toolName: 'find_discussions', filePath: 'noteA.md', content: 'Database migration design.', score: 0.85 },
      { toolName: 'explore_topic_graph', filePath: 'noteA.md', content: 'Database migration design.', score: 0.80 },
      { toolName: 'reconstruct_timeline', filePath: 'noteB.md', content: 'Initial schema created in May.', score: 0.90 }
    ];

    const aggregated = orchestrator.aggregateContext(duplicateItems);
    assert.strictEqual(aggregated.items.length, 2); // 1 duplicate removed
    assert.strictEqual(aggregated.items[0].filePath, 'noteB.md'); // ranked by score
  });

  it('should calculate confidence based on volume, grounding, and relevance scores', () => {
    const orchestrator = new ContextOrchestrator(mockAgent);
    const items = [
      { toolName: 'find_architecture', filePath: 'spec.md', content: 'VitePress documentation setup', score: 0.85 }
    ];

    const aggregated = orchestrator.aggregateContext(items);
    assert.ok(aggregated.confidence >= 0.70);
  });
});
