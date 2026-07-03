# Notely AI Agent

A comprehensive, modular AI assistant integrated into the Notely markdown notes application. The AI agent is context-aware, memory-based, and provides intelligent assistance with note management, editing, and discovery.

## Features

### Core Capabilities
- **Context-Aware Queries**: Understand workspace structure and document relationships
- **Semantic Search**: Find semantically similar documents using embeddings
- **Pattern Learning**: Detect and learn user preferences and workflows
- **Relationship Discovery**: Automatically identify connections between documents
- **Multi-LLM Support**: Configurable Gemini and Groq text providers with HuggingFace embeddings
- **Local Persistence**: Metadata is stored locally; AI requests only run when the user invokes a configured provider

### AI Commands (via Palette - Ctrl/Cmd+Shift+I)
- **Summarize**: Generate document summaries
- **Analyze**: Provide content insights and analysis
- **Format**: Fix markdown formatting issues
- **Search**: Find related documents
- **Generate**: Create new markdown content
- **Organize**: Reorganize document structure
- **Find Related**: Discover semantically similar docs

## Architecture

### Module Organization

```
src/ai/
├── core/                          # Core orchestration
│   ├── Agent.js                   # Main orchestrator
│   ├── ContextManager.js          # Workspace context
│   ├── MemoryManager.js           # Learning & memory
│   ├── PatternDetector.js         # Pattern analysis
│   ├── GraphAnalyzer.js           # Relationship analysis
│   └── MemoryOptimizer.js         # Performance optimization
├── llm/                           # LLM providers
│   ├── LLMProvider.js             # Abstract base
│   ├── LLMRegistry.js             # Provider registry
│   └── providers/
│       ├── GeminiProvider.js      # Google Gemini
│       └── GroqProvider.js        # Groq text generation
├── services/                      # Core services
│   ├── DocumentService.js         # Document indexing
│   ├── EmbeddingService.js        # Vector embeddings
│   ├── RelationshipService.js     # Document relationships
│   └── QueryExecutor.js           # Query routing
├── database/                      # Data persistence
│   ├── DatabaseManager.js         # SQLite operations
│   └── migrations.js              # Schema versioning
├── tools/                         # AI tools
│   └── (File, search, format tools)
├── utils/                         # Utilities
│   ├── ipcProtocol.js             # IPC types
│   ├── aiUtils.js                 # Helper functions
│   └── AIConfig.js                # Configuration
└── components/                    # React components
    ├── AIPalette.jsx              # Command palette
    └── AIPalette.css              # Styling
```

### Database Schema

**Extended SQLite tables** (in `.notes-app/app.sqlite`):

- `ai_document_embeddings` - Vector embeddings for semantic search
- `ai_document_relationships` - Document relationship graph
- `ai_interactions` - User interaction history & learning
- `ai_patterns` - Detected behavior patterns
- `ai_context_cache` - Cached context data

## Usage

### Initialization

```javascript
const Agent = require('src/ai/core/Agent');
const DatabaseManager = require('src/ai/database/DatabaseManager');
const LLMRegistry = require('src/ai/llm/LLMRegistry');

// Setup
const db = new DatabaseManager(appDataDir);
const llmRegistry = new LLMRegistry();
const agent = new Agent(db, llmRegistry);

// Initialize
await agent.initialize(workspaceRoot, {
  name: 'gemini',
  config: { apiKey: process.env.GEMINI_API_KEY }
});
```

### Processing Queries

```javascript
// Simple query
const result = await agent.query('Summarize this document', {
  currentFile: '/path/to/file.md'
});

// With context
const result = await agent.query(userInput, {
  currentFile: currentFilePath,
  selectedText: selectedText
});
```

### Generating Embeddings

```javascript
// Generate embeddings for all documents
const result = await agent.generateEmbeddings();

// With refresh
const result = await agent.generateEmbeddings(true);
```

### Building Relationships

```javascript
// Discover document relationships
const graph = await agent.buildRelationshipGraph();
```

### Pattern Detection

```javascript
// Detect user patterns
const patterns = agent.detectPatterns();
```

## API Key Configuration

### Setting Up API Keys

```javascript
const AIConfig = require('src/ai/utils/AIConfig');
const config = new AIConfig();

// Save Gemini API key (encrypted)
config.saveAPIKey('gemini', process.env.GEMINI_API_KEY);

// Retrieve when needed
const apiKey = config.getAPIKey('gemini');
```

### Electron IPC Integration

Keys are stored securely using Electron's `safeStorage`:

```javascript
// In React component
const apiKey = await window.electron.ipcRenderer.invoke('ai:config:get-api-key', {
  provider: 'gemini'
});

// Set API key
await window.electron.ipcRenderer.invoke('ai:config:set-api-key', {
  provider: 'gemini',
  apiKey: userEnteredKey
});
```

## Performance Considerations

### Optimization
- **Vector Caching**: Embeddings cached in memory + database
- **Lazy Loading**: Services initialized on-demand
- **Query Batching**: Multiple embeddings generated efficiently
- **Cache Cleanup**: Expired data automatically cleaned
- **Database Optimization**: Regular VACUUM and REINDEX

### Memory Management

```javascript
const optimizer = agent.memoryOptimizer;

// Analyze memory
const stats = optimizer.analyzeMemoryUsage();

// Clean expired data
optimizer.cleanExpiredData();

// Get recommendations
const recs = optimizer.getOptimizationRecommendations();
```

### Performance Targets
- Palette open: <200ms
- Query response: <3s (Gemini API call)
- Embedding generation: <5s per document
- Memory query: <100ms

## Configuration

### User Preferences

```javascript
const prefs = {
  enablePatternLearning: true,
  enableEmbeddings: true,
  enableRelationshipDiscovery: true,
  maxTokensPerQuery: 2048,
  temperature: 0.7
};

config.savePreferences(prefs);
```

### LLM Provider Selection

```javascript
// Activate Gemini
await agent.llmRegistry.activateProvider('gemini', {
  apiKey: process.env.GEMINI_API_KEY
});

// Or OpenAI (when implemented)
await agent.llmRegistry.activateProvider('openai', {
  apiKey: process.env.OPENAI_API_KEY
});
```

## Development

### Adding New LLM Providers

```javascript
const LLMProvider = require('src/ai/llm/LLMProvider');

class NewProvider extends LLMProvider {
  constructor(config) {
    super(config);
    this.name = 'new-provider';
  }

  async initialize() {
    // Implement initialization
  }

  async generateText(prompt, options) {
    // Implement text generation
  }

  async generateEmbeddings(texts) {
    // Implement embeddings
  }

  // ... other methods
}

// Register
llmRegistry.register('new-provider', (config) => new NewProvider(config));
```

### Adding New Tools

```javascript
class CustomTool {
  async execute(query, context) {
    // Implement tool logic
    return { result: '...' };
  }
}

// Register with query executor
queryExecutor.registerTool('custom', new CustomTool());
```

## Troubleshooting

### Common Issues

**Issue**: "AI agent not initialized"
- **Solution**: Call `agent.initialize()` before queries

**Issue**: "No embeddings found"
- **Solution**: Run `agent.generateEmbeddings()` first

**Issue**: High memory usage
- **Solution**: Call `optimizer.cleanExpiredData()` and `optimizer.optimizeDatabase()`

**Issue**: Slow relationship discovery
- **Solution**: Reduce document count or increase `maxDistance` threshold

## Security & Privacy

- ✅ **No background cloud sync**: AI requests are sent only to the providers the user configures and explicitly invokes
- ✅ **Encrypted storage**: API keys stored securely via Electron's safeStorage
- ✅ **Local metadata**: Pattern data and embeddings stay in local app storage
- ✅ **User control**: Settings to disable learning, embeddings, and relationship discovery, plus clear local AI data
- ✅ **Context isolation**: Per-workspace isolated AI context

## Future Enhancements

- [ ] Real-time collaborative AI assistance (via P2P when beneficial)
- [ ] Advanced graph visualization in UI
- [ ] Custom tool development framework
- [ ] Streaming responses for long queries
- [ ] Batch query optimization
- [ ] Document clustering UI
- [ ] Cross-workspace pattern sharing (opt-in)

## API Reference

See [AI_API.md](./AI_API.md) for module and integration reference.

## License

Same as Notely application.
