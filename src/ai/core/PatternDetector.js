/**
 * PatternDetector - Advanced pattern detection and analysis
 */

class PatternDetector {
  constructor(memoryManager, documentService, relationshipService) {
    this.memory = memoryManager;
    this.documents = documentService;
    this.relationships = relationshipService;
  }

  /**
   * Analyze user editing patterns
   */
  analyzeEditingPatterns(interactions) {
    const patterns = {
      editFrequency: this._analyzeFrequency(interactions),
      documentTypes: this._analyzeDocumentPreferences(interactions),
      commandPatterns: this._analyzeCommandPatterns(interactions),
      timePatterns: this._analyzeTimePatterns(interactions),
      workflowPatterns: this._analyzeWorkflowPatterns(interactions)
    };

    return patterns;
  }

  /**
   * Analyze interaction frequency
   * @private
   */
  _analyzeFrequency(interactions) {
    if (interactions.length === 0) return null;

    const timeSpans = [];
    for (let i = 1; i < interactions.length; i++) {
      const prev = new Date(interactions[i - 1].timestamp);
      const curr = new Date(interactions[i].timestamp);
      timeSpans.push(curr - prev);
    }

    const avgTimespan = timeSpans.reduce((a, b) => a + b, 0) / timeSpans.length;
    const frequency = 1000 * 60 * 60 / avgTimespan; // interactions per hour

    return {
      averageInteractionSpacing: avgTimespan,
      estimatedFrequencyPerHour: frequency,
      totalInteractions: interactions.length
    };
  }

  /**
   * Analyze document type preferences
   * @private
   */
  _analyzeDocumentPreferences(interactions) {
    const docFrequency = {};

    interactions.forEach(i => {
      if (i.file_context) {
        const ext = this._getFileExtension(i.file_context);
        docFrequency[ext] = (docFrequency[ext] || 0) + 1;
      }
    });

    return Object.entries(docFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type,
        frequency: count,
        percentage: (count / interactions.length * 100).toFixed(2)
      }));
  }

  /**
   * Analyze command/query patterns
   * @private
   */
  _analyzeCommandPatterns(interactions) {
    const queryPatterns = {};

    interactions.forEach(i => {
      const type = i.interaction_type || 'general';
      if (!queryPatterns[type]) {
        queryPatterns[type] = { count: 0, avgTokens: 0, totalTokens: 0 };
      }
      queryPatterns[type].count += 1;
      queryPatterns[type].totalTokens += i.tokens_used || 0;
    });

    // Calculate averages
    for (const [_type, data] of Object.entries(queryPatterns)) {
      data.avgTokens = data.count > 0 ? data.totalTokens / data.count : 0;
    }

    return queryPatterns;
  }

  /**
   * Analyze time-based patterns
   * @private
   */
  _analyzeTimePatterns(interactions) {
    const hourlyActivity = {};
    const dayActivity = {};

    interactions.forEach(i => {
      const date = new Date(i.timestamp);
      const hour = date.getHours();
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

      hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
      dayActivity[day] = (dayActivity[day] || 0) + 1;
    });

    const peakHours = Object.entries(hourlyActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }));

    const activeDays = Object.entries(dayActivity)
      .sort((a, b) => b[1] - a[1])
      .map(([day, count]) => ({ day, count }));

    return { peakHours, activeDays };
  }

  /**
   * Analyze workflow patterns
   * @private
   */
  _analyzeWorkflowPatterns(interactions) {
    const workflows = [];
    let currentWorkflow = [];

    // Group consecutive interactions by type
    for (let i = 0; i < interactions.length; i++) {
      const curr = interactions[i];
      const prev = interactions[i - 1];

      if (!prev || curr.interaction_type === prev.interaction_type) {
        currentWorkflow.push(curr);
      } else {
        if (currentWorkflow.length > 1) {
          workflows.push({
            type: currentWorkflow[0].interaction_type,
            duration: new Date(currentWorkflow[currentWorkflow.length - 1].timestamp) -
                     new Date(currentWorkflow[0].timestamp),
            steps: currentWorkflow.length
          });
        }
        currentWorkflow = [curr];
      }
    }

    return workflows;
  }

  /**
   * Detect document relationship patterns
   */
  detectRelationshipPatterns(minStrength = 0.5) {
    const docs = this.documents.getAllDocuments();

    // Find frequently co-edited documents
    const coEditCounts = {};

    // Find common reference patterns
    for (const doc of docs) {
      const related = this.relationships.getRelatedDocuments(doc.path, null, minStrength);

      related.forEach(rel => {
        const key = [doc.path, rel.target_file].sort().join('|');
        coEditCounts[key] = (coEditCounts[key] || 0) + 1;
      });
    }

    // Find strong co-editing patterns
    const strongPairs = Object.entries(coEditCounts)
      .filter(([, count]) => count > 2)
      .map(([pair, count]) => ({
        documents: pair.split('|'),
        coOccurrences: count
      }));

    return strongPairs;
  }

  /**
   * Predict next document user might want
   */
  predictNextDocument(currentDoc) {
    const related = this.relationships.getRelatedDocuments(currentDoc, null, 0.5);

    return related
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5);
  }

  /**
   * Get file extension
   * @private
   */
  _getFileExtension(filePath) {
    if (!filePath) return 'unknown';
    const parts = filePath.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : 'unknown';
  }
}

module.exports = PatternDetector;
