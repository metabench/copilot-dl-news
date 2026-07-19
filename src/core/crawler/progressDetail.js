'use strict';

/**
 * Pure builder for the normally-hidden per-crawl detail surfaced on the crawler
 * 'progress' event — the coarse phase, which sitemap files were harvested, the
 * pages currently downloading, per-host rate limits, and robots policy. The
 * crawl-status UI reads this off job.progress to drive the phase badge and the
 * expandable job-detail panel.
 *
 * Kept standalone and pure (no crawler `this`, no I/O) so it is unit-testable
 * without constructing a full NewsCrawler, which transitively loads jsdom.
 * NewsCrawler._buildProgressDetail gathers the live sources and delegates here.
 * The field shapes mirror what CrawlerEvents assembles for the stdout channel
 * so both surfaces agree. Every read is defensive: telemetry must never throw
 * into the crawl. Arrays are capped so a pathological crawler can't pin large
 * payloads into the retained job history.
 */

const MAX_SITEMAPS = 50;
const MAX_INFLIGHT = 10;
const MAX_HOSTS = 20;

/** Drop query + hash from a URL (origin+path only) so in-flight targets don't
 *  leak query-string tokens. Returns the input on parse failure. */
function stripQuery(u) {
  try {
    const parsed = new URL(String(u));
    return parsed.origin + parsed.pathname;
  } catch (_) {
    return String(u == null ? '' : u);
  }
}

function buildProgressDetail({
  phase = null,
  sitemapInfo = null,
  currentDownloads = null,
  domainLimits = null,
  robotsInfo = null,
  now = Date.now()
} = {}) {
  const detail = { phase: phase || null };

  try {
    if (sitemapInfo) {
      const urls = Array.isArray(sitemapInfo.urls) ? sitemapInfo.urls : [];
      detail.sitemaps = urls.slice(0, MAX_SITEMAPS).map(String);
      detail.sitemapCount = urls.length;
      detail.sitemapEnqueued = sitemapInfo.discovered || 0;
    }
  } catch (_) { /* sitemap detail is best-effort */ }

  try {
    if (currentDownloads && typeof currentDownloads.entries === 'function') {
      const rows = Array.from(currentDownloads.entries())
        .sort((a, b) => (b[1]?.startedAt || 0) - (a[1]?.startedAt || 0))
        .slice(0, MAX_INFLIGHT)
        .map(([url, info]) => ({ url: stripQuery(url), ageMs: now - (info?.startedAt || now) }));
      detail.currentDownloads = rows;
      detail.currentDownloadsCount = typeof currentDownloads.size === 'number' ? currentDownloads.size : rows.length;
    }
  } catch (_) { /* in-flight detail is best-effort */ }

  try {
    if (domainLimits && typeof domainLimits.entries === 'function') {
      const out = {};
      let n = 0;
      for (const [host, s] of domainLimits.entries()) {
        if (n++ >= MAX_HOSTS) break;
        out[host] = {
          rateLimited: !!(s && s.isLimited),
          limit: (s && s.rpm) || null,
          intervalMs: (s && s.rpm > 0) ? Math.floor(60000 / s.rpm) : null,
          backoffMs: (s && s.backoffUntil > now) ? (s.backoffUntil - now) : null
        };
      }
      detail.perHostLimits = out;
    }
  } catch (_) { /* per-host detail is best-effort */ }

  try {
    if (robotsInfo) {
      detail.robots = {
        loaded: !!robotsInfo.robotsLoaded,
        source: robotsInfo.source || null,
        crawlDelaySeconds: robotsInfo.crawlDelaySeconds ?? null,
        politenessFloorMs: robotsInfo.politenessFloorMs ?? null
      };
    }
  } catch (_) { /* robots detail is best-effort */ }

  return detail;
}

module.exports = { buildProgressDetail, stripQuery, MAX_SITEMAPS, MAX_INFLIGHT, MAX_HOSTS };
