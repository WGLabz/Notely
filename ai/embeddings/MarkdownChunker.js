/**
 * MarkdownChunker - Splitting markdown logically by headers, code blocks, lists, and paragraphs
 */

class MarkdownChunker {
  /**
   * Split note content into chunks
   * @param {string} content - Markdown text
   * @param {string} notePath - Note file path
   * @param {object} options
   */
  static chunk(content, notePath, options = {}) {
    const maxChunkSize = options.maxChunkSize || 800; // character length threshold
    const minChunkSize = options.minChunkSize !== undefined ? options.minChunkSize : 30;
    
    if (!content || !content.trim()) return [];

    const lines = content.split(/\r?\n/);
    const chunks = [];
    let currentChunkLines = [];
    let currentLength = 0;
    let startLine = 1;
    let chunkIndex = 0;
    let currentType = 'paragraph';

    const flushChunk = (endLine) => {
      if (currentChunkLines.length === 0) return;
      
      const chunkText = currentChunkLines.join('\n').trim();
      if (chunkText.length >= minChunkSize) {
        const basename = String(notePath).split(/[/\\]/).pop().replace(/\.md$/, '');
        const id = `${basename}#chunk-${chunkIndex}`;

        chunks.push({
          id,
          note_path: notePath,
          chunk_index: chunkIndex,
          content: chunkText,
          chunk_type: currentType,
          start_line: startLine,
          end_line: endLine,
          content_hash: '' // to be populated by caller / HashManager
        });
        chunkIndex++;
      }
      currentChunkLines = [];
      currentLength = 0;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const isHeader = line.startsWith('#');
      const isCodeFence = line.trim().startsWith('```');
      const isListItem = /^\s*[-*+•]/.test(line) || /^\s*\d+\./.test(line);

      // Handle structural boundaries
      if (isHeader) {
        // Flush previous chunk
        flushChunk(lineNum - 1);
        startLine = lineNum;
        currentType = 'heading';
        currentChunkLines.push(line);
        currentLength += line.length;
        // Flush header as its own chunk
        flushChunk(lineNum);
        startLine = lineNum + 1;
        currentType = 'paragraph';
        continue;
      }

      if (isCodeFence) {
        if (currentType === 'code') {
          // Closing code fence
          currentChunkLines.push(line);
          flushChunk(lineNum);
          startLine = lineNum + 1;
          currentType = 'paragraph';
        } else {
          // Opening code fence
          flushChunk(lineNum - 1);
          startLine = lineNum;
          currentType = 'code';
          currentChunkLines.push(line);
          currentLength += line.length;
        }
        continue;
      }

      if (currentType !== 'code') {
        if (isListItem) {
          if (currentType !== 'list') {
            flushChunk(lineNum - 1);
            startLine = lineNum;
            currentType = 'list';
          }
        } else if (line.trim() === '') {
          // Paragraph breaks on empty lines
          flushChunk(lineNum - 1);
          startLine = lineNum + 1;
          currentType = 'paragraph';
          continue;
        } else if (currentType === 'list') {
          // End of list, transitioning to paragraph
          flushChunk(lineNum - 1);
          startLine = lineNum;
          currentType = 'paragraph';
        }
      }

      // Append line
      currentChunkLines.push(line);
      currentLength += line.length;

      // Threshold check for standard blocks
      if (currentLength >= maxChunkSize && currentType !== 'code') {
        flushChunk(lineNum);
        startLine = lineNum + 1;
      }
    }

    // Flush remainder
    flushChunk(lines.length);

    return chunks;
  }
}

module.exports = MarkdownChunker;
