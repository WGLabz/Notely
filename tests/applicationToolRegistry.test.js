import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ApplicationToolRegistry } = require('../electron/tools/ApplicationToolRegistry.cjs');
const { NoteApplicationService } = require('../electron/services/NoteApplicationService.cjs');

describe('Application Tool Registry Architecture Tests', () => {
  let tmpDir;
  let registry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notely-tool-test-'));
    registry = new ApplicationToolRegistry();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should list and resolve registered tools', () => {
    const schemas = registry.toMcpSchemas();
    expect(schemas.length).toBeGreaterThan(0);
    
    const readTool = schemas.find(s => s.name === 'notes.read');
    expect(readTool).toBeDefined();
    expect(readTool.inputSchema).toBeDefined();
  });

  it('should safely execute notes.create and notes.read within workspace boundaries', async () => {
    const createRes = await registry.executeTool('notes.create', {
      title: 'Architecture Test Note',
      content: 'This is test content.'
    }, { workspaceRoot: tmpDir });

    expect(createRes.success).toBe(true);
    expect(createRes.data.created).toBe(true);
    expect(createRes.metadata.toolName).toBe('notes.create');

    const createdPath = createRes.data.path;
    expect(fs.existsSync(createdPath)).toBe(true);

    const readRes = await registry.executeTool('notes.read', {
      filePath: createdPath
    }, { workspaceRoot: tmpDir });

    expect(readRes.success).toBe(true);
    expect(readRes.data.content).toContain('This is test content.');
  });

  it('should reject path traversal attempts outside workspace root', async () => {
    const service = new NoteApplicationService();
    const maliciousPath = path.resolve(tmpDir, '../outside_secret.txt');

    await expect(service.readNote({
      workspaceRoot: tmpDir,
      filePath: maliciousPath
    })).rejects.toThrow(/Path traversal rejected/);
  });

  it('should throw error for deferred notes.update and notes.delete capabilities', async () => {
    const service = new NoteApplicationService();
    await expect(service.updateNote()).rejects.toThrow(/deferred/);
    await expect(service.deleteNote()).rejects.toThrow(/deferred/);
  });

  it('should calculate workspace statistics cleanly', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test1.md'), '# Test\n- [ ] Task 1\n[[Link1]]', 'utf8');

    const statsRes = await registry.executeTool('workspace.statistics', {}, { workspaceRoot: tmpDir });
    expect(statsRes.success).toBe(true);
    expect(statsRes.data.noteCount).toBe(1);
    expect(statsRes.data.taskCount).toBe(1);
    expect(statsRes.data.linkCount).toBe(1);
  });

  it('should search notes cleanly without exposing storage internals', async () => {
    fs.writeFileSync(path.join(tmpDir, 'search_target.md'), '# Secret Topic\nUnique keyword antigravity.', 'utf8');

    const searchRes = await registry.executeTool('search.notes', { query: 'antigravity' }, { workspaceRoot: tmpDir });
    expect(searchRes.success).toBe(true);
    expect(searchRes.data.length).toBe(1);
    expect(searchRes.data[0].title).toBe('search_target.md');
  });
});
