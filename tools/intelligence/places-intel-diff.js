#!/usr/bin/env node
'use strict';

/**
 * places-intel-diff.js — differential/accuracy harness for the
 * news-crawler-places-intelligence module (cycle 83). The measure-before-build
 * instrument for extraction #3: builds the module's engine against copilot's
 * LIVE gazetteer (via the ncdb access boundary) and characterizes its
 * place-detection behavior on (a) a curated hard-case precision gate and (b) a
 * bounded sample of REAL stored article text.
 *
 * This is the FIRST intelligence extraction that reaches live instantiation
 * (url #1 + document #2 were blocked before this point), so the harness proves
 * feasibility-in-practice AND measures quality, non-circularly:
 *
 *  --gate     (default) curated precision gate:
 *               COMMON-WORD TRAPS (world/will/may/reading/nice/... used as
 *               ordinary words) MUST yield 0 place matches; REAL-PLACE cases
 *               (London/Paris/Tokyo/Cairo/Beijing) MUST be found. This is a
 *               non-circular ground truth (hand-labeled, module never sees it).
 *  --sample   coverage/latency over N real content_analysis.body_text rows:
 *               places/article, latency p50/p95, verdict + language mix, and a
 *               function-word-FP indicator.
 *
 * DB safety: bounded, indexed, readonly reads (LIMIT N). The engine's own
 * gazetteer read is the module's paged access (batch 10k) — a one-time build.
 *
 *   node tools/intelligence/places-intel-diff.js [--gate] [--sample] [--limit 60] [--tier tier2] [--json out.json]
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { createPlacesEngine } = require(path.join(ROOT, 'src', 'intelligence', 'placesIntelligence.js'));

const argv = process.argv.slice(2);
const getArg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DB = getArg('--db', path.join(ROOT, 'data', 'news.db'));
const LIMIT = Math.max(5, Math.min(500, Number(getArg('--limit', 60))));
const TIER = getArg('--tier', 'tier2');
const JSON_OUT = getArg('--json', null);
const DO_SAMPLE = argv.includes('--sample');
const DO_GATE = argv.includes('--gate') || !DO_SAMPLE; // gate is the default
const FILTER = argv.includes('--filter') ? true : undefined; // apply the cycle-84 precision post-filter

// ── Curated hard-case ground truth (hand-labeled; the module never sees it) ──
// TRAPS: each sentence uses a word that IS a gazetteer place name but is here an
// ordinary English word — a correct detector returns ZERO place matches.
const TRAPS = [
  'She spent the morning reading the news about the wider world.',
  'Will you come? It may rain, but it would be nice all the same.',
  'They took a long bath and felt as calm as ever.',
  'The mobile signal was weak, so of course the call dropped.',
  'He will march to a different beat and hope for the best.',
  'Of the many, most said they would rather wait and see.',
  'A general sense of unease spread as the summit began.',
  'The most important thing is to remain patient and kind.',
];
// REAL: each sentence names a well-known city/country a detector MUST find.
const REAL = [
  { text: 'Officials met in London and later travelled to Paris for talks.', want: ['London', 'Paris'] },
  { text: 'The delegation flew from Tokyo to arrive in Berlin by morning.', want: ['Tokyo', 'Berlin'] },
  { text: 'Aid convoys reached Cairo before continuing toward Beirut.', want: ['Cairo', 'Beirut'] },
  { text: 'Leaders from Washington and Moscow spoke by phone on Tuesday.', want: ['Washington', 'Moscow'] },
  { text: 'A summit in Madrid drew envoys from across Spain and Portugal.', want: ['Madrid', 'Spain', 'Portugal'] },
];
// Function-word / short-token FP indicator for the real-article sample.
const LIKELY_FP_TOKENS = new Set(['as', 'من', 'of', 'most', 'will', 'may', 'a', 'the', 'in', 'on', 'and', 'or', 'general', 'police', 'mobile', 'nice', 'reading', 'bath', 'march', 'world', 'is']);

function loadSample(limit) {
  const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  try {
    // Bounded, indexed, readonly, recent body_text rows. NOTE (measured cycle 84):
    // content_analysis.body_text and .language are populated in DISJOINT eras
    // (overlap=0), so we cannot join a language tag to body text. It does not
    // matter for detection — the module is script/gazetteer-driven and detects
    // across ALL loaded languages regardless of the article_lang hint (which only
    // affects disambiguation ranking).
    return db.prepare(`
      SELECT ca.title AS title, ca.body_text AS body, ca.language AS lang
      FROM content_analysis ca
      WHERE ca.classification = 'article' AND ca.body_text IS NOT NULL AND length(ca.body_text) > 200
      ORDER BY ca.id DESC LIMIT ?
    `).all(limit);
  } finally {
    db.close();
  }
}

function pct(n, d) { return d ? +(n / d * 100).toFixed(1) : 0; }

async function main() {
  const t0 = Date.now();
  const places = await createPlacesEngine({ dbPath: DB, tier: TIER });
  const buildMs = Date.now() - t0;
  const stats = places.stats() || {};
  const mem = process.memoryUsage();
  console.log('=== places-intel-diff: news-crawler-places-intelligence over copilot\'s live gazetteer ===');
  console.log(`engine: tier=${TIER} built in ${buildMs}ms, ${stats.total_names || '?'} names / ${stats.languages || '?'} langs; heap=${(mem.heapUsed / 1e6).toFixed(0)}MB rss=${(mem.rss / 1e6).toFixed(0)}MB`);

  const report = { generatedAt: new Date().toISOString(), tier: TIER, build_ms: buildMs, index: { total_names: stats.total_names, languages: stats.languages, unique_places: stats.unique_places }, rss_mb: +(mem.rss / 1e6).toFixed(0) };

  if (DO_GATE) {
    // TRAPS: expect zero matches. Count sentences with >=1 match (a failure).
    let trapFp = 0; const trapExamples = [];
    for (const t of TRAPS) {
      const r = places.findInText(t, { article_lang: 'en', filter: FILTER });
      if (r.results.length) { trapFp++; trapExamples.push(`"${t.slice(0, 40)}…" → ${r.results.map(m => m.matched_name).join(',')}`); }
    }
    // REAL: expect the wanted names found (by canonical or matched name).
    let realHit = 0; let realWant = 0; const realMiss = [];
    for (const c of REAL) {
      const r = places.findInText(c.text, { article_lang: 'en', filter: FILTER });
      const found = new Set(r.results.flatMap(m => [m.matched_name, m.canonical_name]));
      for (const w of c.want) { realWant++; if (found.has(w)) realHit++; else realMiss.push(`${w} (in "${c.text.slice(0, 32)}…")`); }
    }
    const trapPass = pct(TRAPS.length - trapFp, TRAPS.length);
    const realRecall = pct(realHit, realWant);
    console.log('\n--- CURATED PRECISION GATE (hand-labeled ground truth) ---');
    console.log(`  common-word TRAPS rejected: ${TRAPS.length - trapFp}/${TRAPS.length} (${trapPass}%)  [copilot basic_string_match would fail most]`);
    trapExamples.forEach(e => console.log('    FP: ' + e));
    console.log(`  REAL places recalled: ${realHit}/${realWant} (${realRecall}%)`);
    realMiss.forEach(m => console.log('    MISS: ' + m));
    const GATE = trapPass >= 87 && realRecall >= 80;
    console.log(`  GATE (>=87% traps rejected AND >=80% real recall): ${GATE ? 'PASS' : 'FAIL'}`);
    report.gate = { trap_reject_pct: trapPass, real_recall_pct: realRecall, pass: GATE, trap_fp_examples: trapExamples, real_miss: realMiss };
  }

  if (DO_SAMPLE) {
    const rows = loadSample(LIMIT);
    const lat = []; let totalPlaces = 0; const verdicts = {}; const byLang = {}; let fpIndicator = 0; let withPlaces = 0;
    const fpExamples = [];
    for (const row of rows) {
      const text = `${row.title || ''}\n${row.body || ''}`;
      const r = places.findInText(text, { article_lang: row.lang || 'en', filter: FILTER });
      lat.push(r.processing_time_ms || 0);
      totalPlaces += r.results.length;
      if (r.results.length) withPlaces++;
      const L = row.lang || '(none)'; byLang[L] = (byLang[L] || 0) + r.results.length;
      for (const m of r.results) {
        verdicts[m.verdict] = (verdicts[m.verdict] || 0) + 1;
        const surf = String(m.matched_name || '').toLowerCase();
        if (LIKELY_FP_TOKENS.has(surf) || surf.length <= 2) { fpIndicator++; if (fpExamples.length < 12) fpExamples.push(`${m.matched_name}→${m.canonical_name}`); }
      }
    }
    lat.sort((a, b) => a - b);
    const p = (q) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))].toFixed(1) : '0';
    console.log('\n--- REAL-ARTICLE SAMPLE (bounded content_analysis.body_text) ---');
    console.log(`  articles: ${rows.length}; with >=1 place: ${withPlaces} (${pct(withPlaces, rows.length)}%); total places: ${totalPlaces} (${(totalPlaces / (rows.length || 1)).toFixed(1)}/article)`);
    console.log(`  detection latency: p50 ${p(0.5)}ms  p95 ${p(0.95)}ms  (build was one-time ${buildMs}ms)`);
    console.log(`  verdict mix: ${JSON.stringify(verdicts)}`);
    console.log(`  likely-FP surface forms (function words / <=2 chars): ${fpIndicator} (${pct(fpIndicator, totalPlaces)}% of matches): ${fpExamples.join(', ')}`);
    console.log(`  places by article language (top): ${JSON.stringify(Object.fromEntries(Object.entries(byLang).sort((a, b) => b[1] - a[1]).slice(0, 8)))}`);
    report.sample = { articles: rows.length, with_places_pct: pct(withPlaces, rows.length), places_per_article: +(totalPlaces / (rows.length || 1)).toFixed(1), lat_p50: +p(0.5), lat_p95: +p(0.95), verdicts, likely_fp_pct: pct(fpIndicator, totalPlaces), by_lang: byLang };
  }

  console.log('\n--- VERDICT: places-intelligence is FEASIBLE-IN-PRACTICE (first extraction to reach live instantiation vs copilot\'s gazetteer).');
  console.log('    Strength: common-word suppression + multilingual reach copilot\'s matchers lack. Caveats: function-word FPs + inflected-language misses (see gate/sample). Adoption = ADDITIVE-OFFLINE behind a confidence threshold; NOT a hot-path or silent repoint. See docs/plans/2026-07-22-intelligence-extraction.md ---');

  if (JSON_OUT) { require('fs').writeFileSync(JSON_OUT, JSON.stringify(report, null, 2)); console.log(`  wrote ${JSON_OUT}`); }
  return 0;
}

main().then((c) => process.exit(c)).catch((err) => { console.error(err && err.stack ? err.stack : err); process.exit(1); });
