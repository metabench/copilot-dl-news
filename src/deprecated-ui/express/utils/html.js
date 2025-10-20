/**
 * HTML Utilities Module
 * 
 * Centralized HTML generation utilities inspired by jsgui3 patterns.
 * Provides safe HTML escaping, formatting helpers, and composition utilities.
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {*} value - Value to escape
 * @returns {string} Escaped HTML string
 */
function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c] || c));
}

/**
 * Ensures renderNav function exists, providing a fallback
 * @param {Function|undefined} fn - Navigation render function
 * @returns {Function} Safe navigation renderer
 */
function ensureRenderNav(fn) {
  if (typeof fn === 'function') return fn;
  return () => '<nav class="placeholder-nav"><!-- Navigation not available --></nav>';
}

/**
 * Formats bytes into human-readable size
 * @param {number} value - Bytes value
 * @returns {string} Formatted size string (e.g., "1.5 MB")
 */
function formatBytes(value) {
  if (value == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = Number(value) || 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return (index === 0 ? String(current | 0) : current.toFixed(1)) + ' ' + units[index];
}

/**
 * Formats number with thousand separators
 * @param {number} value - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(value) {
  if (value == null) return '';
  try {
    return Number(value).toLocaleString();
  } catch (_) {
    return String(value);
  }
}

/**
 * Converts object to query string
 * @param {Object} params - Parameters object
 * @returns {string} Query string (with leading ? if non-empty)
 */
function toQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

/**
 * Safe wrapper for trace.pre() function
 * @param {Object} trace - Trace object
 * @param {string} name - Trace name
 * @returns {Function} Trace end function or no-op
 */
function safeTracePre(trace, name) {
  if (!trace || typeof trace.pre !== 'function') return () => {};
  try {
    return trace.pre(name) || (() => {});
  } catch (_) {
    return () => {};
  }
}

/**
 * Creates a render context object with common utilities
 * Inspired by jsgui3's Context pattern
 * 
 * @param {Object} options - Context options
 * @param {Function} options.renderNav - Navigation renderer
 * @param {Function} options.startTrace - Trace starter (optional)
 * @param {Object} options.db - Database handle (optional)
 * @param {string} options.urlsDbPath - URLs database path (optional)
 * @returns {Object} Render context with utilities
 */
function createRenderContext(options = {}) {
  return {
    // HTML utilities
    escapeHtml,
    formatBytes,
    formatNumber,
    toQueryString,
    
    // Navigation
    renderNav: ensureRenderNav(options.renderNav),
    
    // Tracing (optional)
    startTrace: options.startTrace || (() => ({ pre: () => () => {} })),
    safeTracePre,
    
    // Database access (for data helpers)
    db: options.db,
    urlsDbPath: options.urlsDbPath,
    
    // Request context (optional)
    req: options.req,
    res: options.res
  };
}

/**
 * Tagged template literal for safe HTML generation
 * Auto-escapes interpolated values unless marked as raw
 * 
 * @example
 * const userInput = '<script>alert("xss")</script>';
 * const nav = renderNav();
 * const page = html`<h1>${userInput}</h1>${html.raw(nav)}`;
 * // Result: <h1>&lt;script&gt;...&lt;/script&gt;</h1><nav>...</nav>
 */
function html(strings, ...values) {
  return strings.reduce((result, str, i) => {
    const value = values[i];
    if (value === undefined) return result + str;
    
    // Handle raw HTML marker
    if (value && value.__html_raw) {
      return result + str + value.__html_raw;
    }
    
    // Auto-escape by default
    return result + str + escapeHtml(value);
  }, '');
}

/**
 * Marks HTML string as safe (skips escaping)
 * @param {string} htmlString - Trusted HTML string
 * @returns {Object} Marker object for html`` tagged template
 */
html.raw = function raw(htmlString) {
  return { __html_raw: htmlString };
};

module.exports = {
  escapeHtml,
  ensureRenderNav,
  formatBytes,
  formatNumber,
  toQueryString,
  safeTracePre,
  createRenderContext,
  html
};
