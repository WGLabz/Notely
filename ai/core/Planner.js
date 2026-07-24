/**
 * Planner - Intent classification & multi-step execution planner for Notely AI
 * Decomposes complex user queries into ordered tool dependency execution graphs.
 */

class Planner {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * Classify user query intent
   * @param {string} query
   * @returns {string} - 'DirectQuery' | 'TopicExploration' | 'TimelineReconstruction' | 'TaskSummary'
   */
  classifyIntent(query) {
    const q = String(query || '').toLowerCase();
    if (q.includes('timeline') || q.includes('history of') || q.includes('how did') && q.includes('evolve')) {
      return 'TimelineReconstruction';
    }
    if (q.includes('task') || q.includes('todo') || q.includes('action item') || q.includes('assigned to')) {
      return 'TaskSummary';
    }
    if (q.includes('architecture') || q.includes('explore') || q.includes('relationship') || q.includes('connected to')) {
      return 'TopicExploration';
    }
    return 'DirectQuery';
  }

  /**
   * Build execution plan graph for query
   * @param {string} query
   * @returns {{ intent: string, steps: Array<{ toolName: string, args: object }> }}
   */
  createPlan(query) {
    const intent = this.classifyIntent(query);
    const steps = [];

    switch (intent) {
      case 'TimelineReconstruction':
        steps.push({ toolName: 'reconstruct_timeline', args: { topic: query } });
        steps.push({ toolName: 'find_discussions', args: { topic: query } });
        break;
      case 'TaskSummary':
        steps.push({ toolName: 'find_people_and_tasks', args: { status: 'open' } });
        break;
      case 'TopicExploration':
        steps.push({ toolName: 'explore_topic_graph', args: { topic: query, maxHops: 2 } });
        steps.push({ toolName: 'find_architecture', args: { component: query } });
        break;
      case 'DirectQuery':
      default:
        steps.push({ toolName: 'find_discussions', args: { topic: query } });
        break;
    }

    return { intent, steps };
  }
}

module.exports = Planner;
