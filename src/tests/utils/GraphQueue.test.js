import { describe, it, expect } from 'vitest';
const GraphQueue = require('../../../ai/queue/GraphQueue');

describe('GraphQueue Unit Tests', () => {
  it('enqueues jobs correctly and prevents duplicates', () => {
    const queue = new GraphQueue();
    const jobId1 = queue.enqueue('/path/to/note1.md');
    const jobId2 = queue.enqueue('/path/to/note1.md');

    expect(jobId1).toBe(jobId2);
    const stats = queue.getStats();
    expect(stats.pending).toBe(1);
  });

  it('dequeues pending jobs in priority order', () => {
    const queue = new GraphQueue();
    queue.enqueue('/path/to/low.md', 1);
    queue.enqueue('/path/to/high.md', 10);

    const firstJob = queue.dequeue();
    expect(firstJob.note_path).toContain('high.md');
  });

  it('updates status and stats correctly', () => {
    const queue = new GraphQueue();
    const id = queue.enqueue('/path/to/note.md');
    const job = queue.dequeue();
    queue.updateStatus(id, 'done');

    const stats = queue.getStats();
    expect(stats.done).toBe(1);
    expect(stats.pending).toBe(0);
  });
});
