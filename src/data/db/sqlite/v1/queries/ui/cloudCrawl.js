"use strict";

const { sanitizeLimit } = require("../helpers");

const DEFAULT_CLOUD_CRAWL_TARGETS = Object.freeze([
  "bbc.com",
  "theguardian.com",
  "reuters.com",
  "nytimes.com",
  "washingtonpost.com",
  "cnn.com",
  "apnews.com",
  "bloomberg.com",
  "ft.com",
  "npr.org"
]);

function normalizeDomain(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  return text.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function normalizeDomains(domains) {
  const input = Array.isArray(domains) ? domains : DEFAULT_CLOUD_CRAWL_TARGETS;
  const seen = new Set();
  const normalized = [];
  for (const value of input) {
    const domain = normalizeDomain(value);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    normalized.push(domain);
  }
  return normalized.length ? normalized : [...DEFAULT_CLOUD_CRAWL_TARGETS];
}

function buildHostWhere(domains, params) {
  const clauses = [];
  for (const domain of domains) {
    clauses.push("(LOWER(u.host) = ? OR LOWER(u.host) LIKE ?)");
    params.push(domain, `%.${domain}`);
  }
  return clauses.length ? `(${clauses.join(" OR ")})` : "1 = 0";
}

function findCanonicalDomain(host, domains) {
  const value = normalizeDomain(host);
  if (!value) return null;
  return domains.find((domain) => value === domain || value.endsWith(`.${domain}`)) || null;
}

function createEmptyTarget(domain, goal) {
  return {
    domain,
    goal,
    okDownloads: 0,
    latestFetchedAt: null,
    progressPct: 0
  };
}

function getCloudCrawlStatusSnapshot(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("getCloudCrawlStatusSnapshot requires a better-sqlite3 database handle");
  }

  const domains = normalizeDomains(options.domains);
  const goal = sanitizeLimit(options.maxPagesPerDomain, { min: 1, max: 1000, fallback: 1000 });
  const recentLimit = sanitizeLimit(options.recentLimit, { min: 1, max: 50, fallback: 12 });
  const since = typeof options.since === "string" && options.since.trim() ? options.since.trim() : null;

  const countParams = [];
  const hostWhere = buildHostWhere(domains, countParams);
  if (since) countParams.push(since);

  const countRows = db.prepare(`
    SELECT
      LOWER(u.host) AS host,
      COUNT(*) AS okDownloads,
      MAX(r.fetched_at) AS latestFetchedAt
    FROM http_responses r
    JOIN urls u ON u.id = r.url_id
    WHERE ${hostWhere}
      AND r.http_status >= 200
      AND r.http_status < 300
      ${since ? "AND r.fetched_at >= ?" : ""}
    GROUP BY LOWER(u.host)
    ORDER BY latestFetchedAt DESC
  `).all(...countParams);

  const targetsByDomain = new Map(domains.map((domain) => [domain, createEmptyTarget(domain, goal)]));
  for (const row of countRows) {
    const domain = findCanonicalDomain(row.host, domains);
    if (!domain) continue;
    const target = targetsByDomain.get(domain);
    target.okDownloads += Number(row.okDownloads) || 0;
    if (!target.latestFetchedAt || String(row.latestFetchedAt || "") > String(target.latestFetchedAt || "")) {
      target.latestFetchedAt = row.latestFetchedAt || null;
    }
  }

  for (const target of targetsByDomain.values()) {
    target.progressPct = Math.min(100, Math.round((target.okDownloads / target.goal) * 100));
  }

  const recentParams = [];
  const recentHostWhere = buildHostWhere(domains, recentParams);
  if (since) recentParams.push(since);
  recentParams.push(recentLimit);

  const recentDownloads = db.prepare(`
    SELECT
      u.host AS host,
      u.url AS url,
      r.http_status AS httpStatus,
      r.bytes_downloaded AS bytesDownloaded,
      r.fetched_at AS fetchedAt
    FROM http_responses r
    JOIN urls u ON u.id = r.url_id
    WHERE ${recentHostWhere}
      AND r.http_status >= 200
      AND r.http_status < 300
      ${since ? "AND r.fetched_at >= ?" : ""}
    ORDER BY r.fetched_at DESC
    LIMIT ?
  `).all(...recentParams);

  const targets = Array.from(targetsByDomain.values());
  const totalOkDownloads = targets.reduce((sum, target) => sum + target.okDownloads, 0);
  const sitesAtGoal = targets.filter((target) => target.okDownloads >= target.goal).length;

  return {
    domains,
    goal,
    since,
    totals: {
      targetSites: domains.length,
      goalDownloads: domains.length * goal,
      okDownloads: totalOkDownloads,
      sitesAtGoal,
      progressPct: Math.min(100, Math.round((totalOkDownloads / Math.max(domains.length * goal, 1)) * 100))
    },
    targets,
    recentDownloads
  };
}

module.exports = {
  DEFAULT_CLOUD_CRAWL_TARGETS,
  getCloudCrawlStatusSnapshot,
  normalizeDomains
};