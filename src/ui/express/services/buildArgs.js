// Build command-line arguments for the crawler process from a POST body.
// This mirrors the logic previously embedded in server.js and is extracted
// to make the server easier to maintain and to pave the way for routes/services split.

function buildArgs(body = {}) {
  const args = ['src/crawl.js'];
  const url = body.startUrl || 'https://www.theguardian.com';
  args.push(url);
  const ctypeRaw = (body.crawlType || '').toString().toLowerCase();
  if (ctypeRaw) {
    args.push(`--crawl-type=${ctypeRaw}`);
  }
  if (body.depth != null) args.push(`--depth=${parseInt(body.depth, 10)}`);
  if (body.maxPages != null) args.push(`--max-pages=${parseInt(body.maxPages, 10)}`);
  // Back-compat: accept either refetchIfOlderThan or legacy maxAge
  const refetch = body.refetchIfOlderThan || body.maxAge;
  if (refetch) {
    args.push(`--refetch-if-older-than=${String(refetch)}`);
  }
  // New: per-type refetch windows (strings like '7d', '6h')
  if (body.refetchArticleIfOlderThan) {
    args.push(`--refetch-article-if-older-than=${String(body.refetchArticleIfOlderThan)}`);
  }
  if (body.refetchHubIfOlderThan) {
    args.push(`--refetch-hub-if-older-than=${String(body.refetchHubIfOlderThan)}`);
  }
  if (body.concurrency != null) args.push(`--concurrency=${parseInt(body.concurrency, 10)}`);
  if (body.maxQueue != null) args.push(`--max-queue=${parseInt(body.maxQueue, 10)}`);
  if (body.noDb === true) args.push('--no-db');
  if (body.dbPath) args.push(`--db=${body.dbPath}`);
  if (body.slow === true) args.push('--slow');
  if (body.preferCache === true) args.push('--prefer-cache');
  if (body.allowQueryUrls === true || body.skipQueryUrls === false) {
    args.push('--allow-query-urls');
  }
  // Fast-start: skip heavy DB size/count sampling at crawler init
  if (body.fastStart === true || String(process.env.UI_FAST_START||'').toLowerCase() === '1') {
    args.push('--fast-start');
  }
  // Sitemap controls
  // New: allow body.crawlType to control sitemap flags
  // Types: 'basic' (no sitemap), 'sitemap-only', 'basic-with-sitemap'
  const ctype = (body.crawlType || '').toString();
  let effUseSitemap = body.useSitemap;
  let effSitemapOnly = body.sitemapOnly;
  if (ctype) {
    if (ctype === 'basic') { effUseSitemap = false; effSitemapOnly = false; }
    else if (ctype === 'sitemap-only') { effUseSitemap = true; effSitemapOnly = true; }
    else if (ctype === 'basic-with-sitemap' || ctype === 'basic+site' || ctype === 'basic-with-site') { effUseSitemap = true; effSitemapOnly = false; }
  }
  // If sitemapOnly is true, it implies using sitemap regardless of useSitemap flag
  if (effSitemapOnly === true) {
    args.push('--sitemap-only');
  } else if (effUseSitemap === false) {
    // Only disable sitemap when not in sitemap-only mode
    args.push('--no-sitemap');
  }
  // Align sitemap cap with maxPages if provided; removes need for a separate control
  if (body.maxPages != null) args.push(`--sitemap-max=${parseInt(body.maxPages, 10)}`);
  // Optional network/pacing configs
  if (body.requestTimeoutMs != null) args.push(`--request-timeout-ms=${parseInt(body.requestTimeoutMs, 10)}`);
  if (body.pacerJitterMinMs != null) args.push(`--pacer-jitter-min-ms=${parseInt(body.pacerJitterMinMs, 10)}`);
  if (body.pacerJitterMaxMs != null) args.push(`--pacer-jitter-max-ms=${parseInt(body.pacerJitterMaxMs, 10)}`);
  return args;
}

module.exports = { buildArgs };
