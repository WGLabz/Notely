const assert = require('assert');
const path = require('path');
const fs = require('fs');
const WorkspaceBrain = require('../../ai/core/WorkspaceBrain');
const ReasoningBrain = require('../../ai/core/ReasoningBrain');
const ActionBrain = require('../../ai/core/ActionBrain');

describe('3-Brain Architecture Subsystem Tests (Phase 1)', () => {
  let tempDir;

  beforeAll(() => {
    tempDir = path.join(__dirname, `temp-brain-test-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore Windows file lock
      }
    }
  });

  it('WorkspaceBrain should collect active note facts cleanly', async () => {
    const noteFile = path.join(tempDir, 'active.md');
    fs.writeFileSync(noteFile, '# Workspace Architecture\nDetails here.', 'utf8');

    const mockAgent = {
      workspaceRoot: tempDir,
      documentService: {
        getDocumentContent: () => '# Workspace Architecture\nDetails here.'
      }
    };

    const brain = new WorkspaceBrain(mockAgent);
    const facts = await brain.getWorkspaceFacts('architecture', { activeNotePath: noteFile });

    assert.ok(facts.activeNote);
    assert.strictEqual(facts.activeNote.path, noteFile);
    assert.ok(facts.activeNote.content.includes('Workspace Architecture'));
  });

  it('ReasoningBrain should format evidence context without throwing', () => {
    const mockRegistry = { getActiveProvider: () => null };
    const brain = new ReasoningBrain(mockRegistry);

    const formatted = brain.formatEvidenceContext({
      activeNote: { path: 'test.md', content: 'Sample text' },
      semanticResults: [{ filePath: 'note1.md', snippet: 'Result 1' }],
      graphRelations: [{ source: 'Auth', target: 'JWT', type: 'uses' }]
    });

    assert.ok(formatted.includes('ACTIVE NOTE'));
    assert.ok(formatted.includes('RELEVANT WORKSPACE CHUNKS'));
    assert.ok(formatted.includes('KNOWLEDGE GRAPH RELATIONS'));
  });

  it('ActionBrain should block update/delete/move actions and prevent overwriting existing notes', () => {
    const mockAgent = { workspaceRoot: tempDir };
    const brain = new ActionBrain(mockAgent);

    // 1. Forbidden actions must be blocked
    const updateCheck = brain.validateAction('update_note', { file_path: 'test.md' });
    assert.strictEqual(updateCheck.allowed, false);
    assert.ok(updateCheck.reason.includes('strictly prohibited'));

    const moveCheck = brain.validateAction('move_note', { sourcePath: 'a.md', targetPath: 'b.md' });
    assert.strictEqual(moveCheck.allowed, false);

    const deleteCheck = brain.validateAction('delete_note', { file_path: 'a.md' });
    assert.strictEqual(deleteCheck.allowed, false);

    // 2. Creating a new note file is allowed
    const createNewCheck = brain.validateAction('create_note', { title: 'Brand New Note' });
    assert.strictEqual(createNewCheck.allowed, true);

    // 3. Creating a note file that already exists MUST be blocked
    const existingFile = path.join(tempDir, 'Existing Note.md');
    fs.writeFileSync(existingFile, 'Existing content', 'utf8');

    const createExistingCheck = brain.validateAction('create_note', { title: 'Existing Note' });
    assert.strictEqual(createExistingCheck.allowed, false);
    assert.ok(createExistingCheck.reason.includes('already exists'));
  });
});
