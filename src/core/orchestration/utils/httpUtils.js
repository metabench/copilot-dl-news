/**
 * HTTP and Network Utilities
 *
 * Utility functions for HTTP operations and network requests.
 * Extracted from placeHubGuessing.js to improve modularity.
 */

/**
 * Extract title from HTML body
 * @param {string} html - HTML content
 * @returns {string|null} - Extracted title or null
 */
function extractTitle(html) {
  if (!html || typeof html !== 'string') return null;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  // Decode HTML entities and trim
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Create a fetch row object for database storage
 * @param {Object} result - Fetch result
 * @param {Object} context - Additional context
 * @returns {Object} - Row object for http_responses table
 */
function createFetchRow(result, context = {}) {
  return {
    url: context.url || result.finalUrl || result.url,
    http_status: result.status,
    final_url: result.finalUrl || result.url,
    title: extractTitle(result.body),
    fetched_at: result.metrics?.fetched_at || new Date().toISOString(),
    bytes_downloaded: result.metrics?.bytes_downloaded || 0,
    content_type: result.metrics?.content_type || null,
    request_started_at: result.metrics?.request_started_at || null,
    duration_ms: result.metrics?.duration_ms || 0,
    ...context
  };
}

/**
 * Fetch URL with timeout and error handling
 * @param {string} url - URL to fetch
 * @param {Function} fetchFn - Fetch function to use
 * @param {Object} options - Fetch options
 * @param {Object} options.logger - Logger instance
 * @param {number} options.timeoutMs - Timeout in milliseconds
 * @param {string} options.method - HTTP method
 * @returns {Promise<Object>} - Fetch result
 */
async function fetchUrl(url, fetchFn, { logger, timeoutMs = 15000, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, timeoutMs);
  const started = Date.now();
  const requestStartedIso = new Date(started).toISOString();
  const requestMethod = typeof method === 'string' && method.trim()
    ? method.trim().toUpperCase()
    : 'GET';

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      method: requestMethod,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GuessPlaceHubs/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    const finished = Date.now();
    clearTimeout(timeout);
    const finalUrl = response.url || url;
    let body = '';
    let bytesDownloaded = 0;
    if (requestMethod !== 'HEAD') {
      try {
        body = await response.text();
        bytesDownloaded = Buffer.byteLength(body, 'utf8');
      } catch (err) {
        logger?.warn?.(`[http] Failed to read body for ${finalUrl}: ${err.message || err}`);
      }
    }

    const headers = response.headers || { get: () => null };
    const contentType = headers.get ? headers.get('content-type') : null;
    const contentLengthHeader = headers.get ? headers.get('content-length') : null;
    const contentLength = contentLengthHeader != null ? Number(contentLengthHeader) : null;

    return {
      ok: response.ok,
      status: response.status,
      finalUrl,
      body,
      metrics: {
        request_started_at: requestStartedIso,
        fetched_at: new Date(finished).toISOString(),
        bytes_downloaded: bytesDownloaded,
        duration_ms: finished - started,
        content_type: contentType,
        content_length: contentLength
      },
      headers
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      logger?.warn?.(`[http] ${requestMethod} ${url} timed out after ${timeoutMs}ms`);
      error.code = 'FETCH_TIMEOUT';
    } else {
      logger?.error?.(`[http] ${requestMethod} ${url} failed: ${error.message || error}`);
    }

    return {
      ok: false,
      status: error.code === 'FETCH_TIMEOUT' ? 408 : 500,
      finalUrl: url,
      body: '',
      error,
      metrics: {
        request_started_at: requestStartedIso,
        fetched_at: new Date().toISOString(),
        bytes_downloaded: 0,
        duration_ms: Date.now() - started,
        content_type: null,
        content_length: null
      },
      headers: { get: () => null }
    };
  }
}

module.exports = {
  fetchUrl,
  extractTitle,
  createFetchRow
};