/**
 * DocumentService - Manages document indexing and metadata
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DocumentService {
  constructor(databaseManager, workspaceRoot) {
    this.db = databaseManager;
    this.workspaceRoot = workspaceRoot;
    this.documentCache = new Map();
    this.indexedFiles = new Set();
  }

  /**
   * Index all markdown files in workspace
   */
  async indexWorkspace() {
    console.log('[DocumentService] Indexing workspace...');
    const files = this._collectMarkdownFiles(this.workspaceRoot);
    
    for (const filePath of files) {
      await this.indexFile(filePath);
    }

    console.log(`[DocumentService] Indexed ${files.length} files`);
    return files.length;
  }

  /**
   * Index a single file
   */
  async indexFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return false;

      const content = fs.readFileSync(filePath, 'utf8');
      const hash = this._hashContent(content);

      // Get cached embedding
      const cached = this.db.getEmbedding(filePath);
      
      // Skip if content hasn't changed
      if (cached && cached.contentHash === hash) {
        this.indexedFiles.add(filePath);
        return true;
      }

      // Cache document metadata
      this.documentCache.set(filePath, {
        path: filePath,
        size: content.length,
        hash,
        indexed_at: new Date().toISOString(),
        headings: this._extractHeadings(content),
        links: this._extractLinks(content),
        codeBlocks: this._extractCodeBlocks(content)
      });

      this.indexedFiles.add(filePath);
      return true;
    } catch (error) {
      console.error(`[DocumentService] Failed to index ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Get document metadata
   */
  getDocumentMetadata(filePath) {
    return this.documentCache.get(filePath) || null;
  }

  /**
   * Search documents by query
   */
  searchDocuments(query, limit = 20) {
    const results = [];
    
    for (const [filePath, metadata] of this.documentCache) {
      const score = this._calculateSearchScore(query, metadata);
      if (score > 0) {
        results.push({
          filePath,
          ...metadata,
          relevanceScore: score
        });
      }
    }

    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  /**
   * Get all documents in workspace
   */
  getAllDocuments() {
    return Array.from(this.documentCache.values());
  }

  /**
   * Get document content
   */
  getDocumentContent(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`[DocumentService] Failed to read ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Get workspace structure
   */
  getWorkspaceStructure() {
    return {
      root: this.workspaceRoot,
      documentCount: this.documentCache.size,
      totalSize: Array.from(this.documentCache.values())
        .reduce((sum, doc) => sum + doc.size, 0),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Extract headings from content
   * @private
   */
  _extractHeadings(content) {
    const headings = [];
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2],
          line: idx + 1
        });
      }
    });

    return headings;
  }

  /**
   * Extract links from content
   * @private
   */
  _extractLinks(content) {
    const links = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      links.push({
        text: match[1],
        href: match[2]
      });
    }

    return links;
  }

  /**
   * Extract code blocks
   * @private
   */
  _extractCodeBlocks(content) {
    const blocks = [];
    const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeRegex.exec(content)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2]
      });
    }

    return blocks;
  }

  /**
   * Collect all markdown files
   * @private
   */
  _collectMarkdownFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      // Skip hidden dirs and node_modules
      if (entry.startsWith('.') || entry === 'node_modules') continue;

      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        this._collectMarkdownFiles(fullPath, files);
      } else if (entry.endsWith('.md')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Hash content for change detection
   * @private
   */
  _hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Calculate search score
   * @private
   */
  _calculateSearchScore(query, metadata) {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Match in headings (high weight)
    metadata.headings?.forEach(h => {
      if (h.text.toLowerCase().includes(queryLower)) {
        score += 10;
      }
    });

    // Match in links
    metadata.links?.forEach(l => {
      if (l.text.toLowerCase().includes(queryLower) || l.href.includes(queryLower)) {
        score += 5;
      }
    });

    // Match in filename
    if (metadata.path.toLowerCase().includes(queryLower)) {
      score += 15;
    }

    return score;
  }
}

module.exports = DocumentService;
