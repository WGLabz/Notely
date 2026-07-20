const assert = require('assert');
const MarkdownChunker = require('../../ai/embeddings/MarkdownChunker');

describe('MarkdownChunker Tests', () => {
  it('should split markdown by headings logically', () => {
    const markdown = `# Header 1\nThis is paragraph 1.\n## Header 2\nThis is paragraph 2.\n- Item 1\n- Item 2`;
    const chunks = MarkdownChunker.chunk(markdown, 'notes/test-note.md', { minChunkSize: 0 });

    assert.ok(chunks.length >= 3);
    assert.strictEqual(chunks[0].chunk_type, 'heading');
    assert.ok(chunks[0].content.includes('Header 1'));
    assert.strictEqual(chunks[2].chunk_type, 'heading');
    assert.ok(chunks[2].content.includes('Header 2'));
  });

  it('should handle empty markdown documents', () => {
    const chunks = MarkdownChunker.chunk('', 'notes/test-note.md');
    assert.strictEqual(chunks.length, 0);
  });

  it('should generate valid chunk IDs based on filename', () => {
    const markdown = `Some random paragraph containing enough characters to reach minimum chunk size.`;
    const chunks = MarkdownChunker.chunk(markdown, 'notes/complex-filename.md');
    assert.ok(chunks.length > 0);
    assert.ok(chunks[0].id.startsWith('complex-filename#chunk-'));
  });
});
