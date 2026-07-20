/**
 * QueryExecutor - Routes queries to AI models with multi-step tool execution
 */

const { getTools } = require('../tools/ToolRegistry');

class QueryExecutor {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * Execute a query using Vercel AI SDK and the tool registry
   */
  async execute(query, context = {}) {
    try {
      const llm = this.agent.llmRegistry.getActiveProvider();
      const model = await llm.getModelInstance();

      const { generateText } = await import('ai');
      const tools = await getTools(this.agent);

      // 1. Build core persona instructions — prefer ContextEngine persona if available
      let systemPrompt;
      let contextEngineTools = {};
      if (this.agent.contextEngine) {
        try {
          const conversationId = context.conversationId || 'default';
          const ceCtx = this.agent.contextEngine.buildContext({
            conversationId,
            activeNotePath: context.currentFile || null,
            activeNoteContent: context.activeNoteContent || null
          });
          systemPrompt = ceCtx.system;
          contextEngineTools = ceCtx.tools || {}; // { searchNotes, exploreGraph }
        } catch (ceErr) {
          console.warn('[QueryExecutor] ContextEngine.buildContext failed, falling back:', ceErr.message);
        }
      }
      if (!systemPrompt) {
        systemPrompt = context.systemPrompt || 'You are a helpful AI assistant for Notely, a modern markdown notes application.';
      }

      // 2. ALWAYS append workspace context metadata
      systemPrompt += `\n\nWorkspace context:
- Workspace folder: ${this.agent.workspaceRoot || 'none'}
- Current open note path: ${context.currentFile || 'none'}`;

      if (llm.baseUrl && llm.baseUrl.includes('api.groq.com')) {
        const { Groq } = require('groq-sdk');
        const groq = new Groq({ apiKey: llm.apiKey, dangerouslyAllowBrowser: true });

        const officialTools = [
          {
            type: 'function',
            function: {
              name: 'read_note',
              description: 'Read the contents of a specific note file in the workspace.',
              parameters: {
                type: 'object',
                properties: {
                  file_path: {
                    type: 'string',
                    description: 'The absolute path to the note file to read.'
                  }
                },
                required: ['file_path']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'search_notes',
              description: 'Search for note files containing a query string in the workspace.',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'The search term or phrase.'
                  }
                },
                required: ['query']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_tasks',
              description: 'Get all checklist tasks across all notes in the workspace, including open, in-progress, and completed items.',
              parameters: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['all', 'open', 'completed'],
                    description: 'Filter tasks by status: open (unchecked), completed (checked), or all.'
                  }
                }
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'list_notes',
              description: 'List all note files in the workspace (optionally filtered by subfolder).',
              parameters: {
                type: 'object',
                properties: {
                  subfolder: {
                    type: 'string',
                    description: 'An optional relative subfolder path within the workspace to restrict listing to.'
                  }
                }
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_current_date',
              description: 'Returns the current date and time. Use before answering questions about today, this week, upcoming, or overdue items.',
              parameters: { type: 'object', properties: {} }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_people',
              description: 'Find people mentioned in workspace notes via @mentions or frontmatter attendees/people fields.',
              parameters: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Filter to notes that mention this specific person (case-insensitive).'
                  }
                }
              }
            }
          }
        ];

        // Add semantic_search if embedding service is available
        if (this.agent.embeddingService?.isAvailable() && this.agent.contextEngine?.semanticRetriever) {
          officialTools.push({
            type: 'function',
            function: {
              name: 'semantic_search',
              description: 'Search workspace notes by semantic meaning using vector similarity. Use when keyword search may miss related concepts.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'The question or topic to search for by meaning.' },
                  topK: { type: 'number', description: 'Number of results (default 5).' }
                },
                required: ['query']
              }
            }
          });
        }
        // Add explore_graph if graph DB is available
        if (this.agent.contextEngine?.graphRetriever) {
          officialTools.push({
            type: 'function',
            function: {
              name: 'explore_graph',
              description: 'Explore how a note is linked to other notes in the knowledge graph.',
              parameters: {
                type: 'object',
                properties: {
                  notePath: { type: 'string', description: 'Full path of the note to start graph traversal from.' },
                  maxDepth: { type: 'number', description: 'Maximum traversal hops (default 2).' }
                },
                required: ['notePath']
              }
            }
          });
        }


        const runTool = async (name, args) => {
          if (name === 'read_note') {
            const filePath = args.file_path || args.filePath;
            try {
              const fs = require('fs');
              if (!filePath || !fs.existsSync(filePath)) {
                return `Error: Note file at path "${filePath}" does not exist.`;
              }
              return fs.readFileSync(filePath, 'utf8');
            } catch (err) {
              return `Error reading file: ${err.message}`;
            }
          }
          if (name === 'search_notes') {
            const queryStr = args.query;
            try {
              const fs = require('fs');
              const files = this.agent.documentService._collectMarkdownFiles(this.agent.workspaceRoot);
              const results = [];
              for (const filePath of files) {
                try {
                  const text = fs.readFileSync(filePath, 'utf8');
                  if (filePath.toLowerCase().includes(queryStr.toLowerCase()) || text.toLowerCase().includes(queryStr.toLowerCase())) {
                    results.push({ path: filePath, preview: text.slice(0, 150) + '...' });
                  }
                } catch {
                  // ignore unreadable files
                }
              }
              return JSON.stringify(results.slice(0, 10), null, 2);
            } catch (err) {
              return `Error searching: ${err.message}`;
            }
          }
          if (name === 'get_tasks') {
            const statusFilter = args.status || 'all';
            try {
              const fs = require('fs');
              const files = this.agent.documentService._collectMarkdownFiles(this.agent.workspaceRoot);
              const tasksList = [];
              for (const filePath of files) {
                try {
                  const text = fs.readFileSync(filePath, 'utf8');
                  const lines = text.split(/\r?\n/);
                  lines.forEach((line, index) => {
                    const match = line.match(/^\s*[-*+]?\s*\[([ xX/])\]\s+(.+)$/);
                    if (match) {
                      const symbol = match[1].toLowerCase();
                      const taskText = match[2].trim();
                      const isCompleted = symbol === 'x';
                      const isOpen = symbol === ' ' || symbol === '/';
                      
                      if (statusFilter === 'open' && !isOpen) return;
                      if (statusFilter === 'completed' && !isCompleted) return;
                      
                      tasksList.push({
                        note: filePath.split(/[\\/]/).pop(),
                        path: filePath,
                        line: index + 1,
                        text: taskText,
                        status: isCompleted ? 'completed' : symbol === '/' ? 'in-progress' : 'open'
                      });
                    }
                  });
                } catch {
                  // ignore unreadable files
                }
              }
              return JSON.stringify(tasksList.slice(0, 50), null, 2);
            } catch (err) {
              return `Error listing tasks: ${err.message}`;
            }
          }
          if (name === 'list_notes') {
            const subfolder = args.subfolder || '';
            try {
              const fs = require('fs');
              const path = require('path');
              const files = this.agent.documentService._collectMarkdownFiles(this.agent.workspaceRoot);
              const matchedFiles = files.filter(filePath => {
                if (!subfolder) return true;
                const relativePath = path.relative(this.agent.workspaceRoot, filePath);
                return relativePath.toLowerCase().includes(subfolder.toLowerCase());
              });
              return JSON.stringify(matchedFiles.map(filePath => ({
                fileName: filePath.split(/[\\/]/).pop(),
                filePath
              })).slice(0, 100), null, 2);
            } catch (err) {
              return `Error listing notes: ${err.message}`;
            }
          }
          if (name === 'get_current_date') {
            const now = new Date();
            return JSON.stringify({
              iso: now.toISOString(),
              date: now.toLocaleDateString('en-CA'),
              time: now.toLocaleTimeString('en-GB', { hour12: false }),
              dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
            }, null, 2);
          }
          if (name === 'get_people') {
            const filterName = (args.name || '').toLowerCase();
            try {
              const files = this.agent.documentService._collectMarkdownFiles(this.agent.workspaceRoot);
              const personMap = {};
              for (const filePath of files) {
                try {
                  const text = require('fs').readFileSync(filePath, 'utf8');
                  const noteName = filePath.split(/[\\/]/).pop();
                  const people = new Set();
                  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                  if (fmMatch) {
                    for (const field of ['attendees', 'people', 'participants', 'authors']) {
                      const section = fmMatch[1].match(new RegExp(`^${field}:\\s*\\n((?:\\s+-\\s+.+\\n?)*)`, 'm'));
                      if (section) { for (const m of section[1].matchAll(/^\s+-\s+(.+)$/gm)) people.add(m[1].trim().toLowerCase()); }
                      const inline = fmMatch[1].match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
                      if (inline) { inline[1].split(',').forEach(p => people.add(p.trim().toLowerCase())); }
                    }
                  }
                  for (const m of text.matchAll(/@([\w.-]+)/g)) people.add(m[1].toLowerCase());
                  for (const person of people) {
                    if (!personMap[person]) personMap[person] = [];
                    personMap[person].push(noteName);
                  }
                } catch { /* skip */ }
              }
              if (filterName) {
                const matched = Object.entries(personMap).filter(([p]) => p.includes(filterName)).reduce((a, [p, n]) => { a[p] = n; return a; }, {});
                return JSON.stringify(matched, null, 2);
              }
              return JSON.stringify(personMap, null, 2);
            } catch (err) { return `Error getting people: ${err.message}`; }
          }
          if (name === 'semantic_search') {
            try {
              const results = await this.agent.contextEngine.semanticRetriever.search(args.query, args.topK || 5);
              if (!results.length) return 'No semantically similar notes found.';
              return results.map((r, i) => `[${i+1}] ${r.note_path} (score: ${r.score.toFixed(3)})\n${r.content}`).join('\n\n');
            } catch (err) { return `Semantic search error: ${err.message}`; }
          }
          if (name === 'explore_graph') {
            try {
              const rows = this.agent.contextEngine.graphRetriever.traverse(args.notePath, args.maxDepth || 2);
              if (!rows.length) return `No graph relations found for: ${args.notePath}`;
              return rows.map(r => `[depth ${r.depth}] ${r.from_path} --[${r.relation}]--> ${r.to_path}`).join('\n');
            } catch (err) { return `Graph traversal error: ${err.message}`; }
          }
          return `Error: Tool ${name} not found`;
        };

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ];

        let steps = 0;
        let finalResponseText = '';
        let totalTokens = 0;
        const trace = [];

        while (steps < 5) {
          const chatCompletion = await groq.chat.completions.create({
            messages,
            model: llm.model || 'llama-3.3-70b-versatile',
            tools: officialTools,
            tool_choice: 'auto',
            temperature: 0.7,
          });

          const choice = chatCompletion.choices[0];
          const responseMessage = choice.message;
          totalTokens += chatCompletion.usage?.total_tokens || 0;

          // Push the assistant's reply (which may contain tool calls) to messages
          messages.push(responseMessage);

          if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            for (const toolCall of responseMessage.tool_calls) {
              const name = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments);
              console.log(`[Groq Native] Executing tool ${name} with args:`, toolCall.function.arguments);
              
              const output = await runTool(name, args);

              trace.push({ name, args, output: output.slice(0, 500) });
              
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: name,
                content: output
              });
            }
            steps++;
          } else {
            finalResponseText = responseMessage.content || '';
            break;
          }
        }
        // Write back to provider so health diagnostics see real stats
        if (llm.usageStats) {
          llm.usageStats.tokensUsedTotal += totalTokens;
          llm.usageStats.requestsTotal += 1;
        }

        return {
          type: 'query',
          result: finalResponseText,
          tokensUsed: totalTokens,
          trace
        };
      }
      const mergedTools = {
        ...tools,
        ...contextEngineTools
      };

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: query,
        tools: mergedTools,
        maxSteps: 5 // Allow multi-step tool calls
      });

      return {
        type: 'query',
        result: result.text,
        tokensUsed: result.usage?.totalTokens || 0
      };
    } catch (error) {
      console.error('[QueryExecutor] Execution failed:', error.message);
      throw error;
    }
  }
}

module.exports = QueryExecutor;
