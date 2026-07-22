/**
 * LocalONNXProvider - WebAssembly local AI provider using Qwen 2.5 ONNX
 */

const LLMProvider = require('./ProviderBase');
const { createLogger } = require('../core/logger');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
    
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model', 'smollm2-135m-onnx');
    this.generator = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return true;
    try {
      log.info('Initializing Local SmolLM2-135M ONNX model...');

      // Configure onnxruntime-web before loading transformers pipeline
      const webOrt = require('onnxruntime-web');
      const cpus = os.cpus() ? os.cpus().length : 2;
      webOrt.env.wasm.numThreads = Math.min(4, Math.max(1, cpus - 1));

      const originalCreate = webOrt.InferenceSession.create;
      webOrt.InferenceSession.create = function(model, options) {
        if (options && options.executionProviders) {
          options.executionProviders = options.executionProviders.map(ep => ep === 'cpu' ? 'wasm' : ep);
        }
        return originalCreate.call(this, model, options);
      };

      const { pipeline, env } = require('@huggingface/transformers');

      // Force local asset retrieval and disable external queries
      env.allowLocalModels = true;
      env.localModelPath = this.modelDir;
      env.cacheDir = this.modelDir;

      // Route the WASM files to the local unpacked directory if packaged in app.asar
      const { pathToFileURL } = require('url');
      let wasmDir = path.dirname(require.resolve('onnxruntime-web')) + path.sep;
      if (wasmDir.includes('app.asar')) {
        wasmDir = wasmDir.replace('app.asar', 'app.asar.unpacked');
      }
      env.backends.onnx.wasm.wasmPaths = pathToFileURL(wasmDir).href;

      const quantizedPath = path.join(this.modelDir, 'onnx', 'model_quantized.onnx');
      const standardPath = path.join(this.modelDir, 'onnx', 'model.onnx');
      let modelFileName = 'model_quantized';

      if (fs.existsSync(quantizedPath)) {
        modelFileName = 'model_quantized';
      } else if (fs.existsSync(standardPath)) {
        modelFileName = 'model';
      } else {
        log.warn(`SmolLM2 ONNX model file not found in: ${this.modelDir}`);
        return false;
      }

      // Load text generation pipeline using local ONNX model
      this.generator = await pipeline('text-generation', this.modelDir, {
        device: 'cpu',
        model_file_name: modelFileName
      });

      this.isInitialized = true;
      log.info('Local SmolLM2 ONNX model initialized successfully.');
      return true;
    } catch (err) {
      log.error('Failed to initialize Local Qwen ONNX model:', err);
      throw err;
    }
  }

  validate() {
    return true;
  }

  async getModelInstance() {
    const self = this;
    return {
      specificationVersion: 'v4',
      provider: 'local',
      modelId: 'Qwen2.5-0.5B-Instruct-ONNX',
      defaultObjectGenerationMode: undefined,
      async doGenerate(options) {
        const response = await self.generateChatCompletion(options.prompt || options.messages, {
          maxTokens: options.maxTokens,
          temperature: options.temperature
        });
        return {
          text: response.text,
          finishReason: 'stop',
          usage: {
            promptTokens: 0,
            completionTokens: 0
          },
          rawCall: { rawPrompt: options.prompt, rawSettings: {} }
        };
      },
      async doStream(options) {
        const response = await self.generateChatCompletion(options.prompt || options.messages, {
          maxTokens: options.maxTokens,
          temperature: options.temperature
        });
        
        const text = response.text;
        
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'text-delta',
              textDelta: text
            });
            controller.close();
          }
        });
        
        return {
          stream,
          finishReason: 'stop',
          usage: {
            promptTokens: 0,
            completionTokens: 0
          },
          rawCall: { rawPrompt: options.prompt, rawSettings: {} }
        };
      }
    };
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
        model: 'SmolLM2-135M-Instruct-ONNX'
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

    const result = await this.generateChatCompletion(messages, { maxTokens: 256, temperature: 0.1 });
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
    // Match any ```json ... ``` block embedded in output, or strip code fence lines
    const match = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
    if (match) return match[1].trim();
    return raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
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
