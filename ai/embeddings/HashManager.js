const crypto = require('crypto');

class HashManager {
  /**
   * Calculate SHA-256 hash of note text content
   * @param {string} content
   * @returns {string}
   */
  static calculateHash(content) {
    return crypto.createHash('sha256').update(content || '').digest('hex');
  }

  /**
   * Determine if note content has changed compared to database record
   * @param {object} db - EmbeddingDB instance
   * @param {string} notePath
   * @param {string} currentContent
   * @returns {boolean} True if changed/missing, False if identical
   */
  static hasChanged(db, notePath, currentContent) {
    const currentHash = this.calculateHash(currentContent);
    const savedHash = db.getNoteHash(notePath);
    return currentHash !== savedHash;
  }
}

module.exports = HashManager;
