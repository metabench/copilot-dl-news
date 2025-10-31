/**
 * HTTP and Network Utilities
 *
 * Utility functions for HTTP operations and network requests.
 * Extracted from placeHubGuessing.js to improve modularity.
 */

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
  fetchUrl
};