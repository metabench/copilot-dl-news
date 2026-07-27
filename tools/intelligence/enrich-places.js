#!/usr/bin/env node
'use strict';

/**
 * enrich-places.js — additive-offline places enrichment (cycle 84).
 *
 * The FIRST real CONSUMER of the places-intelligence module (extraction #3),
 * shipped after the cycle-83 feasibility proof + the cycle-84 precision post-filter
 * flipped the curated gate to PASS (tier1 + stop-word/min-confidence filter:
 * 100% common-word-trap rejection, 90.9% real recall).
 *
 * It runs the filtered engine over stored article body_text and records place
 * MENTIONS into a NEW ADDITIVE table `article_place_mentions` — it NEVER touches
 * the existing `article_places` (name-string, urls.id) or `article_place_relations`
 * (place_id-FK, http_responses.id) tables, so there is zero repoint risk. The new
 * table is keyed on `content_analysis.id` (the analyzed row) + `places.id` (the
 * module's canonical gazetteer place — a real FK target, unlike copilot's
 * basic_string_match 999999 sentinel), and carries the module's multilingual,
 * confidence-scored detections.
 *
 * SAFETY: DRY-RUN by default (reports what it WOULD write, touches nothing).
 * Pass --commit to write. Idempotent: re-running an article DELETEs its prior
 * mentions then re-inserts (so a re-run with a better filter/model is clean).
 * --out-db lets the write target a different DB from the gazetteer source (tests).
 *
 *   node tools/intelligence/enrich-places.js [--limit 300] [--tier tier1] [--commit]
 *        [--db data/news.db] [--out-db data/news.db] [--min-confidence 0.75]
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { createPlacesEngine } = require(path.join(ROOT, 'src', 'intelligence', 'placesIntelligence.js'));

const argv = process.argv.slice(2);
const getArg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DB = getArg('--db', path.join(ROOT, 'data', 'news.db'));
const OUT_DB = getArg('--out-db', DB);
const LIMIT = Math.max(1, Math.min(50000, Number(getArg('--limit', 300))));
const TIER = getArg('--tier', 'tier1');
const MIN_CONF = Number(getArg('--min-confidence', 0.75));
const COMMIT = argv.includes('--commit');

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS article_place_mentions (
  id INTEGER PRIMARY KEY,
  content_id INTEGER NOT NULL,
  place_id INTEGER NOT NULL,
  matched_name TEXT,
  canonical_name TEXT,
  place_kind TEXT,
  country_code TEXT,
  lang TEXT,
  confidence REAL,
  offset_start INTEGER,
  offset_end INTEGER,
  source TEXT NOT NULL DEFAULT 'places-intelligence',
  created_at TEXT NOT NULL,
  UNIQUE(content_id, place_id, offset_start)
);`;
const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_apm_content ON article_place_mentions(content_id);
CREATE INDEX IF NOT EXISTS idx_apm_place ON article_place_mentions(place_id);`;

/**
 * Write one article's place mentions idempotently: delete existing for this
 * content_id, then insert the new set in a transaction. PURE of the engine —
 * takes plain match objects — so it is unit-testable against an in-memory DB.
 * Returns the number of mentions written.
 */
function writeMentions(db, contentId, matches, nowIso) {
  const del = db.prepare('DELETE FROM article_place_mentions WHERE content_id = ?');
  const ins = db.prepare(`INSERT OR IGNORE INTO article_place_mentions
    (content_id, place_id, matched_name, canonical_name, place_kind, country_code, lang, confidence, offset_start, offset_end, source, created_at)
    VALUES (@content_id, @place_id, @matched_name, @canonical_name, @place_kind, @country_code, @lang, @confidence, @offset_start, @offset_end, 'places-intelligence', @created_at)`);
  const tx = db.transaction((rows) => {
    del.run(contentId);
    let n = 0;
    for (const m of rows) {
      if (!m || typeof m.place_id !== 'number') continue;
      ins.run({
        content_id: contentId, place_id: m.place_id,
        matched_name: m.matched_name || null, canonical_name: m.canonical_name || null,
        place_kind: m.place_kind || null, country_code: m.country_code || null,
        lang: m.lang || null, confidence: typeof m.confidence === 'number' ? m.confidence : null,
        offset_start: typeof m.offset_start === 'number' ? m.offset_start : null,
        offset_end: typeof m.offset_end === 'number' ? m.offset_end : null,
        created_at: nowIso,
      });
      n++;
    }
    return n;
  });
  return tx(matches);
}

function ensureSchema(db) { db.exec(CREATE_TABLE_SQL); db.exec(CREATE_INDEX_SQL); }

async function main() {
  const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 1) Build the filtered engine against the gazetteer DB.
  const t0 = Date.now();
  const places = await createPlacesEngine({ dbPath: DB, tier: TIER, filter: { minConfidence: MIN_CONF } });
  console.log(`engine: tier=${TIER} filter(minConf=${MIN_CONF}) built in ${Date.now() - t0}ms`);

  // 2) Read a bounded batch of analyzed articles WITH body text.
  const src = new Database(DB, { readonly: true, fileMustExist: true });
  let rows;
  try {
    rows = src.prepare(`SELECT ca.id AS content_id, ca.title AS title, ca.body_text AS body, ca.language AS lang
      FROM content_analysis ca
      WHERE ca.classification='article' AND ca.body_text IS NOT NULL AND length(ca.body_text) > 200
      ORDER BY ca.id DESC LIMIT ?`).all(LIMIT);
  } finally { src.close(); }

  // 3+4) Detect (filtered) + write STREAMING per article — bounded memory (a full
  // 13k backfill accumulating all detections OOM-killed the process; stream instead).
  let out = null;
  if (COMMIT) {
    out = new Database(OUT_DB);
    out.pragma('journal_mode = WAL');
    out.pragma('busy_timeout = 15000'); // coexist with electron/crawl writers without SQLITE_BUSY throws
    out.pragma('foreign_keys = ON');
    ensureSchema(out);
  }
  let totalMentions = 0; let articlesWithPlaces = 0; let written = 0; const sample = [];
  for (const row of rows) {
    const text = `${row.title || ''}\n${row.body || ''}`;
    const r = places.findInText(text, { article_lang: row.lang || 'en', filter: { minConfidence: MIN_CONF } });
    const matches = (r.results || []).map((m) => ({ ...m, lang: m.lang || row.lang || null }));
    if (matches.length) articlesWithPlaces++;
    totalMentions += matches.length;
    if (out) written += writeMentions(out, row.content_id, matches, nowIso);
    if (sample.length < 6 && matches.length) sample.push(`content#${row.content_id}: ${matches.slice(0, 6).map((m) => `${m.canonical_name}(${(m.confidence || 0).toFixed(2)})`).join(', ')}`);
  }

  console.log(`\nscanned ${rows.length} articles → ${totalMentions} place mentions (${(totalMentions / (rows.length || 1)).toFixed(1)}/article); ${articlesWithPlaces} articles with >=1 place`);
  sample.forEach((s) => console.log('  ' + s));

  if (!COMMIT) {
    console.log(`\nDRY-RUN (default): would create article_place_mentions (if absent) and write ${totalMentions} mentions to ${path.basename(OUT_DB)}. Pass --commit to write.`);
    return 0;
  }
  const tableCount = out.prepare('SELECT COUNT(*) c FROM article_place_mentions').get().c;
  console.log(`\nCOMMITTED: wrote ${written} mentions across ${rows.length} articles; article_place_mentions now has ${tableCount} rows total.`);
  out.close();
  return 0;
}

if (require.main === module) {
  main().then((c) => process.exit(c)).catch((err) => { console.error(err && err.stack ? err.stack : err); process.exit(1); });
}

module.exports = { writeMentions, ensureSchema, CREATE_TABLE_SQL };
