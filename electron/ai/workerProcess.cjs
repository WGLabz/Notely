/**
 * workerProcess.cjs - Background worker process for ONNX embeddings generation and Knowledge Graph indexing
 */

const path = require('path');

let embeddingDb = null;
let indexWorker = null;
let queue = null;

let graphDb = null;
let graphQueue = null;
let graphWorker = null;
let graphService = null;
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

        const GraphDB = require('../../ai/graph/GraphDB');
        const GraphQueue = require('../../ai/queue/GraphQueue');
        const GraphWorker = require('../../ai/queue/GraphWorker');
        const GraphService = require('../../ai/graph/GraphService');

        // 1. Initialize Embeddings Engine & Worker
        embeddingDb = new EmbeddingDB(workspaceRoot);
        embeddingDb.initialize();

        queue = new IndexQueue(embeddingDb);

        const localEmbedder = new ONNXEmbedder(appDataDir);
        await localEmbedder.load().catch(() => {});

        const activeModelName = localEmbedder.model || localEmbedder.name || 'local-bge-small';
        embeddingDb.verifyModelDimensions(activeModelName);

        const embeddingService = new EmbeddingService(null, localEmbedder);
        indexWorker = new IndexWorker(embeddingDb, queue, embeddingService);

        // 2. Initialize Knowledge Graph Engine & Worker
        graphDb = new GraphDB(workspaceRoot);
        graphDb.initialize();

        graphQueue = new GraphQueue(graphDb);
        const mockAgent = { appDataDir };
        graphService = new GraphService(mockAgent, graphDb);
        graphWorker = new GraphWorker(graphDb, graphQueue, graphService);

        // Auto-enqueue workspace markdown notes on startup
        const fs = require('fs');
        function scanMarkdownFiles(dir) {
          let results = [];
          try {
            const list = fs.readdirSync(dir);
            for (const file of list) {
              if (file.startsWith('.') || file === 'node_modules') continue;
              const fullPath = path.join(dir, file);
              const stat = fs.statSync(fullPath);
              if (stat && stat.isDirectory()) {
                results = results.concat(scanMarkdownFiles(fullPath));
              } else if (file.endsWith('.md')) {
                results.push(fullPath);
              }
            }
          } catch { /* ignore scan error */ }
          return results;
        }

        const workspaceNotes = scanMarkdownFiles(workspaceRoot);
        for (const notePath of workspaceNotes) {
          try {
            const stat = fs.statSync(notePath);
            if (graphDb && typeof graphDb.isNoteUpToDate === 'function' && graphDb.isNoteUpToDate(notePath, stat.mtimeMs)) {
              continue; // Skip unchanged notes already up-to-date in GraphDB
            }
          } catch { /* ignore stat error */ }
          graphQueue.enqueue(notePath);
        }

        const LogDB = require('../../ai/logs/LogDB');
        const logDb = new LogDB(workspaceRoot);
        logDb.initialize();

        // Register worker message & log progress
        const originalIndexProcessJob = indexWorker.processNextJob.bind(indexWorker);
        indexWorker.processNextJob = async function() {
          process.parentPort.postMessage({ type: 'working', working: true });
          const res = await originalIndexProcessJob();
          if (res && res.filePath) {
            logDb.addLog('embeddings', `Processed embeddings for note: ${path.basename(res.filePath)}`, 'info');
          }
          process.parentPort.postMessage({ type: 'working', working: this.isWorking });
          return res;
        };

        indexWorker.registerProgressCallback(() => {
          process.parentPort.postMessage({ type: 'progress' });
        });

        graphWorker.registerProgressCallback((progressPayload) => {
          process.parentPort.postMessage({ type: 'graphProgress', payload: progressPayload });
        });

        indexWorker.start();
        graphWorker.start();

        process.parentPort.postMessage({ type: 'started' });

      } else if (type === 'enqueue') {
        const { filePath, priority } = payload;
        if (embeddingDb) {
          embeddingDb.enqueue(filePath, priority);
          if (indexWorker) indexWorker.triggerNext();
        }
        if (graphQueue) {
          graphQueue.enqueue(filePath, priority);
          if (graphWorker) graphWorker.triggerNext();
        }
      } else if (type === 'deleteNote') {
        const { filePath } = payload;
        if (embeddingDb) embeddingDb.deleteNoteData(filePath);
        if (graphDb) graphDb.deleteNoteData(filePath);
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
          } catch {
            try { db.exec('ROLLBACK'); } catch { /* ignore rollback error */ }
          }
        }
      } else if (type === 'rebuildGraph') {
        const { workspaceFiles } = payload;
        if (graphDb) {
          graphDb.clear();
        }
        if (graphQueue) {
          graphQueue.clear();
          for (const file of workspaceFiles) {
            graphQueue.enqueue(file);
          }
        }
        if (graphWorker) {
          graphWorker.resume();
          graphWorker.triggerNext();
        }
      } else if (type === 'pauseGraphWorker') {
        if (graphWorker) graphWorker.pause();
      } else if (type === 'resumeGraphWorker') {
        if (graphWorker) graphWorker.resume();
      } else if (type === 'pause') {
        if (indexWorker) indexWorker.pause();
      } else if (type === 'resume') {
        if (indexWorker) indexWorker.resume();
      } else if (type === 'reloadGraphModel') {
        if (graphService && typeof graphService.getExtractor === 'function') {
          const extractor = graphService.getExtractor();
          if (extractor && typeof extractor.load === 'function') {
            extractor.isLoaded = false;
            await extractor.load().catch(() => {});
          }
        }
      } else if (type === 'shutdown') {
        if (indexWorker) indexWorker.pause();
        if (graphWorker) graphWorker.pause();
        if (embeddingDb) embeddingDb.close();
        if (graphDb) graphDb.close();
        process.exit(0);
      }
    } catch (err) {
      console.error('[Worker Process] Error in child worker message handler:', err);
      process.parentPort.postMessage({ type: 'error', error: err.message });
    }
  });
}
