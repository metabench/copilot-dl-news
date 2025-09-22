#!/usr/bin/env node

/*
  analyse-pages.js
  - Iterates through pages in the DB (articles + related fetches)
  - For any page without analysis or with older analysis_version, compute analysis and store it.
  - Minimal analysis for non-article/navigation pages; comprehensive for articles.
  - Extract place mentions (simple heuristic + optional gazetteer placeholder) and store in article_places.

  Run:
    node src/tools/analyse-pages.js --db=./data/news.db --analysis-version=1 --limit=5000
*/

const path = require('path');
const { findProjectRoot } = require('../utils/project-root');
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

const dbPath = getArg('db', path.join(findProjectRoot(__dirname), 'data', 'news.db'));
const targetVersion = Number(getArg('analysis-version', 1));
const limit = Number(getArg('limit', 10000));

function safeParse(json) {
  if (!json || typeof json !== 'string') return null;
  try { return JSON.parse(json); } catch { return null; }
}

function buildAnalysis({ url, html, title, section, articleRow, fetchRow, matchers, ctx }) {
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
    const detected = [];
    // Gazetteer-driven extraction from text and title
    try {
      if (text && matchers) {
        for (const p of extractGazetteerPlacesFromText(text, matchers, ctx, false)) {
          detected.push({ place: p.name, place_kind: p.kind, method: 'gazetteer', source: 'text', offset_start: p.start, offset_end: p.end, country_code: p.country_code, place_id: p.place_id });
        }
      }
      if (title && matchers) {
        for (const p of extractGazetteerPlacesFromText(title, matchers, ctx, true)) {
          detected.push({ place: p.name, place_kind: p.kind, method: 'gazetteer', source: 'title', offset_start: p.start, offset_end: p.end, country_code: p.country_code, place_id: p.place_id });
        }
      }
      // URL-based detection
      for (const pu of extractPlacesFromUrl(url, matchers)) {
        detected.push({ place: pu.name, place_kind: pu.kind, method: 'gazetteer', source: 'url', offset_start: -1, offset_end: -1, country_code: pu.country_code, place_id: pu.place_id });
      }
    } catch (_) {}
    if (detected.length) base.findings.places = dedupeDetections(detected);
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

// Normalize helper: lower + strip diacritics + collapse spaces
function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(s) {
  return normName(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildGazetteerMatchers(db) {
  const nameMap = new Map(); // normalized name -> [{place_id, kind, country_code, name}]
  const slugMap = new Map(); // slug -> same records
  // Countries and regions (ADM1)
  const rows = db.prepare(`
  SELECT pn.name, COALESCE(pn.normalized, LOWER(pn.name)) AS norm, p.id AS place_id, p.kind, p.country_code, COALESCE(p.population,0) AS population
    FROM place_names pn
    JOIN places p ON p.id = pn.place_id
    WHERE (pn.lang IS NULL OR pn.lang='en')
      AND pn.name_kind IN ('common','official','alias','endonym','exonym')
      AND p.kind IN ('country','region')
  `).all();
  for (const r of rows) {
    const key = normName(r.norm || r.name);
  const rec = { place_id: r.place_id, kind: r.kind, country_code: r.country_code || null, name: r.name, population: r.population };
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(rec);
    const sl = slugify(r.name);
    if (!slugMap.has(sl)) slugMap.set(sl, []);
    slugMap.get(sl).push(rec);
  }
  // Top cities by population to keep lookup set practical
  const cities = db.prepare(`
  SELECT pn.name, COALESCE(pn.normalized, LOWER(pn.name)) AS norm, p.id AS place_id, p.kind, p.country_code, COALESCE(p.population,0) AS population
    FROM place_names pn
    JOIN places p ON p.id = pn.place_id
    WHERE (pn.lang IS NULL OR pn.lang='en')
      AND pn.name_kind IN ('common','official','alias')
      AND p.kind='city'
    ORDER BY COALESCE(p.population, 0) DESC
    LIMIT 5000
  `).all();
  for (const r of cities) {
    const key = normName(r.norm || r.name);
  const rec = { place_id: r.place_id, kind: r.kind, country_code: r.country_code || null, name: r.name, population: r.population };
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(rec);
    const sl = slugify(r.name);
    if (!slugMap.has(sl)) slugMap.set(sl, []);
    slugMap.get(sl).push(rec);
  }
  return { nameMap, slugMap };
}

function extractGazetteerPlacesFromText(text, matchers, ctx, isTitle) {
  const out = [];
  if (!text || !matchers) return out;
  // Tokenize to words; track offsets
  const reWord = /[A-Za-z][A-Za-z'\-]*/g;
  const tokens = [];
  let m;
  while ((m = reWord.exec(text)) !== null) {
    tokens.push({ w: m[0], start: m.index, end: m.index + m[0].length });
  }
  const maxWindow = 4;
  for (let i = 0; i < tokens.length; i++) {
    let matched = false;
    for (let win = Math.min(maxWindow, tokens.length - i); win >= 1; win--) {
      const phrase = tokens.slice(i, i + win).map(t => t.w).join(' ');
      const key = normName(phrase);
      const cand = matchers.nameMap.get(key);
      if (cand && cand.length) {
        const rec = pickBestCandidate(cand, ctx, isTitle);
        out.push({ name: rec.name, kind: rec.kind, country_code: rec.country_code, place_id: rec.place_id, start: tokens[i].start, end: tokens[i + win - 1].end });
        i += win - 1; // advance
        matched = true;
        break;
      }
    }
    if (!matched) {
      // continue scanning
    }
  }
  return out;
}

function extractPlacesFromUrl(url, matchers) {
  const out = [];
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    for (const seg of segments) {
      const parts = seg.split('-');
      const candidates = [seg, ...parts];
      for (const c of candidates) {
        const slug = slugify(c);
        if (!slug) continue;
        const recs = matchers.slugMap.get(slug);
        if (recs && recs.length) {
          const r = recs[0];
          out.push({ name: r.name, kind: r.kind, country_code: r.country_code, place_id: r.place_id });
        }
      }
    }
  } catch (_) {}
  return out;
}

function dedupeDetections(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const key = `${a.source}:${a.place_id || a.place}:${a.offset_start}:${a.offset_end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function inferContext(db, url, title, section) {
  const ctx = { host: null, tld_cc: null, domain_cc: null, url_ccs: [], langs: [], section: section || null, title: title || null };
  try {
    const u = new URL(url);
    ctx.host = u.hostname.toLowerCase();
    const tld = ctx.host.split('.').pop();
    const tldMap = { uk: 'GB', gb: 'GB', ie: 'IE', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', us: 'US', ca: 'CA', au: 'AU', nz: 'NZ', in: 'IN', cn: 'CN', jp: 'JP' };
    ctx.tld_cc = tldMap[tld] || null;
    // domain_locales
    try {
      const row = db.prepare('SELECT country_code, primary_langs FROM domain_locales WHERE host = ?').get(ctx.host);
      if (row) {
        ctx.domain_cc = row.country_code || null;
        if (row.primary_langs) {
          try { ctx.langs = JSON.parse(row.primary_langs); } catch { ctx.langs = String(row.primary_langs).split(/[;,\s]+/).filter(Boolean); }
        }
      }
    } catch (_) {}
    // URL path CCs
    const segs = u.pathname.split('/').filter(Boolean);
    for (const s of segs) {
      const s2 = s.toLowerCase();
      if (s2.length === 2 && /^[a-z]{2}$/.test(s2)) ctx.url_ccs.push(s2.toUpperCase());
      if (s2 === 'uk') ctx.url_ccs.push('GB');
      if (s2 === 'us') ctx.url_ccs.push('US');
      if (s2 === 'ie') ctx.url_ccs.push('IE');
    }
  } catch (_) {}
  return ctx;
}

function pickBestCandidate(candidates, ctx, isTitle) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    let s = 0;
    if (ctx) {
      if (ctx.domain_cc && c.country_code && ctx.domain_cc === c.country_code) s += 5;
      if (ctx.tld_cc && c.country_code && ctx.tld_cc === c.country_code) s += 3;
      if (ctx.url_ccs && c.country_code && ctx.url_ccs.includes(c.country_code)) s += 4;
      if (ctx.section && typeof ctx.section === 'string') {
        const sec = ctx.section.toLowerCase();
        if (c.country_code && sec.includes(c.country_code.toLowerCase())) s += 2;
      }
      if (isTitle) s += 1;
    }
    // Population as a weak tiebreaker
    const pop = Number(c.population || 0);
    if (pop > 0) s += Math.log10(pop + 1) * 0.5;
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

async function main() {
  try { NewsDatabase = require('../db'); } catch (e) {
    console.error('Database unavailable:', e.message);
    process.exit(1);
  }
  const db = new NewsDatabase(dbPath);
  // Build gazetteer matchers once per run
  let gazetteer = null;
  try { gazetteer = buildGazetteerMatchers(db.db); } catch (_) { gazetteer = null; }

  // Find pages to analyze: prefer articles lacking analysis or with older version; also minimal analysis for recent non-articles
  const rows = db.db.prepare(`
  SELECT a.url AS url,
       a.title AS title,
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

  const selectLatestFetch = db.db.prepare(`
    SELECT nav_links_count, article_links_count, word_count
    FROM fetches
    WHERE url = ?
    ORDER BY COALESCE(fetched_at, request_started_at) DESC
    LIMIT 1
  `);

  const upsertPlaceHubInsert = db.db.prepare(`
    INSERT OR IGNORE INTO place_hubs(host, url, place_slug, title, first_seen_at, last_seen_at, nav_links_count, article_links_count, evidence)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
  `);
  const upsertPlaceHubUpdate = db.db.prepare(`
    UPDATE place_hubs SET place_slug = COALESCE(?, place_slug), title = COALESCE(?, title), last_seen_at = datetime('now'),
      nav_links_count = COALESCE(?, nav_links_count), article_links_count = COALESCE(?, article_links_count), evidence = COALESCE(?, evidence)
    WHERE url = ?
  `);

  for (const r of rows) {
    const articleRow = {
      text: r.text,
      word_count: r.word_count,
      article_xpath: r.article_xpath
    };
    const fetchRow = { classification: r.classification };
  const ctx = inferContext(db.db, r.url, r.title || null, r.section || null);
  const analysis = buildAnalysis({ url: r.url, html: r.html, title: r.title || null, section: r.section || null, articleRow, fetchRow, matchers: gazetteer, ctx });
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

    // Detect potential place hub pages using URL + contents
    try {
      const latest = selectLatestFetch.get(r.url) || { nav_links_count: null, article_links_count: null, word_count: r.word_count };
      const isNavLike = (fetchRow.classification === 'nav') || (latest.nav_links_count != null && latest.nav_links_count >= 10);
      const isLightContent = (latest.word_count != null && latest.word_count < 200);
      const urlPlaces = gazetteer ? extractPlacesFromUrl(r.url, gazetteer) : [];
      let chosen = urlPlaces[0] || null;
      // If no URL signal, consider dominant place in detections
      if (!chosen && Array.isArray(analysis.findings?.places)) {
        const counts = new Map();
        for (const fp of analysis.findings.places) {
          const k = fp.place_id || fp.place;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        let maxK = null, maxV = 0;
        for (const [k,v] of counts) { if (v > maxV) { maxV = v; maxK = k; } }
        if (maxK) {
          const hit = analysis.findings.places.find(p => (p.place_id || p.place) === maxK);
          if (hit) chosen = { name: hit.place, kind: hit.place_kind, place_id: hit.place_id, country_code: hit.country_code };
        }
      }
      if ((isNavLike || isLightContent) && chosen) {
        const host = new URL(r.url).hostname.toLowerCase();
        const slug = slugify(chosen.name);
        // Build basic evidence from URL + counts + top mentions
        const evidence = { reason: 'nav-or-hub', slug, urlMatches: Array.from(new Set(urlPlaces.map(p => slugify(p.name)))), nav_links_count: latest.nav_links_count, article_links_count: latest.article_links_count };
        upsertPlaceHubInsert.run(host, r.url, slug, r.title || null, latest.nav_links_count || null, latest.article_links_count || null, JSON.stringify(evidence));
        upsertPlaceHubUpdate.run(slug, r.title || null, latest.nav_links_count || null, latest.article_links_count || null, JSON.stringify(evidence), r.url);
      }
    } catch (_) { /* ignore hub detection errors */ }
  }

  console.log(JSON.stringify({ analysed: rows.length, updated, placesInserted, version: targetVersion }));
  try { db.close(); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
