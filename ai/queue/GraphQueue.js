const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('GraphQueue');

class GraphQueue {
  constructor() {
    this.queue = [];
    this.statusMap = new Map(); // id -> { id, note_path, status, error, retries, created_at }
    this.nextJobId = 1;
  }

  enqueue(notePath, priority = 1) {
    if (!notePath) return null;
    const normalizedPath = path.normalize(notePath);

    // Prevent duplicate active jobs for same path
    const existing = this.queue.find(j => j.note_path === normalizedPath && j.status !== 'done' && j.status !== 'failed');
    if (existing) {
      log.info(`Graph job already queued for: ${normalizedPath}`);
      return existing.id;
    }

    const id = `gjob_${this.nextJobId++}`;
    const job = {
      id,
      note_path: normalizedPath,
      priority,
      status: 'pending',
      error: null,
      retries: 0,
      created_at: Date.now()
    };

    this.queue.push(job);
    this.statusMap.set(id, job);

    // Sort by priority (higher priority first)
    this.queue.sort((a, b) => b.priority - a.priority);

    log.info(`Enqueued graph job ${id} for: ${normalizedPath}`);
    return id;
  }

  dequeue() {
    const job = this.queue.find(j => j.status === 'pending');
    if (job) {
      job.status = 'processing';
    }
    return job;
  }

  updateStatus(jobId, status, error = null) {
    const job = this.statusMap.get(jobId);
    if (job) {
      job.status = status;
      if (error) {
        job.error = error;
        job.retries += 1;
      }
    }
  }

  clear() {
    this.queue = [];
    this.statusMap.clear();
    log.info('GraphQueue cleared');
  }

  getStats() {
    const pending = this.queue.filter(j => j.status === 'pending').length;
    const processing = this.queue.filter(j => j.status === 'processing').length;
    const done = Array.from(this.statusMap.values()).filter(j => j.status === 'done').length;
    const failed = Array.from(this.statusMap.values()).filter(j => j.status === 'failed').length;

    return {
      size: pending + processing,
      total: this.statusMap.size,
      pending,
      processing,
      done,
      failed
    };
  }
}

module.exports = GraphQueue;
