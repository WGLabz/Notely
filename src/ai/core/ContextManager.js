/**
 * ContextManager - Manages workspace context and document indexing
 */

class ContextManager {
  constructor(databaseManager, documentService) {
    this.db = databaseManager;
    this.documentService = documentService;
    this.contextCache = new Map();
    this.workspaceMetadata = null;
  }

  /**
   * Initialize context for a workspace
   */
  async initializeWorkspace(workspaceRoot) {
    try {
      console.log('[ContextManager] Initializing workspace context...');

      // Index all documents
      const documentCount = await this.documentService.indexWorkspace();

      // Cache workspace metadata
      this.workspaceMetadata = this.documentService.getWorkspaceStructure();

      // Restore cached context
      await this._loadCachedContext(workspaceRoot);

      return {
        success: true,
        workspaceRoot,
        documentsIndexed: documentCount,
        metadata: this.workspaceMetadata
      };
    } catch (error) {
      console.error('[ContextManager] Workspace initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Refresh context
   */
  async refresh() {
    try {
      const indexCount = await this.documentService.indexWorkspace();
      this.workspaceMetadata = this.documentService.getWorkspaceStructure();
      this.contextCache.clear();

      return {
        success: true,
        documentsIndexed: indexCount,
        metadata: this.workspaceMetadata
      };
    } catch (error) {
      console.error('[ContextManager] Refresh failed:', error.message);
      throw error;
    }
  }

  /**
   * Get current context snapshot
   */
  getContextSnapshot() {
    return {
      workspace: this.workspaceMetadata,
      documentCount: this.documentService.getAllDocuments().length,
      cacheSize: this.contextCache.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get context for a specific file
   */
  async getFileContext(filePath) {
    const cacheKey = `file:${filePath}`;

    if (this.contextCache.has(cacheKey)) {
      return this.contextCache.get(cacheKey);
    }

    const metadata = this.documentService.getDocumentMetadata(filePath);
    const content = this.documentService.getDocumentContent(filePath);

    const context = {
      filePath,
      metadata,
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 500) || null,
      timestamp: new Date().toISOString()
    };

    // Cache for 1 hour
    this.contextCache.set(cacheKey, context);

    return context;
  }

  /**
   * Get related documents context
   */
  async getRelatedContext(filePath) {
    const cacheKey = `related:${filePath}`;

    if (this.contextCache.has(cacheKey)) {
      return this.contextCache.get(cacheKey);
    }

    const related = this.documentService.searchDocuments(filePath, 10);

    const context = {
      filePath,
      relatedDocuments: related,
      timestamp: new Date().toISOString()
    };

    this.contextCache.set(cacheKey, context);

    return context;
  }

  /**
   * Build context for query
   */
  async buildQueryContext(query, currentFile = null) {
    try {
      // Search for relevant documents
      const searchResults = this.documentService.searchDocuments(query, 5);

      // Get current file context if available
      let fileContext = null;
      if (currentFile) {
        fileContext = await this.getFileContext(currentFile);
      }

      // Build system prompt with context
      const context = {
        query,
        currentFile,
        fileContext,
        relatedDocuments: searchResults.map(r => ({
          path: r.filePath,
          relevance: r.relevanceScore
        })),
        workspaceStructure: this.workspaceMetadata,
        timestamp: new Date().toISOString()
      };

      return context;
    } catch (error) {
      console.error('[ContextManager] buildQueryContext failed:', error.message);
      throw error;
    }
  }

  /**
   * Build system prompt
   */
  buildSystemPrompt(context = {}) {
    const workspace = this.workspaceMetadata || {};
    const docCount = workspace.documentCount || 0;

    let prompt = `You are an AI assistant for a markdown notes application.
Current workspace: ${workspace.root || 'unknown'}
Total documents: ${docCount}
Last workspace update: ${workspace.lastUpdated}

`;

    if (context.currentFile) {
      prompt += `Current document: ${context.currentFile}\n`;
    }

    if (context.relatedDocuments && context.relatedDocuments.length > 0) {
      prompt += `Related documents:\n`;
      context.relatedDocuments.forEach((doc) => {
        prompt += `- ${doc.path} (relevance: ${(doc.relevance * 100).toFixed(0)}%)\n`;
      });
    }

    prompt += `\nProvide helpful, accurate responses focused on markdown documentation and note-taking.`;

    return prompt;
  }

  /**
   * Load cached context from database
   * @private
   */
  async _loadCachedContext(workspaceRoot) {
    try {
      const cached = this.db.getCachedContext(workspaceRoot, 'index_metadata');
      if (cached) {
        console.log('[ContextManager] Restored cached workspace metadata');
        // Could use this to speed up initialization
      }
    } catch {
      // Ignore cache load errors
    }
  }

  /**
   * Save context to cache
   */
  saveCacheMetadata(workspaceRoot) {
    try {
      const data = {
        indexedAt: new Date().toISOString(),
        documentCount: this.documentService.getAllDocuments().length,
        workspaceSize: this.workspaceMetadata?.totalSize || 0
      };

      this.db.cacheContext(workspaceRoot, 'index_metadata', data, 86400000); // 24 hours
    } catch (error) {
      console.warn('[ContextManager] Failed to cache metadata:', error.message);
    }
  }

  /**
   * Clear context cache
   */
  clearCache() {
    this.contextCache.clear();
  }
}

module.exports = ContextManager;
