'use strict';

function safeJsonParse(text, fallback) {
  if (text === undefined || text === null) return fallback;
  const raw = String(text).trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeId(value) {
  const id = String(value || '').trim();
  return id ? id : null;
}

function ensurePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function validateProfileShape(profile) {
  const obj = ensurePlainObject(profile);
  if (!obj) {
    const err = new Error('profile must be an object');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const id = normalizeId(obj.id);
  if (!id) {
    const err = new Error('profile.id is required');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const label = String(obj.label || '').trim();
  if (!label) {
    const err = new Error('profile.label is required');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const startUrl = String(obj.startUrl || '').trim();
  if (startUrl && !startUrl.includes('://')) {
    const err = new Error('profile.startUrl must be an absolute URL (include "://")');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const operationName = obj.operationName != null ? String(obj.operationName || '').trim() : '';
  const overrides = obj.overrides === undefined ? undefined : ensurePlainObject(obj.overrides);
  if (obj.overrides !== undefined && obj.overrides !== null && !overrides) {
    const err = new Error('profile.overrides must be an object');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const description = obj.description != null ? String(obj.description || '').trim() : '';
  const tags = Array.isArray(obj.tags)
    ? obj.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 16)
    : [];

  return {
    id,
    label,
    description: description || null,
    tags,
    startUrl: startUrl || null,
    operationName: operationName || null,
    overrides: overrides === undefined ? undefined : (overrides || null)
  };
}

class CrawlerProfilesStore {
  constructor({ db } = {}) {
    if (!db || typeof db.getSetting !== 'function' || typeof db.setSetting !== 'function') {
      throw new Error('CrawlerProfilesStore requires a db with getSetting/setSetting');
    }
    this.db = db;

    this.keys = {
      list: 'crawlerProfiles.list',
      activeId: 'crawlerProfiles.activeId'
    };
  }

  _loadList() {
    const items = safeJsonParse(this.db.getSetting(this.keys.list, '[]'), []);
    return Array.isArray(items) ? items : [];
  }

  _saveList(items) {
    const payload = JSON.stringify(Array.isArray(items) ? items : []);
    return this.db.setSetting(this.keys.list, payload);
  }

  _loadActiveId() {
    return normalizeId(this.db.getSetting(this.keys.activeId, null));
  }

  _saveActiveId(id) {
    return this.db.setSetting(this.keys.activeId, id != null ? String(id) : null);
  }

  list() {
    const items = this._loadList()
      .map((p) => {
        try {
          return validateProfileShape(p);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const activeId = this._loadActiveId();
    const active = activeId ? items.find((p) => p.id === activeId) : null;

    return {
      items,
      activeId: active ? active.id : (items[0]?.id || null),
      activeProfile: active || (items[0] || null)
    };
  }

  get(id) {
    const key = normalizeId(id);
    if (!key) return null;
    const items = this._loadList();
    const found = items.find((p) => p && String(p.id || '').trim() === key);
    if (!found) return null;
    return validateProfileShape(found);
  }

  upsert(profile) {
    const normalized = validateProfileShape(profile);
    const items = this._loadList();

    const next = [];
    let replaced = false;
    for (const item of items) {
      const itemId = item && item.id != null ? String(item.id).trim() : '';
      if (itemId && itemId === normalized.id) {
        next.push(normalized);
        replaced = true;
      } else {
        next.push(item);
      }
    }

    if (!replaced) {
      next.push(normalized);
    }

    this._saveList(next);

    // If this is the first profile, make it active.
    const activeId = this._loadActiveId();
    if (!activeId) {
      this._saveActiveId(normalized.id);
    }

    return normalized;
  }

  delete(id) {
    const key = normalizeId(id);
    if (!key) return false;

    const items = this._loadList();
    const next = items.filter((p) => !(p && String(p.id || '').trim() === key));

    if (next.length === items.length) {
      return false;
    }

    this._saveList(next);

    const activeId = this._loadActiveId();
    if (activeId === key) {
      const newActive = next[0] && next[0].id != null ? String(next[0].id).trim() : null;
      this._saveActiveId(newActive);
    }

    return true;
  }

  setActive(id) {
    const key = normalizeId(id);
    if (!key) {
      const err = new Error('id is required');
      err.statusCode = 400;
      err.code = 'BAD_REQUEST';
      throw err;
    }

    const exists = this.get(key);
    if (!exists) {
      const err = new Error('Profile not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    this._saveActiveId(key);
    return exists;
  }

  bootstrapGuardianPresets() {
    const defaults = [
      {
        id: 'guardian-home',
        label: 'The Guardian — Home',
        description: 'Basic article crawl seeded from the Guardian homepage.',
        tags: ['guardian'],
        startUrl: 'https://www.theguardian.com',
        operationName: 'basicArticleCrawl',
        overrides: {
          concurrency: 2,
          maxDownloads: 2000,
          logging: { queue: false }
        }
      },
      {
        id: 'guardian-uk',
        label: 'The Guardian — UK',
        description: 'Basic article crawl seeded from the Guardian UK section.',
        tags: ['guardian', 'uk'],
        startUrl: 'https://www.theguardian.com/uk',
        operationName: 'basicArticleCrawl',
        overrides: {
          concurrency: 2,
          maxDownloads: 2000,
          logging: { queue: false }
        }
      }
    ];

    const existing = this.list().items;
    const existingIds = new Set(existing.map((p) => p.id));

    const installed = [];
    for (const p of defaults) {
      if (!existingIds.has(p.id)) {
        installed.push(this.upsert(p));
      }
    }

    // Ensure activeId exists.
    const activeId = this._loadActiveId();
    if (!activeId) {
      const first = this.list().items[0];
      if (first) {
        this._saveActiveId(first.id);
      }
    }

    return {
      installed,
      count: installed.length
    };
  }
}

module.exports = {
  CrawlerProfilesStore
};
