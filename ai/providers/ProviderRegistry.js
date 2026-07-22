/**
 * providerRegistry - Single source of truth for all LLM provider definitions.
 *
 * WHY THIS EXISTS
 * ---------------
 * Without this file, adding a new provider required touching at minimum four
 * separate locations:
 *   1. LLMRegistry._registerBuiltInProviders()
 *   2. ALLOWED_PROVIDERS set in aiHandlers.cjs
 *   3. initializeAIForWorkspace() in main.cjs (hardcoded provider name)
 *   4. The providers[] array in AISettings.jsx
 *
 * This registry eliminates that fragmentation. LLMRegistry, aiHandlers, and
 * main.cjs all derive their behaviour from this one file. Adding a new provider
 * now requires only:
 *   1. Create the provider class in providers/
 *   2. Add one entry to PROVIDER_REGISTRY below
 *
 * STRUCTURE
 * ---------
 * Each entry describes:
 *   id              - Canonical lowercase identifier (used as storage key, IPC param)
 *   name            - Human-readable display name (shown in AISettings UI)
 *   description     - Short capability summary for the UI
 *   available       - Whether the provider is fully implemented (false = planned/stub)
 *   supportsEmbeddings - Whether the provider can produce embedding vectors
 *   factory(config) - Function that constructs the provider instance
 *
 * USAGE
 * -----
 *   const { PROVIDER_REGISTRY, ALLOWED_PROVIDER_IDS } = require('./providerRegistry');
 *
 *   // Check a provider id is valid:
 *   ALLOWED_PROVIDER_IDS.has('groq')  // true
 *
 *   // Instantiate a provider:
 *   const entry = PROVIDER_REGISTRY['groq'];
 *   const provider = entry.factory({ apiKey: '...' });
 */

const GeminiProvider   = require('./GeminiProvider');
const { GroqProvider } = require('./GroqProvider');
const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');

/**
 * @type {Record<string, {
 *   id: string,
 *   name: string,
 *   description: string,
 *   available: boolean,
 *   supportsEmbeddings: boolean,
 *   capabilities: object,
 *   factory: (config: object) => import('./LLMProvider')
 * }>}
 */
const PROVIDER_REGISTRY = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Multimodal AI — supports embeddings & semantic search',
    available: true,
    supportsEmbeddings: true,
    capabilities: {
      textGeneration: true,
      embeddings: true,
      semanticSearch: true,
      relationshipDiscovery: true,
      patternDetection: true,
    },
    models: [
      { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',      note: 'Fast · default' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', note: 'Lightest' },
      { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro',        note: 'Highest quality' },
      { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash',      note: 'Balanced' },
    ],
    defaultModel: 'gemini-2.0-flash',
    factory: (config) => new GeminiProvider(config.apiKey, config),
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    description: 'Free-tier ultra-fast inference (llama-3, gemma, mistral)',
    available: true,
    supportsEmbeddings: false,
    capabilities: {
      textGeneration: true,
      embeddings: false,
      semanticSearch: false,
      relationshipDiscovery: false,
      patternDetection: true,
    },
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',   note: 'Best quality · default' },
      { id: 'llama3-8b-8192',          label: 'Llama 3 8B',       note: 'Fast · lightweight' },
      { id: 'gemma2-9b-it',            label: 'Gemma 2 9B',       note: 'Google open model' },
      { id: 'mixtral-8x7b-32768',      label: 'Mixtral 8×7B',     note: '32k context' },
    ],
    defaultModel: 'llama-3.3-70b-versatile',
    factory: (config) => new GroqProvider(config.apiKey, config),
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI official endpoints (GPT-4o, GPT-4o Mini)',
    available: true,
    supportsEmbeddings: true,
    capabilities: {
      textGeneration: true,
      embeddings: true,
      semanticSearch: true,
      relationshipDiscovery: true,
      patternDetection: true,
    },
    models: [
      { id: 'gpt-4o',      label: 'GPT-4o',      note: 'Standard' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', note: 'Fast · default' }
    ],
    defaultModel: 'gpt-4o-mini',
    factory: (config) => new OpenAICompatibleProvider(config.apiKey, config)
  }
};

/**
 * Set of valid, available provider ids — used for input validation in
 * aiHandlers.cjs without duplicating the list.
 * Includes embedding-only providers (e.g. 'huggingface') so their tokens
 * can be stored and retrieved through the same AIConfig key store.
 *
 * @type {Set<string>}
 */
const ALLOWED_PROVIDER_IDS = new Set([
  ...Object.values(PROVIDER_REGISTRY)
    .filter((p) => p.available)
    .map((p) => p.id),
  'huggingface', // embedding-only provider — not a text generation provider
]);

module.exports = { PROVIDER_REGISTRY, ALLOWED_PROVIDER_IDS };
