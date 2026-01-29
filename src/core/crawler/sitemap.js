const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { XMLParser } = require('fast-xml-parser');

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

  const fetchText = async (u) => {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' } });
      if (!res.ok) return null;
      return await res.text();
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
