/**
 * MemoryManager - Manages agent memory, patterns, and learning
 */

class MemoryManager {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.sessionMemory = {
      interactions: [],
      patterns: [],
      learnings: []
    };
  }

  /**
   * Record user interaction
   */
  recordInteraction(query, response, filePath, workspaceRoot, type = 'query', model = null, tokensUsed = 0) {
    try {
      this.db.recordInteraction(query, response, filePath, workspaceRoot, type, model, tokensUsed);

      // Add to session memory
      this.sessionMemory.interactions.push({
        query,
        response,
        filePath,
        type,
        timestamp: new Date().toISOString(),
        tokensUsed
      });

      // Keep session memory bounded
      if (this.sessionMemory.interactions.length > 100) {
        this.sessionMemory.interactions.shift();
      }

      return true;
    } catch (error) {
      console.error('[MemoryManager] Failed to record interaction:', error.message);
      return false;
    }
  }

  /**
   * Rate an interaction
   */
  rateInteraction(interactionId, rating) {
    try {
      this.db.rateInteraction(interactionId, rating);
      return true;
    } catch (error) {
      console.error('[MemoryManager] Failed to rate interaction:', error.message);
      return false;
    }
  }

  /**
   * Detect and record patterns
   */
  detectPatterns(workspaceRoot) {
    try {
      const interactions = this.db.getRecentInteractions(workspaceRoot, 50);

      if (interactions.length === 0) {
        return [];
      }

      const patterns = [];

      // Detect interaction type patterns
      const typeFrequency = {};
      interactions.forEach(i => {
        typeFrequency[i.interaction_type] = (typeFrequency[i.interaction_type] || 0) + 1;
      });

      for (const [type, count] of Object.entries(typeFrequency)) {
        const frequency = count / interactions.length;
        if (frequency > 0.2) {
          patterns.push({
            type: 'interaction_pattern',
            name: `prefers_${type}_queries`,
            data: { type, frequency },
            confidence: frequency
          });

          this.db.addPattern(
            workspaceRoot,
            'common_queries',
            `prefers_${type}_queries`,
            { type, frequency },
            frequency
          );
        }
      }

      // Detect time-based patterns
      const timePatterns = this._analyzeTimePatterns(interactions);
      patterns.push(...timePatterns);

      return patterns;
    } catch (error) {
      console.error('[MemoryManager] Pattern detection failed:', error.message);
      return [];
    }
  }

  /**
   * Get learned patterns
   */
  getPatterns(workspaceRoot, type, minConfidence = 0.3) {
    try {
      return this.db.getPatterns(workspaceRoot, type, minConfidence);
    } catch (error) {
      console.error('[MemoryManager] Failed to get patterns:', error.message);
      return [];
    }
  }

  /**
   * Get recent interactions
   */
  getRecentInteractions(workspaceRoot, limit = 20, type = null) {
    try {
      return this.db.getRecentInteractions(workspaceRoot, limit, type);
    } catch (error) {
      console.error('[MemoryManager] Failed to get interactions:', error.message);
      return [];
    }
  }

  /**
   * Get personalized context
   */
  getPersonalizedContext(workspaceRoot) {
    try {
      const patterns = this.db.getPatterns(workspaceRoot, 'common_queries', 0.3);
      const recentInteractions = this.db.getRecentInteractions(workspaceRoot, 10);

      return {
        learnedPatterns: patterns,
        recentActivity: recentInteractions,
        personalizedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[MemoryManager] Failed to get personalized context:', error.message);
      return null;
    }
  }

  /**
   * Analyze time-based patterns
   * @private
   */
  _analyzeTimePatterns(interactions) {
    const patterns = [];
    const hours = {};

    interactions.forEach(i => {
      const date = new Date(i.timestamp);
      const hour = date.getHours();
      hours[hour] = (hours[hour] || 0) + 1;
    });

    // Find peak hours
    const sorted = Object.entries(hours)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (sorted.length > 0) {
      patterns.push({
        type: 'time_pattern',
        name: 'peak_activity_hours',
        data: { hours: sorted.map(s => parseInt(s[0])) },
        confidence: sorted[0][1] / interactions.length
      });
    }

    return patterns;
  }

  /**
   * Get session summary
   */
  getSessionSummary() {
    return {
      sessionInteractions: this.sessionMemory.interactions.length,
      sessionPatterns: this.sessionMemory.patterns.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear session memory
   */
  clearSession() {
    this.sessionMemory = {
      interactions: [],
      patterns: [],
      learnings: []
    };
  }
}

module.exports = MemoryManager;
