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
    const def = list.find(p => p.id === 'general');
    assert.strictEqual(def.name, 'General Assistant');
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

  it('should sync custom persona changes to disk on save', () => {
    const customP = {
      id: 'my-custom-test-persona',
      name: 'Custom Test Persona',
      description: 'Test Desc',
      prompt: 'This is the prompt content.',
      type: 'custom',
      avatar: '🕵️',
      version: '1.0'
    };

    personaDB.save(customP);

    const saved = personaDB.get(customP.id);
    assert.strictEqual(saved.name, 'Custom Test Persona');
    assert.ok(saved.file_path);
    assert.ok(fs.existsSync(saved.file_path));

    const fileContent = fs.readFileSync(saved.file_path, 'utf8');
    assert.ok(fileContent.includes('name: "Custom Test Persona"'));
    assert.ok(fileContent.includes('This is the prompt content.'));
  });

  it('should throw an error when attempting to modify a builtin persona', () => {
    const builtinP = {
      id: 'general',
      name: 'Hacked Persona',
      description: 'Hacked Desc',
      prompt: 'Hacked prompt.',
      type: 'builtin',
      avatar: '👻',
      version: '1.0'
    };

    assert.throws(() => {
      personaDB.save(builtinP);
    }, /Cannot modify system default personas/);
  });
});

