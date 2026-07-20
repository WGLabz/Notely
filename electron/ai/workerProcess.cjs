/**
 * workerProcess.cjs - Background worker process for ONNX embeddings generation and indexing
 */

let embeddingDb = null;
let indexWorker = null;
let queue = null;

if (process.parentPort) {
  process.parentPort.on('message', async (e) => {
    const { type, payload } = e.data || {};

    try {
      if (type === 'start') {
        const { workspaceRoot, appDataDir } = payload;

        const EmbeddingDB = require('../../ai/embeddings/EmbeddingDB');
        const IndexQueue = require('../../ai/queue/IndexQueue');
        const IndexWorker = require('../../ai/queue/IndexWorker');
        const EmbeddingService = require('../../ai/embeddings/EmbeddingService');
        const ONNXEmbedder = require('../../ai/embeddings/ONNXEmbedder');

        embeddingDb = new EmbeddingDB(workspaceRoot);
        embeddingDb.initialize();

        queue = new IndexQueue(embeddingDb);

        const localProvider = new ONNXEmbedder(appDataDir);
        await localProvider.load();

        const embeddingService = new EmbeddingService(null, localProvider);

        indexWorker = new IndexWorker(embeddingDb, queue, embeddingService);
        
        // Monkey-patch processNextJob to report real-time working status
        const originalProcessNextJob = indexWorker.processNextJob.bind(indexWorker);
        indexWorker.processNextJob = async function() {
          process.parentPort.postMessage({ type: 'working', working: true });
          const res = await originalProcessNextJob();
          process.parentPort.postMessage({ type: 'working', working: this.isWorking });
          return res;
        };

        indexWorker.registerProgressCallback(() => {
          process.parentPort.postMessage({ type: 'progress' });
        });
        indexWorker.start();

        process.parentPort.postMessage({ type: 'started' });
      } else if (type === 'enqueue') {
        const { filePath, priority } = payload;
        if (embeddingDb) {
          embeddingDb.enqueue(filePath, priority);
          if (indexWorker) indexWorker.triggerNext();
        }
      } else if (type === 'deleteNote') {
        const { filePath } = payload;
        if (embeddingDb) {
          embeddingDb.deleteNoteData(filePath);
        }
      } else if (type === 'renameNote') {
        const { oldPath, newPath } = payload;
        if (embeddingDb && embeddingDb.db) {
          const db = embeddingDb.db;
          try {
            db.exec('BEGIN');
            db.prepare('UPDATE chunks SET note_path = ? WHERE note_path = ?').run(newPath, oldPath);
            db.prepare('UPDATE note_hashes SET note_path = ? WHERE note_path = ?').run(newPath, oldPath);
            db.prepare('UPDATE indexing_queue SET note_path = ? WHERE note_path = ?').run(newPath, oldPath);
            db.prepare('UPDATE indexing_log SET note_path = ? WHERE note_path = ?').run(newPath, oldPath);
            db.exec('COMMIT');
          } catch (err) {
            try { db.exec('ROLLBACK'); } catch {
              // Ignore rollback errors if transaction wasn't active or DB locked
            }
            console.error('[Worker Process] Failed to rename note paths in DB:', err.message);
          }
        }
      } else if (type === 'pause') {
        if (indexWorker) indexWorker.pause();
      } else if (type === 'resume') {
        if (indexWorker) indexWorker.resume();
      } else if (type === 'shutdown') {
        if (indexWorker) indexWorker.pause();
        if (embeddingDb) embeddingDb.close();
        process.exit(0);
      }
    } catch (err) {
      console.error('[Worker Process] Error in child worker message handler:', err);
      process.parentPort.postMessage({ type: 'error', error: err.message });
    }
  });
}
