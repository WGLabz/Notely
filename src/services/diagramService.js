/**
 * Electron service for Excalidraw diagram file operations
 * Handles reading, writing, and managing diagram files on disk
 */

import { getDiagramImagePath } from '../utils/diagramFileUtils';

function invokeDiagram(method, payload) {
  const apiMethod = window.notesApi?.[method];
  if (typeof apiMethod === 'function') {
    return apiMethod(payload);
  }
  if (window.electron?.ipcRenderer?.invoke) {
    const channelByMethod = {
      readDiagramSource: 'diagram:read-source',
      writeDiagramSource: 'diagram:write-source',
      writeDiagramImage: 'diagram:write-image',
      readDiagramImage: 'diagram:read-image',
      deleteDiagram: 'diagram:delete',
      diagramExists: 'diagram:exists',
    };
    const channel = channelByMethod[method];
    if (channel) {
      return window.electron.ipcRenderer.invoke(channel, payload);
    }
  }
  throw new Error(`Diagram API method unavailable: ${method}`);
}

/**
 * Read diagram source file (.excalidraw)
 * @param {string} documentPath - Path to document directory
 * @param {string} diagramId - Diagram identifier
 * @returns {Promise<object>} Parsed diagram data
 */
export async function readDiagramSource(documentPath, diagramId) {
  try {
    const response = await invokeDiagram('readDiagramSource', {
      documentPath,
      diagramId,
    });
    
    if (response && response.success) {
      return JSON.parse(response.data);
    }
    
    return null;
  } catch (err) {
    console.error('Failed to read diagram source:', err);
    return null;
  }
}

/**
 * Write diagram source file (.excalidraw)
 * @param {string} documentPath - Path to document directory
 * @param {string} diagramId - Diagram identifier
 * @param {object} diagramData - Excalidraw diagram data
 * @returns {Promise<boolean>} Success status
 */
export async function writeDiagramSource(documentPath, diagramId, diagramData) {
  try {
    const response = await invokeDiagram('writeDiagramSource', {
      documentPath,
      diagramId,
      data: JSON.stringify(diagramData),
    });
    
    return response?.success ?? false;
  } catch (err) {
    console.error('Failed to write diagram source:', err);
    return false;
  }
}

/**
 * Write diagram image file (.png)
 * @param {string} documentPath - Path to document directory
 * @param {string} diagramId - Diagram identifier
 * @param {Buffer|string} imageData - Image data (buffer or base64)
 * @returns {Promise<boolean>} Success status
 */
export async function writeDiagramImage(documentPath, diagramId, imageData) {
  try {
    const response = await invokeDiagram('writeDiagramImage', {
      documentPath,
      diagramId,
      imageData,
    });
    
    return response?.success ?? false;
  } catch (err) {
    console.error('Failed to write diagram image:', err);
    return false;
  }
}

/**
 * Read diagram image file (.png) as a data URL
 * @param {string} documentPath - Path to document directory
 * @param {string} diagramId - Diagram identifier
 * @returns {Promise<string|null>} image data URL
 */
export async function readDiagramImage(documentPath, diagramId) {
  try {
    const response = await invokeDiagram('readDiagramImage', {
      documentPath,
      diagramId,
    });

    if (response?.success && response?.data) {
      return response.data;
    }
    return null;
  } catch (err) {
    console.error('Failed to read diagram image:', err);
    return null;
  }
}

/**
 * Delete diagram folder
 * @param {string} documentPath - Path to document directory
 * @param {string} diagramId - Diagram identifier
 * @returns {Promise<boolean>} Success status
 */
export async function deleteDiagram(documentPath, diagramId) {
  try {
    const response = await invokeDiagram('deleteDiagram', {
      documentPath,
      diagramId,
    });
    
    return response?.success ?? false;
  } catch (err) {
    console.error('Failed to delete diagram:', err);
    return false;
  }
}

/**
 * Check if diagram exists
 * @param {string} documentPath - Path to document directory
 * @param {string} diagramId - Diagram identifier
 * @returns {Promise<boolean>}
 */
export async function diagramExists(documentPath, diagramId) {
  try {
    const response = await invokeDiagram('diagramExists', {
      documentPath,
      diagramId,
    });
    
    return response?.exists ?? false;
  } catch (err) {
    console.error('Failed to check diagram existence:', err);
    return false;
  }
}

/**
 * Get diagram image path relative to document
 * @param {string} diagramId - Diagram identifier
 * @returns {string} Relative path to diagram image
 */
export function getDiagramImageUrl(documentPath, diagramId) {
  // This would be replaced with actual image URL from file system
  const imagePath = getDiagramImagePath('document', diagramId);
  return `file://${documentPath}/${imagePath}`;
}
