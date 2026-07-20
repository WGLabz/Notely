const assert = require('assert');
const LLMRegistry = require('../../ai/providers/LLMRegistry');

describe('LLMProvider & Registry Tests', () => {
  it('should list all registered providers', () => {
    const registry = new LLMRegistry();
    const providers = registry.listProviders();
    
    assert.ok(providers.length >= 2);
    assert.ok(providers.includes('gemini'));
    assert.ok(providers.includes('groq'));
  });

  it('should activate provider with configs', async () => {
    const registry = new LLMRegistry();
    
    // Attempt activation with dummy key
    const success = await registry.activateProvider('groq', { apiKey: 'dummy-key', model: 'llama-3.3-70b-specdec' });
    assert.ok(success);
    
    const active = registry.getActiveProvider();
    assert.strictEqual(active.name.toLowerCase(), 'groq');
    assert.strictEqual(active.model, 'llama-3.3-70b-specdec');
  });
});
