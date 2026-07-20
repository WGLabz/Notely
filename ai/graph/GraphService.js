/**
 * GraphService - Extract structured knowledge graphs from note contents using LLM
 */

const { createLogger } = require('../core/logger');

const log = createLogger('GraphService');

class GraphService {
  constructor(agent, graphDb) {
    this.agent = agent;
    this.graphDb = graphDb;
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

      const systemPrompt = `You are an AI assistant designed to extract knowledge graphs from markdown text.
Extract all relevant entities (e.g., 'Person', 'Project', 'Technology', 'Company', 'Concept', 'Task') and relationships (e.g., 'REFERENCES', 'USES', 'DEPENDS_ON', 'MENTIONS', 'RELATED_TO') from the provided note text.

Return ONLY a valid JSON object matching the following structure (no markdown wrapper, no other text):
{
  "entities": [
    { "id": "entity-unique-id", "type": "Person|Project|Technology|Company|Concept|Task", "name": "Entity Name", "properties": {} }
  ],
  "relationships": [
    { "source_id": "source-id", "target_id": "target-id", "type": "REFERENCES|USES|DEPENDS_ON|MENTIONS|RELATED_TO", "weight": 1.0, "metadata": {} }
  ]
}

Important rules:
1. Normalize all entity IDs to lower-case alphanumeric with hyphens (e.g., "llama-3-3", "john-doe").
2. The note itself is always an entity of type "Note" (the ID is the normalized note path slug: "${noteId}"). Make sure to link other extracted entities back to this Note entity using MENTIONS, REFERENCES, etc.
3. Keep the JSON output clean, valid, and compact.`;

      const prompt = `Extract entities and relationships from this note.
Note Path: ${filePath}
Note Contents:
---
${content}
---`;

      let parsedData = { entities: [], relationships: [] };
      try {
        const llm = this.agent.llmRegistry.getActiveProvider();
        // Call LLM
        const { text: resultText } = await llm.generateText(prompt, { systemPrompt, temperature: 0.1 });
        // Clean and parse JSON
        const cleanedJson = this._cleanJsonResponse(resultText);
        parsedData = JSON.parse(cleanedJson);
      } catch (llmErr) {
        log.warn(`LLM graph extraction failed for ${filePath}, falling back to local regex:`, llmErr.message);
      }

      // Local tag and wikilink regex extraction
      const extractedEntities = [];
      const extractedRels = [];

      // 1. Extract Wikilinks: [[Target Note]]
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

      // 2. Extract Tags: #tag
      const tagRegex = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;
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

      if (!parsedData.entities) parsedData.entities = [];
      parsedData.entities.push(...extractedEntities);

      if (!parsedData.relationships) parsedData.relationships = [];
      parsedData.relationships.push(...extractedRels);

      // Clear existing outgoing relationships for this note to prevent stale accumulation
      this.graphDb.db.prepare('DELETE FROM relationships WHERE source_id = ?').run(noteId);

      // Save note entity first
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

  /**
   * Helper to clean markdown JSON wrappers from the response
   */
  _cleanJsonResponse(text) {
    const raw = String(text || '').trim();
    const match = raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    return match ? match[1].trim() : raw;
  }
}

module.exports = GraphService;
