"use strict";

const { selectRecentDomains } = require("../db/sqlite/v1/queries/ui/recentDomains");
const { listRecentCrawls } = require("../db/sqlite/v1/queries/ui/crawls");
const { listRecentErrors } = require("../db/sqlite/v1/queries/ui/errors");
const { getCachedMetric } = require("./server/services/metricsService");

function normalizeDomainEntry(entry) {
  if (!entry) {
    return { host: null, articleCount: 0, lastSavedAt: null };
  }
  return {
    host: entry.host || null,
    articleCount: Number(entry.articleCount ?? entry.article_count ?? 0) || 0,
    lastSavedAt: entry.lastSavedAt ?? entry.last_saved_at ?? null
  };
}

function tryGetCachedDomainSnapshot(db, { windowSize } = {}) {
  if (!db) return null;
  try {
    const cached = getCachedMetric(db, "domains.top_hosts_window");
    if (cached && cached.payload && Array.isArray(cached.payload.hosts)) {
      return {
        source: "cache",
        hosts: cached.payload.hosts.map(normalizeDomainEntry),
        windowSize: Number(cached.payload.windowSize) || Number(windowSize) || null,
        cache: {
          statKey: cached.statKey,
          generatedAt: cached.generatedAt,
          stale: cached.stale,
          maxAgeMs: cached.maxAgeMs
        }
      };
    }
  } catch (_) {
    // Ignore cache read failures and fall back to live queries.
  }
  return null;
}

function buildDomainSnapshot(db, { windowSize, limit }) {
  const cached = tryGetCachedDomainSnapshot(db, { windowSize });
  if (cached) {
    return cached;
  }
  const normalizedWindowSize = Number(windowSize) || null;
  const normalizedLimit = Number(limit) || undefined;
  const liveRows = selectRecentDomains(db, {
    windowSize: normalizedWindowSize || undefined,
    limit: normalizedLimit
  }).map(normalizeDomainEntry);
  return {
    source: "live",
    hosts: liveRows,
    windowSize: normalizedWindowSize,
    cache: null
  };
}

function createHomeCardLoaders({ db, domainWindowSize, domainLimit, crawlLimit, errorLimit }) {
  if (!db) {
    return {};
  }
  const safeWindowSize = Number(domainWindowSize) || undefined;
  const safeDomainLimit = Number(domainLimit) || undefined;
  const safeCrawlLimit = Number(crawlLimit) || undefined;
  const safeErrorLimit = Number(errorLimit) || undefined;
  return {
    domainSnapshot: () => buildDomainSnapshot(db, { windowSize: safeWindowSize, limit: safeDomainLimit }),
    crawls: () => listRecentCrawls(db, safeCrawlLimit ? { limit: safeCrawlLimit } : undefined),
    errors: () => listRecentErrors(db, safeErrorLimit ? { limit: safeErrorLimit } : undefined)
  };
}

module.exports = {
  normalizeDomainEntry,
  tryGetCachedDomainSnapshot,
  buildDomainSnapshot,
  createHomeCardLoaders
};
