/**
 * WebToolService.cjs
 * Application service for Web Search (DuckDuckGo free API/HTML) and URL Content Fetching.
 */

const https = require('https');
const http = require('http');

class WebToolService {
  /**
   * Search the web using DuckDuckGo free search API.
   */
  async searchWeb({ query, limit = 5 }) {
    if (!query || typeof query !== 'string') {
      throw new Error('Search query must be a non-empty string.');
    }

    const encoded = encodeURIComponent(query.trim());
    const targetUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;

    try {
      const html = await this._fetchText(targetUrl, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      const results = [];
      const resultRegex = /<a class="result__url" href="([^"]+)".*?>\s*(.*?)\s*<\/a>[\s\S]*?<a class="result__snippet".*?>\s*(.*?)\s*<\/a>/gi;
      
      let match;
      while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
        let rawUrl = match[1];
        if (rawUrl.includes('uddg=')) {
          const urlMatch = rawUrl.match(/uddg=([^&]+)/);
          if (urlMatch) rawUrl = decodeURIComponent(urlMatch[1]);
        }
        
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        const snippet = match[3].replace(/<[^>]+>/g, '').trim();

        if (rawUrl && title) {
          results.push({
            title,
            url: rawUrl,
            snippet
          });
        }
      }

      if (results.length === 0) {
        // Fallback: simple link extraction
        const linkRegex = /<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
        while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
          const href = match[1];
          const text = match[2].replace(/<[^>]+>/g, '').trim();
          if (href.startsWith('http') && text.length > 10 && !href.includes('duckduckgo.com')) {
            results.push({ title: text, url: href, snippet: text });
          }
        }
      }

      return {
        query,
        count: results.length,
        results
      };
    } catch (err) {
      throw new Error(`Web search failed: ${err.message}`);
    }
  }

  /**
   * Fetch web page content by URL and convert to Markdown text.
   */
  async fetchUrl({ url, maxLength = 8000 }) {
    if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      throw new Error('Valid http/https URL is required.');
    }

    try {
      const html = await this._fetchText(url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });

      // Strip scripts, styles, nav, headers, footers
      let cleanHtml = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '');

      // Extract title
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : url;

      // Basic HTML to Markdown conversion
      let text = cleanHtml
        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n### $1\n\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (text.length > maxLength) {
        text = text.slice(0, maxLength) + '\n\n... (content truncated)';
      }

      return {
        url,
        title,
        content: text
      };
    } catch (err) {
      throw new Error(`Failed to fetch URL ${url}: ${err.message}`);
    }
  }

  _fetchText(targetUrl, headers = {}) {
    return new Promise((resolve, reject) => {
      const client = targetUrl.startsWith('https') ? https : http;
      const req = client.get(targetUrl, { headers, timeout: 10000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirect = res.headers.location;
          if (!redirect.startsWith('http')) {
            const origin = new URL(targetUrl).origin;
            redirect = new URL(redirect, origin).toString();
          }
          return this._fetchText(redirect, headers).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout after 10000ms'));
      });
    });
  }
}

module.exports = {
  WebToolService
};
