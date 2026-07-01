/**
 * Electron Main Process IPC Handlers for Diagram File Operations
 * 
 * Usage in main.cjs:
 * const { setupDiagramHandlers } = require('./electron/diagram-handlers.cjs');
 * setupDiagramHandlers(ipcMain);
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

function isNotFoundError(err) {
  return Boolean(err && err.code === 'ENOENT');
}

/**
 * Setup diagram IPC handlers
 * @param {Object} ipcMain - Electron's ipcMain
 * @param {string} appDataPath - Application data directory
 */
function setupDiagramHandlers(ipcMain, appDataPath, deps = {}) {
  const {
    getNotesRoot = () => "",
    filePathWithin = () => false,
    emitLocalP2PSyncEvent = null,
    hashContent = null,
  } = deps;

  function getCurrentDiagramDir(documentPath, diagramId) {
    return path.join(documentPath, '.notes-app', 'excali-diagrams', diagramId);
  }

  function getLegacyDiagramDir(documentPath, diagramId) {
    return path.join(documentPath, 'excali-diagrams', diagramId);
  }

  function getPreferredExistingDiagramDir(documentPath, diagramId) {
    const currentDir = getCurrentDiagramDir(documentPath, diagramId);
    if (fsSync.existsSync(currentDir)) return currentDir;
    const legacyDir = getLegacyDiagramDir(documentPath, diagramId);
    if (fsSync.existsSync(legacyDir)) return legacyDir;
    return currentDir;
  }

  function emitDiagramSync(filePath, options = {}) {
    if (typeof emitLocalP2PSyncEvent !== 'function' || typeof hashContent !== 'function') {
      return;
    }

    const { op = 'update', baseHash = null } = options;
    const notesRoot = getNotesRoot();
    const resolved = path.resolve(String(filePath || ''));
    if (!resolved || !filePathWithin(notesRoot, resolved)) {
      return;
    }

    if (op === 'delete') {
      emitLocalP2PSyncEvent({
        op: 'delete',
        filePath: resolved,
        baseHash,
        newHash: null,
        content: null,
        contentBase64: null,
        contentEncoding: 'base64',
      });
      return;
    }

    if (!fsSync.existsSync(resolved)) {
      return;
    }

    const contentBase64 = fsSync.readFileSync(resolved).toString('base64');
    emitLocalP2PSyncEvent({
      op,
      filePath: resolved,
      baseHash,
      newHash: hashContent(contentBase64),
      content: null,
      contentBase64,
      contentEncoding: 'base64',
    });
  }
  /**
   * Read diagram source file
   */
  ipcMain.handle('diagram:read-source', async (event, { documentPath, diagramId }) => {
    try {
      const sourceFile = path.join(getPreferredExistingDiagramDir(documentPath, diagramId), 'diagram.excalidraw');
      const data = await fs.readFile(sourceFile, 'utf-8');
      
      return {
        success: true,
        data,
      };
    } catch (err) {
      if (isNotFoundError(err)) {
        return {
          success: false,
          notFound: true,
        };
      }
      console.error('Failed to read diagram source:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  });

  /**
   * Write diagram source file
   */
  ipcMain.handle('diagram:write-source', async (event, { documentPath, diagramId, data }) => {
    try {
      const diagramDir = getCurrentDiagramDir(documentPath, diagramId);
      const sourceFile = path.join(diagramDir, 'diagram.excalidraw');
      const existed = fsSync.existsSync(sourceFile);
      const previousBase64 = existed ? fsSync.readFileSync(sourceFile).toString('base64') : null;
      const previousHash = previousBase64 && typeof hashContent === 'function' ? hashContent(previousBase64) : null;
      
      // Create directory if it doesn't exist
      await mkdirRecursive(diagramDir);

      await fs.writeFile(sourceFile, data, 'utf-8');
      emitDiagramSync(sourceFile, { op: existed ? 'update' : 'create', baseHash: previousHash });
      
      return {
        success: true,
      };
    } catch (err) {
      console.error('Failed to write diagram source:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  });

  /**
   * Write diagram image file
   */
  ipcMain.handle('diagram:write-image', async (event, { documentPath, diagramId, imageData }) => {
    try {
      const diagramDir = getCurrentDiagramDir(documentPath, diagramId);
      const imageFile = path.join(diagramDir, 'diagram.png');
      const existed = fsSync.existsSync(imageFile);
      const previousBase64 = existed ? fsSync.readFileSync(imageFile).toString('base64') : null;
      const previousHash = previousBase64 && typeof hashContent === 'function' ? hashContent(previousBase64) : null;
      
      // Create directory if it doesn't exist
      await mkdirRecursive(diagramDir);

      
      // Handle both base64 strings and buffers
      let buffer;
      if (typeof imageData === 'string') {
        // Remove data URL prefix if present
        const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        buffer = imageData;
      }
      
      await fs.writeFile(imageFile, buffer);
      emitDiagramSync(imageFile, { op: existed ? 'update' : 'create', baseHash: previousHash });
      
      return {
        success: true,
      };
    } catch (err) {
      console.error('Failed to write diagram image:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  });

  /**
   * Delete diagram folder
   */
  ipcMain.handle('diagram:delete', async (event, { documentPath, diagramId }) => {
    try {
      const diagramDirs = [
        getCurrentDiagramDir(documentPath, diagramId),
        getLegacyDiagramDir(documentPath, diagramId),
      ];
      const sourceFileHashes = [];
      const imageFileHashes = [];
      for (const diagramDir of diagramDirs) {
        const sourceFile = path.join(diagramDir, 'diagram.excalidraw');
        const imageFile = path.join(diagramDir, 'diagram.png');
        const sourceHash = (typeof hashContent === 'function' && fsSync.existsSync(sourceFile))
          ? hashContent(fsSync.readFileSync(sourceFile).toString('base64'))
          : null;
        const imageHash = (typeof hashContent === 'function' && fsSync.existsSync(imageFile))
          ? hashContent(fsSync.readFileSync(imageFile).toString('base64'))
          : null;
        sourceFileHashes.push({ filePath: sourceFile, hash: sourceHash });
        imageFileHashes.push({ filePath: imageFile, hash: imageHash });
      }
      for (const diagramDir of diagramDirs) {
        await rmRecursive(diagramDir);
      }
      sourceFileHashes.forEach((entry) => emitDiagramSync(entry.filePath, { op: 'delete', baseHash: entry.hash }));
      imageFileHashes.forEach((entry) => emitDiagramSync(entry.filePath, { op: 'delete', baseHash: entry.hash }));
      
      return {
        success: true,
      };
    } catch (err) {
      console.error('Failed to delete diagram:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  });

  /**
   * Check if diagram exists
   */
  ipcMain.handle('diagram:exists', async (event, { documentPath, diagramId }) => {
    try {
      const sourceFile = path.join(getPreferredExistingDiagramDir(documentPath, diagramId), 'diagram.excalidraw');
      
      try {
        await fs.access(sourceFile);
        return {
          exists: true,
        };
      } catch {
        return {
          exists: false,
        };
      }
    } catch (err) {
      console.error('Failed to check diagram existence:', err);
      return {
        exists: false,
        error: err.message,
      };
    }
  });

  /**
   * Read diagram image file as base64
   */
  ipcMain.handle('diagram:read-image', async (event, { documentPath, diagramId }) => {
    try {
      const imageFile = path.join(getPreferredExistingDiagramDir(documentPath, diagramId), 'diagram.png');
      const imageData = await fs.readFile(imageFile);
      const base64 = imageData.toString('base64');
      
      return {
        success: true,
        data: `data:image/png;base64,${base64}`,
      };
    } catch (err) {
      if (isNotFoundError(err)) {
        return {
          success: false,
          notFound: true,
        };
      }
      console.error('Failed to read diagram image:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  });
}

/**
 * Utility: Recursively create directory
 */
async function mkdirRecursive(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Utility: Recursively remove directory
 */
async function rmRecursive(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isDirectory()) {
        await rmRecursive(filePath);
      } else {
        await fs.unlink(filePath);
      }
    }
    
    await fs.rmdir(dirPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

module.exports = {
  setupDiagramHandlers,
};
