const fs = require('fs');
const path = require('path');
const https = require('https');
const { createLogger } = require('../core/logger');

const log = createLogger('ModelDownloader');

// Module-level shared states to prevent instanced progress reset and isolation issues
let isDownloadingEmbedding = false;
let embeddingProgress = 0;

let isDownloadingGraph = false;
let graphProgress = 0;

class ModelDownloader {
  constructor(appDataDir) {
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model');
    this.modelUrl = 'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/onnx/model.onnx';
    const vocabUrlPart = 'resolve/main/vocab.txt';
    this.vocabUrl = `https://huggingface.co/Xenova/bge-small-en-v1.5/${vocabUrlPart}`;
    this.progressCallback = null;

    this.smolLM2ONNXDir = path.join(this.modelDir, 'smollm2-135m-onnx');
    this.smolLM2ONNXFiles = [
      { name: 'config.json', url: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/resolve/main/config.json' },
      { name: 'generation_config.json', url: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/resolve/main/generation_config.json' },
      { name: 'special_tokens_map.json', url: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/resolve/main/special_tokens_map.json' },
      { name: 'tokenizer.json', url: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/resolve/main/tokenizer.json' },
      { name: 'tokenizer_config.json', url: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/resolve/main/tokenizer_config.json' },
      { name: 'onnx/model_quantized.onnx', url: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX/resolve/main/onnx/model_quantized.onnx' }
    ];
  }

  isGraphModelDownloaded() {
    return this.smolLM2ONNXFiles.every(file => fs.existsSync(path.join(this.smolLM2ONNXDir, file.name)));
  }

  async downloadGraphModel(onProgress = null) {
    if (this.isGraphModelDownloaded()) {
      log.info('Graph SmolLM2 ONNX model already downloaded');
      return true;
    }
    if (isDownloadingGraph) {
      log.info('Download already in progress');
      return false;
    }

    isDownloadingGraph = true;
    graphProgress = 0;
    this.progressCallback = onProgress;

    try {
      if (!fs.existsSync(this.smolLM2ONNXDir)) {
        fs.mkdirSync(this.smolLM2ONNXDir, { recursive: true });
      }

      log.info('Starting SmolLM2 ONNX model download from HuggingFace...');
      
      let completedCount = 0;
      for (const file of this.smolLM2ONNXFiles) {
        const destPath = path.join(this.smolLM2ONNXDir, file.name);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        log.info(`Downloading SmolLM2 ONNX asset: ${file.name}...`);
        
        await this.downloadFile(file.url, destPath, (bytesRead, totalBytes) => {
          if (totalBytes > 0) {
            const baseProgress = Math.round((completedCount / this.smolLM2ONNXFiles.length) * 100);
            const currentFileProgress = Math.round((bytesRead / totalBytes) * (100 / this.smolLM2ONNXFiles.length));
            graphProgress = Math.min(99, baseProgress + currentFileProgress);
            if (this.progressCallback) {
              this.progressCallback(graphProgress);
            }
          }
        });
        
        completedCount++;
        graphProgress = Math.round((completedCount / this.smolLM2ONNXFiles.length) * 100);
        if (this.progressCallback) {
          this.progressCallback(graphProgress);
        }
      }

      log.info('SmolLM2 ONNX model downloaded successfully');
      isDownloadingGraph = false;
      graphProgress = 100;
      return true;
    } catch (err) {
      isDownloadingGraph = false;
      log.error('Failed to download SmolLM2 ONNX model', err);
      throw err;
    }
  }

  isModelDownloaded() {
    const modelPath = path.join(this.modelDir, 'model.onnx');
    const vocabPath = path.join(this.modelDir, 'vocab.txt');
    return fs.existsSync(modelPath) && fs.existsSync(vocabPath);
  }

  getProgress() {
    return {
      isDownloading: isDownloadingEmbedding,
      progress: embeddingProgress
    };
  }

  getGraphProgress() {
    return {
      isDownloading: isDownloadingGraph,
      progress: graphProgress
    };
  }

  deleteModel() {
    try {
      const modelPath = path.join(this.modelDir, 'model.onnx');
      const vocabPath = path.join(this.modelDir, 'vocab.txt');
      if (fs.existsSync(modelPath)) fs.unlinkSync(modelPath);
      if (fs.existsSync(vocabPath)) fs.unlinkSync(vocabPath);
      log.info('Deleted local embedding model files.');
      return true;
    } catch (err) {
      log.error('Failed to delete embedding model files', err);
      throw err;
    }
  }

  deleteGraphModel() {
    try {
      if (fs.existsSync(this.smolLM2ONNXDir)) {
        fs.rmSync(this.smolLM2ONNXDir, { recursive: true, force: true });
      }
      log.info('Deleted local graph ONNX model files.');
      return true;
    } catch (err) {
      log.error('Failed to delete graph model files', err);
      throw err;
    }
  }

  async download(onProgress = null) {
    if (this.isModelDownloaded()) {
      log.info('Model already downloaded');
      return true;
    }
    if (isDownloadingEmbedding) {
      log.info('Download already in progress');
      return false;
    }

    isDownloadingEmbedding = true;
    embeddingProgress = 0;
    this.progressCallback = onProgress;

    try {
      if (!fs.existsSync(this.modelDir)) {
        fs.mkdirSync(this.modelDir, { recursive: true });
      }

      log.info('Starting BGE ONNX model download from HuggingFace...');
      
      const modelPath = path.join(this.modelDir, 'model.onnx');
      const vocabPath = path.join(this.modelDir, 'vocab.txt');

      // Download vocab file first
      await this.downloadFile(this.vocabUrl, vocabPath);
      log.info('Vocab file downloaded successfully');

      // Download ONNX weights
      await this.downloadFile(this.modelUrl, modelPath, (bytesRead, totalBytes) => {
        if (totalBytes > 0) {
          embeddingProgress = Math.round((bytesRead / totalBytes) * 100);
          if (this.progressCallback) {
            this.progressCallback(embeddingProgress);
          }
        }
      });

      log.info('Model file downloaded successfully');
      isDownloadingEmbedding = false;
      embeddingProgress = 100;
      return true;
    } catch (err) {
      isDownloadingEmbedding = false;
      log.error('Failed to download embedding model', err);
      throw err;
    }
  }

  downloadFile(url, dest, onProgress = null) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      
      const request = (targetUrl) => {
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NotelyApp/0.1.27 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36'
          }
        };
        https.get(targetUrl, options, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307 || response.statusCode === 308) {
            // Handle redirects (including relative paths)
            let redirectUrl = response.headers.location;
            if (redirectUrl && !redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
              const origin = new URL(targetUrl).origin;
              redirectUrl = new URL(redirectUrl, origin).toString();
            }
            request(redirectUrl);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download file, HTTP status: ${response.statusCode}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let bytesRead = 0;

          response.on('data', (chunk) => {
            bytesRead += chunk.length;
            file.write(chunk);
            if (onProgress) {
              onProgress(bytesRead, totalBytes);
            }
          });

          response.on('end', () => {
            file.end();
          });

          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      };

      request(url);
    });
  }
}

module.exports = ModelDownloader;
