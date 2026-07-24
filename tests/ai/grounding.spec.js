const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { PersonaStandard } = require('../../ai/personas/PersonaStandard');
const PromptLibrary = require('../../ai/core/PromptLibrary');
const GroundingEngine = require('../../ai/core/GroundingEngine');

describe('PersonaStandard, PromptLibrary & GroundingEngine Tests (Phases 4 & 5)', () => {
  let tempDir;

  beforeAll(() => {
    tempDir = path.join(__dirname, `temp-grounding-test-${Date.now()}`);
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

  it('PersonaStandard should validate persona definitions', () => {
    const valid = PersonaStandard.validate({
      id: 'custom',
      name: 'Custom',
      tone: 'friendly',
      systemInstructions: 'Help user'
    });
    assert.strictEqual(valid, true);

    const invalid = PersonaStandard.validate({ id: 'bad' });
    assert.strictEqual(invalid, false);
  });

  it('PromptLibrary should compose system prompts cleanly', () => {
    const prompt = PromptLibrary.composeSystemPrompt('Act as Architect', 'Workspace: /test');
    assert.ok(prompt.includes('STRICT IMMUTABILITY'));
    assert.ok(prompt.includes('ACTIVE PERSONA ROLE'));
    assert.ok(prompt.includes('CURATED WORKSPACE CONTEXT'));
  });

  it('GroundingEngine should verify valid citations and fallback broken links', () => {
    const validFile = path.join(tempDir, 'valid.md');
    fs.writeFileSync(validFile, 'valid note', 'utf8');

    const sampleText = `Read [valid.md](file:///${validFile.replace(/\\/g, '/')}) and [missing.md](file:///C:/nonexistent/missing.md).`;
    const result = GroundingEngine.verifyCitations(sampleText);

    assert.strictEqual(result.verifiedCitations, 1);
    assert.strictEqual(result.brokenCitations, 1);
    assert.ok(result.text.includes('[valid.md]'));
    assert.ok(result.text.includes('missing.md')); // broken link converted to plain text
  });
});
