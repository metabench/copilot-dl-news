"use strict";

const statementCache = new WeakMap();

function getStatements(db) {
  let cached = statementCache.get(db);
  if (cached) return cached;

  const selectByUrl = db.prepare("SELECT id, host FROM urls WHERE url = ?");
  const insertUrl = db.prepare(`
    INSERT OR IGNORE INTO urls (url, host, created_at, last_seen_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
  `);
  const updateHost = db.prepare("UPDATE urls SET host = COALESCE(?, host) WHERE id = ?");
  const touchUrl = db.prepare("UPDATE urls SET last_seen_at = datetime('now') WHERE id = ?");

  cached = { selectByUrl, insertUrl, updateHost, touchUrl };
  statementCache.set(db, cached);
  return cached;
}

function deriveHost(url) {
  if (!url || typeof url !== "string") {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname ? parsed.hostname.toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

function ensureUrlId(db, url, options = {}) {
  if (!db) {
    throw new Error("ensureUrlId requires a database handle");
  }
  if (!url || typeof url !== "string") {
    return null;
  }

  const { selectByUrl, insertUrl, updateHost, touchUrl } = getStatements(db);
  const host = deriveHost(url);

  insertUrl.run(url, host);

  const row = selectByUrl.get(url);
  if (!row || row.id == null) {
    throw new Error(`Failed to resolve url_id for ${url}`);
  }

  if (host && !row.host) {
    try {
      updateHost.run(host, row.id);
    } catch (_) {}
  }

  if (options.touch !== false) {
    try {
      touchUrl.run(row.id);
    } catch (_) {}
  }

  return row.id;
}

module.exports = {
  ensureUrlId,
  deriveHost
};
