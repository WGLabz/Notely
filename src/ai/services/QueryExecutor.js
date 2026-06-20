/**
 * QueryExecutor - Routes queries to appropriate tools and services
 */

class QueryExecutor {
  constructor(agent, tools = {}) {
    this.agent = agent;
    this.tools = {
      search: tools.search || null,
      format: tools.format || null,
      refactor: tools.refactor || null,
      file: tools.file || null,
      ...tools
    };
  }

  /**
   * Execute a query
   */
  async execute(query, context = {}) {
    try {
      // Determine query type
      const type = this._determineQueryType(query);

      // Route to appropriate handler
      switch (type) {
        case 'search':
          return await this._handleSearch(query, context);
        case 'format':
          return await this._handleFormat(query, context);
        case 'refactor':
          return await this._handleRefactor(query, context);
        case 'summarize':
          return await this._handleSummarize(query, context);
        case 'generate':
          return await this._handleGenerate(query, context);
        case 'analyze':
          return await this._handleAnalyze(query, context);
        default:
          return await this._handleGeneral(query, context);
      }
    } catch (error) {
      console.error('[QueryExecutor] Execution failed:', error.message);
      throw error;
    }
  }

  /**
   * Determine query type
   * @private
   */
  _determineQueryType(query) {
    const q = query.toLowerCase();

    if (q.match(/search|find|look|query/)) return 'search';
    if (q.match(/format|fix|clean/)) return 'format';
    if (q.match(/refactor|reorganize|reorder/)) return 'refactor';
    if (q.match(/summary|summarize|overview/)) return 'summarize';
    if (q.match(/generate|create|write|add/)) return 'generate';
    if (q.match(/analyze|check|analyze|review/)) return 'analyze';

    return 'general';
  }

  /**
   * Handle search queries
   * @private
   */
  async _handleSearch(query, context) {
    if (!this.tools.search) {
      throw new Error('Search tool not available');
    }

    return await this.tools.search.execute(query, context);
  }

  /**
   * Handle formatting queries
   * @private
   */
  async _handleFormat(query, context) {
    if (!this.tools.format) {
      throw new Error('Format tool not available');
    }

    return await this.tools.format.execute(query, context);
  }

  /**
   * Handle refactoring queries
   * @private
   */
  async _handleRefactor(query, context) {
    if (!this.tools.refactor) {
      throw new Error('Refactor tool not available');
    }

    return await this.tools.refactor.execute(query, context);
  }

  /**
   * Handle summarization
   * @private
   */
  async _handleSummarize(query, context) {
    const llm = this.agent.llmRegistry.getActiveProvider();
    const filePath = context.filePath || context.currentFile;

    if (!filePath) {
      throw new Error('No file context for summarization');
    }

    const content = this.agent.documentService.getDocumentContent(filePath);
    if (!content) {
      throw new Error('Could not read file');
    }

    const response = await llm.generateText(
      `Summarize the following markdown document concisely:\n\n${content}`,
      {
        maxTokens: 500,
        systemPrompt: 'You are a technical documentation expert. Provide a concise, clear summary.'
      }
    );

    return {
      type: 'summarize',
      result: response.text,
      filePath,
      tokensUsed: response.tokensUsed
    };
  }

  /**
   * Handle content generation
   * @private
   */
  async _handleGenerate(query, context) {
    const llm = this.agent.llmRegistry.getActiveProvider();

    const response = await llm.generateText(query, {
      maxTokens: 2048,
      systemPrompt: 'You are a helpful markdown documentation assistant. Generate well-formatted markdown content.'
    });

    return {
      type: 'generate',
      result: response.text,
      tokensUsed: response.tokensUsed
    };
  }

  /**
   * Handle analysis
   * @private
   */
  async _handleAnalyze(query, context) {
    const llm = this.agent.llmRegistry.getActiveProvider();
    const filePath = context.filePath || context.currentFile;

    if (!filePath) {
      throw new Error('No file context for analysis');
    }

    const content = this.agent.documentService.getDocumentContent(filePath);
    if (!content) {
      throw new Error('Could not read file');
    }

    const response = await llm.generateText(
      `Analyze this markdown document and provide insights:\n\n${content}\n\nAnalysis: ${query}`,
      {
        maxTokens: 1500,
        systemPrompt: 'You are a technical analyst. Provide detailed, actionable insights.'
      }
    );

    return {
      type: 'analyze',
      result: response.text,
      filePath,
      tokensUsed: response.tokensUsed
    };
  }

  /**
   * Handle general queries (pass to LLM)
   * @private
   */
  async _handleGeneral(query, context) {
    const llm = this.agent.llmRegistry.getActiveProvider();

    const response = await llm.generateText(query, {
      maxTokens: 1024,
      systemPrompt: 'You are a helpful AI assistant for a markdown notes application.'
    });

    return {
      type: 'general',
      result: response.text,
      tokensUsed: response.tokensUsed
    };
  }

  /**
   * Register a tool
   */
  registerTool(name, tool) {
    this.tools[name] = tool;
  }

  /**
   * Get tool
   */
  getTool(name) {
    return this.tools[name] || null;
  }
}

module.exports = QueryExecutor;
