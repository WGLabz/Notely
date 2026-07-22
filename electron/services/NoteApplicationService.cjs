/**
 * NoteApplicationService.cjs
 * Application service for Note capabilities consumed by the Tool Layer.
 * Enforces workspace boundary security and business validation.
 */

const fs = require('fs');
const path = require('path');

function assertPathInWorkspace(targetPath, workspaceRoot) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('Workspace root is required.');
  }
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Target path is required.');
  }
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(resolvedRoot, targetPath);

  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path traversal rejected: target path is outside workspace root.');
  }
  return resolvedTarget;
}

function collectMarkdownFiles(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) return fileList;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(fullPath, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

class NoteApplicationService {
  /**
   * Read note content with pagination and workspace security validation.
   */
  async readNote(args = {}) {
    const { workspaceRoot } = args;
    const targetFile = args.filePath || args.file_path;
    const startLine = Number(args.startLine || args.start_line || 1);
    let maxLines = Number(args.maxLines || args.max_lines || 500);

    if (args.endLine || args.end_line) {
      const endLine = Number(args.endLine || args.end_line);
      maxLines = Math.max(1, endLine - startLine + 1);
    }

    const validPath = assertPathInWorkspace(targetFile, workspaceRoot);
    if (!fs.existsSync(validPath)) {
      throw new Error(`Note file at path "${targetFile}" does not exist.`);
    }

    const content = fs.readFileSync(validPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = startIdx + Math.min(maxLines, 10000);
    const slicedContent = lines.slice(startIdx, endIdx).join('\n');
    let finalContent = slicedContent;
    let isTruncated = endIdx < totalLines;

    if (finalContent.length > 10000) {
      finalContent = finalContent.slice(0, 10000) + '\n\n... [Content truncated due to size. Use start_line and max_lines parameters to read further.]';
      isTruncated = true;
    }

    return {
      path: validPath,
      content: finalContent,
      startLine: startIdx + 1,
      linesRead: Math.min(endIdx - startIdx, totalLines - startIdx),
      totalLines,
      truncated: isTruncated
    };
  }

  /**
   * Create a new note safely inside the workspace.
   */
  async createNote({ workspaceRoot, title, content = '', folder = '' }) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Note title is required.');
    }
    const cleanTitle = title.trim();
    let normalizedFolder = folder ? folder.trim() : '';
    if (
      normalizedFolder.toLowerCase() === 'root'
      || normalizedFolder === '/'
      || normalizedFolder === '.'
      || normalizedFolder === './'
    ) {
      normalizedFolder = '';
    }
    const targetFolder = normalizedFolder ? assertPathInWorkspace(normalizedFolder, workspaceRoot) : path.resolve(workspaceRoot);
    
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const safeBaseName = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
    let fileName = `${safeBaseName}.md`;
    let filePath = path.join(targetFolder, fileName);
    let counter = 2;

    while (fs.existsSync(filePath)) {
      fileName = `${safeBaseName}-${counter}.md`;
      filePath = path.join(targetFolder, fileName);
      counter += 1;
    }

    const fileContent = content.startsWith('# ') ? content : `# ${cleanTitle}\n\n${content}`;
    fs.writeFileSync(filePath, fileContent, 'utf8');

    return {
      path: filePath,
      title: cleanTitle,
      created: true
    };
  }

  /**
   * Move or rename a note inside the workspace.
   */
  async moveNote({ workspaceRoot, sourcePath, targetPath }) {
    const validSource = assertPathInWorkspace(sourcePath, workspaceRoot);
    const validTarget = assertPathInWorkspace(targetPath, workspaceRoot);

    if (!fs.existsSync(validSource)) {
      throw new Error(`Source file "${sourcePath}" does not exist.`);
    }

    const targetDir = path.dirname(validTarget);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.renameSync(validSource, validTarget);
    return {
      previousPath: validSource,
      newPath: validTarget,
      moved: true
    };
  }

  /**
   * Extract checklist tasks across notes in the workspace.
   */
  async extractTasks({ workspaceRoot, notePath, status = 'all' }) {
    const files = notePath
      ? [assertPathInWorkspace(notePath, workspaceRoot)]
      : collectMarkdownFiles(workspaceRoot);

    const tasks = [];
    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      try {
        const text = fs.readFileSync(filePath, 'utf8');
        const lines = text.split(/\r?\n/);
        lines.forEach((line, index) => {
          const match = line.match(/^\s*[-*+]?\s*\[([ xX/])\]\s+(.+)$/);
          if (match) {
            const symbol = match[1].toLowerCase();
            const taskText = match[2].trim();
            const isCompleted = symbol === 'x';
            const isOpen = symbol === ' ' || symbol === '/';

            if (status === 'open' && !isOpen) return;
            if (status === 'completed' && !isCompleted) return;

            tasks.push({
              note: path.basename(filePath),
              path: filePath,
              line: index + 1,
              text: taskText,
              status: isCompleted ? 'completed' : symbol === '/' ? 'in-progress' : 'open'
            });
          }
        });
      } catch {
        // skip unreadable
      }
    }
    return tasks.slice(0, 100);
  }

  /**
   * Note updates deferred until system maturity.
   */
  async updateNote() {
    throw new Error('notes.update capability is deferred until system maturity.');
  }

  /**
   * Note deletions deferred until system maturity.
   */
  async deleteNote() {
    throw new Error('notes.delete capability is deferred until system maturity.');
  }
}

module.exports = {
  NoteApplicationService,
  assertPathInWorkspace,
  collectMarkdownFiles
};
