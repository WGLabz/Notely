class IndexQueue {
  constructor(db) {
    this.db = db;
  }

  /**
   * Enqueue a note path with a specific priority
   * @param {string} notePath 
   * @param {number} priority 
   */
  enqueue(notePath, priority = 0) {
    this.db.enqueue(notePath, priority);
  }

  /**
   * Fetch and mark the next job in line
   */
  dequeue() {
    return this.db.dequeue();
  }

  /**
   * Update status of a job
   */
  updateStatus(id, status, error = null) {
    this.db.updateJobStatus(id, status, error);
  }

  /**
   * Return size of remaining queue
   */
  size() {
    return this.db.getQueueSize();
  }

  /**
   * Clear queue
   */
  clear() {
    this.db.clearQueue();
  }
}

module.exports = IndexQueue;
