const fs = require('fs');
const path = require('path');
const { createLogger } = require('../core/logger');

const log = createLogger('ONNXEmbedder');

class ONNXEmbedder {
  constructor(appDataDir) {
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model');
    this.session = null;
    this.tokenizer = null;
    this.isLoaded = false;
    this.ort = null;
    this.isInitialized = false;
  }

  async load() {
    if (this.isLoaded) return;
    try {
      log.info('Loading local ONNX embedding session...');
      try {
        this.ort = require('onnxruntime-node');
      } catch (err) {
        log.warn('Failed to load native onnxruntime-node. Trying onnxruntime-web (WASM) fallback:', err.message);
        this.ort = require('onnxruntime-web');
      }
      
      const modelPath = path.join(this.modelDir, 'model.onnx');
      const vocabPath = path.join(this.modelDir, 'vocab.txt');

      if (!fs.existsSync(modelPath) || !fs.existsSync(vocabPath)) {
        throw new Error('Model or vocab files missing. Download required.');
      }

      this.session = await this.ort.InferenceSession.create(modelPath);
      this.vocab = fs.readFileSync(vocabPath, 'utf8').split('\n');
      this.isLoaded = true;
      this.isInitialized = true;
      log.info('ONNX embedding model loaded successfully.');
    } catch (err) {
      this.isInitialized = false;
      log.error('Failed to load ONNX embedding session', err);
      throw err;
    }
  }

  getActiveModelName() {
    return 'bge-small-en-v1.5 (local)';
  }

  isAvailable() {
    return this.isLoaded;
  }

  async generateEmbeddings(texts) {
    if (Array.isArray(texts)) {
      return Promise.all(texts.map(t => this.generateEmbedding(t)));
    }
    return this.generateEmbedding(texts);
  }

  /**
   * Generates a 384-dimension vector embedding for text
   * @param {string} text 
   * @returns {Promise<Array<number>>}
   */
  async generateEmbedding(text) {
    if (!this.isLoaded) {
      await this.load();
    }

    try {
      const tokens = this.tokenize(text);
      const inputIds = new BigInt64Array(tokens.map(t => BigInt(t)));
      const attentionMask = new BigInt64Array(tokens.map(() => 1n));
      const tokenTypeIds = new BigInt64Array(tokens.map(() => 0n));

      const inputIdsTensor = new this.ort.Tensor('int64', inputIds, [1, tokens.length]);
      const attentionMaskTensor = new this.ort.Tensor('int64', attentionMask, [1, tokens.length]);
      const tokenTypeIdsTensor = new this.ort.Tensor('int64', tokenTypeIds, [1, tokens.length]);

      const results = await this.session.run({
        input_ids: inputIdsTensor,
        attention_mask: attentionMaskTensor,
        token_type_ids: tokenTypeIdsTensor
      });

      // BGE outputs [1, seq_len, 384] or [1, 384] depending on output node configurations.
      // Usually, we extract the CLS token (first token at index 0 of seq_len dimension) or mean pool.
      // In BGE-small, output name is 'last_hidden_state' or 'sentence_embedding'.
      let outputTensor = results.sentence_embedding || results.last_hidden_state;
      if (!outputTensor) {
        // Fallback to first available output
        const firstKey = Object.keys(results)[0];
        outputTensor = results[firstKey];
      }

      const floatData = Array.from(outputTensor.data);
      
      // If it's the last hidden state [1, seq_len, 384], extract CLS token (first 384 values)
      if (outputTensor.dims.length === 3) {
        return floatData.slice(0, 384);
      }
      
      return floatData;
    } catch (err) {
      log.error('Embedding generation failed', err);
      throw err;
    }
  }

  tokenize(text) {
    // Robust BERT/BGE clean and pre-tokenize: split words from punctuation/symbols
    const rawText = String(text || '').toLowerCase();
    
    // Regex matches words/numbers or individual punctuation/non-space symbols
    const pattern = /[a-z0-9]+|[^\s\w]/gi;
    const words = [];
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
      words.push(match[0]);
    }

    const tokens = [101]; // CLS token ID
    
    // Map words to vocab dictionary IDs
    const vocabMap = new Map();
    this.vocab.forEach((word, idx) => vocabMap.set(word.trim(), idx));

    for (const word of words) {
      if (vocabMap.has(word)) {
        tokens.push(vocabMap.get(word));
      } else {
        // Subword tokenization fallback
        let i = 0;
        while (i < word.length) {
          let subWord = word.substring(i);
          let subId = -1;
          while (subWord.length > 0) {
            const check = i === 0 ? subWord : '##' + subWord;
            if (vocabMap.has(check)) {
              subId = vocabMap.get(check);
              break;
            }
            subWord = subWord.substring(0, subWord.length - 1);
          }
          if (subId !== -1) {
            tokens.push(subId);
            i += subWord.length;
          } else {
            tokens.push(100); // UNK token ID
            break;
          }
        }

      }
    }
    tokens.push(102); // SEP token ID
    return tokens;
  }
}

module.exports = ONNXEmbedder;
