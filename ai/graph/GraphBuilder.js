/**
 * GraphBuilder - Rebuild the entire workspace Knowledge Graph database
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('GraphBuilder');

class GraphBuilder {
  constructor(agent, graphDb, graphService) {
    this.agent = agent;
    this.graphDb = graphDb;
    this.graphService = graphService;
    this.isRebuilding = false;
  }

  /**
   * Scan notes and rebuild the Knowledge Graph
   */
  async rebuild() {
    if (this.isRebuilding) {
      log.warn('Rebuild already in progress');
      return { success: false, error: 'Rebuild already in progress' };
    }

    try {
      this.isRebuilding = true;
      log.info('Starting complete Knowledge Graph rebuild...');

      if (!this.graphDb.isInitialized) {
        this.graphDb.initialize();
      }

      // Clear existing graph tables
      this.graphDb.clear();

      // Find all markdown files in the workspace
      const workspaceFiles = this._getWorkspaceMarkdownFiles();
      log.info(`Found ${workspaceFiles.length} markdown notes to index for graph`);

      let processedCount = 0;
      let failedCount = 0;

      for (const filePath of workspaceFiles) {
        try {
          if (!fs.existsSync(filePath)) {
            failedCount++;
            continue;
          }

          const content = fs.readFileSync(filePath, 'utf8');
          const success = await this.graphService.processNote(filePath, content);
          
          if (success) {
            processedCount++;
          } else {
            failedCount++;
          }
        } catch (fileErr) {
          log.error(`Error reading or processing note ${filePath}:`, fileErr.message);
          failedCount++;
        }
      }

      log.info(`Knowledge Graph rebuild complete. Processed: ${processedCount}, Failed: ${failedCount}`);
      return {
        success: true,
        processedCount,
        failedCount,
        stats: this.graphDb.getStatus()
      };
    } catch (err) {
      log.error('Failed to rebuild graph:', err);
      return { success: false, error: err.message };
    } finally {
      this.isRebuilding = false;
    }
  }

  /**
   * Helper to scan all markdown files recursively in the workspace root
   */
  _getWorkspaceMarkdownFiles() {
    const rootPath = this.agent.workspaceRoot;
    if (!rootPath || !fs.existsSync(rootPath)) {
      // Fallback: check db file list
      if (this.agent.db && typeof this.agent.db.getWorkspaceFiles === 'function') {
        return this.agent.db.getWorkspaceFiles().map(f => f.file_path);
      }
      return [];
    }

    const files = [];
    const scan = (dir) => {
      // Ignore hidden folders (like .notes-app, .git)
      const base = path.basename(dir);
      if (base.startsWith('.')) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
          }
        }
      } catch (err) {
        log.error(`Failed to scan directory ${dir}:`, err.message);
      }
    };

    scan(rootPath);
    return files;
  }
}

module.exports = GraphBuilder;
