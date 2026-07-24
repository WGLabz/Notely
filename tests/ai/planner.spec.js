const assert = require('assert');
const Planner = require('../../ai/core/Planner');
const { semanticToolsCatalog, SemanticToolRunner } = require('../../ai/tools/SemanticTools');

describe('Planner & Semantic Tools Tests (Phase 2)', () => {
  it('Planner should classify intents and build multi-step execution plans', () => {
    const planner = new Planner({});

    const timelinePlan = planner.createPlan('Show me the timeline of authentication changes');
    assert.strictEqual(timelinePlan.intent, 'TimelineReconstruction');
    assert.strictEqual(timelinePlan.steps.length, 2);
    assert.strictEqual(timelinePlan.steps[0].toolName, 'reconstruct_timeline');

    const taskPlan = planner.createPlan('Find open tasks assigned to me');
    assert.strictEqual(taskPlan.intent, 'TaskSummary');
    assert.strictEqual(taskPlan.steps[0].toolName, 'find_people_and_tasks');

    const topicPlan = planner.createPlan('Explore architecture of graph database');
    assert.strictEqual(topicPlan.intent, 'TopicExploration');
    assert.strictEqual(topicPlan.steps[0].toolName, 'explore_topic_graph');
  });

  it('SemanticToolRunner should execute semantic tools cleanly', async () => {
    assert.ok(Array.isArray(semanticToolsCatalog));
    assert.strictEqual(semanticToolsCatalog.length, 5);

    const mockAgent = {
      workspaceBrain: {
        getWorkspaceFacts: async (topic) => [{ topic, snippet: 'Sample discussion' }]
      }
    };
    const runner = new SemanticToolRunner(mockAgent);

    const discussionRes = await runner.run('find_discussions', { topic: 'JWT Auth' });
    assert.ok(discussionRes);

    const timelineRes = await runner.run('reconstruct_timeline', { topic: 'Vite Migration' });
    assert.ok(Array.isArray(timelineRes));
    assert.ok(timelineRes[0].event.includes('Vite Migration'));
  });
});
