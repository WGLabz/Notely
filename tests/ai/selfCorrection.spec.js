const assert = require('assert');
const path = require('path');
const fs = require('fs');
const SelfCorrectionEngine = require('../../ai/core/SelfCorrectionEngine');

describe('SelfCorrectionEngine ReAct Response Validation Tests', () => {
  let tempDir;

  beforeAll(() => {
    tempDir = path.join(__dirname, `temp-self-correct-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('should strip technical tool narration jargon automatically', () => {
    const rawText = 'I executed the following tools: search_notes. Based on your notes, here is the result.';
    const res = SelfCorrectionEngine.validateAndCorrect(rawText, { query: 'test' });

    assert.strictEqual(res.corrected, true);
    assert.ok(!res.validatedText.includes('I executed the following tools:'));
    assert.ok(res.validatedText.includes('Based on your notes'));
  });

  it('should convert broken note file links to plain text labels', () => {
    const validFile = path.join(tempDir, 'exists.md');
    fs.writeFileSync(validFile, 'content', 'utf8');

    const rawText = `Check [exists.md](file:///${validFile.replace(/\\/g, '/')}) and [fake.md](file:///C:/fake/path/fake.md).`;
    const res = SelfCorrectionEngine.validateAndCorrect(rawText, { query: 'test' });

    assert.strictEqual(res.corrected, true);
    assert.ok(res.validatedText.includes('[exists.md]('));
    assert.ok(!res.validatedText.includes('[fake.md](')); // broken link target stripped
    assert.ok(res.validatedText.includes('fake.md')); // plain label kept
  });
});
