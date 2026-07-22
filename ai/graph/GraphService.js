/**
 * GraphService - High-level orchestrator for Knowledge Graph ingestion & processing
 */

const path = require('path');
const { createLogger } = require('../core/logger');
const MarkdownASTParser = require('./MarkdownASTParser');
const EvidenceStore = require('./EvidenceStore');
const EntityResolver = require('./EntityResolver');
const ModernBERTExtractor = require('./ModernBERTExtractor');

const log = createLogger('GraphService');

class GraphService {
  constructor(agent, graphDb) {
    this.agent = agent;
    this.graphDb = graphDb;
    this.astParser = new MarkdownASTParser();
    this.evidenceStore = new EvidenceStore(graphDb);
    this.entityResolver = new EntityResolver(graphDb);
    this.modernbertExtractor = null;
  }

  getExtractor() {
    if (!this.modernbertExtractor && this.agent?.appDataDir) {
      this.modernbertExtractor = new ModernBERTExtractor(this.agent.appDataDir);
    }
    return this.modernbertExtractor;
  }

  /**
   * Process a markdown note and save entities, relationships, and evidence to GraphDB
   */
  async processNote(filePath, content) {
    try {
      if (!this.graphDb.isInitialized) {
        this.graphDb.initialize();
      }

      const noteName = path.basename(filePath, '.md');
      const rootEntityId = this.entityResolver.generateEntityId(filePath, 'Note');

      // 1. Structural Markdown AST Parsing
      const ast = this.astParser.parse(filePath, content);

      // Root Note Entity
      this.graphDb.upsertEntity({
        id: rootEntityId,
        name: noteName,
        canonical_name: noteName,
        type: 'Note',
        note_path: filePath,
        properties: ast.rootEntity.properties
      });

      // Clear old evidence for note re-ingestion
      this.evidenceStore.deleteForSource(filePath);

      // 1a. Wikilinks [[Target]]
      for (const link of ast.links) {
        const targetId = this.entityResolver.generateEntityId(link.targetName, 'Note');
        this.graphDb.upsertEntity({
          id: targetId,
          name: link.targetName,
          canonical_name: link.targetName,
          type: 'Note',
          properties: { name: link.targetName }
        });

        const evId = this.evidenceStore.addEvidence({
          sourceId: filePath,
          extractor: 'ast_parser',
          subjectText: noteName,
          predicateText: 'links_to',
          objectText: link.targetName,
          rawSentence: `[[${link.targetName}]]`,
          confidence: 1.0
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: targetId,
          type: 'links_to',
          weight: 1.2,
          confidence: 1.0,
          evidence_id: evId
        });
      }

      // 1b. Tags #tag
      for (const tag of ast.tags) {
        const tagId = this.entityResolver.generateEntityId(tag.tagName, 'Tag');
        this.graphDb.upsertEntity({
          id: tagId,
          name: tag.tagName,
          canonical_name: tag.name,
          type: 'Tag'
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: tagId,
          type: 'tagged',
          weight: 1.0,
          confidence: 1.0
        });
      }

      // 1c. Embedded Media
      for (const media of ast.media) {
        const mediaId = this.entityResolver.generateEntityId(media.name, 'Image');
        this.graphDb.upsertEntity({
          id: mediaId,
          name: media.name,
          canonical_name: media.name,
          type: 'Image',
          properties: { path: media.path, alt: media.alt }
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: mediaId,
          type: 'contains_media',
          weight: 0.9,
          confidence: 1.0
        });
      }

      // 1d. Attachments & URLs
      for (const url of ast.urls) {
        const urlId = this.entityResolver.generateEntityId(url.url, 'ExternalURL');
        this.graphDb.upsertEntity({
          id: urlId,
          name: url.label,
          canonical_name: url.url,
          type: 'ExternalURL',
          properties: { url: url.url }
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: urlId,
          type: 'references_url',
          weight: 0.8,
          confidence: 1.0
        });
      }

      for (const att of ast.attachments) {
        const attId = this.entityResolver.generateEntityId(att.name, 'Document');
        this.graphDb.upsertEntity({
          id: attId,
          name: att.name,
          canonical_name: att.name,
          type: 'Document',
          properties: { path: att.path, label: att.label }
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: attId,
          type: 'attaches_file',
          weight: 0.9,
          confidence: 1.0
        });
      }

      // 1e. Code Blocks
      for (const cb of ast.codeBlocks) {
        const langId = this.entityResolver.generateEntityId(cb.language, 'CodeBlock');
        this.graphDb.upsertEntity({
          id: langId,
          name: cb.language.toUpperCase(),
          canonical_name: cb.language,
          type: 'CodeBlock',
          properties: { language: cb.language }
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: langId,
          type: 'contains_code',
          weight: 0.8,
          confidence: 1.0
        });
      }

      // 1f. Sections (Structural Headings) - filter system design sections like # RawNotes and # Cleansed
      const SYSTEM_SECTIONS = new Set(['rawnotes', 'raw notes', 'raw', 'cleansed', 'cleansed notes', 'cleansed note']);
      for (const sec of ast.sections) {
        const normTitle = String(sec.title || '').trim().toLowerCase();
        if (SYSTEM_SECTIONS.has(normTitle)) {
          continue; // Skip system design section headings
        }

        const secId = this.entityResolver.generateEntityId(`${filePath}:${sec.title}`, 'Section');
        this.graphDb.upsertEntity({
          id: secId,
          name: sec.title,
          canonical_name: sec.title,
          type: 'Section',
          properties: { level: sec.level, wordCount: sec.wordCount }
        });

        const hierarchyWeight = parseFloat(Math.max(0.5, 1.4 - ((sec.level || 1) * 0.1)).toFixed(2));
        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: secId,
          type: 'contains_section',
          weight: hierarchyWeight,
          confidence: 1.0
        });
      }

      // 1g. Bold Keyterms **Term**
      for (const kt of (ast.keyTerms || [])) {
        const ktId = this.entityResolver.generateEntityId(kt.term, 'KeyTerm');
        this.graphDb.upsertEntity({
          id: ktId,
          name: kt.term,
          canonical_name: kt.term,
          type: 'KeyTerm'
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: ktId,
          type: 'emphasizes',
          weight: 1.0,
          confidence: 1.0
        });
      }

      // 1h. Inline Code `code`
      for (const ic of (ast.inlineCodes || [])) {
        const icId = this.entityResolver.generateEntityId(ic.code, 'CodeSnippet');
        this.graphDb.upsertEntity({
          id: icId,
          name: ic.code,
          canonical_name: ic.code,
          type: 'CodeSnippet',
          properties: { code: ic.code }
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: icId,
          type: 'references_code',
          weight: 0.85,
          confidence: 1.0
        });
      }

      // 1i. Callouts & Math Formulas
      for (const co of (ast.callouts || [])) {
        const coId = this.entityResolver.generateEntityId(`${filePath}:${co.type}:${co.title}`, 'Callout');
        this.graphDb.upsertEntity({
          id: coId,
          name: `${co.type}: ${co.title}`,
          canonical_name: co.title,
          type: 'Callout',
          properties: { calloutType: co.type }
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: coId,
          type: 'has_callout',
          weight: 0.9,
          confidence: 1.0
        });
      }

      for (const mf of (ast.mathFormulas || [])) {
        const mfId = this.entityResolver.generateEntityId(mf.formula, 'Formula');
        this.graphDb.upsertEntity({
          id: mfId,
          name: mf.formula.length > 30 ? mf.formula.slice(0, 30) + '...' : mf.formula,
          canonical_name: mf.formula,
          type: 'Formula',
          properties: { rawFormula: mf.formula }
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: mfId,
          type: 'contains_formula',
          weight: 0.9,
          confidence: 1.0
        });
      }

      // 1j. Tasks (- [ ] task, - [x] task)
      for (const t of (ast.tasks || [])) {
        const taskId = this.entityResolver.generateEntityId(`${filePath}:${t.taskText}`, 'Task');
        this.graphDb.upsertEntity({
          id: taskId,
          name: t.taskText,
          canonical_name: t.taskText,
          type: 'Task',
          properties: { completed: t.completed }
        });

        this.graphDb.upsertRelationship({
          source_id: rootEntityId,
          target_id: taskId,
          type: t.completed ? 'has_completed_task' : 'has_open_task',
          weight: 0.95,
          confidence: 1.0
        });
      }

      // 2. Cross-Note Plain Text Mention Mining
      if (this.graphDb?.db) {
        try {
          const otherNotes = this.graphDb.db.prepare("SELECT id, name, note_path FROM entities WHERE type = 'Note' AND id != ?").all(rootEntityId);
          for (const other of otherNotes) {
            if (other.name && other.name.length >= 3 && content.toLowerCase().includes(other.name.toLowerCase())) {
              this.graphDb.upsertRelationship({
                source_id: rootEntityId,
                target_id: other.id,
                type: 'mentions_note',
                weight: 0.85,
                confidence: 0.85
              });
            }
          }
        } catch { /* ignore fallback extraction errors */ }
      }

      // 3. Neural AI Pipeline (ModernBERT NER + RE)
      const extractor = this.getExtractor();
      if (extractor && typeof extractor.extractEntitiesAndRelations === 'function') {
        const aiResults = await extractor.extractEntitiesAndRelations(content, {
          confidenceThreshold: 0.60,
          evidenceStore: this.evidenceStore,
          sourceId: filePath
        });

        const createdEntities = new Map();

        // Save AI extracted entities
        for (const ent of aiResults.entities) {
          const resolved = this.entityResolver.resolveMention(ent.name, ent.type || 'Entity');
          if (resolved) {
            this.graphDb.upsertEntity({
              id: resolved.id,
              name: resolved.name,
              canonical_name: resolved.canonical_name,
              type: resolved.type,
              properties: ent.properties || {}
            });
            createdEntities.set(ent.name, resolved.id);

            // Connect root note to extracted entity
            this.graphDb.upsertRelationship({
              source_id: rootEntityId,
              target_id: resolved.id,
              type: 'mentions',
              weight: ent.confidence || 0.8,
              confidence: ent.confidence || 0.8,
              evidence_id: ent.evidenceId
            });
          }
        }

        // Save AI extracted relationships
        for (const rel of aiResults.relationships) {
          const srcId = createdEntities.get(rel.source_name) || this.entityResolver.generateEntityId(rel.source_name, rel.source_type);
          const tgtId = createdEntities.get(rel.target_name) || this.entityResolver.generateEntityId(rel.target_name, rel.target_type);

          if (srcId && tgtId && srcId !== tgtId) {
            this.graphDb.upsertRelationship({
              source_id: srcId,
              target_id: tgtId,
              type: rel.type || 'related_to',
              weight: rel.weight || 0.85,
              confidence: rel.confidence || 0.85,
              evidence_id: rel.evidenceId
            });
          }
        }
      }

      log.info(`Successfully processed note graph for: ${filePath}`);
    } catch (err) {
      log.error(`Failed to process note graph for ${filePath}:`, err);
      throw err;
    }
  }
}

module.exports = GraphService;
