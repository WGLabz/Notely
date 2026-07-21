/**
 * LocalONNXProvider - WebAssembly local AI provider using Qwen 2.5 ONNX
 */

const Module = require('module');
const originalLoad = Module._load;
let inRedirect = false;

Module._load = function(request, parent) {
  if (!inRedirect && (request === 'onnxruntime-common' || request.includes('onnxruntime-common'))) {
    inRedirect = true;
    try {
      return originalLoad.call(this, require.resolve('onnxruntime-common'), parent);
    } finally {
      inRedirect = false;
    }
  }

  if (request === 'onnxruntime-node' || request.includes('onnxruntime-node')) {
    try {
      return originalLoad.apply(this, arguments);
    } catch {
      console.warn('[LocalONNXProvider] Intercepting broken onnxruntime-node, redirecting to onnxruntime-web (WASM)');
      const webOrt = require('onnxruntime-web');
      
      // Limit to 1 thread to avoid ES module blob: url worker loading errors in Node/Electron environment
      webOrt.env.wasm.numThreads = 1;
      
      const originalCreate = webOrt.InferenceSession.create;
      webOrt.InferenceSession.create = function(model, options) {
        if (options && options.executionProviders) {
          options.executionProviders = options.executionProviders.map(ep => ep === 'cpu' ? 'wasm' : ep);
        }
        return originalCreate.call(this, model, options);
      };
      return webOrt;
    }
  }
  return originalLoad.apply(this, arguments);
};

const LLMProvider = require('./ProviderBase');
const { createLogger } = require('../core/logger');
const path = require('path');
const fs = require('fs');

const log = createLogger('LocalONNXProvider');

class LocalONNXProvider extends LLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'Local (ONNX)';
    
    let appDataDir = config.appDataDir;
    if (!appDataDir) {
      try {
        const { app } = require('electron');
        appDataDir = path.join(app.getPath('appData'), 'Notely');
      } catch {
        appDataDir = path.join(process.env.APPDATA || process.env.HOME || '', 'Notely');
      }
    }
    
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model', 'qwen-onnx');
    this.generator = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return true;
    try {
      log.info('Initializing Local Qwen ONNX model...');
      const { pipeline, env } = await import('@huggingface/transformers');

      // Force local asset retrieval and disable external queries
      env.allowLocalModels = true;
      env.localModelPath = this.modelDir;
      env.cacheDir = this.modelDir;

      // Route the WASM files to the local node_modules folder to prevent network fetch/caching issues
      env.backends.onnx.wasm.wasmPaths = path.dirname(require.resolve('onnxruntime-web')) + path.sep;

      const modelFilePath = path.join(this.modelDir, 'onnx', 'model_quantized.onnx');
      if (!fs.existsSync(modelFilePath)) {
        throw new Error(`Qwen ONNX model files are missing at: ${modelFilePath}`);
      }

      // Load text generation pipeline using local quantized model
      this.generator = await pipeline('text-generation', this.modelDir, {
        device: 'cpu',
        model_file_name: 'model_quantized'
      });

      this.isInitialized = true;
      log.info('Local Qwen ONNX model initialized successfully.');
      return true;
    } catch (err) {
      log.error('Failed to initialize Local Qwen ONNX model:', err);
      throw err;
    }
  }

  validate() {
    return true;
  }

  async generateText(prompt, options = {}) {
    if (!this.isInitialized) await this.initialize();
    const { maxTokens = 512, temperature = 0.7 } = options;

    try {
      const messages = [{ role: 'user', content: prompt }];
      
      const formattedPrompt = this.generator.tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true
      });

      const output = await this.generator(formattedPrompt, {
        max_new_tokens: maxTokens,
        do_sample: temperature > 0,
        temperature: temperature || undefined,
        return_full_text: false
      });

      const text = output[0]?.generated_text || '';
      return {
        text,
        tokensUsed: 0,
        model: 'Qwen2.5-0.5B-Instruct-ONNX'
      };
    } catch (err) {
      log.error('Text generation failed:', err);
      throw err;
    }
  }

  async generateChatCompletion(messages, options = {}) {
    if (!this.isInitialized) await this.initialize();
    const { maxTokens = 512, temperature = 0.7 } = options;

    try {
      const formattedMessages = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));

      const formattedPrompt = this.generator.tokenizer.apply_chat_template(formattedMessages, {
        tokenize: false,
        add_generation_prompt: true
      });

      const output = await this.generator(formattedPrompt, {
        max_new_tokens: maxTokens,
        do_sample: temperature > 0,
        temperature: temperature || undefined,
        return_full_text: false
      });

      const text = output[0]?.generated_text || '';
      return {
        text,
        tokensUsed: 0,
        model: 'Qwen2.5-0.5B-Instruct-ONNX'
      };
    } catch (err) {
      log.error('Chat completion failed:', err);
      throw err;
    }
  }

  // Graph/Relationship Extraction interface
  async extractGraph(content, _filePath) {
    const prompt = `Extract all entities and relationships from the text below. Return ONLY a valid JSON object.
Text: ${content}`;

    const systemPrompt = `You are an AI assistant designed to extract knowledge graphs from markdown text.
Return ONLY a valid JSON object matching the following structure (no markdown wrappers, no other text):
{
  "entities": [
    { "id": "entity-unique-id", "type": "Person|Project|Technology|Company|Concept|Task", "name": "Entity Name", "properties": {} }
  ],
  "relationships": [
    { "source_id": "source-id", "target_id": "target-id", "type": "REFERENCES|USES|DEPENDS_ON|MENTIONS|RELATED_TO", "weight": 1.0, "metadata": {} }
  ]
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    const result = await this.generateChatCompletion(messages, { maxTokens: 1024, temperature: 0.1 });
    try {
      const cleaned = this._cleanJsonResponse(result.text);
      return JSON.parse(cleaned);
    } catch (err) {
      log.error('Failed to parse JSON graph from local ONNX response:', err, result.text);
      return { entities: [], relationships: [] };
    }
  }

  isReady() {
    return this.isInitialized;
  }

  _cleanJsonResponse(text) {
    const raw = String(text || '').trim();
    const match = raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    return match ? match[1].trim() : raw;
  }

  getCapabilities() {
    return {
      supportsEmbeddings: false,
      supportsChatCompletion: true,
      supportsCaching: false,
      supportsStreaming: false,
      maxTokens: 2048
    };
  }
}

module.exports = LocalONNXProvider;
