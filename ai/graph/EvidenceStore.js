/**
 * EvidenceStore - Manages raw evidence records for provenance tracking
 */

const { createLogger } = require('../core/logger');

const log = createLogger('EvidenceStore');

class EvidenceStore {
  constructor(graphDb) {
    this.graphDb = graphDb;
  }

  /**
   * Save evidence record
   */
  addEvidence({
    sourceId,
    extractor,
    subjectText,
    subjectSpanStart = null,
    subjectSpanEnd = null,
    predicateText = null,
    objectText = null,
    objectSpanStart = null,
    objectSpanEnd = null,
    rawSentence,
    confidence = 1.0
  }) {
    if (!this.graphDb?.db) return null;

    try {
      const crypto = require('crypto');
      const id = 'ev-' + crypto.randomUUID();
      const stmt = this.graphDb.db.prepare(`
        INSERT INTO evidence (
          id, source_id, extractor, subject_text, subject_span_start, subject_span_end,
          predicate_text, object_text, object_span_start, object_span_end,
          raw_sentence, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        id,
        sourceId,
        extractor,
        subjectText,
        subjectSpanStart,
        subjectSpanEnd,
        predicateText,
        objectText,
        objectSpanStart,
        objectSpanEnd,
        rawSentence,
        confidence
      );

      return id;
    } catch (err) {
      log.error('Failed to save evidence:', err.message);
      return null;
    }
  }

  /**
   * Get evidence by ID
   */
  getEvidence(id) {
    if (!this.graphDb?.db) return null;
    try {
      const stmt = this.graphDb.db.prepare('SELECT * FROM evidence WHERE id = ?');
      return stmt.get(id) || null;
    } catch (err) {
      log.error(`Failed to get evidence ${id}:`, err.message);
      return null;
    }
  }

  /**
   * Get all evidence records for a source document
   */
  getEvidenceForSource(sourceId) {
    if (!this.graphDb?.db) return [];
    try {
      const stmt = this.graphDb.db.prepare('SELECT * FROM evidence WHERE source_id = ? ORDER BY created_at DESC');
      return stmt.all(sourceId);
    } catch (err) {
      log.error(`Failed to get evidence for source ${sourceId}:`, err.message);
      return [];
    }
  }

  /**
   * Delete evidence for source
   */
  deleteForSource(sourceId) {
    if (!this.graphDb?.db) return;
    try {
      const stmt = this.graphDb.db.prepare('DELETE FROM evidence WHERE source_id = ?');
      stmt.run(sourceId);
    } catch (err) {
      log.error(`Failed to delete evidence for source ${sourceId}:`, err.message);
    }
  }
}

module.exports = EvidenceStore;
