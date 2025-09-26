const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function parseXmlMaybe(xml) {
  try { const parser = require('fast-xml-parser'); if (parser && parser.XMLParser) { const xp = new parser.XMLParser({ ignoreAttributes: false }); return xp.parse(xml); } } catch {}
  const locs = []; const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi; let m; while ((m = re.exec(xml)) !== null) { locs.push(m[1]); }
  return { __locs: locs };
}

async function loadSitemaps(baseUrl, domain, sitemapUrls, opts) {
  const list = Array.isArray(sitemapUrls) && sitemapUrls.length ? sitemapUrls.slice() : [ `${baseUrl}/sitemap.xml` ];
  const seen = new Set(); let enqueued = 0; const maxUrls = Math.max(0, opts?.sitemapMaxUrls || 5000);
  const fetchText = async (u) => { try { const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' } }); if (!res.ok) return null; return await res.text(); } catch { return null; } };
  const pushUrl = (u) => { if (maxUrls && enqueued >= maxUrls) return; try { const abs = new URL(u, baseUrl).href; if (new URL(abs).hostname !== domain) return; if (seen.has(abs)) return; seen.add(abs); if (typeof opts?.push === 'function') opts.push(abs); enqueued++; } catch {} };
  const handleDoc = (doc) => { if (!doc) return; if (doc.__locs) { for (const u of doc.__locs) pushUrl(u); return; } if (doc.urlset && doc.urlset.url) { const arr = Array.isArray(doc.urlset.url) ? doc.urlset.url : [doc.urlset.url]; for (const e of arr) { const loc = e.loc || e['#text'] || null; if (loc) pushUrl(String(loc)); } return; } if (doc.sitemapindex && doc.sitemapindex.sitemap) { const arr = Array.isArray(doc.sitemapindex.sitemap) ? doc.sitemapindex.sitemap : [doc.sitemapindex.sitemap]; for (const e of arr) { const loc = e.loc || e['#text'] || null; if (loc) list.push(String(loc)); } } };
  for (let i = 0; i < list.length; i++) { const u = list[i]; if (typeof u !== 'string') continue; try { if (new URL(u, baseUrl).hostname !== domain) continue; } catch { continue; } const xml = await fetchText(u); if (!xml) continue; try { const doc = await parseXmlMaybe(xml); handleDoc(doc); } catch {} if (maxUrls && enqueued >= maxUrls) break; }
  return enqueued;
}

module.exports = { loadSitemaps };
