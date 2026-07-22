/**
 * WorkspaceApplicationService.cjs
 * Application service for Workspace level statistics, health, and activity monitoring.
 */

const fs = require('fs');
const path = require('path');
const { collectMarkdownFiles } = require('./NoteApplicationService.cjs');

class WorkspaceApplicationService {
  /**
   * Get workspace statistics and health metrics.
   */
  async getStatistics({ workspaceRoot }) {
    if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
      throw new Error('Invalid workspace root.');
    }

    const files = collectMarkdownFiles(workspaceRoot);
    let totalSizeBytes = 0;
    let totalLinkCount = 0;
    let totalTaskCount = 0;

    for (const filePath of files) {
      try {
        const stat = fs.statSync(filePath);
        totalSizeBytes += stat.size;
        const text = fs.readFileSync(filePath, 'utf8');

        // Count markdown wiki links [[link]] or [text](url)
        const wikiLinks = text.match(/\[\[.+?\]\]/g) || [];
        const mdLinks = text.match(/\[.+?\]\(.+?\)/g) || [];
        totalLinkCount += wikiLinks.length + mdLinks.length;

        // Count checklist tasks
        const tasks = text.match(/^\s*[-*+]?\s*\[[ xX/]\]\s+/gm) || [];
        totalTaskCount += tasks.length;
      } catch {
        // skip
      }
    }

    return {
      workspaceRoot,
      noteCount: files.length,
      storageBytes: totalSizeBytes,
      linkCount: totalLinkCount,
      taskCount: totalTaskCount,
      health: 'healthy'
    };
  }

  /**
   * Get recently modified notes in the workspace.
   */
  async getRecentActivity({ workspaceRoot, limit = 10 }) {
    if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
      return [];
    }

    const files = collectMarkdownFiles(workspaceRoot);
    const fileStats = [];

    for (const filePath of files) {
      try {
        const stat = fs.statSync(filePath);
        fileStats.push({
          path: filePath,
          title: path.basename(filePath),
          modifiedAt: stat.mtime.toISOString(),
          sizeBytes: stat.size
        });
      } catch {
        // skip
      }
    }

    fileStats.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    return fileStats.slice(0, Math.min(limit, 50));
  }
}

module.exports = {
  WorkspaceApplicationService
};
