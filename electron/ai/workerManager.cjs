/**
 * workerManager.cjs - Manages background utilityProcess lifecycles and messaging
 */

const { utilityProcess, BrowserWindow } = require('electron');
const path = require('path');

let childProcess = null;
let isPaused = false;
let isWorking = false;
let graphProgressState = {
  isBuilding: false,
  isPaused: false,
  current: 0,
  total: 0,
  progress: 0,
  noteName: '',
  nodeCount: 0,
  edgeCount: 0,
  queueSize: 0
};

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
    const { type, error, working, payload } = e || {};
    if (type === 'error') {
      console.error('[Worker Manager] Child worker reported error:', error);
      isWorking = false;
    } else if (type === 'working') {
      isWorking = !!working;
    } else if (type === 'graphProgress') {
      graphProgressState = {
        isBuilding: payload?.isBuilding ?? true,
        isPaused: payload?.isPaused ?? false,
        current: payload?.current || 0,
        total: payload?.total || 0,
        progress: payload?.progress || 0,
        noteName: payload?.noteName || '',
        nodeCount: payload?.nodeCount || 0,
        edgeCount: payload?.edgeCount || 0,
        queueSize: payload?.queueSize || 0
      };

      // Broadcast to renderer windows
      try {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('ai:graph:progress', graphProgressState);
          }
        }
      } catch (err) {
        console.error('[Worker Manager] Failed to broadcast graphProgress to renderer:', err.message);
      }
    } else if (type === 'graphComplete') {
      graphProgressState = {
        ...graphProgressState,
        isBuilding: false,
        noteName: ''
      };
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

function rebuildGraph(workspaceFiles, providerConfig = null) {
  graphProgressState = {
    isBuilding: true,
    isPaused: false,
    current: 0,
    total: Array.isArray(workspaceFiles) ? workspaceFiles.length : 0,
    progress: 0,
    noteName: 'Starting graph rebuild...',
    nodeCount: 0,
    edgeCount: 0,
    queueSize: Array.isArray(workspaceFiles) ? workspaceFiles.length : 0
  };
  if (childProcess) {
    childProcess.postMessage({
      type: 'rebuildGraph',
      payload: { workspaceFiles, providerConfig }
    });
  }
}

function pauseGraphWorker() {
  if (childProcess) {
    childProcess.postMessage({ type: 'pauseGraphWorker' });
    graphProgressState.isPaused = true;
  }
}

function resumeGraphWorker() {
  if (childProcess) {
    childProcess.postMessage({ type: 'resumeGraphWorker' });
    graphProgressState.isPaused = false;
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
  pauseGraphWorker,
  resumeGraphWorker,
  shutdownWorker,
  rebuildGraph,
  getGraphProgressState: () => graphProgressState,
  get isPaused() { return isPaused; },
  get isWorking() { return isWorking; }
};
