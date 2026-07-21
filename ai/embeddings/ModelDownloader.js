const fs = require('fs');
const path = require('path');
const https = require('https');
const { createLogger } = require('../core/logger');

const log = createLogger('ModelDownloader');

class ModelDownloader {
  constructor(appDataDir) {
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model');
    this.modelUrl = 'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/onnx/model.onnx';
    const vocabUrlPart = 'resolve/main/vocab.txt';
    this.vocabUrl = `https://huggingface.co/Xenova/bge-small-en-v1.5/${vocabUrlPart}`;
    this.isDownloading = false;
    this.progress = 0;
    this.progressCallback = null;
    this.graphModelUrl = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';
    this.graphModelPath = path.join(this.modelDir, 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf');
  }

  isGraphModelDownloaded() {
    return fs.existsSync(this.graphModelPath);
  }

  async downloadGraphModel(onProgress = null) {
    if (this.isGraphModelDownloaded()) {
      log.info('Graph Qwen model already downloaded');
      return true;
    }
    if (this.isDownloading) {
      log.info('Download already in progress');
      return false;
    }

    this.isDownloading = true;
    this.progress = 0;
    this.progressCallback = onProgress;

    try {
      if (!fs.existsSync(this.modelDir)) {
        fs.mkdirSync(this.modelDir, { recursive: true });
      }

      log.info('Starting Qwen GGUF model download from HuggingFace...');
      
      await this.downloadFile(this.graphModelUrl, this.graphModelPath, (bytesRead, totalBytes) => {
        if (totalBytes > 0) {
          this.progress = Math.round((bytesRead / totalBytes) * 100);
          if (this.progressCallback) {
            this.progressCallback(this.progress);
          }
        }
      });

      log.info('Qwen GGUF model downloaded successfully');
      this.isDownloading = false;
      this.progress = 100;
      return true;
    } catch (err) {
      this.isDownloading = false;
      log.error('Failed to download Qwen model', err);
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
      isDownloading: this.isDownloading,
      progress: this.progress
    };
  }

  async download(onProgress = null) {
    if (this.isModelDownloaded()) {
      log.info('Model already downloaded');
      return true;
    }
    if (this.isDownloading) {
      log.info('Download already in progress');
      return false;
    }

    this.isDownloading = true;
    this.progress = 0;
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
          this.progress = Math.round((bytesRead / totalBytes) * 100);
          if (this.progressCallback) {
            this.progressCallback(this.progress);
          }
        }
      });

      log.info('Model file downloaded successfully');
      this.isDownloading = false;
      this.progress = 100;
      return true;
    } catch (err) {
      this.isDownloading = false;
      log.error('Failed to download embedding model', err);
      throw err;
    }
  }

  downloadFile(url, dest, onProgress = null) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      
      const request = (targetUrl) => {
        https.get(targetUrl, (response) => {
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
