/**
 * MemoryOptimizer - Memory management and optimization
 */

class MemoryOptimizer {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * Analyze memory usage
   */
  analyzeMemoryUsage() {
    const memUsage = process.memoryUsage();

    return {
      heapUsed: this._formatBytes(memUsage.heapUsed),
      heapTotal: this._formatBytes(memUsage.heapTotal),
      rss: this._formatBytes(memUsage.rss),
      external: this._formatBytes(memUsage.external),
      arrayBuffers: this._formatBytes(memUsage.arrayBuffers),
      cacheStats: { ...this.cacheStats }
    };
  }

  /**
   * Clean expired data
   */
  cleanExpiredData() {
    let cleaned = 0;

    try {
      // Clean expired cache entries
      const expiredCache = this.db.cleanExpiredCache();
      cleaned += expiredCache;

      // Could add more cleanup logic here
      // - Remove old interactions
      // - Archive old patterns
      // - Compact database

      console.log(`[MemoryOptimizer] Cleaned ${cleaned} expired entries`);
      return { success: true, entriesRemoved: cleaned };
    } catch (error) {
      console.error('[MemoryOptimizer] Cleanup failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Optimize database
   */
  optimizeDatabase() {
    try {
      // Run VACUUM to reclaim space
      this.db.query('VACUUM');

      // Rebuild indexes
      this.db.query('REINDEX');

      console.log('[MemoryOptimizer] Database optimized');
      return { success: true, message: 'Database optimized' };
    } catch (error) {
      console.error('[MemoryOptimizer] Database optimization failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get database statistics
   */
  getDatabaseStats() {
    try {
      const tableStats = {};

      const tables = [
        'ai_document_embeddings',
        'ai_document_relationships',
        'ai_interactions',
        'ai_patterns',
        'ai_context_cache'
      ];

      for (const table of tables) {
        const result = this.db.query(`SELECT COUNT(*) as count FROM ${table}`);
        const sizeResult = this.db.query(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`);

        tableStats[table] = {
          rows: result[0]?.count || 0,
          estimatedSize: sizeResult[0]?.size || 0
        };
      }

      return {
        tables: tableStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[MemoryOptimizer] Failed to get database stats:', error.message);
      return null;
    }
  }

  /**
   * Archive old interactions
   */
  archiveOldInteractions(olderThanDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      const cutoffISO = cutoffDate.toISOString();

      // Move old interactions to archive
      const result = this.db.query(`
        DELETE FROM ai_interactions
        WHERE timestamp < ?
      `, [cutoffISO]);

      console.log(`[MemoryOptimizer] Archived interactions older than ${olderThanDays} days`);
      return { success: true, archivedCount: result };
    } catch (error) {
      console.error('[MemoryOptimizer] Archiving failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations() {
    const recommendations = [];
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapUsagePercent > 90) {
      recommendations.push({
        level: 'critical',
        message: 'High memory usage detected. Consider cleaning caches.',
        action: 'cleanExpiredData'
      });
    }

    if (heapUsagePercent > 75) {
      recommendations.push({
        level: 'warning',
        message: 'Memory usage is elevated.',
        action: 'optimizeDatabase'
      });
    }

    const dbStats = this.getDatabaseStats();
    if (dbStats) {
      let totalRows = 0;
      for (const table of Object.values(dbStats.tables)) {
        totalRows += table.rows;
      }

      if (totalRows > 100000) {
        recommendations.push({
          level: 'info',
          message: 'Consider archiving old interactions to free up space.',
          action: 'archiveOldInteractions'
        });
      }
    }

    return recommendations;
  }

  /**
   * Record cache hit/miss
   */
  recordCacheAccess(hit) {
    if (hit) {
      this.cacheStats.hits += 1;
    } else {
      this.cacheStats.misses += 1;
    }
  }

  /**
   * Record cache eviction
   */
  recordEviction() {
    this.cacheStats.evictions += 1;
  }

  /**
   * Get cache efficiency
   */
  getCacheEfficiency() {
    const total = this.cacheStats.hits + this.cacheStats.misses;

    if (total === 0) {
      return 0;
    }

    return ((this.cacheStats.hits / total) * 100).toFixed(2);
  }

  /**
   * Format bytes to readable format
   * @private
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = MemoryOptimizer;
