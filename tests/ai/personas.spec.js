const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PersonaDB } = require('../../ai/memory/PersonaDB');

describe('PersonaDB Frontmatter and Importing Tests', () => {
  let tempDir;
  let personaDB;

  beforeAll(() => {
    tempDir = path.join(__dirname, 'temp-persona-test');
    personaDB = new PersonaDB(tempDir);
    personaDB.initialize();
  });

  afterAll(() => {
    personaDB.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should seed default built-ins', () => {
    const list = personaDB.list();
    assert.ok(list.length >= 4);
    const def = list.find(p => p.id === 'default');
    assert.strictEqual(def.name, 'Default Assistant');
  });

  it('should strictly parse valid persona markdown files', () => {
    const mdFile = path.join(tempDir, 'valid.md');
    fs.writeFileSync(mdFile, [
      '---',
      'name: Custom Persona',
      'description: Custom Desc',
      'type: custom',
      'version: 1.2',
      '---',
      'You are custom custom.'
    ].join('\n'), 'utf8');

    const parsed = PersonaDB.parsePersonaFile(mdFile);
    assert.strictEqual(parsed.meta.name, 'Custom Persona');
    assert.strictEqual(parsed.prompt, 'You are custom custom.');
  });

  it('should reject frontmatter missing required fields', () => {
    const mdFile = path.join(tempDir, 'invalid.md');
    fs.writeFileSync(mdFile, [
      '---',
      'name: Bad Persona',
      'type: custom',
      '---',
      'You are bad.'
    ].join('\n'), 'utf8');

    assert.throws(() => {
      PersonaDB.parsePersonaFile(mdFile);
    }, /missing required frontmatter field/);
  });
});

