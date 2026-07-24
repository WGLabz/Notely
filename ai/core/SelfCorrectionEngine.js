/**
 * SelfCorrectionEngine - Response validation & self-correction loop for Notely AI
 * Validates generated LLM responses before returning them to the user.
 * Checks for zero-jargon compliance, citation grounding, and evidence alignment.
 */

const GroundingEngine = require('./GroundingEngine');

class SelfCorrectionEngine {
  /**
   * Validate and self-correct response text
   * @param {string} text
   * @param {object} options - { query, evidenceContext }
   * @returns {{ validatedText: string, corrected: boolean, issues: string[] }}
   */
  static validateAndCorrect(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return { validatedText: '', corrected: false, issues: [] };
    }

    let currentText = text;
    const issues = [];
    let corrected = false;

    // 1. Zero-Jargon Compliance Check (Strip internal tool names if leaked by LLM)
    const jargonPatterns = [
      /I executed the following tools:?/gi,
      /#### Tool Output:?\s*\w+/gi,
      /\[Tool:\s*\w+\]/gi,
      /I invoked tool \w+/gi
    ];

    for (const pattern of jargonPatterns) {
      if (pattern.test(currentText)) {
        issues.push('Leaked internal tool technical jargon');
        currentText = currentText.replace(pattern, '').trim();
        corrected = true;
      }
    }

    // 2. Citation Link Verification (Verify file:/// links exist on disk)
    const citationRes = GroundingEngine.verifyCitations(currentText);
    if (citationRes.brokenCitations > 0) {
      issues.push(`Found ${citationRes.brokenCitations} broken note links`);
      currentText = citationRes.text;
      corrected = true;
    }

    // 3. Note Title Hallucination Verification & Line Link Formatting
    if (options.workspaceFiles && Array.isArray(options.workspaceFiles)) {
      const titleRes = GroundingEngine.verifyNoteTitleClaims(currentText, options.workspaceFiles);
      if (titleRes.hallucinations.length > 0) {
        issues.push(`Stripped ${titleRes.hallucinations.length} ungrounded note title claim(s)`);
        currentText = titleRes.text;
        corrected = true;
      }
      currentText = GroundingEngine.formatLineNumberLinks(currentText, options.workspaceFiles);
    }

    // 4. Grounding Fallback Check
    if (options.evidenceContext === false || options.evidenceContext === '') {
      const lower = currentText.toLowerCase();
      if (lower.includes('in your note') && !lower.includes("couldn't find")) {
        issues.push('Claimed note facts without workspace evidence');
      }
    }

    return {
      validatedText: currentText,
      corrected,
      issues
    };
  }
}

module.exports = SelfCorrectionEngine;
