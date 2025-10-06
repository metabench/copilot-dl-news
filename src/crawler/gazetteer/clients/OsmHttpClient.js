'use strict';

const { each } = require('lang-tools');
const DEFAULT_USER_AGENT = 'copilot-dl-news/1.0 (OSM groundwork)';

async function importFetch() {
  const { default: fetch } = await import('node-fetch');
  return fetch;
}

class OsmHttpClient {
  constructor({
    logger = console,
    userAgent = DEFAULT_USER_AGENT,
    overpassUrl = 'https://overpass-api.de/api/interpreter',
    osmApiBase = 'https://api.openstreetmap.org/api/0.6',
    nominatimBase = 'https://nominatim.openstreetmap.org',
    fetchImpl = null,
    throttleMs = 1000
  } = {}) {
    this.logger = logger || console;
    this.userAgent = userAgent;
    this.overpassUrl = overpassUrl;
    this.osmApiBase = osmApiBase.replace(/\/$/, '');
    this.nominatimBase = nominatimBase.replace(/\/$/, '');
    this._fetchImpl = fetchImpl;
    this.throttleMs = throttleMs;
    this._lastCallAt = 0;
  }

  async _fetch(url, options = {}) {
    if (!this._fetchImpl) {
      this._fetchImpl = await importFetch();
    }
    const elapsed = Date.now() - this._lastCallAt;
    if (this.throttleMs > 0 && elapsed < this.throttleMs) {
      await new Promise((resolve) => setTimeout(resolve, this.throttleMs - elapsed));
    }
    const headers = Object.assign({}, options.headers, {
      'User-Agent': this.userAgent,
      'Accept': options.accept || 'application/json'
    });
    const response = await this._fetchImpl(url, {
      ...options,
      headers
    });
    this._lastCallAt = Date.now();
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OSM request failed (${response.status}): ${text.slice(0, 200)}`);
    }
    return response;
  }

  async fetchOverpass(query, { signal = null, responseType = 'json' } = {}) {
    if (!query || typeof query !== 'string') {
      throw new Error('Overpass query string is required');
    }
    this.logger.info('[OsmHttpClient] Overpass query length:', query.length);
    const response = await this._fetch(this.overpassUrl, {
      method: 'POST',
      body: query,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      signal
    });
    if (responseType === 'raw') {
      return response.text();
    }
    return response.json();
  }

  async fetchElement(osmType, osmId, { signal = null } = {}) {
    const type = String(osmType || '').toLowerCase();
    if (!['node', 'way', 'relation'].includes(type)) {
      throw new Error(`Unsupported OSM element type: ${osmType}`);
    }
    if (!osmId) {
      throw new Error('osmId is required');
    }
    const url = `${this.osmApiBase}/${type}/${encodeURIComponent(osmId)}.json`;
    const res = await this._fetch(url, { signal });
    return res.json();
  }

  async fetchNominatimDetails(params = {}, { signal = null } = {}) {
    const url = new URL(`${this.nominatimBase}/lookup`);
    each(params, (value, key) => {
      if (value != null) {
        url.searchParams.set(key, value);
      }
    });
    if (!url.searchParams.has('format')) {
      url.searchParams.set('format', 'json');
    }
    const res = await this._fetch(url.toString(), {
      headers: {
        'Accept-Language': 'en'
      },
      signal
    });
    return res.json();
  }
}

module.exports = { OsmHttpClient };
