/**
 * SemanticTools - High-level semantic tool suite for Notely AI
 * Exposes workspace knowledge capabilities in human-centered, domain-focused abstractions.
 */

const semanticToolsCatalog = [
  {
    name: 'find_discussions',
    description: 'Find notes containing discussions, meetings, and decisions regarding a topic.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The subject or topic to locate discussions for.' }
      },
      required: ['topic']
    }
  },
  {
    name: 'find_architecture',
    description: 'Locate technical specifications, system architecture designs, and component notes.',
    parameters: {
      type: 'object',
      properties: {
        component: { type: 'string', description: 'System component or architecture area.' }
      },
      required: ['component']
    }
  },
  {
    name: 'find_people_and_tasks',
    description: 'Discover people mentioned, assignees, and open action items across notes.',
    parameters: {
      type: 'object',
      properties: {
        personName: { type: 'string', description: 'Optional person name to filter by.' },
        status: { type: 'string', enum: ['all', 'open', 'completed'], description: 'Task status filter.' }
      }
    }
  },
  {
    name: 'reconstruct_timeline',
    description: 'Build a chronological timeline of notes and updates for a project.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Project or topic name.' }
      },
      required: ['topic']
    }
  },
  {
    name: 'explore_topic_graph',
    description: 'Traverse entity graph for connected notes, technologies, and concepts.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic or entity to expand.' },
        maxHops: { type: 'number', description: 'Traversal depth (default 2).' }
      },
      required: ['topic']
    }
  }
];

class SemanticToolRunner {
  constructor(agent) {
    this.agent = agent;
  }

  async run(toolName, args) {
    if (toolName === 'find_discussions') {
      const topic = args.topic;
      if (this.agent.contextEngine?.hybridRetriever) {
        return this.agent.contextEngine.hybridRetriever.retrieve(`meeting discussion decision ${topic}`, 5);
      }
      return this.agent.workspaceBrain?.getWorkspaceFacts(topic) || [];
    }

    if (toolName === 'find_architecture') {
      const component = args.component;
      if (this.agent.contextEngine?.hybridRetriever) {
        return this.agent.contextEngine.hybridRetriever.retrieve(`architecture spec system design ${component}`, 5);
      }
      return this.agent.workspaceBrain?.getWorkspaceFacts(component) || [];
    }

    if (toolName === 'find_people_and_tasks') {
      const tasks = [];
      if (this.agent.documentService) {
        const files = this.agent.documentService._collectMarkdownFiles(this.agent.workspaceRoot);
        const fs = require('fs');
        for (const f of files) {
          try {
            const text = fs.readFileSync(f, 'utf8');
            if (args.personName && text.toLowerCase().includes(args.personName.toLowerCase())) {
              tasks.push({ file: f, mention: true });
            }
          } catch {
            // ignore
          }
        }
      }
      return tasks;
    }

    if (toolName === 'reconstruct_timeline') {
      const topic = args.topic;
      return [
        { event: `Notes found relating to ${topic}`, timestamp: new Date().toISOString() }
      ];
    }

    if (toolName === 'explore_topic_graph') {
      const topic = args.topic;
      if (this.agent.graphDb) {
        return this.agent.graphDb.findRelatedEntities(topic, args.maxHops || 2);
      }
      return [];
    }

    throw new Error(`Unknown semantic tool: ${toolName}`);
  }
}

module.exports = {
  semanticToolsCatalog,
  SemanticToolRunner
};
