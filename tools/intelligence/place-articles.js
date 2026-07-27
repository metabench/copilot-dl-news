#!/usr/bin/env node
'use strict';

/**
 * place-articles.js — SURFACE the cycle-84 places enrichment (cycle 85).
 *
 * Reads the additive `article_place_mentions` table (place_id-FK, multilingual,
 * confidence-scored — built by tools/intelligence/enrich-places.js) to answer
 * "which articles mention place X".
 *
 * The FK/place_id design is language-independent by construction: "London"/"Londres"/
 * "Лондон" all fold to one place_id, and the id resolves to a real `places` row (no
 * basic_string_match 999999 sentinel). It also carries a confidence score for ranking.
 * The `legacy_article_places_rows` figure is reported for context only — NOTE that the
 * legacy `article_places` table is DEGENERATE (7 distinct places, ~94% "London"), so it
 * is NOT a meaningful baseline; do not read the comparison as "beats the incumbent".
 * This tool is a reusable read-side CLI surface (no server/UI change, no ncdb-debt).
 *
 * READONLY + bounded (LIMIT). The query functions are exported + unit-tested.
 *
 *   node tools/intelligence/place-articles.js --place London [--limit 15]
 *   node tools/intelligence/place-articles.js --place-id 21 [--json]
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const argv = process.argv.slice(2);
const getArg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DB = getArg('--db', path.join(ROOT, 'data', 'news.db'));
const PLACE = getArg('--place', null);
const PLACE_ID = getArg('--place-id', null);
const LIMIT = Math.max(1, Math.min(200, Number(getArg('--limit', 15))));
const JSON_OUT = argv.includes('--json');

// English-primary DISPLAY name for a place. The AUTHORITATIVE source is
// `places.canonical_name_id` (populated for 99.8% of places, English 97.5% of the
// time — e.g. Gaza→"Gaza City", London→"London"); use it first. Fall back to an
// English-ranked pick from place_names ONLY for the ~24 places with a NULL
// canonical_name_id. Do NOT use `is_preferred` as the display key: it is NON-UNIQUE
// (avg ~39 preferred names PER PLACE, max 533, in every language), so a bare
// `WHERE is_preferred=1 LIMIT 1` returns an ARBITRARY language (it once showed Gaza
// as 加薩). `alias` is the places-table alias whose .id + .canonical_name_id are read.
const enDisplayName = (alias) => `COALESCE(
  (SELECT name FROM place_names WHERE id = ${alias}.canonical_name_id),
  (SELECT name FROM place_names WHERE place_id = ${alias}.id
     ORDER BY (lang IN ('en','en-GB','en-US','en-CA','en-AU','eng')) DESC,
              (lang = 'und') DESC, is_official DESC, is_preferred DESC, length(name) ASC
     LIMIT 1))`;

/** Resolve a place NAME (any language) to gazetteer place rows via place_names. */
function resolvePlaceIds(db, name) {
  const norm = String(name || '').trim().toLowerCase();
  if (!norm) return [];
  return db.prepare(`
    SELECT DISTINCT p.id AS place_id, p.kind, p.country_code, p.population,
           ${enDisplayName('p')} AS name
    FROM place_names pn JOIN places p ON p.id = pn.place_id
    WHERE pn.normalized = ? OR lower(pn.name) = ?
    ORDER BY p.population DESC NULLS LAST LIMIT 10
  `).all(norm, norm);
}

/** Resolve a single place by gazetteer id (English-primary display name). */
function resolvePlaceById(db, id) {
  return db.prepare(`SELECT id AS place_id, kind, country_code, population, ${enDisplayName('places')} AS name FROM places WHERE id = ?`).get(Number(id)) || null;
}

/**
 * DISTINCT articles mentioning a place_id, via the FK-valid mentions table,
 * ranked by best mention confidence. Title comes from content_analysis (always
 * present); the URL is LEFT-joined (content_analysis→content_storage→
 * http_responses→urls) and is NULL for recent rows whose content_storage has a
 * NULL http_response_id — a measured data reality (the recent analysis path does
 * not link content_storage to http_responses), so the article still shows by
 * title. GROUP BY content_analysis.id collapses the multiple mentions per article.
 */
function listArticlesForPlace(db, placeId, limit) {
  return db.prepare(`
    SELECT ca.id AS content_id, ca.title,
           MAX(apm.confidence) AS confidence, COUNT(*) AS mention_count,
           (SELECT u.url FROM content_storage cs
              LEFT JOIN http_responses h ON h.id = cs.http_response_id
              LEFT JOIN urls u ON u.id = h.url_id
              WHERE cs.id = ca.content_id LIMIT 1) AS url
    FROM article_place_mentions apm
    JOIN content_analysis ca ON ca.id = apm.content_id
    WHERE apm.place_id = ?
    GROUP BY ca.id
    ORDER BY MAX(apm.confidence) DESC, ca.id DESC LIMIT ?
  `).all(placeId, limit);
}

/** Coverage comparison: FK mentions vs legacy name-string article_places. */
function coverageComparison(db, placeId, placeName) {
  const mentions = db.prepare('SELECT COUNT(DISTINCT content_id) c FROM article_place_mentions WHERE place_id = ?').get(placeId).c;
  const distinctSurfaces = db.prepare('SELECT COUNT(DISTINCT matched_name) c FROM article_place_mentions WHERE place_id = ?').get(placeId).c;
  let legacy = 0;
  try { legacy = db.prepare('SELECT COUNT(*) c FROM article_places WHERE lower(place) = ?').get(String(placeName || '').toLowerCase()).c; } catch (_) { /* table shape */ }
  return { mentions_articles: mentions, distinct_surface_forms: distinctSurfaces, legacy_article_places_rows: legacy };
}

function main() {
  const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  try {
    let targets = [];
    if (PLACE_ID) {
      const p = resolvePlaceById(db, PLACE_ID);
      if (p) targets = [p];
    } else if (PLACE) {
      targets = resolvePlaceIds(db, PLACE);
    } else {
      console.log('usage: place-articles.js --place <name> | --place-id <id> [--limit N] [--json]');
      return 2;
    }
    if (!targets.length) { console.log('no matching place'); return 0; }

    const out = [];
    for (const t of targets.slice(0, 3)) {
      const articles = listArticlesForPlace(db, t.place_id, LIMIT);
      const cov = coverageComparison(db, t.place_id, t.name);
      out.push({ place: t, coverage: cov, articles });
      if (!JSON_OUT) {
        console.log(`\n=== ${t.name || '(place ' + t.place_id + ')'} [${t.kind}/${t.country_code || '?'}] place_id=${t.place_id} ===`);
        console.log(`  coverage: ${cov.mentions_articles} articles via FK mentions (${cov.distinct_surface_forms} distinct surface forms) · legacy article_places name-string rows: ${cov.legacy_article_places_rows}`);
        articles.forEach((a) => console.log(`  [${(a.confidence || 0).toFixed(2)} ×${a.mention_count}] "${String(a.title || '(untitled)').slice(0, 58)}"${a.url ? '  ' + String(a.url).slice(0, 44) : ''}`));
        if (!articles.length) console.log('  (no mentions for this place — run enrich-places.js to widen coverage)');
      }
    }
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
    return 0;
  } finally { db.close(); }
}

if (require.main === module) process.exit(main());

module.exports = { resolvePlaceIds, resolvePlaceById, listArticlesForPlace, coverageComparison };
