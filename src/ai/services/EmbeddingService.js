/**
 * EmbeddingService - Manages vector embeddings and semantic search
 */

class EmbeddingService {
  constructor(databaseManager, llmRegistry) {
    this.db = databaseManager;
    this.llmRegistry = llmRegistry;
    this.embeddingCache = new Map();
  }

  /**
   * Generate and store embedding for document
   */
  async generateEmbedding(filePath, content, forceRefresh = false) {
    try {
      const llm = this.llmRegistry.getActiveProvider();

      // Check cache
      if (!forceRefresh) {
        const cached = this.db.getEmbedding(filePath);
        if (cached) {
          this.embeddingCache.set(filePath, cached.vector);
          return cached;
        }
      }

      // Generate new embedding
      const vector = await llm.generateEmbeddings(content);
      const hash = this._hashContent(content);

      // Store in database
      this.db.saveEmbedding(filePath, vector, hash);
      this.embeddingCache.set(filePath, vector);

      return {
        vector,
        contentHash: hash,
        model: llm.name
      };
    } catch (error) {
      console.error(`[EmbeddingService] Failed to generate embedding for ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Batch generate embeddings
   */
  async generateBatchEmbeddings(documents) {
    console.log(`[EmbeddingService] Generating embeddings for ${documents.length} documents...`);
    
    const results = [];
    
    for (const doc of documents) {
      try {
        const result = await this.generateEmbedding(doc.path, doc.content);
        results.push({ path: doc.path, success: true, ...result });
      } catch (error) {
        results.push({ path: doc.path, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Semantic search - find similar documents
   */
  async semanticSearch(query, topK = 10) {
    try {
      const llm = this.llmRegistry.getActiveProvider();

      // Generate query embedding
      const queryVector = await llm.generateEmbeddings(query);

      // Get all stored embeddings
      const allDocs = this.db.query(`
        SELECT file_path, embedding_vector FROM ai_document_embeddings
      `);

      // Calculate similarity scores
      const similarities = allDocs.map(doc => ({
        filePath: doc.file_path,
        similarity: this._cosineSimilarity(queryVector, JSON.parse(doc.embedding_vector.toString()))
      }));

      // Sort by similarity and return top K
      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    } catch (error) {
      console.error('[EmbeddingService] Semantic search failed:', error.message);
      throw error;
    }
  }

  /**
   * Find similar documents to a given document
   */
  async findSimilarDocuments(filePath, topK = 10) {
    try {
      const embedding = this.db.getEmbedding(filePath);
      if (!embedding) {
        throw new Error(`No embedding found for ${filePath}`);
      }

      const vector = embedding.vector;
      const allDocs = this.db.query(`
        SELECT file_path, embedding_vector FROM ai_document_embeddings
        WHERE file_path != ?
      `, [filePath]);

      const similarities = allDocs.map(doc => ({
        filePath: doc.file_path,
        similarity: this._cosineSimilarity(vector, JSON.parse(doc.embedding_vector.toString()))
      }));

      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    } catch (error) {
      console.error('[EmbeddingService] findSimilarDocuments failed:', error.message);
      throw error;
    }
  }

  /**
   * Get embedding for file
   */
  getEmbedding(filePath) {
    if (this.embeddingCache.has(filePath)) {
      return this.embeddingCache.get(filePath);
    }

    const embedding = this.db.getEmbedding(filePath);
    if (embedding) {
      this.embeddingCache.set(filePath, embedding.vector);
      return embedding.vector;
    }

    return null;
  }

  /**
   * Clear embedding cache (for memory management)
   */
  clearCache() {
    this.embeddingCache.clear();
  }

  /**
   * Cosine similarity between two vectors
   * @private
   */
  _cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, idx) => sum + val * b[idx], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Hash content
   * @private
   */
  _hashContent(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

module.exports = EmbeddingService;
