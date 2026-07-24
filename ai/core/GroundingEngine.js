/**
 * GroundingEngine - Verifies claims and citation links against workspace filesystem
 */

const fs = require('fs');

class GroundingEngine {
  /**
   * Verify file links in response text
   * @param {string} text
   * @returns {{ text: string, verifiedCitations: number, brokenCitations: number }}
   */
  static verifyCitations(text) {
    if (!text || typeof text !== 'string') {
      return { text: text || '', verifiedCitations: 0, brokenCitations: 0 };
    }

    let verified = 0;
    let broken = 0;

    const linkRegex = /\[([^\]]+)\]\(file:\/\/\/([^)]+)\)/g;
    const verifiedText = text.replace(linkRegex, (match, label, filePath) => {
      // Decode URI spaces
      const decodedPath = decodeURIComponent(filePath);
      if (fs.existsSync(decodedPath)) {
        verified++;
        return match;
      } else {
        broken++;
        return label; // Fallback to plain label if link target doesn't exist
      }
    });

    return {
      text: verifiedText,
      verifiedCitations: verified,
      brokenCitations: broken
    };
  }

  /**
   * Verify note title claims against actual workspace files
   * @param {string} text
   * @param {string[]} workspaceFiles
   * @returns {{ text: string, hallucinations: string[] }}
   */
  static verifyNoteTitleClaims(text, workspaceFiles = []) {
    if (!text || typeof text !== 'string' || !Array.isArray(workspaceFiles) || workspaceFiles.length === 0) {
      return { text: text || '', hallucinations: [] };
    }

    const noteBasenames = new Set(workspaceFiles.map(f => {
      const name = f.split(/[\\/]/).pop().replace(/\.md$/i, '').toLowerCase();
      return name;
    }));

    const hallucinations = [];
    const titleRegex = /note\s+(?:titled|named|called|titled:?)\s+["']?([A-Za-z0-9\s\-_]+)["']?/gi;

    const cleanedText = text.replace(titleRegex, (match, claimedTitle) => {
      const normTitle = String(claimedTitle || '').trim().toLowerCase();
      if (normTitle && !noteBasenames.has(normTitle)) {
        hallucinations.push(claimedTitle);
        return `note (no matching file found for "${claimedTitle}")`;
      }
      return match;
    });

    return { text: cleanedText, hallucinations };
  }

  /**
   * Auto-format unlinked note line number citations into clickable file:/// links
   * @param {string} text
   * @param {string[]} workspaceFiles
   * @returns {string}
   */
  static formatLineNumberLinks(text, workspaceFiles = []) {
    if (!text || typeof text !== 'string' || !Array.isArray(workspaceFiles) || workspaceFiles.length === 0) {
      return text || '';
    }

    const fileMap = new Map();
    for (const f of workspaceFiles) {
      const filename = f.split(/[\\/]/).pop();
      fileMap.set(filename.toLowerCase(), f);
    }

    // Match unlinked pattern: "filename.md (line 18)" or "filename.md lines 18-23" or "filename.md:18-23"
    const unlinkedLineRegex = /(?<!\(file:\/\/\/[^)]*)\b([A-Za-z0-9\-_.]+\.md)\b(?:\s*\(?(?:lines?|L)?\s*(\d+)(?:\s*[-–—]\s*(\d+))?\)?|:(\d+)(?:-(\d+))?)/gi;

    return text.replace(unlinkedLineRegex, (match, filename, line1, line2, lineAlt1, lineAlt2) => {
      const fullPath = fileMap.get(filename.toLowerCase());
      if (!fullPath) return match;

      const startLine = line1 || lineAlt1;
      const endLine = line2 || lineAlt2;
      const normPath = fullPath.replace(/\\/g, '/');

      if (startLine && endLine) {
        return `[${filename}:L${startLine}-L${endLine}](file:///${normPath}#L${startLine})`;
      } else if (startLine) {
        return `[${filename}:L${startLine}](file:///${normPath}#L${startLine})`;
      }

      return match;
    });
  }
}

module.exports = GroundingEngine;
