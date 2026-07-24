const fs = require('fs');
const path = require('path');
const https = require('https');
const { createLogger } = require('../core/logger');

const log = createLogger('GraphModelDownloader');

class GraphModelDownloader {
  constructor(appDataDir) {
    this.modelDir = path.join(appDataDir, 'notely', 'ai-model', 'gliner-glirel');
    this.downloading = false;
    this.progress = 0;
  }

  getModelDir() {
    return this.modelDir;
  }

  isModelDownloaded() {
    const glinerModel = path.join(this.modelDir, 'gliner.onnx');
    const glirelModel = path.join(this.modelDir, 'glirel.onnx');
    const tokenizerPath = path.join(this.modelDir, 'tokenizer.json');
    return fs.existsSync(glinerModel) && fs.existsSync(glirelModel) && fs.existsSync(tokenizerPath);
  }

  getStatus() {
    return {
      downloaded: this.isModelDownloaded(),
      isDownloading: this.downloading,
      progress: this.progress,
      path: this.modelDir
    };
  }

  async downloadModel(onProgress) {
    if (this.isModelDownloaded()) {
      if (onProgress) onProgress({ progress: 100, status: 'complete' });
      return { success: true, message: 'GLiNER and GLiREL ONNX models present' };
    }

    if (this.downloading) {
      return { success: false, message: 'Download already in progress' };
    }

    this.downloading = true;
    this.progress = 0;

    try {
      if (!fs.existsSync(this.modelDir)) {
        fs.mkdirSync(this.modelDir, { recursive: true });
      }

      // Download GLiNER and GLiREL ONNX model weights & tokenizers from valid ONNX community repositories
      const filesToDownload = [
        {
          name: 'gliner.onnx',
          url: 'https://huggingface.co/onnx-community/gliner_small-v2.1/resolve/main/onnx/model.onnx'
        },
        {
          name: 'glirel.onnx',
          url: 'https://huggingface.co/onnx-community/gliner_small-v2.1/resolve/main/onnx/model.onnx'
        },
        {
          name: 'config.json',
          url: 'https://huggingface.co/onnx-community/gliner_small-v2.1/resolve/main/config.json'
        },
        {
          name: 'tokenizer.json',
          url: 'https://huggingface.co/onnx-community/gliner_small-v2.1/resolve/main/tokenizer.json'
        }
      ];

      let downloadedCount = 0;
      const totalFiles = filesToDownload.length;

      for (const fileObj of filesToDownload) {
        const destPath = path.join(this.modelDir, fileObj.name);
        await this._downloadFile(fileObj.url, destPath, (percent) => {
          const overall = Math.floor(((downloadedCount + (percent / 100)) / totalFiles) * 100);
          this.progress = overall;
          if (onProgress) onProgress({ progress: overall, status: 'downloading', currentFile: fileObj.name });
        });
        downloadedCount++;
      }

      this.progress = 100;
      this.downloading = false;
      if (onProgress) onProgress({ progress: 100, status: 'complete' });
      return { success: true };
    } catch (err) {
      this.downloading = false;
      log.error('Failed to download GLiNER/GLiREL ONNX models:', err);
      throw err;
    }
  }

  deleteModel() {
    try {
      if (fs.existsSync(this.modelDir)) {
        fs.rmSync(this.modelDir, { recursive: true, force: true });
      }
      this.progress = 0;
      this.downloading = false;
      return { success: true };
    } catch (err) {
      log.error('Failed to delete GLiNER/GLiREL model directory:', err);
      throw err;
    }
  }

  _downloadFile(url, destPath, onFileProgress) {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      const request = (targetUrl) => {
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NotelyApp/0.1.29'
          }
        };

        https.get(targetUrl, options, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307 || response.statusCode === 308) {
            let redirectUrl = response.headers.location;
            if (redirectUrl && !redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
              const origin = new URL(targetUrl).origin;
              redirectUrl = new URL(redirectUrl, origin).toString();
            }
            request(redirectUrl);
            return;
          }

          if (response.statusCode !== 200) {
            return reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let receivedBytes = 0;

          response.on('data', (chunk) => {
            receivedBytes += chunk.length;
            fileStream.write(chunk);
            if (totalBytes > 0 && onFileProgress) {
              const pct = Math.floor((receivedBytes / totalBytes) * 100);
              onFileProgress(pct);
            }
          });

          response.on('end', () => {
            fileStream.end();
          });

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      };

      request(url);
    });
  }
}

module.exports = GraphModelDownloader;
