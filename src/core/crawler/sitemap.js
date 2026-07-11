const { XMLParser } = require('fast-xml-parser');

const DEFAULT_SITEMAP_FETCH_TIMEOUT_MS = Number(process.env.CRAWLER_SITEMAP_FETCH_TIMEOUT_MS || 15000);
// TTL for skipping the network entirely (RobotsCache pattern). Default 0 =
// always revalidate: news sitemaps change constantly, so a conditional GET
// (304 = ~200 bytes instead of ~580KB) is the safe default.
const DEFAULT_SITEMAP_CACHE_TTL_SECONDS = Number(process.env.CRAWLER_SITEMAP_CACHE_TTL_SECONDS || 0);

async function timeoutFetch(url, options = {}, fetchOverride = null) {
  const fetchImpl = typeof fetchOverride === 'function'
    ? fetchOverride
    : (typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : (await import('node-fetch')).default);
  if (options && options.signal) return fetchImpl(url, options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_SITEMAP_FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseXmlMaybe(xml) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    return parser.parse(xml);
  } catch (err) {
    // Fallback to regex if XML parsing fails
    const locs = [];
    const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      locs.push(m[1]);
    }
    return { __locs: locs };
  }
}

async function loadSitemaps(baseUrl, domain, sitemapUrls, opts) {
  const list = Array.isArray(sitemapUrls) && sitemapUrls.length ? sitemapUrls.slice() : [ `${baseUrl}/sitemap.xml` ];
  const seen = new Set();
  let enqueued = 0;
  const maxUrls = Math.max(0, opts?.sitemapMaxUrls || 5000);

  // Conditional-fetch cache, injected (DB-backed via news-crawler-db's
  // sitemap_cache accessors — see RobotsAndSitemapCoordinator). Shape:
  //   { get(url) -> Promise<{body,etag,lastModified,contentType,fetchedAt}|null>,
  //     set(url, record) -> Promise<void> }
  // All persistence lives in the DB (2026-07-11 hub-loop P0 — the previous
  // tmp/sitemap-cache file store is gone). Cache is best-effort throughout.
  const cache = opts?.cache && typeof opts.cache.get === 'function' && typeof opts.cache.set === 'function'
    ? opts.cache
    : null;
  const cacheTtlSeconds = Number.isFinite(opts?.cacheTtlSeconds)
    ? opts.cacheTtlSeconds
    : DEFAULT_SITEMAP_CACHE_TTL_SECONDS;

  const emitFetch = (u, res, bytes, requestStartedIso, extra = {}) => {
    if (typeof opts?.onFetch !== 'function') return;
    try {
      opts.onFetch({
        url: u,
        status: res?.status ?? null,
        contentType: res?.headers?.get?.('content-type') || extra.contentType || null,
        etag: res?.headers?.get?.('etag') || extra.etag || null,
        lastModified: res?.headers?.get?.('last-modified') || extra.lastModified || null,
        bytes: bytes || 0,
        requestStartedIso,
        fetchedAtIso: new Date().toISOString()
      });
    } catch { /* visibility is best-effort */ }
  };

  const fetchText = async (u) => {
    const requestStartedIso = new Date().toISOString();
    try {
      let cached = null;
      if (cache) {
        try { cached = await cache.get(u); } catch { cached = null; }
        if (cached && typeof cached.body !== 'string') cached = null;
      }

      // RobotsCache-style TTL: within TTL, reuse the cached body without any
      // network round-trip (no synthetic ledger row — no request happened).
      if (cached && cacheTtlSeconds > 0 && cached.fetchedAt
        && (Date.now() - Date.parse(cached.fetchedAt)) < cacheTtlSeconds * 1000) {
        return cached.body;
      }

      const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' };
      if (cached?.etag) headers['If-None-Match'] = cached.etag;
      if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

      const res = await timeoutFetch(u, { headers }, opts?.fetchImpl);

      // 304: origin confirms our cached body is current — reuse it, record
      // the (tiny) revalidation in the ledger, skip the re-download.
      if (res.status === 304 && cached) {
        if (cache) {
          try { await cache.set(u, { ...cached, url: u, fetchedAt: new Date().toISOString() }); } catch { /* best-effort */ }
        }
        emitFetch(u, res, 0, requestStartedIso, {
          etag: cached.etag, lastModified: cached.lastModified, contentType: cached.contentType
        });
        return cached.body;
      }

      const text = res.ok ? await res.text() : null;
      if (text && cache) {
        try {
          await cache.set(u, {
            url: u,
            body: text,
            etag: res.headers?.get?.('etag') || null,
            lastModified: res.headers?.get?.('last-modified') || null,
            contentType: res.headers?.get?.('content-type') || null,
            fetchedAt: new Date().toISOString()
          });
        } catch { /* best-effort */ }
      }
      emitFetch(u, res, text ? Buffer.byteLength(text, 'utf8') : 0, requestStartedIso);
      return text;
    } catch { return null; }
  };

  const pushUrl = (u, meta = {}) => {
    if (maxUrls && enqueued >= maxUrls) return;
    try {
      const abs = new URL(u, baseUrl).href;
      if (new URL(abs).hostname !== domain) return;
      if (seen.has(abs)) return;
      seen.add(abs);
      if (typeof opts?.push === 'function') {
        opts.push(abs, meta);
      }
      enqueued++;
    } catch {}
  };

  const handleDoc = (doc) => {
    if (!doc) return;

    // Regex fallback result
    if (doc.__locs) {
      for (const u of doc.__locs) pushUrl(u);
      return;
    }

    // Handle <urlset> (standard sitemap)
    if (doc.urlset && doc.urlset.url) {
      const arr = Array.isArray(doc.urlset.url) ? doc.urlset.url : [doc.urlset.url];
      for (const e of arr) {
        const loc = e.loc || e['#text'] || null;
        if (loc) {
          const meta = {};
          if (e.lastmod) meta.lastmod = e.lastmod;
          if (e.changefreq) meta.changefreq = e.changefreq;
          if (e.priority) meta.priority = e.priority;
          // Handle news extension
          if (e['news:news']) {
             meta.isNews = true;
             if (e['news:news']['news:publication_date']) {
               meta.publicationDate = e['news:news']['news:publication_date'];
             }
             if (e['news:news']['news:title']) {
               meta.title = e['news:news']['news:title'];
             }
          }
          pushUrl(String(loc), meta);
        }
      }
      return;
    }

    // Handle <sitemapindex> (nested sitemaps)
    if (doc.sitemapindex && doc.sitemapindex.sitemap) {
      const arr = Array.isArray(doc.sitemapindex.sitemap) ? doc.sitemapindex.sitemap : [doc.sitemapindex.sitemap];
      for (const e of arr) {
        const loc = e.loc || e['#text'] || null;
        if (loc) list.push(String(loc));
      }
    }
  };

  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (typeof u !== 'string') continue;
    try {
      if (new URL(u, baseUrl).hostname !== domain) continue;
    } catch { continue; }

    const xml = await fetchText(u);
    if (!xml) continue;

    try {
      const doc = await parseXmlMaybe(xml);
      handleDoc(doc);
    } catch {}

    if (maxUrls && enqueued >= maxUrls) break;
  }

  return enqueued;
}

module.exports = { loadSitemaps };
