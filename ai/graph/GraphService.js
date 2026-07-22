/**
 * GraphService - Extract structured knowledge graphs from note contents using ModernBERT / local pipeline
 */

const { createLogger } = require('../core/logger');
const ModernBERTExtractor = require('./ModernBERTExtractor');

const log = createLogger('GraphService');

class GraphService {
  constructor(agent, graphDb) {
    this.agent = agent;
    this.graphDb = graphDb;
    this.modernbertExtractor = null;
  }

  getExtractor() {
    if (!this.modernbertExtractor && this.agent?.appDataDir) {
      this.modernbertExtractor = new ModernBERTExtractor(this.agent.appDataDir);
    }
    return this.modernbertExtractor;
  }

  /**
   * Extract entities and relationships from a note and save them to GraphDB
   */
  async processNote(filePath, content) {
    try {
      if (!this.graphDb.isInitialized) {
        this.graphDb.initialize();
      }

      const path = require('path');
      const noteName = path.basename(filePath, '.md');
      const noteId = noteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      log.info(`Extracting entities and relationships for: ${filePath}`);

      let parsedData = { entities: [], relationships: [] };

      const extractor = this.getExtractor();

      try {
        if (extractor && extractor.isAvailable()) {
          log.info('Running ModernBERT ONNX local graph extraction...');
          parsedData = await extractor.extractEntitiesAndRelations(content);
        } else if (this.agent?.graphProvider?.isReady()) {
          log.info('Running local ONNX provider graph extraction...');
          parsedData = await this.agent.graphProvider.extractGraph(content, filePath);
        } else if (this.agent?.llmRegistry?.getActiveProvider()) {
          const llm = this.agent.llmRegistry.getActiveProvider();
          const systemPrompt = `Extract entities (Person, Project, Technology, Company, Concept, Task) and relationships (REFERENCES, USES, DEPENDS_ON, MENTIONS, RELATED_TO) from markdown.
Return ONLY valid JSON matching {"entities":[{"id":"slug","type":"Type","name":"Name"}],"relationships":[{"source_id":"src","target_id":"tgt","type":"RELATION"}]}`;
          const prompt = `Note Path: ${filePath}\nContents:\n${content}`;
          const { text: resultText } = await llm.generateText(prompt, { systemPrompt, temperature: 0.1 });
          const cleanedJson = this._cleanJsonResponse(resultText);
          parsedData = JSON.parse(cleanedJson);
        }
      } catch (extractorErr) {
        log.warn(`Model graph extraction failed for ${filePath}, falling back to structural parser:`, extractorErr.message);
      }

      // Explicit Structural Markdown Parser
      const extractedEntities = [];
      const extractedRels = [];

      // 1. Wikilinks: [[Target Note]]
      const wikilinkRegex = /\[\[(.*?)\]\]/g;
      let match;
      while ((match = wikilinkRegex.exec(content)) !== null) {
        const targetName = match[1].trim();
        if (targetName) {
          const targetId = targetName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          extractedEntities.push({
            id: targetId,
            type: 'Note',
            name: targetName
          });
          extractedRels.push({
            source_id: noteId,
            target_id: targetId,
            type: 'links_to',
            weight: 1.0
          });
        }
      }

      // 2. Tags: #tag
      const tagRegex = /(?:^|\s)#([a-zA-Z_-]*[a-zA-Z][a-zA-Z0-9_-]*)/g;
      while ((match = tagRegex.exec(content)) !== null) {
        const tagName = match[1].trim();
        if (tagName) {
          const tagId = `tag-${tagName.toLowerCase()}`;
          extractedEntities.push({
            id: tagId,
            type: 'Tag',
            name: `#${tagName}`
          });
          extractedRels.push({
            source_id: noteId,
            target_id: tagId,
            type: 'tagged',
            weight: 1.0
          });
        }
      }

      // 3. Images: ![alt](image_path)
      const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
      while ((match = imageRegex.exec(content)) !== null) {
        const altText = match[1].trim() || 'Image';
        const imgPath = match[2].trim();
        if (imgPath && !imgPath.startsWith('http://') && !imgPath.startsWith('https://')) {
          const imgName = imgPath.split(/[\\/]/).pop();
          const imgId = `media-img-${imgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          extractedEntities.push({
            id: imgId,
            type: 'Image',
            name: imgName,
            properties: { alt: altText, path: imgPath }
          });
          extractedRels.push({
            source_id: noteId,
            target_id: imgId,
            type: 'contains_media',
            weight: 1.0
          });
        }
      }

      // 4. Attachments & External URLs: [label](path_or_url)
      const linkRegex = /(?<![[![])\[(.*?)\]\((.*?)\)/g;
      while ((match = linkRegex.exec(content)) !== null) {
        const label = match[1].trim();
        const href = match[2].trim();
        if (href.startsWith('http://') || href.startsWith('https://')) {
          const urlId = `ext-url-${href.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          extractedEntities.push({
            id: urlId,
            type: 'ExternalURL',
            name: label || href,
            properties: { url: href }
          });
          extractedRels.push({
            source_id: noteId,
            target_id: urlId,
            type: 'references_url',
            weight: 1.0
          });
        } else if (href.match(/\.(pdf|docx|xlsx|pptx|txt|csv|zip|png|jpg|jpeg|svg)$/i)) {
          const docName = href.split(/[\\/]/).pop();
          const docId = `doc-${docName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          extractedEntities.push({
            id: docId,
            type: 'Document',
            name: docName,
            properties: { label, path: href }
          });
          extractedRels.push({
            source_id: noteId,
            target_id: docId,
            type: 'attaches_file',
            weight: 1.0
          });
        }
      }

      // 5. Code Blocks: ```lang
      const codeBlockRegex = /```([a-zA-Z0-9_+-]+)/g;
      while ((match = codeBlockRegex.exec(content)) !== null) {
        const lang = match[1].trim().toLowerCase();
        if (lang && lang.length < 20) {
          const langId = `tech-lang-${lang}`;
          extractedEntities.push({
            id: langId,
            type: 'Technology',
            name: lang.toUpperCase()
          });
          extractedRels.push({
            source_id: noteId,
            target_id: langId,
            type: 'contains_code',
            weight: 1.0
          });
        }
      }

      if (!parsedData.entities) parsedData.entities = [];
      parsedData.entities.push(...extractedEntities);

      if (!parsedData.relationships) parsedData.relationships = [];
      parsedData.relationships.push(...extractedRels);

      // Clear existing outgoing relationships for this note to prevent stale accumulation
      if (this.graphDb.db) {
        this.graphDb.db.prepare('DELETE FROM relationships WHERE source_id = ?').run(noteId);
      }

      // Save root note entity
      this.graphDb.upsertEntity({
        id: noteId,
        type: 'Note',
        name: noteName,
        note_path: filePath,
        properties: { size: content.length }
      });

      // Upsert all extracted entities
      if (parsedData.entities && Array.isArray(parsedData.entities)) {
        for (const entity of parsedData.entities) {
          if (!entity.id || !entity.type || !entity.name) continue;
          
          this.graphDb.upsertEntity({
            id: entity.id,
            type: entity.type,
            name: entity.name,
            properties: entity.properties || {}
          });
        }
      }

      // Upsert all relationships
      if (parsedData.relationships && Array.isArray(parsedData.relationships)) {
        for (const rel of parsedData.relationships) {
          if (!rel.source_id || !rel.target_id || !rel.type) continue;
          
          this.graphDb.upsertRelationship({
            source_id: rel.source_id,
            target_id: rel.target_id,
            type: rel.type,
            weight: Number(rel.weight) || 1.0,
            metadata: rel.metadata || {}
          });
        }
      }

      log.info(`Finished processing graph for: ${filePath}. Extracted ${parsedData.entities?.length || 0} nodes.`);
      return true;
    } catch (err) {
      log.error(`Failed to process graph for note ${filePath}:`, err.message);
      return false;
    }
  }

  _cleanJsonResponse(text) {
    const raw = String(text || '').trim();
    const match = raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    return match ? match[1].trim() : raw;
  }
}

module.exports = GraphService;
