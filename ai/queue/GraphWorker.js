const fs = require('fs');
const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('GraphWorker');

class GraphWorker {
  constructor(graphDb, queue, graphService) {
    this.graphDb = graphDb;
    this.queue = queue;
    this.graphService = graphService;
    this.isPaused = false;
    this.isWorking = false;
    this.workerTimeout = null;
    this.onProgressCallback = null;
  }

  start() {
    this.isPaused = false;
    log.info('GraphWorker started');
    this.triggerNext();
  }

  pause() {
    this.isPaused = true;
    if (this.workerTimeout) {
      clearTimeout(this.workerTimeout);
      this.workerTimeout = null;
    }
    log.info('GraphWorker paused');
  }

  resume() {
    this.isPaused = false;
    log.info('GraphWorker resumed');
    this.triggerNext();
  }

  registerProgressCallback(cb) {
    this.onProgressCallback = cb;
  }

  triggerNext() {
    if (this.isPaused || this.isWorking) return;

    if (this.workerTimeout) {
      clearTimeout(this.workerTimeout);
    }

    this.workerTimeout = setTimeout(() => {
      this.processNextJob();
    }, 200); // slight debounce delay to yield CPU
  }

  async processNextJob() {
    if (this.isPaused || this.isWorking) return;

    const job = this.queue.dequeue();
    if (!job) {
      this.notifyProgress();
      return; // Queue empty
    }

    this.isWorking = true;
    log.info(`Processing graph job for: ${job.note_path}`);
    this.notifyProgress(job.note_path);

    try {
      if (!fs.existsSync(job.note_path)) {
        if (this.graphDb && this.graphDb.deleteNoteData) {
          this.graphDb.deleteNoteData(job.note_path);
        }
        this.queue.updateStatus(job.id, 'done');
        this.notifyProgress(job.note_path);
        this.isWorking = false;
        this.triggerNext();
        return;
      }

      const content = fs.readFileSync(job.note_path, 'utf8');

      if (this.graphService && typeof this.graphService.processNote === 'function') {
        await this.graphService.processNote(job.note_path, content);
      }

      this.queue.updateStatus(job.id, 'done');
      log.info(`Successfully processed graph job for: ${job.note_path}`);
    } catch (err) {
      log.error(`Failed graph job for ${job.note_path}:`, err);
      const isRetryable = job.retries < 2;
      const nextStatus = isRetryable ? 'pending' : 'failed';
      this.queue.updateStatus(job.id, nextStatus, err.message);
    }

    this.isWorking = false;
    this.notifyProgress();
    this.triggerNext();
  }

  notifyProgress(currentNote = '') {
    if (typeof this.onProgressCallback === 'function') {
      const stats = this.queue.getStats();
      const nodeCount = this.graphDb && this.graphDb.getNodeCount ? this.graphDb.getNodeCount() : 0;
      const edgeCount = this.graphDb && this.graphDb.getEdgeCount ? this.graphDb.getEdgeCount() : 0;

      const total = stats.total || 1;
      const done = stats.done || 0;
      const progressPct = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 100;

      this.onProgressCallback({
        isBuilding: this.isWorking || stats.pending > 0,
        isPaused: this.isPaused,
        current: done,
        total: total,
        progress: progressPct,
        noteName: currentNote ? path.basename(currentNote) : '',
        nodeCount,
        edgeCount,
        queueSize: stats.size
      });
    }
  }
}

module.exports = GraphWorker;
