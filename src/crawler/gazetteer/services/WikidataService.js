'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fetch } = require('undici');

/**
 * WikidataService
 *
 * Centralized service for interacting with Wikidata's SPARQL endpoint and entity API.
 * Provides caching, rate limiting, query execution, and entity fetching capabilities.
 *
 * Features:
 * - SPARQL query execution with caching (SHA1-based)
 * - Entity fetching (single or batch)
 * - Configurable rate limiting
 * - Timeout/abort support
 * - Query builder utilities
 * - Result streaming for large datasets (future)
 * - Federated query support (future)
 *
 * @example
 * const service = new WikidataService({
 *   cacheDir: 'data/cache/sparql',
 *   sleepMs: 250,
 *   timeoutMs: 20000,
 *   logger: console
 * });
 *
 * const result = await service.executeSparqlQuery(`
 *   SELECT ?item ?label WHERE {
 *     ?item wdt:P31 wd:Q6256.
 *     ?item rdfs:label ?label.
 *   }
 * `);
 */
class WikidataService {
  constructor({
    sparqlEndpoint = 'https://query.wikidata.org/sparql',
    entityEndpoint = 'https://www.wikidata.org/wiki/Special:EntityData',
    cacheDir = path.join(process.cwd(), 'data', 'cache', 'sparql'),
    sleepMs = 250,
    timeoutMs = 20000,
    userAgent = 'copilot-dl-news/1.0',
    logger = console
  } = {}) {
    this.sparqlEndpoint = sparqlEndpoint;
    this.entityEndpoint = entityEndpoint;
    this.cacheDir = cacheDir;
    this.sleepMs = sleepMs;
    this.timeoutMs = timeoutMs;
    this.userAgent = userAgent;
    this.logger = logger;

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Execute a SPARQL query against the Wikidata endpoint.
   * Results are cached using SHA1 hash of the query.
   *
   * @param {string} query - SPARQL query string
   * @param {Object} options - Execution options
   * @param {boolean} options.useCache - Whether to use caching (default: true)
   * @param {number} options.timeoutMs - Override default timeout
   * @param {AbortSignal} options.signal - Abort signal for cancellation
   * @returns {Promise<Object>} SPARQL query results in JSON format
   */
  async executeSparqlQuery(query, { useCache = true, timeoutMs = null, signal = null } = {}) {
    // Check cache first
    if (useCache) {
      const cached = this._getCachedResult(query);
      if (cached) {
        this.logger.info('[WikidataService] SPARQL cache hit');
        return cached;
      }
    }

    // Execute query
    const timeout = timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const url = `${this.sparqlEndpoint}?format=json&query=${encodeURIComponent(query)}`;
      this.logger.info('[WikidataService] Executing SPARQL query:', url.substring(0, 100) + '...');

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/sparql-results+json'
        },
        signal: signal || controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      // Cache result
      if (useCache) {
        this._cacheResult(query, result);
      }

      // Rate limiting
      if (this.sleepMs > 0) {
        await this._sleep(this.sleepMs);
      }

      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      this.logger.error('[WikidataService] SPARQL query failed:', err.message);
      throw err;
    }
  }

  /**
   * Fetch Wikidata entities by their QIDs.
   * Supports batch fetching (multiple QIDs in a single request).
   *
   * @param {string|string[]} qids - Single QID or array of QIDs
   * @param {Object} options - Fetch options
   * @param {number} options.timeoutMs - Override default timeout
   * @param {AbortSignal} options.signal - Abort signal for cancellation
   * @returns {Promise<Object>} Entity data from Wikidata
   */
  async fetchEntities(qids, { timeoutMs = null, signal = null } = {}) {
    const qidArray = Array.isArray(qids) ? qids : [qids];
    
    if (qidArray.length === 0) {
      return { entities: {} };
    }

    const timeout = timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const qidString = encodeURIComponent(qidArray.join('|'));
      const url = `${this.entityEndpoint}/${qidString}.json`;
      this.logger.info('[WikidataService] Fetching entities:', qidArray.length, 'QIDs');

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        },
        signal: signal || controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Entity fetch failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      // Rate limiting
      if (this.sleepMs > 0) {
        await this._sleep(this.sleepMs);
      }

      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      this.logger.error('[WikidataService] Entity fetch failed:', err.message);
      throw err;
    }
  }

  /**
   * Query builder utilities for constructing SPARQL queries programmatically.
   */
  get queryBuilder() {
    return new WikidataQueryBuilder();
  }

  /**
   * Execute multiple SPARQL queries in sequence with rate limiting.
   *
   * @param {string[]} queries - Array of SPARQL query strings
   * @param {Object} options - Batch execution options
   * @returns {Promise<Object[]>} Array of query results
   */
  async executeBatch(queries, options = {}) {
    const results = [];
    
    for (const query of queries) {
      const result = await this.executeSparqlQuery(query, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Clear all cached SPARQL results.
   */
  clearCache() {
    const files = fs.readdirSync(this.cacheDir);
    let cleared = 0;

    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(this.cacheDir, file));
        cleared++;
      }
    }

    this.logger.info(`[WikidataService] Cleared ${cleared} cached queries`);
    return cleared;
  }

  /**
   * Get statistics about cached queries.
   */
  getCacheStats() {
    const files = fs.readdirSync(this.cacheDir);
    const cacheFiles = files.filter(f => f.endsWith('.json'));
    
    let totalSize = 0;
    for (const file of cacheFiles) {
      const stats = fs.statSync(path.join(this.cacheDir, file));
      totalSize += stats.size;
    }

    return {
      count: cacheFiles.length,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    };
  }

  // Private methods

  _getCachedResult(query) {
    const hash = this._hashQuery(query);
    const cachePath = path.join(this.cacheDir, `${hash}.json`);

    if (fs.existsSync(cachePath)) {
      try {
        const content = fs.readFileSync(cachePath, 'utf8');
        return JSON.parse(content);
      } catch (err) {
        this.logger.warn('[WikidataService] Failed to read cache:', err.message);
        return null;
      }
    }

    return null;
  }

  _cacheResult(query, result) {
    const hash = this._hashQuery(query);
    const cachePath = path.join(this.cacheDir, `${hash}.json`);

    try {
      fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn('[WikidataService] Failed to cache result:', err.message);
    }
  }

  _hashQuery(query) {
    return crypto.createHash('sha1').update(query).digest('hex');
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * WikidataQueryBuilder
 *
 * Utility for constructing SPARQL queries programmatically.
 * Provides a fluent API for building complex queries.
 *
 * @example
 * const query = new WikidataQueryBuilder()
 *   .select(['?item', '?label'])
 *   .where([
 *     '?item wdt:P31 wd:Q6256.',
 *     '?item rdfs:label ?label.'
 *   ])
 *   .filter('LANG(?label) = "en"')
 *   .limit(100)
 *   .build();
 */
class WikidataQueryBuilder {
  constructor() {
    this._prefixes = {
      wd: 'http://www.wikidata.org/entity/',
      wdt: 'http://www.wikidata.org/prop/direct/',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#'
    };
    this._select = [];
    this._where = [];
    this._filters = [];
    this._optional = [];
    this._limit = null;
    this._offset = null;
    this._orderBy = null;
  }

  /**
   * Add a custom prefix.
   */
  prefix(name, uri) {
    this._prefixes[name] = uri;
    return this;
  }

  /**
   * Set SELECT variables.
   */
  select(variables) {
    this._select = Array.isArray(variables) ? variables : [variables];
    return this;
  }

  /**
   * Add WHERE clause patterns.
   */
  where(patterns) {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];
    this._where.push(...patternArray);
    return this;
  }

  /**
   * Add FILTER expressions.
   */
  filter(expression) {
    this._filters.push(expression);
    return this;
  }

  /**
   * Add OPTIONAL clause patterns.
   */
  optional(patterns) {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];
    this._optional.push(...patternArray);
    return this;
  }

  /**
   * Set LIMIT.
   */
  limit(value) {
    this._limit = value;
    return this;
  }

  /**
   * Set OFFSET.
   */
  offset(value) {
    this._offset = value;
    return this;
  }

  /**
   * Set ORDER BY.
   */
  orderBy(expression) {
    this._orderBy = expression;
    return this;
  }

  /**
   * Build the complete SPARQL query string.
   */
  build() {
    let query = '';

    // Prefixes
    for (const [name, uri] of Object.entries(this._prefixes)) {
      query += `PREFIX ${name}: <${uri}>\n`;
    }
    query += '\n';

    // SELECT
    query += `SELECT ${this._select.join(' ')}\n`;

    // WHERE
    query += 'WHERE {\n';
    for (const pattern of this._where) {
      query += `  ${pattern}\n`;
    }

    // OPTIONAL
    if (this._optional.length > 0) {
      query += '  OPTIONAL {\n';
      for (const pattern of this._optional) {
        query += `    ${pattern}\n`;
      }
      query += '  }\n';
    }

    // FILTER
    for (const filter of this._filters) {
      query += `  FILTER(${filter})\n`;
    }

    query += '}\n';

    // ORDER BY
    if (this._orderBy) {
      query += `ORDER BY ${this._orderBy}\n`;
    }

    // LIMIT/OFFSET
    if (this._limit) {
      query += `LIMIT ${this._limit}\n`;
    }
    if (this._offset) {
      query += `OFFSET ${this._offset}\n`;
    }

    return query;
  }
}

module.exports = WikidataService;
