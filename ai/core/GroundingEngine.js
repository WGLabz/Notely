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
}

module.exports = GroundingEngine;
