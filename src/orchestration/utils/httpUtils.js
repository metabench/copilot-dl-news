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
  const startTime = Date.now();

  try {
    logger?.debug?.(`Fetching ${method} ${url}`);

    const result = await fetchFn(url, {
      method,
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
      }
    });

    const duration = Date.now() - startTime;

    if (result.error) {
      logger?.warn?.(`Fetch failed for ${url}: ${result.error.message}`);
      return {
        url,
        error: result.error,
        duration,
        timestamp: new Date().toISOString()
      };
    }

    logger?.debug?.(`Fetched ${url} in ${duration}ms (status: ${result.statusCode})`);

    return {
      url,
      status: 'success',
      statusCode: result.statusCode,
      contentType: result.contentType,
      contentLength: result.contentLength,
      title: result.title,
      html: result.html,
      duration,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger?.error?.(`Fetch error for ${url}: ${error.message}`);

    return {
      url,
      error: {
        message: error.message,
        code: error.code || 'FETCH_ERROR',
        stack: error.stack
      },
      duration,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  fetchUrl
};