'use strict';

const DEFAULT_BASE_URL = 'http://localhost:8088';

async function importFetch() {
  const { default: fetch } = await import('node-fetch');
  return fetch;
}

class PlacesInfoClient {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = null,
    logger = console,
    defaultTimeoutMs = 30000
  } = {}) {
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this._fetchImpl = fetchImpl;
    this.logger = logger || console;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async _ensureFetch() {
    if (!this._fetchImpl) {
      this._fetchImpl = await importFetch();
    }
    return this._fetchImpl;
  }

  async _fetchJson(path, {
    searchParams = null,
    signal = null,
    timeoutMs = undefined,
    headers = null
  } = {}) {
    const fetch = await this._ensureFetch();
    const url = new URL(path, `${this.baseUrl}/`);
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value === undefined || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const v of value) {
            if (v !== undefined && v !== null) {
              url.searchParams.append(key, String(v));
            }
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const effectiveTimeout = timeoutMs === undefined ? this.defaultTimeoutMs : timeoutMs;
    let controller = null;
    let timeoutId = null;
    let didTimeout = false;
    let finalSignal = signal || null;

    if (!finalSignal && effectiveTimeout > 0) {
      controller = new AbortController();
      finalSignal = controller.signal;
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, effectiveTimeout);
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: Object.assign({
          Accept: 'application/json'
        }, headers || {}),
        signal: finalSignal || undefined
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`Places API request failed (${response.status} ${response.statusText || ''}) ${bodyText.slice(0, 200)}`.trim());
      }

      return await response.json();
    } catch (error) {
      if (error && error.name === 'AbortError' && didTimeout) {
        throw new Error(`Places API request to ${url.pathname} timed out after ${effectiveTimeout}ms`);
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async getServerTime(options = {}) {
    return this._fetchJson('/v1/time', options);
  }

  async getSampleUser(options = {}) {
    return this._fetchJson('/v1/user', options);
  }

  async getSampleUsers(options = {}) {
    return this._fetchJson('/v1/users', options);
  }

  async fetchAdminAreas({
    country,
    level = undefined,
    includeGeometry = undefined,
    minFeatures = undefined,
    batchSize = undefined
  } = {}, options = {}) {
    if (!country) {
      throw new Error('country is required to fetch admin areas');
    }

    const searchParams = {
      country,
      level,
      minFeatures,
      batchSize
    };

    if (includeGeometry !== undefined) {
      searchParams.includeGeometry = includeGeometry ? 'true' : 'false';
    }

    return this._fetchJson('/v1/admin-areas', {
      ...options,
      searchParams
    });
  }
}

module.exports = {
  PlacesInfoClient,
  DEFAULT_BASE_URL
};
