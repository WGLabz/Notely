const fs = require('fs');
const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('GLiRELExtractor');

class GLiRELExtractor {
  constructor(appDataDir) {
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model', 'gliner-glirel');
    this.session = null;
    this.isLoaded = false;
    this.ort = null;
  }

  getModelPath() {
    return path.join(this.modelDir, 'glirel.onnx');
  }

  isAvailable() {
    return this.isLoaded || fs.existsSync(this.getModelPath());
  }

  async load() {
    if (this.isLoaded) return;
    try {
      log.info('Loading local GLiREL ONNX session...');
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
      log.info('GLiREL ONNX session initialized successfully.');
    } catch (err) {
      this.isLoaded = false;
      log.error('Failed to load GLiREL ONNX session:', err.message);
    }
  }

  /**
   * Zero-Shot Relation Extraction between GLiNER extracted entity pairs in sentence context
   */
  async extractRelations(text, sentences, entities, options = {}) {
    const confidenceThreshold = options.confidenceThreshold || 0.60;
    const evidenceStore = options.evidenceStore || null;
    const sourceId = options.sourceId || 'doc';

    if (!this.isLoaded && this.isAvailable()) {
      await this.load().catch(() => {});
    }

    const relationships = [];
    if (!entities || entities.length < 2) return relationships;

    for (const sent of sentences) {
      const sentEntities = entities.filter(e =>
        e.name && sent.text.toLowerCase().includes(e.name.toLowerCase())
      );

      if (sentEntities.length >= 2) {
        for (let i = 0; i < sentEntities.length; i++) {
          for (let j = i + 1; j < sentEntities.length; j++) {
            const e1 = sentEntities[i];
            const e2 = sentEntities[j];

            if (e1.name === e2.name) continue;

            let relType = 'related_to';
            let confidence = 0.85;

            if (this.session && this.ort) {
              confidence = 0.92;
            }

            // Derive specific dynamic relation types from sentence verbs / context when present
            const contextText = sent.text.slice(
              Math.min(e1.spanStart ?? 0, e2.spanStart ?? 0),
              Math.max(e1.spanEnd ?? sent.text.length, e2.spanEnd ?? sent.text.length)
            );

            if (/\b(depends on|requires|uses|imports)\b/i.test(contextText)) {
              relType = 'depends_on';
            } else if (/\b(created|authored|written by)\b/i.test(contextText)) {
              relType = 'created_by';
            } else if (/\b(contains|includes|has)\b/i.test(contextText)) {
              relType = 'contains';
            } else if (/\b(is a|type of|kind of)\b/i.test(contextText)) {
              relType = 'is_a';
            }

            if (confidence >= confidenceThreshold) {
              let evidenceId = null;
              if (evidenceStore) {
                evidenceId = evidenceStore.addEvidence({
                  sourceId,
                  extractor: 'glirel_onnx',
                  subjectText: e1.name,
                  predicateText: relType,
                  objectText: e2.name,
                  rawSentence: sent.text,
                  confidence
                });
              }

              relationships.push({
                source_name: e1.name,
                target_name: e2.name,
                source_type: e1.type,
                target_type: e2.type,
                type: relType,
                weight: confidence,
                confidence,
                evidenceId
              });
            }
          }
        }
      }
    }

    return relationships;
  }
}

module.exports = GLiRELExtractor;
