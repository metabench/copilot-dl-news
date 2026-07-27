#!/usr/bin/env node
'use strict';

/**
 * doc-intel-diff.js — page-fixture differential harness for the
 * document-intelligence module (cycle 80). The measure-before-build instrument
 * for extraction #2: runs the sibling `analyze_document` over REAL stored HTML
 * pages and reports what it classifies + how its schema facts overlap copilot's
 * own `extractSchemaSignals`. This makes the scout's "additive new capability,
 * NOT a drop-in substitute" verdict a MEASURED fact, not a theorised one.
 *
 * It is NOT a url-string harness (that was url-intel-diff.js) — document
 * classification needs the real page bytes, so it reads + decompresses real
 * `content_storage` blobs.
 *
 * DB safety: a bounded, indexed, readonly read (LIMIT N by id DESC) closed
 * promptly in a finally — NOT a slow scan (the live-DB-probe gotcha is about
 * unbounded slow queries pinning the WAL; a LIMIT-N indexed read is fast).
 *
 *   node tools/intelligence/doc-intel-diff.js [--db data/news.db] [--limit 60]
 *        [--json <path>]
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const { createDocumentClassifier, DETAILED_LABELS, GENERAL_LABELS } = require(path.join(ROOT, 'src', 'intelligence', 'documentIntelligence.js'));
const { decompress } = require(path.join(ROOT, 'src', 'shared', 'utils', 'compression.js'));

const argv = process.argv.slice(2);
const getArg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const DB = getArg('--db', path.join(ROOT, 'data', 'news.db'));
const LIMIT = Math.max(5, Math.min(500, Number(getArg('--limit', 60))));
const JSON_OUT = getArg('--json', null);

function loadFixtures(accuracyMode) {
  const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  const out = [];
  try {
    // Bounded, indexed, readonly. gzip/brotli only (zstd needs an extra package).
    // --accuracy: join content_analysis for the GROUND TRUTH (copilot classified
    // the page 'article'), so we can measure the module's accuracy, not just its
    // distribution. content_analysis.content_id -> content_storage.id.
    const rows = accuracyMode
      ? db.prepare(`
          SELECT cs.content_blob AS blob, ct.algorithm AS algo, u.url AS url, ca.title AS title
          FROM content_analysis ca
          JOIN content_storage cs ON cs.id = ca.content_id
          JOIN compression_types ct ON cs.compression_type_id = ct.id
          JOIN http_responses h ON h.id = cs.http_response_id
          JOIN urls u ON u.id = h.url_id
          WHERE ca.classification = 'article' AND ct.algorithm IN ('gzip','brotli')
            AND cs.content_blob IS NOT NULL AND ca.title IS NOT NULL AND length(ca.title) > 15
          ORDER BY ca.id DESC LIMIT ?
        `).all(LIMIT)
      : db.prepare(`
          SELECT cs.content_blob AS blob, ct.algorithm AS algo, u.url AS url, NULL AS title
          FROM content_storage cs
          JOIN compression_types ct ON cs.compression_type_id = ct.id
          JOIN http_responses h ON h.id = cs.http_response_id
          JOIN urls u ON u.id = h.url_id
          WHERE ct.algorithm IN ('gzip','brotli') AND cs.content_blob IS NOT NULL
          ORDER BY cs.id DESC LIMIT ?
        `).all(LIMIT);
    for (const r of rows) {
      try {
        const html = decompress(Buffer.isBuffer(r.blob) ? r.blob : Buffer.from(r.blob), r.algo).toString('utf8');
        if (html && html.length > 40) out.push({ url: r.url, html, title: r.title });
      } catch (_) { /* skip a bad blob */ }
    }
  } finally {
    db.close();
  }
  return out;
}

// --accuracy: measure the module's labels against copilot's CONFIRMED-article
// ground truth. A high false-positive rate (article -> login/product/org/error)
// means the module is miscalibrated for news content and is NOT usable offline.
async function runAccuracy() {
  const docIntel = await createDocumentClassifier();
  const fixtures = loadFixtures(true);
  if (!fixtures.length) { console.log('no confirmed-article fixtures found'); return 0; }
  const HARD_FP = new Set(['login_page', 'product_page', 'organization_page', 'error_page']);
  const general = {}; const detailed = {}; let hardFp = 0; const examples = [];
  for (const { url, html, title } of fixtures) {
    const m = docIntel.classifyDocument(html, url);
    general[m.classification] = (general[m.classification] || 0) + 1;
    detailed[m.label] = (detailed[m.label] || 0) + 1;
    if (HARD_FP.has(m.label)) { hardFp++; if (examples.length < 15) examples.push([m.label, String(title || '').slice(0, 48), String(url).slice(0, 66)]); }
  }
  const n = fixtures.length;
  const recall = (general.article || 0) / n * 100;
  const fpPct = hardFp / n * 100;
  console.log('=== doc-intel accuracy vs copilot-CONFIRMED articles (ground truth = article) ===');
  console.log(`sample: ${n} confirmed articles`);
  console.log(`  module calls them "article": ${general.article || 0} (${recall.toFixed(1)}% recall)`);
  console.log(`  HARD false-positives (article -> login/product/org/error): ${hardFp} (${fpPct.toFixed(1)}%)`);
  console.log('  module general-stage distribution:');
  for (const [k, v] of Object.entries(general).sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log('  false-positive examples (real articles mislabeled):');
  examples.forEach(([l, t, u]) => console.log(`    [${l}] "${t}" ${u}`));
  const GATE = recall >= 80 && fpPct <= 5;
  console.log(`  GATE (need >=80% article-recall AND <=5% hard-FP): ${GATE ? 'PASS — usable offline' : 'FAIL — NOT usable; module miscalibrated for news content (needs upstream recalibration)'}`);
  return 0;
}

async function main() {
  if (argv.includes('--accuracy')) return runAccuracy();
  const docIntel = await createDocumentClassifier();
  const fixtures = loadFixtures(false);
  if (!fixtures.length) { console.log('no decompressible fixtures found'); return 0; }

  const detailed = {}; const general = {};
  // NEW capability = detailed labels copilot has NO content-signal home for.
  const NEW_CAP = new Set(['opinion_article', 'blog_post', 'product_page', 'organization_page', 'error_page', 'login_page']);
  const newCapExamples = {};

  for (const { url, html } of fixtures) {
    const m = docIntel.classifyDocument(html, url);
    detailed[m.label] = (detailed[m.label] || 0) + 1;
    general[m.classification] = (general[m.classification] || 0) + 1;
    if (NEW_CAP.has(m.label)) {
      (newCapExamples[m.label] = newCapExamples[m.label] || []);
      if (newCapExamples[m.label].length < 5) newCapExamples[m.label].push(url);
    }
  }

  const total = fixtures.length;
  const newCapCount = Object.entries(detailed).filter(([k]) => NEW_CAP.has(k)).reduce((s, [, c]) => s + c, 0);
  const report = {
    generatedAt: new Date().toISOString(), fixtures: total,
    module_general_label_distribution: general,
    module_detailed_label_distribution: detailed,
    new_capability_labels_copilot_cannot_produce: Object.fromEntries(
      Object.entries(detailed).filter(([k]) => NEW_CAP.has(k))),
    new_capability_pct: total ? +(newCapCount / total * 100).toFixed(1) : 0,
    caveat: 'DELEGATION BLOCKED (drop-in): input re-parse reverses task #46 + zero decision value on the hot path; output-shape (no weighted schema.score) = consumer rewrite; taxonomy mismatch. ADDITIVE-OFFLINE only, and even that needs validation — spot checks show the module MISLABELS some real pages (a news article as login_page, /about as opinion_article), so its labels are not trustworthy as-is without a labelled-fixture accuracy pass.',
  };

  console.log('=== doc-intel-diff: document-intelligence over real stored pages ===');
  console.log(`fixtures: ${total} decompressed real pages`);
  console.log('--- module GENERAL-stage label distribution (maps to copilot article/hub/nav/unknown) ---');
  for (const l of GENERAL_LABELS.concat(Object.keys(general).filter((k) => !GENERAL_LABELS.includes(k)))) {
    if (general[l]) console.log(`  ${String(general[l]).padStart(4)}  ${l}`);
  }
  console.log('--- module DETAILED label distribution (its 9-value taxonomy) ---');
  for (const [l, c] of Object.entries(detailed).sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${l}${NEW_CAP.has(l) ? '   <- NEW capability (no copilot content-signal home)' : ''}`);
  console.log(`--- ${newCapCount}/${total} (${report.new_capability_pct}%) got a NEW-capability label copilot cannot produce ---`);
  for (const [l, ex] of Object.entries(newCapExamples)) { console.log(`  # ${l}`); ex.forEach((u) => console.log(`      ${String(u).slice(0, 100)}`)); }
  console.log('--- VERDICT: document-intelligence delegation is BLOCKED as a drop-in (input re-parse reverses #46 + zero hot-path decision value; output-shape; taxonomy).');
  console.log('    Value is ADDITIVE-OFFLINE (the NEW labels), but the module MISLABELS some real pages (news->login_page, /about->opinion_article) — needs a labelled-fixture accuracy pass before adoption. See docs/plans/2026-07-22-intelligence-extraction.md ---');

  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2)); console.log(`  wrote ${JSON_OUT}`); }
  return 0;
}

main().then((c) => process.exit(c)).catch((err) => { console.error(err); process.exit(1); });
