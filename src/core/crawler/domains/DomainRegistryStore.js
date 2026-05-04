"use strict";

class DomainRegistryStore {
  constructor({ db } = {}) {
    this.db = db && db.db ? db.db : db;
  }

  list({ limit = 100 } = {}) {
    const items = this._readItems(limit);
    return { items, count: items.length };
  }

  _readItems(limit) {
    if (!this.db || typeof this.db.prepare !== "function") {
      return [];
    }

    if (this._tableExists("domain_registry")) {
      return this.db.prepare(`
        SELECT host, enabled, crawl_profile AS crawlProfile, preflight_status AS preflightStatus
        FROM domain_registry
        ORDER BY enabled DESC, host ASC
        LIMIT ?
      `).all(limit).map(normalizeRegistryRow);
    }

    if (this._tableExists("urls")) {
      return this.db.prepare(`
        SELECT host, COUNT(*) AS urlCount
        FROM urls
        WHERE host IS NOT NULL AND TRIM(host) != ''
        GROUP BY host
        ORDER BY urlCount DESC, host ASC
        LIMIT ?
      `).all(limit).map((row) => ({
        host: row.host,
        enabled: true,
        crawlProfile: null,
        preflight: null,
        stats: { urlCount: Number(row.urlCount) || 0 },
      }));
    }

    return [];
  }

  _tableExists(name) {
    try {
      const row = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
      return Boolean(row && row.name);
    } catch (_) {
      return false;
    }
  }
}

function normalizeRegistryRow(row) {
  return {
    host: row.host,
    enabled: row.enabled === 1 || row.enabled === true || row.enabled === "true",
    crawlProfile: row.crawlProfile || null,
    preflight: row.preflightStatus ? { status: row.preflightStatus } : null,
  };
}

module.exports = { DomainRegistryStore };