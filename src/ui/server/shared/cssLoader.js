const fs = require('fs');
const path = require('path');

const cssCache = new Map();

/**
 * Load CSS from a file, optionally caching it.
 * @param {string} cssPath - Path to CSS file relative to the project root (e.g. 'src/ui/server/geoImport/styles.css')
 * @param {Object} options - Options
 * @param {boolean} [options.cache=true] - Whether to cache the CSS content
 * @param {boolean} [options.minify=false] - Whether to minify the CSS (simple regex based)
 * @returns {string} CSS content
 */
function loadCSS(cssPath, options = {}) {
  const { cache = true, minify = false } = options;
  
  if (cache && cssCache.has(cssPath)) {
    return cssCache.get(cssPath);
  }
  
  // Resolve path relative to project root
  // Assuming this file is in src/ui/server/shared/cssLoader.js
  // Project root is ../../../../
  const rootDir = path.resolve(__dirname, '..', '..', '..', '..');
  const fullPath = path.join(rootDir, cssPath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`CSS file not found: ${fullPath}`);
    return '';
  }

  let css = fs.readFileSync(fullPath, 'utf8');
  
  if (minify) {
    css = css.replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1');
  }
  
  if (cache) {
    cssCache.set(cssPath, css);
  }
  
  return css;
}

module.exports = { loadCSS };
