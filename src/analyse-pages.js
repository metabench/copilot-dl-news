#!/usr/bin/env node

/*
  analyse-pages.js
  - Iterates through pages in the DB (articles + related fetches)
  - For any page without analysis or with older analysis_version, compute analysis and store it.
  - Minimal analysis for non-article/navigation pages; comprehensive for articles.
  - Extract place mentions (simple heuristic + optional gazetteer placeholder) and store in article_places.

  Run:
    node src/analyse-pages.js --db=./data/news.db --analysis-version=1 --limit=5000
*/

const path = require('path');
let NewsDatabase = null;
const { Readability } = require('@mozilla/readability');
const { JSDOM, VirtualConsole } = require('jsdom');

function getArg(name, fallback) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const v = a.split('=')[1];
  if (v === undefined) return fallback;
  if (v === 'true') return true; if (v === 'false') return false;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

const dbPath = getArg('db', path.join(process.cwd(), 'data', 'news.db'));
const targetVersion = Number(getArg('analysis-version', 1));
const limit = Number(getArg('limit', 10000));

function safeParse(json) {
  if (!json || typeof json !== 'string') return null;
  try { return JSON.parse(json); } catch { return null; }
}

function buildAnalysis({ url, html, articleRow, fetchRow }) {
  // analysis object schema (stored as JSON):
  // { analysis_version, kind: 'minimal'|'article', findings: { places: [...] }, notes: string[], meta: { method, wordCount, articleXPath, whereFound: [...] } }
  const base = { analysis_version: targetVersion, kind: 'minimal', findings: {}, notes: [], meta: {} };
  // If we have an article row, prefer comprehensive analysis
  if (articleRow && articleRow.text) {
    base.kind = 'article';
    // Use existing text/XPath/word_count if available
    base.meta.wordCount = articleRow.word_count ?? null;
    base.meta.articleXPath = articleRow.article_xpath || null;
    const text = articleRow.text;
    // Extract naive place mentions (seed rule-set; can be replaced with gazetteer later)
    const places = extractPlacesFromText(text, url);
    if (places.length) base.findings.places = places.map(p => ({
      place: p.place, place_kind: p.kind, method: p.method, source: 'text', offset_start: p.start, offset_end: p.end
    }));
    // If articleXPath missing but html present, attempt a quick Readability pass to infer word count/node
    if (!base.meta.articleXPath && html) {
      try {
        const vc = new VirtualConsole();
        vc.on('jsdomError', () => {});
        const dom = new JSDOM(html, { url, virtualConsole: vc });
        const r = new Readability(dom.window.document).parse();
        if (r && r.textContent) {
          base.meta.wordCount = base.meta.wordCount ?? (r.textContent.trim().split(/\s+/).filter(Boolean).length);
        }
      } catch (_) { }
    }
    base.meta.method = 'readability+heuristics@v1';
    return base;
  }
  // If we only have fetch classification
  if (fetchRow) {
    base.kind = ['article','nav'].includes(fetchRow.classification) ? fetchRow.classification : 'minimal';
    base.meta.method = 'minimal@v1';
  }
  return base;
}

// Very simple place extraction: looks for proper nouns that are known country or UK/US regions; placeholder for real gazetteer
function extractPlacesFromText(text, url) {
  const out = [];
  if (!text) return out;
  const candidates = [];
  // Seed lists (tiny); replace with gazetteer later
  const countries = ['Wales','Scotland','England','Northern Ireland','United Kingdom','UK','United States','USA','France','Germany','Spain','Italy','China','India'];
  const ukRegions = ['Cardiff','Swansea','Newport','Aberystwyth','Bangor','Edinburgh','Glasgow','Birmingham','Manchester','Leeds','Bristol','London'];
  const patterns = [...countries, ...ukRegions].map(escapeRegExp).join('|');
  const re = new RegExp(`\\b(${patterns})\\b`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const place = m[1];
    const kind = countries.includes(place) ? 'country' : 'city';
    out.push({ place, kind, method: 'list', start: m.index, end: m.index + place.length });
  }
  // Simple URL-based hints (e.g., /uk/wales/)
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    const hints = [
      { re: /\b(uk|us|world|europe)\/(wales|scotland|england|northern-ireland)\b/, map: (g) => (g[2] || '').replace(/-/g,' ') },
      { re: /\b\/wales\b/, map: () => 'Wales' }
    ];
    for (const h of hints) {
      const mm = p.match(h.re);
      if (mm) {
        const place = h.map(mm);
        if (place) out.push({ place, kind: 'region', method: 'url', start: -1, end: -1 });
      }
    }
  } catch (_) {}
  return out;
}

function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

async function main() {
  try { NewsDatabase = require('./db'); } catch (e) {
    console.error('Database unavailable:', e.message);
    process.exit(1);
  }
  const db = new NewsDatabase(dbPath);

  // Find pages to analyze: prefer articles lacking analysis or with older version; also minimal analysis for recent non-articles
  const rows = db.db.prepare(`
    SELECT a.url AS url,
           a.html AS html,
           a.text AS text,
           a.word_count AS word_count,
           a.article_xpath AS article_xpath,
           a.analysis AS analysis_json,
           lf.classification AS classification,
           lf.ts AS last_ts
    FROM articles a
    LEFT JOIN latest_fetch lf ON lf.url = a.url
    WHERE (
      a.analysis IS NULL
      OR CAST(json_extract(a.analysis, '$.analysis_version') AS INTEGER) IS NULL
      OR CAST(json_extract(a.analysis, '$.analysis_version') AS INTEGER) < ?
    )
    ORDER BY (last_ts IS NULL) ASC, last_ts DESC
    LIMIT ?
  `).all(targetVersion, limit);

  let updated = 0;
  let placesInserted = 0;

  const upsertArticleAnalysis = db.db.prepare(`
    UPDATE articles SET analysis = ? WHERE url = ?
  `);

  const insertPlace = db.db.prepare(`
    INSERT OR IGNORE INTO article_places(article_url, place, place_kind, method, source, offset_start, offset_end, context, first_seen_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const r of rows) {
    const articleRow = {
      text: r.text,
      word_count: r.word_count,
      article_xpath: r.article_xpath
    };
    const fetchRow = { classification: r.classification };
    const analysis = buildAnalysis({ url: r.url, html: r.html, articleRow, fetchRow });
    // Persist analysis JSON
    try {
      upsertArticleAnalysis.run(JSON.stringify(analysis), r.url);
      updated++;
    } catch (_) {}
    // Persist places if present
    const foundPlaces = Array.isArray(analysis.findings?.places) ? analysis.findings.places : [];
    for (const p of foundPlaces) {
      try {
        const ctx = null; // could add snippet around offsets later
        insertPlace.run(r.url, p.place, p.place_kind || null, p.method || null, p.source || null, p.offset_start ?? null, p.offset_end ?? null, ctx);
        placesInserted++;
      } catch (_) {}
    }
  }

  console.log(JSON.stringify({ analysed: rows.length, updated, placesInserted, version: targetVersion }));
  try { db.close(); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
