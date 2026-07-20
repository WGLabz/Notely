const fs = require('fs');
const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('PersonaDB');

// Built-in persona definitions with custom avatar metadata (emoji/icon shorthand)
const BUILTIN_PERSONAS = [
  {
    id: 'default',
    name: 'Default Assistant',
    description: 'Balanced general-purpose assistant.',
    type: 'builtin',
    version: '1.0',
    avatar: '💬',
    prompt: 'You are a helpful assistant integrated into Notely, a markdown note-taking app. Answer clearly and concisely, referencing workspace content when relevant.'
  },
  {
    id: 'creative',
    name: 'Creative Writer',
    description: 'Narrative-focused, metaphor-rich brainstorming assistant.',
    type: 'builtin',
    version: '1.0',
    avatar: '🎨',
    prompt: 'You are a creative writing assistant in Notely. Help the user explore ideas with vivid language, compelling metaphors, narrative flow, and imaginative brainstorming. Embrace unconventional angles.'
  },
  {
    id: 'technical',
    name: 'Technical Analyst',
    description: 'Strict, logic-driven assistant for code and structured analysis.',
    type: 'builtin',
    version: '1.0',
    avatar: '🔬',
    prompt: 'You are a technical analyst assistant in Notely. Respond with precision and structure. Use code blocks, markdown tables, and strict logical reasoning. Avoid informal language. Validate assumptions explicitly.'
  },
  {
    id: 'researcher',
    name: 'Academic Researcher',
    description: 'Cites workspace sources and provides factual, structured analysis.',
    type: 'builtin',
    version: '1.0',
    avatar: '🎓',
    prompt: 'You are an academic research assistant in Notely. Cite workspace notes when answering. Prioritize factual accuracy, logical outlines, and structured responses. Flag uncertainty explicitly.'
  }
];

const REQUIRED_FIELDS = ['name', 'description', 'type', 'version'];

class PersonaDB {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
    this.personasDir = path.join(appDataDir, 'personas');
    this.dbPath = path.join(appDataDir, 'personas.db');
    this.db = null;
  }

  initialize() {
    try {
      if (!fs.existsSync(this.appDataDir)) {
        fs.mkdirSync(this.appDataDir, { recursive: true });
      }
      if (!fs.existsSync(this.personasDir)) {
        fs.mkdirSync(this.personasDir, { recursive: true });
      }

      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(this.dbPath);

      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');

      this._createTables();
      this._seedBuiltins();
      log.info(`PersonaDB initialized at: ${this.dbPath}`);
      return true;
    } catch (err) {
      log.error('Failed to initialize PersonaDB', err);
      throw err;
    }
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        file_path TEXT,
        type TEXT NOT NULL DEFAULT 'custom',
        version TEXT,
        avatar TEXT DEFAULT '👤',
        prompt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    
    // Migration: Add avatar column if it does not exist (older databases)
    try {
      this.db.exec("ALTER TABLE personas ADD COLUMN avatar TEXT DEFAULT '👤'");
    } catch {
      // Column already exists, ignore error
    }
  }

  _seedBuiltins() {
    const now = new Date().toISOString();
    // Use INSERT OR REPLACE for seeding built-ins so they get the avatar updates
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO personas (id, name, description, file_path, type, version, avatar, prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of BUILTIN_PERSONAS) {
      insert.run(p.id, p.name, p.description, null, p.type, p.version, p.avatar, p.prompt, now, now);
    }
  }

  list() {
    return this.db.prepare('SELECT * FROM personas ORDER BY type DESC, name ASC').all();
  }

  get(id) {
    return this.db.prepare('SELECT * FROM personas WHERE id = ?').get(id) || null;
  }

  save(persona) {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO personas (id, name, description, file_path, type, version, avatar, prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, description=excluded.description, file_path=excluded.file_path,
         type=excluded.type, version=excluded.version, avatar=excluded.avatar, prompt=excluded.prompt, updated_at=excluded.updated_at`
    ).run(
      persona.id, persona.name, persona.description ?? '', persona.file_path ?? null,
      persona.type ?? 'custom', persona.version ?? '1.0', persona.avatar ?? '👤', persona.prompt, now, now
    );
  }

  delete(id) {
    const row = this.get(id);
    if (row && row.type === 'builtin') throw new Error('Cannot delete built-in personas.');
    this.db.prepare('DELETE FROM personas WHERE id = ?').run(id);
    if (row && row.file_path && fs.existsSync(row.file_path)) {
      fs.unlinkSync(row.file_path);
    }
  }

  static parsePersonaFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.startsWith('---')) {
      throw new Error('Invalid persona file: must begin with YAML frontmatter (---).');
    }

    const endFM = raw.indexOf('\n---', 3);
    if (endFM === -1) {
      throw new Error('Invalid persona file: frontmatter closing (---) not found.');
    }

    const fmText = raw.slice(3, endFM).trim();
    const prompt = raw.slice(endFM + 4).trim();

    if (!prompt) {
      throw new Error('Invalid persona file: system prompt body is empty after frontmatter.');
    }

    const meta = {};
    for (const line of fmText.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      meta[key] = val;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!meta[field]) {
        throw new Error(`Invalid persona file: missing required frontmatter field "${field}".`);
      }
    }

    return { meta, prompt };
  }

  importFromFile(srcPath) {
    try {
      const { meta, prompt } = PersonaDB.parsePersonaFile(srcPath);

      const id = meta.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const destPath = path.join(this.personasDir, `${id}.md`);
      if (srcPath !== destPath) {
        fs.copyFileSync(srcPath, destPath);
      }

      this.save({
        id,
        name: meta.name,
        description: meta.description,
        file_path: destPath,
        type: 'custom',
        version: meta.version,
        avatar: meta.avatar || '👤',
        prompt
      });

      return { id, name: meta.name };
    } catch (err) {
      log.error(`Failed to import persona from file: ${srcPath}`, err);
      // Return a placeholder representation
      return { id: 'invalid', name: 'Invalid Persona File' };
    }
  }

  exportToFile(id, destPath) {
    const row = this.get(id);
    if (!row) throw new Error(`Persona "${id}" not found.`);

    const content = [
      '---',
      `name: "${row.name}"`,
      `description: "${row.description}"`,
      `type: "${row.type}"`,
      `version: "${row.version}"`,
      `avatar: "${row.avatar || '👤'}"`,
      '---',
      '',
      row.prompt
    ].join('\n');

    fs.writeFileSync(destPath, content, 'utf8');
    return destPath;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = { PersonaDB };
