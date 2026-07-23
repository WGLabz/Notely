/**
 * Utilities for managing Excalidraw diagram files
 * Handles reading, writing, and rendering diagrams
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique diagram ID
 */
export function generateDiagramId() {
  return uuidv4().slice(0, 8);
}

/**
 * Get the root diagram folder path.
 * The on-disk storage is keyed by diagram ID, not document slug.
 * @returns {string} Path to diagrams root folder
 */
export function getDiagramFolderPath() {
  return ".notes-app/excali-diagrams";
}

/**
 * Get the diagram folder path for a specific diagram
 * @param {string} _docSlug - Legacy argument kept for API compatibility
 * @param {string} diagramId - Diagram identifier
 * @returns {string} Path to specific diagram folder
 */
export function getDiagramPath(_docSlug, diagramId) {
  return `${getDiagramFolderPath()}/${diagramId}`;
}

/**
 * Get the source file path (.excalidraw)
 * @param {string} docSlug - Document slug
 * @param {string} diagramId - Diagram identifier
 * @returns {string} Path to .excalidraw source file
 */
export function getDiagramSourcePath(docSlug, diagramId) {
  return `${getDiagramPath(docSlug, diagramId)}/diagram.excalidraw`;
}

/**
 * Get the rendered image path (.png)
 * @param {string} docSlug - Document slug
 * @param {string} diagramId - Diagram identifier
 * @returns {string} Path to rendered PNG image
 */
export function getDiagramImagePath(_docSlug, diagramId) {
  return `.notes-app/excali-diagrams/${diagramId}/diagram.png`;
}

/**
 * Get markdown image reference for a diagram
 * @param {string} docSlug - Document slug
 * @param {string} diagramId - Diagram identifier
 * @returns {string} Markdown image reference
 */
export function getDiagramMarkdownReference(docSlug, diagramId) {
  const imagePath = getDiagramImagePath(docSlug, diagramId);
  return `![Excalidraw Diagram](${imagePath})`;
}

/**
 * Extract diagram ID and document slug from markdown image reference
 * @param {string} markdownRef - Markdown reference like ![...](excali-diagrams/slug/id/...)
 * @returns {object|null} {docSlug, diagramId} or null if not a diagram reference
 */
export function parseDiagramReference(markdownRef) {
  // Match both:
  // - .notes-app/excali-diagrams/diagramId/diagram.png (current)
  // - excali-diagrams/diagramId/diagram.png (legacy)
  // - excali-diagrams/docSlug/diagramId/diagram.png (legacy slugged)
  const match = markdownRef.match(/!\[.*?\]\(((?:\.notes-app\/)?excali-diagrams\/(?:(?:([^/]+)\/)?([^/]+))\/diagram\.png|media\/diagrams\/([^/.]+)\.png)\)\s*(?:\{[^}]*\})?/);
  
  if (match) {
    return {
      docSlug: match[2] || null,
      diagramId: match[4] || match[3],
      fullPath: match[1],
    };
  }
  
  return null;
}

/**
 * Check if an image reference is a diagram
 * @param {string} imagePath - Image path
 * @returns {boolean}
 */
export function isDiagramReference(imagePath) {
  return (
    Boolean(imagePath) &&
    (imagePath.includes('excali-diagrams') || imagePath.includes('media/diagrams')) &&
    (imagePath.includes('diagram.png') || imagePath.endsWith('.png'))
  );
}

/**
 * Generate PNG from Excalidraw data using canvas
 * Returns data URL
 * @param {object} diagramData - Excalidraw diagram data
 * @returns {Promise<string>} Data URL of PNG image
 */
export async function generateDiagramPNG(_diagramData) {
  try {
    // Create a temporary canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    
    // This is a placeholder - actual rendering would use Excalidraw's export functionality
    // For now, we'll return a simple canvas as data URL
    // In a real implementation, you'd use Excalidraw's exportToCanvas or similar
    
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Failed to generate PNG:', err);
    throw new Error('Failed to generate diagram PNG');
  }
}

/**
 * Create diagram reference markdown with metadata
 * @param {string} docSlug - Document slug
 * @param {string} diagramId - Diagram ID
 * @param {object} diagramData - Excalidraw diagram data
 * @returns {string} Markdown with embedded data
 */
export function createDiagramMarkdown(docSlug, diagramId, _diagramData) {
  const imagePath = getDiagramImagePath(docSlug, diagramId);
  
  // Create markdown that references the image
  // Include a hidden data attribute for the diagram ID
  return `![Excalidraw Diagram](${imagePath}){data-diagram-id="${diagramId}" data-diagram-type="excalidraw"}`;
}

/**
 * Extract diagram metadata from markdown
 * @param {string} markdown - Markdown content
 * @returns {array} Array of {diagramId, imagePath} objects
 */
export function extractDiagramReferences(markdown) {
  const diagramRefs = [];
  
  // Match both current (media/diagrams) and legacy diagram reference paths.
  const pattern = /!\[Excalidraw Diagram\]\(((?:\.notes-app\/)?excali-diagrams\/(?:(?:[^/]+\/)?([^/]+))\/diagram\.png|media\/diagrams\/([^/.]+)\.png)\)\s*\{data-diagram-id=["“]([^"”]+)["”]/g;
  
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    diagramRefs.push({
      imagePath: match[1],
      diagramId: match[4] || match[2] || match[3],
    });
  }
  
  return diagramRefs;
}
