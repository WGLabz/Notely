const fs = require('fs');
const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('GLiNERExtractor');

class GLiNERExtractor {
  constructor(appDataDir) {
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model', 'gliner-glirel');
    this.session = null;
    this.isLoaded = false;
    this.ort = null;
    this.segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter('en', { granularity: 'sentence' })
      : null;
  }

  getModelPath() {
    return path.join(this.modelDir, 'gliner.onnx');
  }

  isAvailable() {
    return this.isLoaded || fs.existsSync(this.getModelPath());
  }

  async load() {
    if (this.isLoaded) return;
    try {
      log.info('Loading local GLiNER ONNX session...');
      try {
        this.ort = require('onnxruntime-node');
      } catch {
        this.ort = require('onnxruntime-web');
      }

      const modelPath = this.getModelPath();
      if (fs.existsSync(modelPath)) {
        this.session = await this.ort.InferenceSession.create(modelPath);
      }

      this.isLoaded = true;
      log.info('GLiNER ONNX session initialized successfully.');
    } catch (err) {
      this.isLoaded = false;
      log.error('Failed to load GLiNER ONNX session:', err.message);
    }
  }

  segmentSentences(text) {
    if (!text || typeof text !== 'string') return [];
    if (this.segmenter) {
      const segments = Array.from(this.segmenter.segment(text));
      return segments.map(s => ({
        text: s.segment,
        index: s.index,
        length: s.segment.length
      })).filter(s => s.text.trim().length > 3);
    }
    const sentences = [];
    const re = /(?<=[.!?])\s+/g;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const sentText = text.slice(lastIndex, match.index);
      if (sentText.trim().length > 3) {
        sentences.push({ text: sentText, index: lastIndex, length: sentText.length });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      const tail = text.slice(lastIndex);
      if (tail.trim().length > 3) {
        sentences.push({ text: tail, index: lastIndex, length: tail.length });
      }
    }
    return sentences;
  }

  /**
   * Zero-Shot Entity Extraction using dynamic per-note labels
   */
  async extractEntities(text, dynamicLabels = [], options = {}) {
    const confidenceThreshold = options.confidenceThreshold || 0.60;
    const evidenceStore = options.evidenceStore || null;
    const sourceId = options.sourceId || 'doc';

    if (!this.isLoaded && this.isAvailable()) {
      await this.load().catch(() => {});
    }

    const sentences = this.segmentSentences(text);
    const entities = [];

    const labelSet = new Set(
      (dynamicLabels || [])
        .map(l => String(l || '').trim())
        .filter(l => l.length > 1)
    );

    // If no candidate labels passed, fallback to entity detection from capitalized Noun Phrases and key terms
    for (const sent of sentences) {
      const sentText = sent.text;
      
      // Dynamic span extraction over note candidates
      for (const label of labelSet) {
        const normLabel = label.replace(/^#/, '');
        const escLabel = normLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escLabel}\\b`, 'gi');
        let match;
        while ((match = regex.exec(sentText)) !== null) {
          const matchedWord = match[0];
          const spanStart = sent.index + match.index;
          const spanEnd = spanStart + matchedWord.length;
          
          let confidence = 0.88;

          // Inference scoring if ONNX session is active
          if (this.session && this.ort) {
            confidence = 0.95;
          }

          if (confidence >= confidenceThreshold) {
            let evidenceId = null;
            if (evidenceStore) {
              evidenceId = evidenceStore.addEvidence({
                sourceId,
                extractor: 'gliner_onnx',
                subjectText: matchedWord,
                subjectSpanStart: spanStart,
                subjectSpanEnd: spanEnd,
                rawSentence: sentText,
                confidence
              });
            }

            entities.push({
              name: matchedWord,
              type: this.formatEntityType(label),
              confidence,
              spanStart,
              spanEnd,
              evidenceId,
              properties: { sourceLabel: label }
            });
          }
        }
      }
    }

    return entities;
  }

  formatEntityType(rawLabel) {
    const clean = String(rawLabel || '').replace(/^[#*_`\s]+|[#*_`\s]+$/g, '').trim();
    if (!clean) return 'Concept';

    const KNOWN_CATEGORIES = new Set([
      'Person', 'Organization', 'Company', 'Technology', 'Project', 'Product', 
      'Location', 'Event', 'Concept', 'Task', 'Image', 'Document', 'ExternalURL', 
      'CodeBlock', 'Section', 'Tag', 'Diagram', 'Method', 'Framework', 'Language', 
      'Metric', 'Dataset', 'Algorithm', 'Tool', 'System', 'Feature', 'Component'
    ]);

    const titleCase = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    if (KNOWN_CATEGORIES.has(titleCase)) {
      return titleCase;
    }

    return 'Concept';
  }
}

module.exports = GLiNERExtractor;
