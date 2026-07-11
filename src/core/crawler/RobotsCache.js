'use strict';

const DEFAULT_ROBOTS_CACHE_TTL_SECONDS = Number(
  process.env.CRAWLER_ROBOTS_CACHE_TTL_SECONDS || 24 * 60 * 60
);

function toPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeText(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return String(value);
}

function parseTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
}

function getHeader(headers, name) {
  if (!headers || !name) return null;
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || null;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

function extractSitemapUrls(robotsTxt, baseUrl) {
  const text = normalizeText(robotsTxt);
  if (!text) return [];
  const urls = new Set();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^sitemap\s*:/i.test(trimmed)) continue;
    const raw = trimmed.replace(/^sitemap\s*:/i, '').trim();
    if (!raw) continue;
    try {
      urls.add(new URL(raw, baseUrl).href);
    } catch (_) {
      // Ignore malformed sitemap declarations.
    }
  }
  return [...urls];
}

function parseCrawlDelays(robotsTxt) {
  const text = normalizeText(robotsTxt);
  const delays = new Map();
  if (!text) return delays;

  let agents = [];
  let sawDirective = false;
  const startNewGroupIfNeeded = () => {
    if (sawDirective) {
      agents = [];
      sawDirective = false;
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const field = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (field === 'user-agent') {
      startNewGroupIfNeeded();
      if (value) agents.push(value.toLowerCase());
      continue;
    }

    sawDirective = true;
    if (field !== 'crawl-delay' || agents.length === 0) continue;
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    for (const agent of agents) {
      if (!delays.has(agent)) delays.set(agent, seconds);
    }
  }

  return delays;
}

function parseCrawlDelay(robotsTxt, userAgent = '*') {
  const delays = parseCrawlDelays(robotsTxt);
  const normalized = String(userAgent || '*').toLowerCase();
  if (delays.has(normalized)) return delays.get(normalized);
  if (normalized.includes('/')) {
    const shortName = normalized.split('/')[0];
    if (delays.has(shortName)) return delays.get(shortName);
  }
  return delays.has('*') ? delays.get('*') : null;
}

function normalizeCachedRecord(record, source = 'typed') {
  if (!record) return null;
  const robotsTxt = normalizeText(
    record.robotsTxt ?? record.robots_txt ?? record.html ?? record.body ?? record.text
  );
  if (!robotsTxt) return null;
  return {
    source,
    domain: record.domain || null,
    robotsTxt,
    fetchedAt: record.fetchedAt || record.fetched_at || record.cacheUpdatedAt || record.updatedAt || null,
    expiresAt: record.expiresAt || record.expires_at || null,
    httpStatus: record.httpStatus ?? record.http_status ?? null,
    etag: record.etag || null,
    lastModified: record.lastModified || record.last_modified || null,
    crawlDelaySeconds: record.crawlDelaySeconds ?? record.crawl_delay_seconds ?? null,
    sitemapUrls: parseJsonArray(record.sitemapUrls ?? record.sitemap_urls)
  };
}

class RobotsCache {
  constructor({
    baseUrl,
    domain,
    fetchImpl,
    dbAdapter = null,
    ttlSeconds = DEFAULT_ROBOTS_CACHE_TTL_SECONDS,
    retryAttempts = 3,
    retryDelayMs = 1000,
    now = () => Date.now(),
    logger = console
  } = {}) {
    if (!baseUrl || !domain) throw new Error('RobotsCache requires baseUrl and domain');
    if (typeof fetchImpl !== 'function') throw new Error('RobotsCache requires fetchImpl');
    this.baseUrl = baseUrl;
    this.domain = domain;
    this.robotsUrl = `${baseUrl}/robots.txt`;
    this.fetch = fetchImpl;
    this.dbAdapter = dbAdapter;
    this.ttlSeconds = toPositiveNumber(ttlSeconds, DEFAULT_ROBOTS_CACHE_TTL_SECONDS);
    this.retryAttempts = Math.max(1, Math.floor(toPositiveNumber(retryAttempts, 3)));
    this.retryDelayMs = Math.max(0, Math.floor(Number(retryDelayMs) || 0));
    this.now = now;
    this.logger = logger || console;
  }

  getCrawlDelay(robotsTxt, userAgent = '*') {
    return parseCrawlDelay(robotsTxt, userAgent);
  }

  async load() {
    const db = this._resolveDb();
    const cached = await this._readCache(db);
    if (cached && this._isFresh(cached)) {
      return this._result('cache-hit', cached);
    }

    const headers = this._conditionalHeaders(cached);
    const requestStartedIso = new Date(this.now()).toISOString();
    const response = await this._fetchWithRetry(headers);
    const fetchedAtIso = new Date(this.now()).toISOString();
    if (!response) {
      return cached ? this._result('stale-cache', cached) : { loaded: false, source: 'fetch-failed' };
    }
    if (response.status === 304 && cached) {
      await this._recordFetchVisibility(response, { requestStartedIso, fetchedAtIso, bytes: 0 });
      const touched = await this._touchCache(db, cached);
      return this._result('revalidated-304', { ...cached, fetchedAt: touched || new Date(this.now()).toISOString() });
    }
    if (response.status === 404) {
      await this._recordFetchVisibility(response, { requestStartedIso, fetchedAtIso, bytes: 0 });
      return { loaded: false, source: 'not-found', httpStatus: 404 };
    }
    if (!response.ok) {
      await this._recordFetchVisibility(response, { requestStartedIso, fetchedAtIso, bytes: 0 });
      return cached ? this._result('stale-cache', cached) : { loaded: false, source: 'http-error', httpStatus: response.status };
    }

    const robotsTxt = await response.text();
    await this._recordFetchVisibility(response, {
      requestStartedIso,
      fetchedAtIso,
      bytes: Buffer.byteLength(robotsTxt, 'utf8')
    });
    const record = {
      domain: this.domain,
      robotsTxt,
      fetchedAt: new Date(this.now()).toISOString(),
      httpStatus: response.status || 200,
      etag: getHeader(response.headers, 'etag'),
      lastModified: getHeader(response.headers, 'last-modified'),
      crawlDelaySeconds: parseCrawlDelay(robotsTxt, '*'),
      sitemapUrls: extractSitemapUrls(robotsTxt, this.baseUrl)
    };
    await this._writeCache(db, record);
    return this._result('network', record);
  }

  _result(source, record) {
    return {
      loaded: true,
      source,
      robotsUrl: this.robotsUrl,
      robotsTxt: record.robotsTxt,
      fetchedAt: record.fetchedAt || null,
      httpStatus: record.httpStatus || 200,
      etag: record.etag || null,
      lastModified: record.lastModified || null,
      crawlDelaySeconds: record.crawlDelaySeconds ?? parseCrawlDelay(record.robotsTxt, '*'),
      sitemapUrls: Array.isArray(record.sitemapUrls) && record.sitemapUrls.length
        ? record.sitemapUrls
        : extractSitemapUrls(record.robotsTxt, this.baseUrl)
    };
  }

  /**
   * Fetch-visibility: land the robots.txt request in http_responses like any
   * other real HTTP request, so politeness/throughput accounting sees it.
   * Best-effort — recording must never break robots loading.
   */
  async _recordFetchVisibility(response, { requestStartedIso, fetchedAtIso, bytes = 0 } = {}) {
    try {
      const adapter = typeof this.dbAdapter === 'function' ? this.dbAdapter() : this.dbAdapter;
      if (!adapter || typeof adapter.insertHttpResponse !== 'function') return;
      await adapter.insertHttpResponse({
        url: this.robotsUrl,
        request_started_at: requestStartedIso,
        fetched_at: fetchedAtIso,
        http_status: response.status,
        content_type: getHeader(response.headers, 'content-type'),
        etag: getHeader(response.headers, 'etag'),
        last_modified: getHeader(response.headers, 'last-modified'),
        bytes_downloaded: bytes
      });
    } catch (_error) { /* visibility is best-effort */ }
  }

  _resolveDb() {
    const adapter = typeof this.dbAdapter === 'function' ? this.dbAdapter() : this.dbAdapter;
    if (!adapter) return null;
    if (
      typeof adapter.getRobotsCache === 'function' ||
      typeof adapter.upsertRobotsCache === 'function' ||
      typeof adapter.getArticleByUrl === 'function' ||
      typeof adapter.getArticleRowByUrl === 'function'
    ) {
      return adapter;
    }
    return adapter.db || adapter;
  }

  async _readCache(db) {
    if (!db) return null;
    try {
      if (typeof db.getRobotsCache === 'function') {
        return normalizeCachedRecord(await db.getRobotsCache(this.domain), 'typed');
      }
      if (db.coverage && typeof db.coverage.getRobotsCache === 'function') {
        return normalizeCachedRecord(await db.coverage.getRobotsCache(this.domain), 'typed');
      }
      if (typeof db.getArticleByUrl === 'function') {
        return normalizeCachedRecord(await db.getArticleByUrl(this.robotsUrl), 'legacy-article');
      }
      if (typeof db.getArticleRowByUrl === 'function') {
        return normalizeCachedRecord(await db.getArticleRowByUrl(this.robotsUrl), 'legacy-article');
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  async _writeCache(db, record) {
    if (!db) return;
    const expiresAt = new Date(this.now() + this.ttlSeconds * 1000).toISOString();
    const typed = { ...record, expiresAt };
    try {
      if (typeof db.upsertRobotsCache === 'function') {
        await db.upsertRobotsCache(typed);
        return;
      }
      if (db.coverage && typeof db.coverage.upsertRobotsCache === 'function') {
        await db.coverage.upsertRobotsCache(typed);
        return;
      }
      if (typeof db.upsertArticle === 'function') {
        await db.upsertArticle({
          url: this.robotsUrl,
          fetched_at: record.fetchedAt,
          http_status: record.httpStatus || 200,
          content_type: 'text/plain',
          html: record.robotsTxt,
          title: 'robots.txt',
          classification: 'robots',
          etag: record.etag || null,
          last_modified: record.lastModified || null
        }, { compress: false });
      }
    } catch (_) {
      // Cache write failure is non-critical.
    }
  }

  async _touchCache(db, cached) {
    if (!db) return null;
    const fetchedAt = new Date(this.now()).toISOString();
    const record = { ...cached, domain: this.domain, fetchedAt };
    try {
      if (typeof db.upsertRobotsCache === 'function') {
        await db.upsertRobotsCache({ ...record, expiresAt: new Date(this.now() + this.ttlSeconds * 1000).toISOString() });
        return fetchedAt;
      }
      if (db.coverage && typeof db.coverage.upsertRobotsCache === 'function') {
        await db.coverage.upsertRobotsCache({ ...record, expiresAt: new Date(this.now() + this.ttlSeconds * 1000).toISOString() });
        return fetchedAt;
      }
      await this._writeCache(db, record);
      return fetchedAt;
    } catch (_) {
      return null;
    }
  }

  _isFresh(record) {
    if (!record) return false;
    if (record.expiresAt && parseTimestamp(record.expiresAt) > this.now()) return true;
    const fetchedAtMs = parseTimestamp(record.fetchedAt);
    if (!fetchedAtMs) return false;
    return Math.floor((this.now() - fetchedAtMs) / 1000) < this.ttlSeconds;
  }

  _conditionalHeaders(cached) {
    const headers = {};
    if (!cached) return headers;
    if (cached.etag) headers['If-None-Match'] = cached.etag;
    if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    return headers;
  }

  async _fetchWithRetry(headers = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        return await this.fetch(this.robotsUrl, Object.keys(headers).length ? { headers } : undefined);
      } catch (err) {
        lastError = err;
        if (attempt < this.retryAttempts && this.retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
        }
      }
    }
    if (lastError && this.logger?.log) {
      this.logger.log(`Failed to fetch robots.txt: ${lastError.message || lastError}`);
    }
    return null;
  }
}

module.exports = {
  RobotsCache,
  extractSitemapUrls,
  parseCrawlDelay,
  parseCrawlDelays,
  normalizeCachedRecord
};
