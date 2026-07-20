/**
 * Agent - Main orchestrator for AI agent functionality
 */

const DocumentService = require('../tools/DocumentReader');
const EmbeddingService = require('../embeddings/EmbeddingService');
const RelationshipService = require('../graph/RelationshipService');
const QueryExecutor = require('./QueryExecutor');
const ContextManager = require('../context/ContextManager');
const MemoryManager = require('../memory/InteractionLog');
const GraphDB = require('../graph/GraphDB');
const GraphService = require('../graph/GraphService');
const GraphBuilder = require('../graph/GraphBuilder');

class Agent {
  constructor(databaseManager, llmRegistry) {
    this.db = databaseManager;
    this.llmRegistry = llmRegistry;

    // Initialize services — EmbeddingService receives null here; the actual
    // embeddingProvider is injected after construction via setEmbeddingProvider()
    // (called from initializeAISystem once the HF token is resolved).
    this.documentService = new DocumentService(this.db, '');
    this.embeddingService = new EmbeddingService(this.db, null);
    this.relationshipService = new RelationshipService(
      this.db,
      this.embeddingService,
      this.documentService
    );
    this.queryExecutor = new QueryExecutor(this);
    this.contextManager = new ContextManager(this.db, this.documentService);
    this.memoryManager = new MemoryManager(this.db);

    this.graphDb = null;
    this.graphService = null;
    this.graphBuilder = null;

    this.isInitialized = false;
    this.workspaceRoot = null;
  }

  /**
   * Inject (or replace) the embedding provider after construction.
   * Called by initializeAISystem once the HuggingFace token is resolved.
   */
  setEmbeddingProvider(provider) {
    this.embeddingService.setProvider(provider);
  }

  /**
   * Initialize agent for workspace
   */
  async initialize(workspaceRoot, llmProvider) {
    try {
      console.log('[Agent] Initializing...');

      // Activate LLM provider
      if (llmProvider) {
        await this.llmRegistry.activateProvider(llmProvider.name, llmProvider.config);
      }

      // Store workspace root
      this.workspaceRoot = workspaceRoot;
      this.documentService.workspaceRoot = workspaceRoot;

      // Initialize GraphDB
      this.graphDb = new GraphDB(workspaceRoot);
      this.graphDb.initialize();
      this.graphService = new GraphService(this, this.graphDb);
      this.graphBuilder = new GraphBuilder(this, this.graphDb, this.graphService);

      // Initialize database
      if (!this.db.isInitialized) {
        this.db.initialize();
      }

      // Initialize context for workspace
      const contextResult = await this.contextManager.initializeWorkspace(workspaceRoot);

      this.isInitialized = true;

      console.log('[Agent] Initialized successfully');
      return {
        success: true,
        ...contextResult
      };
    } catch (error) {
      console.error('[Agent] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Process a query
   */
  async query(userQuery, context = {}) {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized');
    }

    try {
      // Build query context
      const queryContext = await this.contextManager.buildQueryContext(
        userQuery,
        context.currentFile
      );
      
      // Preserve the frontend persona system prompt
      if (context.systemPrompt) {
        queryContext.systemPrompt = context.systemPrompt;
      }

      // Execute query
      const result = await this.queryExecutor.execute(userQuery, queryContext);

      // Record interaction
      this.memoryManager.recordInteraction(
        userQuery,
        result.result,
        context.currentFile,
        this.workspaceRoot,
        result.type,
        this.llmRegistry.getActiveProvider().name,
        result.tokensUsed
      );

      return {
        success: true,
        query: userQuery,
        result: result.result,
        type: result.type,
        tokensUsed: result.tokensUsed,
        trace: result.trace || [],
        context: queryContext
      };
    } catch (error) {
      console.error('[Agent] Query processing failed:', error.message);
      return {
        success: false,
        error: error.message,
        query: userQuery
      };
    }
  }

  /**
   * Generate embeddings for workspace
   */
  async generateEmbeddings(_forceRefresh = false) {
    try {
      const docs = this.documentService.getAllDocuments();
      console.log(`[Agent] Generating embeddings for ${docs.length} documents...`);

      const results = await this.embeddingService.generateBatchEmbeddings(docs);

      const successful = results.filter(r => r.success).length;
      console.log(`[Agent] Successfully generated ${successful}/${docs.length} embeddings`);

      return {
        success: true,
        embeddingsGenerated: successful,
        total: docs.length,
        results
      };
    } catch (error) {
      console.error('[Agent] Embedding generation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build relationship graph
   */
  async buildRelationshipGraph() {
    if (!this.graphBuilder) {
      return { success: false, error: 'Graph builder not initialized' };
    }
    return this.graphBuilder.rebuild();
  }

  /**
   * Learn from interactions
   */
  detectPatterns() {
    try {
      const patterns = this.memoryManager.detectPatterns(this.workspaceRoot);
      console.log(`[Agent] Detected ${patterns.length} patterns`);

      return {
        success: true,
        patternsDetected: patterns.length,
        patterns
      };
    } catch (error) {
      console.error('[Agent] Pattern detection failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      workspaceRoot: this.workspaceRoot,
      llmProvider: this.llmRegistry.activeProvider?.name || null,
      embeddingProvider: this.embeddingService.embeddingProvider?.name || null,
      embeddingsAvailable: this.embeddingService.isAvailable(),
      documentCount: this.documentService.getAllDocuments().length,
      sessionInfo: this.memoryManager.getSessionSummary(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset agent
   */
  reset() {
    this.memoryManager.clearSession();
    this.contextManager.clearCache();
    this.embeddingService.clearCache();
    this.relationshipService.clearCache();
    console.log('[Agent] Reset successfully');
  }

  /**
   * Shutdown agent
   */
  shutdown() {
    try {
      this.reset();
      if (this.graphDb) {
        this.graphDb.close();
      }
      if (this.db && this.db.isInitialized) {
        this.db.close();
      }
      this.isInitialized = false;
      console.log('[Agent] Shutdown complete');
    } catch (error) {
      console.error('[Agent] Shutdown error:', error.message);
    }
  }
}

module.exports = Agent;
