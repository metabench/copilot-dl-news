'use strict';

/**
 * HTTP Record/Replay Harness for Deterministic Testing
 * 
 * Provides three modes:
 * - 'live': pass-through to actual fetch (default)
 * - 'record': capture HTTP requests/responses to fixtures
 * - 'replay': serve responses from fixtures without network access
 * 
 * Fixture format: JSON metadata with body stored inline (base64 for binary)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'http');

// Headers to redact for security
const REDACTED_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token'
]);

/**
 * Generate a stable cache key for a request
 * @param {string} url - Request URL
 * @param {Object} [options] - Request options
 * @returns {string} - Stable hash key
 */
function generateFixtureKey(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const normalized = new URL(url);
  
  // Sort query params for deterministic hashing
  normalized.searchParams.sort();
  
  const keyData = {
    method,
    url: normalized.toString(),
    // Include body hash if present (for POST/PUT)
    bodyHash: options.body 
      ? crypto.createHash('sha256').update(String(options.body)).digest('hex').slice(0, 16)
      : null
  };
  
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify(keyData))
    .digest('base64url')
    .slice(0, 16);
  
  // Create readable filename prefix from URL
  const urlPrefix = normalized.hostname
    .replace(/[^a-z0-9]/gi, '_')
    .slice(0, 32);
  
  return `${urlPrefix}_${method}_${hash}`;
}

/**
 * Redact sensitive headers from request/response
 * @param {Object} headers - Headers object
 * @returns {Object} - Headers with sensitive values redacted
 */
function redactHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  
  const redacted = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    redacted[key] = REDACTED_HEADERS.has(lowerKey) ? '[REDACTED]' : value;
  }
  return redacted;
}

/**
 * Create an HTTP record/replay harness
 * 
 * @param {Object} options - Configuration options
 * @param {'live'|'record'|'replay'} options.mode - Operating mode
 * @param {string} [options.fixtureDir] - Directory for fixture files
 * @param {string} [options.namespace] - Namespace to avoid fixture collisions
 * @param {Function} [options.fetchFn] - Underlying fetch function (defaults to global fetch)
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} - Harness with fetch and utility methods
 */
function createHttpRecordReplay({
  mode = 'live',
  fixtureDir = DEFAULT_FIXTURE_DIR,
  namespace = 'default',
  fetchFn = null,
  logger = console
} = {}) {
  // Validate mode
  if (!['live', 'record', 'replay'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Must be "live", "record", or "replay".`);
  }
  
  // Resolve fixture directory with namespace
  const resolvedFixtureDir = path.join(fixtureDir, namespace);
  
  // Resolve fetch function
  const realFetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (!realFetch && mode !== 'replay') {
    throw new Error('No fetch function available. Provide fetchFn option or use replay mode.');
  }
  
  /**
   * Get fixture file path for a request
   */
  function getFixturePath(url, options) {
    const key = generateFixtureKey(url, options);
    return path.join(resolvedFixtureDir, `${key}.json`);
  }
  
  /**
   * Load fixture from disk
   */
  function loadFixture(fixturePath) {
    if (!fs.existsSync(fixturePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(fixturePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      logger.warn(`[httpRecordReplay] Failed to load fixture ${fixturePath}: ${err.message}`);
      return null;
    }
  }
  
  /**
   * Save fixture to disk
   */
  function saveFixture(fixturePath, fixture) {
    const dir = path.dirname(fixturePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8');
  }
  
  /**
   * Create a Response-like object from fixture data
   */
  function createResponseFromFixture(fixture) {
    let body = fixture.body;
    
    // Decode base64 body if needed
    if (fixture.bodyEncoding === 'base64') {
      body = Buffer.from(fixture.body, 'base64');
    }
    
    return {
      ok: fixture.status >= 200 && fixture.status < 300,
      status: fixture.status,
      statusText: fixture.statusText || '',
      headers: new Map(Object.entries(fixture.headers || {})),
      url: fixture.url,
      
      // Body methods
      async text() {
        return typeof body === 'string' ? body : body.toString('utf8');
      },
      async json() {
        const text = typeof body === 'string' ? body : body.toString('utf8');
        return JSON.parse(text);
      },
      async arrayBuffer() {
        if (Buffer.isBuffer(body)) {
          return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
        }
        return Buffer.from(body).buffer;
      },
      async buffer() {
        return Buffer.isBuffer(body) ? body : Buffer.from(body);
      },
      
      // Mark as fixture response
      _fromFixture: true,
      _fixturePath: fixture._fixturePath
    };
  }
  
  /**
   * Fetch wrapper with record/replay support
   */
  async function fetch(url, options = {}) {
    const fixturePath = getFixturePath(url, options);
    
    if (mode === 'replay') {
      const fixture = loadFixture(fixturePath);
      if (!fixture) {
        throw new Error(
          `[httpRecordReplay] Replay mode: No fixture found for ${url}. ` +
          `Expected at: ${fixturePath}`
        );
      }
      logger.debug?.(`[httpRecordReplay] Replaying fixture for ${url}`);
      return createResponseFromFixture({ ...fixture, _fixturePath: fixturePath });
    }
    
    // Live or record mode - make actual request
    const response = await realFetch(url, options);
    
    if (mode === 'record') {
      // Clone response to read body without consuming it
      const clonedResponse = response.clone();
      const bodyText = await clonedResponse.text();
      
      // Determine if body should be base64 encoded
      const contentType = response.headers.get('content-type') || '';
      const isBinary = !contentType.includes('text') && 
                       !contentType.includes('json') && 
                       !contentType.includes('xml');
      
      const fixture = {
        url: url,
        method: (options.method || 'GET').toUpperCase(),
        requestHeaders: redactHeaders(options.headers || {}),
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(
          [...response.headers.entries()].map(([k, v]) => [k, redactHeaders({ [k]: v })[k]])
        ),
        body: isBinary ? Buffer.from(bodyText).toString('base64') : bodyText,
        bodyEncoding: isBinary ? 'base64' : 'utf8',
        recordedAt: new Date().toISOString()
      };
      
      saveFixture(fixturePath, fixture);
      logger.debug?.(`[httpRecordReplay] Recorded fixture for ${url}`);
    }
    
    return response;
  }
  
  /**
   * Check if a fixture exists for a given request
   */
  function hasFixture(url, options = {}) {
    const fixturePath = getFixturePath(url, options);
    return fs.existsSync(fixturePath);
  }
  
  /**
   * Delete a fixture
   */
  function deleteFixture(url, options = {}) {
    const fixturePath = getFixturePath(url, options);
    if (fs.existsSync(fixturePath)) {
      fs.unlinkSync(fixturePath);
      return true;
    }
    return false;
  }
  
  /**
   * List all fixtures in namespace
   */
  function listFixtures() {
    if (!fs.existsSync(resolvedFixtureDir)) {
      return [];
    }
    return fs.readdirSync(resolvedFixtureDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(resolvedFixtureDir, f));
  }
  
  /**
   * Clear all fixtures in namespace
   */
  function clearFixtures() {
    const fixtures = listFixtures();
    for (const f of fixtures) {
      fs.unlinkSync(f);
    }
    return fixtures.length;
  }
  
  return {
    fetch,
    hasFixture,
    deleteFixture,
    listFixtures,
    clearFixtures,
    getFixturePath,
    generateFixtureKey,
    mode,
    fixtureDir: resolvedFixtureDir
  };
}

module.exports = {
  createHttpRecordReplay,
  generateFixtureKey,
  redactHeaders,
  DEFAULT_FIXTURE_DIR
};
