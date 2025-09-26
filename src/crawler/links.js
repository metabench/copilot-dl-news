const cheerio = require('cheerio');

function findNavigationLinks($, normalizeUrl, isOnDomain) {
  const out = []; const sels = ['header a','nav a','footer a','[role="navigation"] a','.menu a','.nav a','.navigation a','.breadcrumb a','.breadcrumbs a','.pagination a','.pager a'];
  sels.forEach(sel => { $(sel).each((_, el) => { const href = $(el).attr('href'); if (!href) return; const nu = normalizeUrl(href); if (!nu) return; const anchor = $(el).text().trim().slice(0,200) || null; const rel = $(el).attr('rel') || null; const onDomain = isOnDomain(nu) ? 1 : 0; out.push({ url: nu, anchor, rel, onDomain }); }); });
  const map = new Map(); for (const l of out) { if (!map.has(l.url)) map.set(l.url, l); } return Array.from(map.values());
}

function findArticleLinks($, normalizeUrl, looksLikeArticle, isOnDomain) {
  const out = []; const sels = ['article a','.article a','.story a','.content a[href*="/"]','a[href*="/article"]','a[href*="/story"]','a[href*="/news"]','a[href*="/world"]','a[href*="/politics"]','a[href*="/business"]','a[href*="/sport"]','a[href*="/culture"]','a[href*="/opinion"]','a[href*="/lifestyle"]','a[href*="/technology"]','h1 a','h2 a','h3 a'];
  sels.forEach(sel => { $(sel).each((_, el) => { const href = $(el).attr('href'); if (!href) return; const nu = normalizeUrl(href); if (!nu) return; if (isOnDomain(nu) && looksLikeArticle(nu)) { const anchor = $(el).text().trim().slice(0,200) || null; const rel = $(el).attr('rel') || null; out.push({ url: nu, anchor, rel, onDomain: 1 }); } }); });
  const map = new Map(); for (const l of out) { if (!map.has(l.url)) map.set(l.url, l); } return Array.from(map.values());
}

module.exports = { findNavigationLinks, findArticleLinks };
