const { randomUUID } = require('crypto');

class ConversationStore {
  /**
   * @param {import('./MemoryDB').MemoryDB} memoryDB
   * @param {import('./PersonaDB').PersonaDB} personaDB
   */
  constructor(memoryDB, personaDB) {
    this.memoryDB = memoryDB;
    this.personaDB = personaDB;
  }

  get db() { return this.memoryDB.db; }

  // --- Conversations --------------------------------------------

  listConversations() {
    return this.db.prepare(
      'SELECT id, title, persona, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
    ).all();
  }

  getConversation(id) {
    return this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) || null;
  }

  createConversation(title = 'New Chat', persona = 'default') {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO conversations (id, title, persona, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, title, persona, now, now);
    return this.getConversation(id);
  }

  setPersona(conversationId, personaId) {
    this.db.prepare('UPDATE conversations SET persona = ?, updated_at = ? WHERE id = ?')
      .run(personaId, new Date().toISOString(), conversationId);
  }

  deleteConversation(id) {
    // Messages cascade via FK
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  clearAll() {
    this.db.exec('DELETE FROM conversations');
  }

  // --- Messages ------------------------------------------------

  getMessages(conversationId) {
    const rows = this.db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversationId);
    return rows.map(r => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : null
    }));
  }

  addMessage(conversationId, role, content, metadata = null) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const metadataStr = metadata ? JSON.stringify(metadata) : null;
    this.db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, conversationId, role, content, metadataStr, now);
    // Touch parent conversation timestamp
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, conversationId);
    return { id, conversation_id: conversationId, role, content, metadata, created_at: now };
  }

  // --- Candidate Knowledge -------------------------------------

  listPendingKnowledge() {
    return this.db.prepare(
      "SELECT * FROM candidate_knowledge WHERE status = 'pending' ORDER BY extracted_at DESC"
    ).all();
  }

  approveKnowledge(id) {
    this.db.prepare("UPDATE candidate_knowledge SET status = 'approved' WHERE id = ?").run(id);
  }

  rejectKnowledge(id) {
    this.db.prepare("UPDATE candidate_knowledge SET status = 'rejected' WHERE id = ?").run(id);
  }

  addCandidateKnowledge(sourcePath, entity, relation, target) {
    const { randomUUID } = require('crypto');
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO candidate_knowledge (id, source_path, entity, relation, target, extracted_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, sourcePath, entity, relation, target, now, 'pending');
    return id;
  }

  // --- Persona delegation --------------------------------------

  listPersonas() {
    return this.personaDB.list();
  }

  getPersona(id) {
    return this.personaDB.get(id);
  }

  savePersona(persona) {
    return this.personaDB.save(persona);
  }

  deletePersona(id) {
    return this.personaDB.delete(id);
  }

  importPersonaFromFile(srcPath) {
    return this.personaDB.importFromFile(srcPath);
  }

  exportPersonaToFile(id, destPath) {
    return this.personaDB.exportToFile(id, destPath);
  }
}

module.exports = { ConversationStore };
