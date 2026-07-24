/**
 * QueryTools - Shared tool definitions and runners for QueryExecutor
 */

const getOfficialTools = (agent) => {
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
    },
    {
      type: 'function',
      function: {
        name: 'create_note',
        description: 'Create a new markdown note in the workspace with title, content, and optional subfolder.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title or file name for the new note (e.g. "Project Blueprint").' },
            content: { type: 'string', description: 'Markdown body content.' },
            subfolder: { type: 'string', description: 'Optional subfolder inside workspace.' }
          },
          required: ['title', 'content']
        }
      }
    }
  ];

  // Add semantic_search if embedding service is available
  if (agent.embeddingService?.isAvailable() && agent.contextEngine?.semanticRetriever) {
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

  // Add explore_graph if graph DB or retriever is available
  if (agent.contextEngine?.graphRetriever || agent.graphDb) {
    officialTools.push({
      type: 'function',
      function: {
        name: 'explore_graph',
        description: 'Explore how a note, person, concept, technology, or topic is linked to other entities in the knowledge graph.',
        parameters: {
          type: 'object',
          properties: {
            identifier: { type: 'string', description: 'The note path, title, person name, or topic (e.g., "Bikash Panda", "Semantic Search", "ai-and-search.md") to start graph traversal from.' },
            notePath: { type: 'string', description: 'Alias for identifier.' },
            maxDepth: { type: 'number', description: 'Maximum traversal hops (default 2).' }
          }
        }
      }
    });
  }

  return officialTools;
};

const runTool = async (agent, name, args) => {
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
      const files = agent.documentService._collectMarkdownFiles(agent.workspaceRoot);
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
      const files = agent.documentService._collectMarkdownFiles(agent.workspaceRoot);
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
      const path = require('path');
      const files = agent.documentService._collectMarkdownFiles(agent.workspaceRoot);
      const matchedFiles = files.filter(filePath => {
        if (!subfolder) return true;
        const relativePath = path.relative(agent.workspaceRoot, filePath);
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
      const files = agent.documentService._collectMarkdownFiles(agent.workspaceRoot);
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
      const queryStr = args.query || args.topic || args.q || agent.lastQuery || '';
      if (!queryStr) return 'No search query provided for semantic search.';
      const results = await agent.contextEngine.semanticRetriever.search(queryStr, args.topK || 5);
      if (!results.length) return 'No semantically similar notes found.';
      return results.map((r, i) => `[${i+1}] ${r.note_path} (score: ${r.score.toFixed(3)})\n${r.content}`).join('\n\n');
    } catch (err) { return `Semantic search error: ${err.message}`; }
  }
  if (name === 'explore_graph') {
    const target = args.identifier || args.notePath || '';
    try {
      let rows = [];
      if (agent.graphDb) {
        rows = agent.graphDb.traversePathOrId(target, args.maxDepth || 2);
      } else if (agent.contextEngine?.graphRetriever) {
        rows = agent.contextEngine.graphRetriever.traverse(target, args.maxDepth || 2);
      }
      if (!rows || !rows.length) return `No knowledge graph connections found for: "${target}"`;
      return rows.map(r => {
        let line = `[(${r.from_type || 'Entity'}) ${r.from_name || r.from_path}] --[${r.relation}]--> [(${r.to_type || 'Entity'}) ${r.to_name || r.to_path}]`;
        if (r.evidence) {
          line += `\n  Evidence: "${r.evidence}"`;
        }
        return line;
      }).join('\n');
    } catch (err) { return `Graph traversal error: ${err.message}`; }
  }
  if (name === 'create_note') {
    try {
      const fs = require('fs');
      const path = require('path');
      const title = String(args.title || 'Untitled').trim();
      const fileName = title.endsWith('.md') ? title : `${title}.md`;
      const targetDir = args.subfolder ? path.join(agent.workspaceRoot, args.subfolder) : agent.workspaceRoot;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const fullPath = path.join(targetDir, fileName);
      if (fs.existsSync(fullPath)) {
        return `Notice: A note named "${fileName}" already exists. Updating or overwriting existing notes is strictly disabled to safeguard note content.`;
      }
      const content = String(args.content || '');
      fs.writeFileSync(fullPath, content, 'utf8');

      if (agent.graphService) {
        await agent.graphService.processNote(fullPath, content);
      }
      return `Created new note: [${fileName}](file:///${fullPath.replace(/\\/g, '/')})`;
    } catch (err) {
      return `Error creating note: ${err.message}`;
    }
  }
  return `Error: Tool ${name} not found`;
};

module.exports = {
  getOfficialTools,
  runTool
};
