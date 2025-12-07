'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Favicon fetcher for news websites
 * Fetches favicons from websites and returns base64-encoded data
 */

/**
 * Fetch a website's favicon
 * Tries multiple common favicon locations
 * 
 * @param {string} websiteUrl - The website URL
 * @param {Object} [options] - Options
 * @param {number} [options.timeout=5000] - Request timeout in ms
 * @param {number} [options.maxSize=102400] - Max favicon size in bytes (100KB)
 * @returns {Promise<{ data: string, contentType: string } | null>} - Base64 data and content type, or null
 */
async function fetchFavicon(websiteUrl, { timeout = 5000, maxSize = 102400 } = {}) {
  const parsed = new URL(websiteUrl);
  const baseUrl = `${parsed.protocol}//${parsed.hostname}`;
  
  // Favicon locations to try, in order of preference
  const faviconPaths = [
    '/favicon.ico',
    '/favicon.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/favicon-32x32.png',
    '/favicon-16x16.png'
  ];
  
  for (const path of faviconPaths) {
    try {
      const result = await fetchUrl(`${baseUrl}${path}`, { timeout, maxSize });
      if (result && isValidImageContentType(result.contentType)) {
        return result;
      }
    } catch (err) {
      // Continue to next path
    }
  }
  
  // Try to parse HTML for favicon link (as fallback)
  try {
    const htmlResult = await fetchUrl(baseUrl, { timeout, maxSize: 51200 });
    if (htmlResult && htmlResult.contentType.includes('text/html')) {
      const faviconUrl = extractFaviconFromHtml(htmlResult.data, baseUrl);
      if (faviconUrl) {
        const iconResult = await fetchUrl(faviconUrl, { timeout, maxSize });
        if (iconResult && isValidImageContentType(iconResult.contentType)) {
          return iconResult;
        }
      }
    }
  } catch (err) {
    // Ignore HTML parsing errors
  }
  
  return null;
}

/**
 * Fetch a URL and return base64-encoded data
 * @param {string} url - URL to fetch
 * @param {Object} options - Options
 * @returns {Promise<{ data: string, contentType: string } | null>}
 */
function fetchUrl(url, { timeout, maxSize }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    
    const req = client.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsCrawler/1.0)',
        'Accept': 'image/*, text/html'
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        fetchUrl(redirectUrl, { timeout, maxSize })
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      
      const contentType = res.headers['content-type'] || 'application/octet-stream';
      const chunks = [];
      let totalSize = 0;
      
      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          req.destroy();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        resolve({ data: base64, contentType: contentType.split(';')[0] });
      });
      
      res.on('error', () => resolve(null));
    });
    
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Check if content type is a valid image type
 * @param {string} contentType - MIME type
 * @returns {boolean}
 */
function isValidImageContentType(contentType) {
  const validTypes = [
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/ico',
    'image/icon',
    'image/png',
    'image/gif',
    'image/jpeg',
    'image/svg+xml',
    'image/webp'
  ];
  return validTypes.some(t => contentType.includes(t));
}

/**
 * Extract favicon URL from HTML
 * @param {string} base64Html - Base64-encoded HTML
 * @param {string} baseUrl - Base URL for resolving relative paths
 * @returns {string|null} - Favicon URL or null
 */
function extractFaviconFromHtml(base64Html, baseUrl) {
  try {
    const html = Buffer.from(base64Html, 'base64').toString('utf8');
    
    // Look for link rel="icon" or rel="shortcut icon"
    const iconPattern = /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["'][^>]*>/i;
    const appleTouchPattern = /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["'][^>]*>/i;
    
    let match = html.match(iconPattern) || html.match(appleTouchPattern);
    
    // Also try reversed attribute order
    if (!match) {
      const reversedPattern = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["'][^>]*>/i;
      match = html.match(reversedPattern);
    }
    
    if (match && match[1]) {
      return new URL(match[1], baseUrl).toString();
    }
  } catch (err) {
    // Ignore parsing errors
  }
  return null;
}

/**
 * Fetch and store favicons for multiple websites
 * @param {Object} db - Database instance with favicon methods
 * @param {Array<{ id: number, url: string }>} websites - Websites to fetch favicons for
 * @param {Object} [options] - Options
 * @param {Function} [options.onProgress] - Progress callback (current, total, website)
 * @param {Function} [options.logger] - Logger
 * @returns {Promise<{ success: number, failed: number }>}
 */
async function fetchAndStoreFavicons(db, websites, { onProgress, logger = console } = {}) {
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < websites.length; i++) {
    const website = websites[i];
    
    if (onProgress) {
      onProgress(i + 1, websites.length, website);
    }
    
    try {
      const result = await fetchFavicon(website.url);
      
      if (result) {
        db.setNewsWebsiteFavicon(website.id, result.data, result.contentType);
        success++;
        logger.debug?.(`[favicon] Fetched favicon for ${website.url}`);
      } else {
        db.setNewsWebsiteFaviconError(website.id, 'No favicon found');
        failed++;
        logger.debug?.(`[favicon] No favicon found for ${website.url}`);
      }
    } catch (err) {
      db.setNewsWebsiteFaviconError(website.id, err.message);
      failed++;
      logger.warn?.(`[favicon] Error fetching favicon for ${website.url}:`, err.message);
    }
  }
  
  return { success, failed };
}

module.exports = {
  fetchFavicon,
  fetchAndStoreFavicons,
  isValidImageContentType,
  extractFaviconFromHtml
};
