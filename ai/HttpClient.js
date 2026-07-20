/**
 * HttpClient - Shared HTTP utility for LLM providers.
 * Provides fetch with timeout, exponential-backoff retries, and
 * Retry-After header support. Extracted so every provider can reuse
 * identical resilience behaviour without copying code.
 */

class HttpClient {
  /**
   * @param {Object} options
   * @param {number} [options.requestTimeoutMs=30000]
   * @param {number} [options.maxRetries=2]
   */
  constructor(options = {}) {
    this.requestTimeoutMs = Number(options.requestTimeoutMs) || 30000;
    this.maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 2;
  }

  /**
   * Fetch with abort-based timeout and exponential-backoff retries.
   * Retries: network errors, timeouts, HTTP 429, HTTP 5xx.
   * Non-retryable responses are returned as-is so callers can inspect response.ok.
   *
   * @param {string} url
   * @param {RequestInit} [init={}]
   * @param {Object} [overrides]
   * @param {number} [overrides.retries]
   * @param {number} [overrides.timeoutMs]
   * @returns {Promise<Response>}
   */
  async fetchWithRetry(url, init = {}, { retries = this.maxRetries, timeoutMs = this.requestTimeoutMs } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          await this._delay(this._backoffDelay(attempt, response));
          continue;
        }
        return response;
      } catch (error) {
        clearTimeout(timer);
        lastError = error?.name === 'AbortError'
          ? new Error(`Request timed out after ${timeoutMs}ms`)
          : error;
        if (attempt < retries) {
          await this._delay(this._backoffDelay(attempt));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Compute backoff delay in ms, honouring Retry-After when present.
   * @private
   */
  _backoffDelay(attempt, response) {
    if (response && typeof response.headers?.get === 'function') {
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        return Math.min(retryAfter * 1000, 20000);
      }
    }
    const base = Math.min(1000 * 2 ** attempt, 8000);
    return base + Math.floor(Math.random() * 250);
  }

  /** @private */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = HttpClient;
