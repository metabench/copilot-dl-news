"use strict";

const { listDomainRegistryItems } = require("news-crawler-db");

class DomainRegistryStore {
  constructor({ db } = {}) {
    this.db = db && db.db ? db.db : db;
  }

  list({ limit = 100 } = {}) {
    const items = this._readItems(limit);
    return { items, count: items.length };
  }

  _readItems(limit) {
    if (!this.db) {
      return [];
    }

    return listDomainRegistryItems(this.db, { limit }).map((row) => {
      if (row.urlCount != null) {
        return {
          host: row.host,
          enabled: true,
          crawlProfile: null,
          preflight: null,
          stats: { urlCount: Number(row.urlCount) || 0 },
        };
      }
      return normalizeRegistryRow(row);
    });
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
