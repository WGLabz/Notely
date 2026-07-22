const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('GraphQueue');

class GraphQueue {
  constructor(graphDb = null) {
    this.graphDb = graphDb;
    this.queue = [];
    this.statusMap = new Map(); // id -> { id, note_path, status, error, retries, created_at }
    this.nextJobId = Date.now();
    if (this.graphDb) {
      this.loadFromDb();
    }
  }

  setGraphDb(graphDb) {
    this.graphDb = graphDb;
    if (this.graphDb) {
      this.loadFromDb();
    }
  }

  loadFromDb() {
    if (!this.graphDb?.db) return;
    try {
      const rows = this.graphDb.db.prepare(
        "SELECT * FROM graph_queue WHERE status IN ('pending', 'processing') ORDER BY priority DESC, created_at ASC"
      ).all();
      for (const row of rows) {
        const job = {
          id: row.id,
          note_path: row.note_path,
          priority: row.priority,
          status: 'pending', // Reset processing to pending on reload
          error: row.error,
          retries: row.retries,
          created_at: row.created_at
        };
        if (!this.statusMap.has(job.id)) {
          this.queue.push(job);
          this.statusMap.set(job.id, job);
        }
      }
    } catch (err) {
      log.warn('Failed to load queue from database:', err.message);
    }
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

    if (this.graphDb?.db) {
      try {
        const stmt = this.graphDb.db.prepare(`
          INSERT INTO graph_queue (id, note_path, priority, status, error, retries, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET status = excluded.status, priority = excluded.priority
        `);
        stmt.run(job.id, job.note_path, job.priority, job.status, job.error, job.retries, job.created_at);
      } catch (err) {
        log.warn(`Failed to persist enqueued job ${id}:`, err.message);
      }
    }

    // Sort by priority (higher priority first)
    this.queue.sort((a, b) => b.priority - a.priority);

    log.info(`Enqueued graph job ${id} for: ${normalizedPath}`);
    return id;
  }

  dequeue() {
    const job = this.queue.find(j => j.status === 'pending');
    if (job) {
      job.status = 'processing';
      if (this.graphDb?.db) {
        try {
          this.graphDb.db.prepare("UPDATE graph_queue SET status = 'processing' WHERE id = ?").run(job.id);
        } catch { /* ignore update status error */ }
      }
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
      if (this.graphDb?.db) {
        try {
          const stmt = this.graphDb.db.prepare('UPDATE graph_queue SET status = ?, error = ?, retries = ? WHERE id = ?');
          stmt.run(status, error, job.retries, jobId);
        } catch { /* ignore update status error */ }
      }
    }
  }

  clear() {
    this.queue = [];
    this.statusMap.clear();
    if (this.graphDb?.db) {
      try {
        this.graphDb.db.prepare('DELETE FROM graph_queue').run();
      } catch { /* ignore delete queue error */ }
    }
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

