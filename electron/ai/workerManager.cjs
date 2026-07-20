/**
 * workerManager.cjs - Manages background utilityProcess lifecycles and messaging
 */

const { utilityProcess } = require('electron');
const path = require('path');

let childProcess = null;
let isPaused = false;
let isWorking = false;

function startWorker(workspaceRoot, appDataDir, hfToken) {
  if (childProcess) {
    shutdownWorker();
  }

  isPaused = false;
  isWorking = false;

  const scriptPath = path.join(__dirname, 'workerProcess.cjs');
  console.log('[Worker Manager] Spawning utilityProcess at:', scriptPath);

  childProcess = utilityProcess.fork(scriptPath);

  childProcess.on('spawn', () => {
    console.log('[Worker Manager] Utility process spawned successfully.');
    childProcess.postMessage({
      type: 'start',
      payload: { workspaceRoot, appDataDir, hfToken }
    });
  });

  childProcess.on('message', (e) => {
    const { type, error, working } = e || {};
    if (type === 'error') {
      console.error('[Worker Manager] Child worker reported error:', error);
      isWorking = false;
    } else if (type === 'working') {
      isWorking = !!working;
    } else if (type === 'progress') {
      // Forward status progress triggers if needed
    }
  });

  childProcess.on('exit', (code) => {
    console.log(`[Worker Manager] Utility process exited with code: ${code}`);
    childProcess = null;
    isWorking = false;
  });
}

function enqueueNote(filePath, priority = 0) {
  if (childProcess) {
    childProcess.postMessage({
      type: 'enqueue',
      payload: { filePath, priority }
    });
  }
}

function deleteNoteData(filePath) {
  if (childProcess) {
    childProcess.postMessage({
      type: 'deleteNote',
      payload: { filePath }
    });
  }
}

function renameNoteData(oldPath, newPath) {
  if (childProcess) {
    childProcess.postMessage({
      type: 'renameNote',
      payload: { oldPath, newPath }
    });
  }
}

function pauseWorker() {
  if (childProcess) {
    childProcess.postMessage({ type: 'pause' });
    isPaused = true;
  }
}

function resumeWorker() {
  if (childProcess) {
    childProcess.postMessage({ type: 'resume' });
    isPaused = false;
  }
}

function shutdownWorker() {
  if (childProcess) {
    childProcess.postMessage({ type: 'shutdown' });
    childProcess = null;
    isWorking = false;
  }
}

module.exports = {
  startWorker,
  enqueueNote,
  deleteNoteData,
  renameNoteData,
  pauseWorker,
  resumeWorker,
  shutdownWorker,
  get isPaused() { return isPaused; },
  get isWorking() { return isWorking; }
};
