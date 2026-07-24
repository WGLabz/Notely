const path = require('path');
const { createLogger } = require('../core/logger');
const GLiNERExtractor = require('./GLiNERExtractor');
const GLiRELExtractor = require('./GLiRELExtractor');

const log = createLogger('GLiNERGLiRELPipeline');

class GLiNERGLiRELPipeline {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
    this.gliner = new GLiNERExtractor(appDataDir);
    this.glirel = new GLiRELExtractor(appDataDir);
    this.isInitialized = false;
  }

  isAvailable() {
    return this.gliner.isAvailable() || this.glirel.isAvailable();
  }

  async load() {
    if (this.isInitialized) return;
    log.info('Initializing GLiNER + GLiREL neural extraction pipeline...');
    await Promise.all([
      this.gliner.load().catch(err => log.warn('GLiNER load notice:', err.message)),
      this.glirel.load().catch(err => log.warn('GLiREL load notice:', err.message))
    ]);
    this.isInitialized = true;
    log.info('GLiNER + GLiREL pipeline initialized.');
  }

  /**
   * Run model-driven entity & relation extraction over note content
   * @param {string} text Note raw text
   * @param {object} ast Markdown AST parser results for dynamic label discovery
   * @param {object} options Pipeline options (confidenceThreshold, evidenceStore, sourceId)
   */
  async extractEntitiesAndRelations(text, ast = {}, options = {}) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return { entities: [], relationships: [] };
    }

    if (!this.isInitialized) {
      await this.load().catch(() => {});
    }

    // 1. Dynamic Model-Driven Label Discovery from Note Content
    const SYSTEM_SECTIONS = new Set(['rawnotes', 'raw notes', 'raw note', 'raw', 'cleansed', 'cleansed notes', 'cleansed note']);
    const dynamicLabels = new Set();

    if (ast) {
      if (ast.tags) ast.tags.forEach(t => dynamicLabels.add(t.name || t.tagName));
      if (ast.sections) {
        ast.sections.forEach(s => {
          const norm = String(s.title || '').trim().toLowerCase();
          if (!SYSTEM_SECTIONS.has(norm)) {
            dynamicLabels.add(s.title);
          }
        });
      }
      if (ast.keyTerms) ast.keyTerms.forEach(k => dynamicLabels.add(k.term));
      if (ast.links) ast.links.forEach(l => dynamicLabels.add(l.targetName));
    }

    const candidateLabels = Array.from(dynamicLabels).filter(Boolean);

    // 2. GLiNER NER Pass
    const rawEntities = await this.gliner.extractEntities(text, candidateLabels, options);
    const filteredEntities = rawEntities.filter(ent => {
      const norm = String(ent.name || '').trim().toLowerCase();
      return !SYSTEM_SECTIONS.has(norm);
    });

    // 3. GLiREL RE Pass
    const sentences = this.gliner.segmentSentences(text);
    const rawRelationships = await this.glirel.extractRelations(text, sentences, filteredEntities, options);
    const relationships = rawRelationships.filter(rel => {
      const normSrc = String(rel.source_name || '').trim().toLowerCase();
      const normTgt = String(rel.target_name || '').trim().toLowerCase();
      return !SYSTEM_SECTIONS.has(normSrc) && !SYSTEM_SECTIONS.has(normTgt);
    });

    // 4. Deduplicate entities by canonical name
    const uniqueEntities = new Map();
    for (const ent of filteredEntities) {
      const key = String(ent.name || '').trim().toLowerCase();
      if (!uniqueEntities.has(key) || (ent.confidence > uniqueEntities.get(key).confidence)) {
        uniqueEntities.set(key, ent);
      }
    }

    return {
      entities: Array.from(uniqueEntities.values()),
      relationships
    };
  }
}

module.exports = GLiNERGLiRELPipeline;
