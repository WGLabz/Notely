/**
 * ApplicationToolRegistry.cjs
 * Central Application Tool Registry for Notely.
 * Provides typed tool definitions, Zod validation, structured output envelopes,
 * telemetry/logging, Vercel AI SDK export, and future MCP schema export.
 */

const { NoteApplicationService } = require('../services/NoteApplicationService.cjs');
const { KnowledgeApplicationService } = require('../services/KnowledgeApplicationService.cjs');
const { WorkspaceApplicationService } = require('../services/WorkspaceApplicationService.cjs');
const { z } = require('zod');

class ApplicationToolRegistry {
  constructor() {
    this.noteService = new NoteApplicationService();
    this.knowledgeService = new KnowledgeApplicationService();
    this.workspaceService = new WorkspaceApplicationService();

    this.tools = new Map();
    this.aliasMap = new Map();

    this._registerDefaultTools();
  }

  /**
   * Set active agent instance for knowledge service (GraphDB/EmbeddingDB binding).
   */
  setAgentInstance(agentInstance) {
    this.knowledgeService.setAgentInstance(agentInstance);
  }

  /**
   * Register a capability tool in the central registry.
   */
  registerTool(def) {
    if (!def.name || !def.version || !def.execute) {
      throw new Error('Tool definition must specify name, version, and execute function.');
    }
    const fullName = `${def.name}@${def.version}`;
    this.tools.set(fullName, def);
    this.aliasMap.set(def.name, fullName);

    if (def.aliases && Array.isArray(def.aliases)) {
      for (const alias of def.aliases) {
        this.aliasMap.set(alias, fullName);
      }
    }
  }

  /**
   * Resolve a tool name or alias to its full versioned name.
   */
  resolveToolName(nameOrAlias) {
    if (this.tools.has(nameOrAlias)) return nameOrAlias;
    if (this.aliasMap.has(nameOrAlias)) return this.aliasMap.get(nameOrAlias);
    return null;
  }

  /**
   * Execute a tool by name/alias with typed validation and structured response envelope.
   */
  async executeTool(toolNameOrAlias, rawArgs = {}, context = {}) {
    const startTime = Date.now();
    const fullName = this.resolveToolName(toolNameOrAlias);

    const caller = context.caller || 'internal_ai';
    const workspaceRoot = context.workspaceRoot || rawArgs.workspaceRoot || null;

    if (!fullName || !this.tools.has(fullName)) {
      return this._buildResponse({
        success: false,
        data: null,
        toolName: toolNameOrAlias,
        version: 'unknown',
        startTime,
        caller,
        executionPath: 'ApplicationToolRegistry -> resolveToolName',
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool "${toolNameOrAlias}" is not registered in the Application Tool Registry.`
        }
      });
    }

    const toolDef = this.tools.get(fullName);

    // Validate inputs if schema exists
    let validatedArgs = rawArgs || {};
    if (toolDef.schema && typeof toolDef.schema.parse === 'function') {
      try {
        validatedArgs = toolDef.schema.parse(rawArgs || {});
      } catch (err) {
        return this._buildResponse({
          success: false,
          data: null,
          toolName: toolDef.name,
          version: toolDef.version,
          startTime,
          caller,
          executionPath: `ApplicationToolRegistry -> SchemaValidation -> ${toolDef.name}`,
          error: {
            code: 'INVALID_INPUT',
            message: `Input validation failed for tool "${toolDef.name}": ${err.message}`
          }
        });
      }
    }

    // Merge context workspaceRoot into validatedArgs if needed
    const finalArgs = {
      ...validatedArgs,
      workspaceRoot: validatedArgs.workspaceRoot || workspaceRoot
    };

    try {
      const data = await toolDef.execute(finalArgs, context, this);
      return this._buildResponse({
        success: true,
        data,
        toolName: toolDef.name,
        version: toolDef.version,
        startTime,
        caller,
        executionPath: `ApplicationToolRegistry -> ${toolDef.serviceName || 'Service'} -> ${toolDef.name}`
      });
    } catch (err) {
      return this._buildResponse({
        success: false,
        data: null,
        toolName: toolDef.name,
        version: toolDef.version,
        startTime,
        caller,
        executionPath: `ApplicationToolRegistry -> ExecutionFailure -> ${toolDef.name}`,
        error: {
          code: 'EXECUTION_ERROR',
          message: err.message || 'An error occurred during tool execution.'
        }
      });
    }
  }

  _buildResponse({ success, data, toolName, version, startTime, caller, executionPath, error = null, warnings = [] }) {
    const durationMs = Date.now() - startTime;
    return {
      success,
      data,
      metadata: {
        toolName,
        version,
        durationMs,
        timestamp: new Date().toISOString()
      },
      diagnostics: {
        caller,
        executionPath
      },
      warnings,
      error
    };
  }

  /**
   * Export registered tools to Vercel AI SDK compatible tool definitions.
   */
  async toVercelTools(context = {}) {
    const { tool } = await import('ai');
    const { z } = await import('zod');

    const vercelTools = {};

    for (const [fullName, toolDef] of this.tools.entries()) {
      // Use alias name or primary name for Vercel AI SDK compatibility
      const sdkName = toolDef.sdkName || toolDef.aliases?.[0] || toolDef.name.replace(/\./g, '_');
      
      vercelTools[sdkName] = tool({
        description: toolDef.description,
        parameters: toolDef.schema || z.object({}),
        execute: async (args) => {
          const res = await this.executeTool(fullName, args, context);
          if (!res.success) {
            return `Error [${res.error?.code || 'FAILURE'}]: ${res.error?.message}`;
          }
          if (res.data && typeof res.data.content === 'string') {
            return res.data.content;
          }
          return typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
        }
      });
    }

    return vercelTools;
  }

  /**
   * Export registered tools into JSON-RPC / MCP Tool format.
   */
  toMcpSchemas() {
    const mcpSchemas = [];
    for (const toolDef of this.tools.values()) {
      mcpSchemas.push({
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.jsonSchema || { type: 'object', properties: {} }
      });
    }
    return mcpSchemas;
  }

  _registerDefaultTools() {
    // 1. notes.read
    this.registerTool({
      name: 'notes.read',
      version: 'v1',
      aliases: ['read_note'],
      sdkName: 'read_note',
      serviceName: 'NoteApplicationService',
      description: 'Read the contents of a specific note file in the workspace.',
      schema: z.object({
        filePath: z.string().optional().describe('Relative or absolute path to the note file.'),
        file_path: z.string().optional().describe('Relative or absolute path to the note file.'),
        startLine: z.number().optional().describe('Start line number (default: 1).'),
        start_line: z.number().optional().describe('Start line number (default: 1).'),
        maxLines: z.number().optional().describe('Maximum lines to read (default: 500).'),
        max_lines: z.number().optional().describe('Maximum lines to read (default: 500).'),
        end_line: z.number().optional().describe('End line number.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative or absolute path to the note file.' },
          startLine: { type: 'number', description: 'Start line number (default: 1).' },
          maxLines: { type: 'number', description: 'Maximum lines to read (default: 500).' }
        },
        required: ['filePath']
      },
      execute: async (args) => {
        const filePath = args.filePath || args.file_path;
        if (!filePath) {
          throw new Error('filePath or file_path is required.');
        }
        return this.noteService.readNote({
          ...args,
          filePath
        });
      }
    });

    // 2. notes.create
    this.registerTool({
      name: 'notes.create',
      version: 'v1',
      aliases: ['create_note'],
      sdkName: 'create_note',
      serviceName: 'NoteApplicationService',
      description: 'Create a new note in the workspace.',
      schema: z.object({
        title: z.string().optional().describe('Title for the new note.'),
        note_title: z.string().optional().describe('Title or name for the new note.'),
        name: z.string().optional().describe('Name or title for the new note.'),
        content: z.string().optional().describe('Initial markdown content.'),
        folder: z.string().optional().describe('Target folder path within workspace.'),
        target_folder: z.string().optional().describe('Target folder path within workspace.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title for the new note.' },
          note_title: { type: 'string', description: 'Title or name for the new note.' },
          name: { type: 'string', description: 'Name or title for the new note.' },
          content: { type: 'string', description: 'Initial markdown content.' },
          folder: { type: 'string', description: 'Target folder path within workspace.' }
        }
      },
      execute: async (args) => {
        const finalTitle = args.title || args.note_title || args.name || 'Untitled';
        return this.noteService.createNote({
          ...args,
          title: finalTitle,
          folder: args.folder || args.target_folder
        });
      }
    });

    // 3. notes.move
    this.registerTool({
      name: 'notes.move',
      version: 'v1',
      aliases: ['move_note'],
      sdkName: 'move_note',
      serviceName: 'NoteApplicationService',
      description: 'Move or rename a note within the workspace.',
      schema: z.object({
        sourcePath: z.string().optional().describe('Source file path.'),
        source_path: z.string().optional().describe('Source file path.'),
        targetPath: z.string().optional().describe('Target destination file path.'),
        target_path: z.string().optional().describe('Target destination file path.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: 'Source file path.' },
          targetPath: { type: 'string', description: 'Target destination file path.' }
        },
        required: ['sourcePath', 'targetPath']
      },
      execute: async (args) => {
        const sourcePath = args.sourcePath || args.source_path;
        const targetPath = args.targetPath || args.target_path;
        if (!sourcePath || !targetPath) {
          throw new Error('Both source path and target path are required.');
        }
        return this.noteService.moveNote({
          ...args,
          sourcePath,
          targetPath
        });
      }
    });

    // 4. notes.extract_tasks
    this.registerTool({
      name: 'notes.extract_tasks',
      version: 'v1',
      aliases: ['get_tasks'],
      sdkName: 'get_tasks',
      serviceName: 'NoteApplicationService',
      description: 'Extract checklist tasks across notes in the workspace.',
      schema: z.object({
        notePath: z.string().optional().describe('Optional specific note path to extract tasks from.'),
        note_path: z.string().optional().describe('Optional specific note path to extract tasks from.'),
        status: z.enum(['all', 'open', 'completed']).optional().describe('Filter tasks by status.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          notePath: { type: 'string', description: 'Optional specific note path to extract tasks from.' },
          status: { type: 'string', enum: ['all', 'open', 'completed'], description: 'Filter tasks by status.' }
        }
      },
      execute: async (args) => this.noteService.extractTasks(args)
    });

    // 5. search.notes
    this.registerTool({
      name: 'search.notes',
      version: 'v1',
      aliases: ['search_notes'],
      sdkName: 'search_notes',
      serviceName: 'KnowledgeApplicationService',
      description: 'Search note files matching a query string in the workspace.',
      schema: z.object({
        query: z.string().describe('The search query or keyword.'),
        limit: z.number().optional().describe('Max results to return (default: 10).')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query or keyword.' },
          limit: { type: 'number', description: 'Max results to return (default: 10).' }
        },
        required: ['query']
      },
      execute: async (args) => this.knowledgeService.searchNotes(args)
    });

    // 6. search.similar
    this.registerTool({
      name: 'search.similar',
      version: 'v1',
      aliases: ['semantic_search'],
      sdkName: 'semantic_search',
      serviceName: 'KnowledgeApplicationService',
      description: 'Find semantically similar notes using vector embeddings.',
      schema: z.object({
        notePath: z.string().optional().describe('Path to source note.'),
        note_path: z.string().optional().describe('Path to source note.'),
        text: z.string().optional().describe('Raw text query for similarity.'),
        topK: z.number().optional().describe('Top K results (default: 5).'),
        top_k: z.number().optional().describe('Top K results (default: 5).')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          notePath: { type: 'string', description: 'Path to source note.' },
          text: { type: 'string', description: 'Raw text query for similarity.' },
          topK: { type: 'number', description: 'Top K results (default: 5).' }
        }
      },
      execute: async (args) => this.knowledgeService.searchSimilar(args)
    });

    // 7. search.hybrid
    this.registerTool({
      name: 'search.hybrid',
      version: 'v1',
      aliases: ['hybrid_search'],
      sdkName: 'hybrid_search',
      serviceName: 'KnowledgeApplicationService',
      description: 'Hybrid search combining full-text search and vector similarity.',
      schema: z.object({
        query: z.string().describe('Query text.'),
        limit: z.number().optional().describe('Limit results.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query text.' },
          limit: { type: 'number', description: 'Limit results.' }
        },
        required: ['query']
      },
      execute: async (args) => this.knowledgeService.searchHybrid(args)
    });

    // 8. knowledge.related_topics
    this.registerTool({
      name: 'knowledge.related_topics',
      version: 'v1',
      aliases: ['get_graph'],
      sdkName: 'get_graph',
      serviceName: 'KnowledgeApplicationService',
      description: 'Traverse knowledge graph relationships for a given note.',
      schema: z.object({
        notePath: z.string().optional().describe('Source note path.'),
        note_path: z.string().optional().describe('Source note path.'),
        maxDepth: z.number().optional().describe('Max graph traversal depth.'),
        max_depth: z.number().optional().describe('Max graph traversal depth.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          notePath: { type: 'string', description: 'Source note path.' },
          maxDepth: { type: 'number', description: 'Max graph traversal depth.' }
        },
        required: ['notePath']
      },
      execute: async (args) => {
        const notePath = args.notePath || args.note_path;
        if (!notePath) {
          throw new Error('notePath or note_path is required.');
        }
        return this.knowledgeService.getRelatedTopics({
          ...args,
          notePath
        });
      }
    });

    // 9. knowledge.find_clusters
    this.registerTool({
      name: 'knowledge.find_clusters',
      version: 'v1',
      aliases: ['find_clusters'],
      sdkName: 'find_clusters',
      serviceName: 'KnowledgeApplicationService',
      description: 'Get semantic topic clusters across the workspace.',
      schema: z.object({
        minSize: z.number().optional().describe('Minimum cluster size.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          minSize: { type: 'number', description: 'Minimum cluster size.' }
        }
      },
      execute: async (args) => this.knowledgeService.findClusters(args)
    });

    // 10. knowledge.status
    this.registerTool({
      name: 'knowledge.status',
      version: 'v1',
      aliases: ['knowledge_status'],
      sdkName: 'knowledge_status',
      serviceName: 'KnowledgeApplicationService',
      description: 'Get indexing and health status of knowledge engines.',
      schema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      execute: async (args) => this.knowledgeService.getKnowledgeStatus(args)
    });

    // 11. knowledge.reindex
    this.registerTool({
      name: 'knowledge.reindex',
      version: 'v1',
      aliases: ['reindex_knowledge'],
      sdkName: 'reindex_knowledge',
      serviceName: 'KnowledgeApplicationService',
      description: 'Trigger background reindexing of knowledge graph and embeddings.',
      schema: z.object({
        force: z.boolean().optional().describe('Force full reindex.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          force: { type: 'boolean', description: 'Force full reindex.' }
        }
      },
      execute: async (args) => this.knowledgeService.reindexKnowledge(args)
    });

    // 12. workspace.statistics
    this.registerTool({
      name: 'workspace.statistics',
      version: 'v1',
      aliases: ['workspace_stats'],
      sdkName: 'workspace_stats',
      serviceName: 'WorkspaceApplicationService',
      description: 'Get workspace health, document counts, and storage metrics.',
      schema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      execute: async (args) => this.workspaceService.getStatistics(args)
    });

    // 13. workspace.recent_activity
    this.registerTool({
      name: 'workspace.recent_activity',
      version: 'v1',
      aliases: ['recent_activity'],
      sdkName: 'recent_activity',
      serviceName: 'WorkspaceApplicationService',
      description: 'Get list of recently modified notes in the workspace.',
      schema: z.object({
        limit: z.number().optional().describe('Max items to return.')
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max items to return.' }
        }
      },
      execute: async (args) => this.workspaceService.getRecentActivity(args)
    });
  }
}

// Global Application Tool Registry Singleton
const applicationToolRegistry = new ApplicationToolRegistry();

module.exports = {
  ApplicationToolRegistry,
  applicationToolRegistry
};
