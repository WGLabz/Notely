const assert = require('assert');
const HashManager = require('../../ai/embeddings/HashManager');

describe('HashManager Tests', () => {
  it('should generate consistent SHA-256 hashes for strings', () => {
    const text = 'hello world';
    const hash1 = HashManager.calculateHash(text);
    const hash2 = HashManager.calculateHash(text);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  it('should detect differences between texts', () => {
    const hash1 = HashManager.calculateHash('apple');
    const hash2 = HashManager.calculateHash('orange');
    assert.notStrictEqual(hash1, hash2);
  });
});
