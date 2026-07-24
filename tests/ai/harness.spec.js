const assert = require('assert');
const AgentHarness = require('../../ai/diagnostics/AgentHarness');

describe('AgentHarness Evaluation Suite Tests', () => {
  it('AgentHarness should run evaluation scenarios and compute metrics', async () => {
    const mockAgent = {
      query: async (q) => ({
        success: true,
        result: `Based on your notes regarding ${q}, here is the answer.`,
        tokensUsed: 120,
        trace: [{ name: 'find_discussions', args: { topic: q } }]
      })
    };

    const harness = new AgentHarness(mockAgent);
    const evalResults = await harness.runEvaluation([
      { id: 'scen-1', query: 'What decisions were made on authentication?' },
      { id: 'scen-2', query: 'Explore note connections for database graph' }
    ]);

    assert.strictEqual(evalResults.totalScenarios, 2);
    assert.strictEqual(evalResults.totalTokensUsed, 240);
    assert.strictEqual(evalResults.zeroJargonScore, 100);
    assert.strictEqual(evalResults.groundingScore, 100);
    assert.ok(evalResults.averageLatencyMs >= 0);
  });
});
