#!/usr/bin/env node
'use strict';

/**
 * dedup-http-responses.js — collapse duplicate http_responses rows.
 *
 * The live DB accumulated ~35k redundant http_responses rows: the SAME fetch
 * (identical url_id + fetched_at + request_started_at) recorded more than once
 * by re-fetch/re-ingest paths. Each redundant row can drag a content_storage
 * blob + a content_analysis + (via CASCADE) article_place_relations, so the
 * bloat is threefold. This tool removes the redundant rows while preserving
 * EVERY distinct piece of content, every analyzed piece of content, and every
 * place relation.
 *
 * WHY IT IS LOSSLESS (measured, not assumed):
 *   - Within a duplicate key-group, all content_storage rows share one
 *     content_sha256 (0 divergent groups measured). Deleting the non-keeper
 *     rows therefore drops only byte-identical copies — the keeper still holds
 *     that sha, so `COUNT(DISTINCT content_sha256)` is invariant.
 *   - The keeper per group is chosen richest-chain-first:
 *       has content_analysis > has article_place_relations > has content > lowest id
 *     so the analyzed / graph-bearing row is never the one deleted. Every
 *     distinct analyzed sha therefore survives on its group's keeper.
 *   - article_place_relations.article_id -> http_responses(id) is ON DELETE
 *     CASCADE, so before deleting a loser we RE-POINT its relations to the
 *     keeper (UPDATE OR IGNORE, dropping only exact (article_id,place_id,
 *     matching_rule_level) duplicates the keeper already has).
 *
 * The guarantee is enforced at RUNTIME, not trusted: the whole mutation runs
 * in one transaction and is ROLLED BACK unless the sha-based invariants below
 * hold afterwards. Dry-run by default; --commit to write. ALWAYS run against a
 * COPY, verify, then swap — never against the live news.db.
 *
 *   node tools/db/dedup-http-responses.js --db data/news-dedup.db            # dry-run
 *   node tools/db/dedup-http-responses.js --db data/news-dedup.db --commit   # write
 *
 * NULL fetched_at rows (55 in the live DB) are left untouched: GROUP BY treats
 * NULLs as equal but a UNIQUE index would not, so they are out of scope for a
 * safe, unambiguous key. Reported, never deleted.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));

const argv = process.argv.slice(2);
const getArg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DB = getArg('--db', path.join(ROOT, 'data', 'news.db'));
const COMMIT = argv.includes('--commit');

function invariants(db) {
  return {
    http_rows: db.prepare('SELECT COUNT(*) c FROM http_responses').get().c,
    content_rows: db.prepare('SELECT COUNT(*) c FROM content_storage').get().c,
    analysis_rows: db.prepare('SELECT COUNT(*) c FROM content_analysis').get().c,
    url_rows: db.prepare('SELECT COUNT(*) c FROM urls').get().c,
    apr_rows: db.prepare('SELECT COUNT(*) c FROM article_place_relations').get().c,
    // The LOSSLESS invariants — sha-based, so collapsing duplicate content_ids
    // (the whole point) is allowed while unique content can never be lost.
    distinct_content_sha: db.prepare('SELECT COUNT(DISTINCT content_sha256) c FROM content_storage WHERE content_sha256 IS NOT NULL').get().c,
    distinct_analyzed_sha: db.prepare('SELECT COUNT(DISTINCT cs.content_sha256) c FROM content_analysis ca JOIN content_storage cs ON cs.id = ca.content_id WHERE cs.content_sha256 IS NOT NULL').get().c,
    // Post-condition: no duplicate key-groups remain (non-null fetched_at).
    dup_groups: db.prepare('SELECT COUNT(*) c FROM (SELECT 1 FROM http_responses WHERE fetched_at IS NOT NULL GROUP BY url_id, fetched_at, request_started_at HAVING COUNT(*) > 1)').get().c,
  };
}

function main() {
  const db = new Database(DB, { fileMustExist: true });
  db.pragma('foreign_keys = ON'); // keep FK guards live: children deleted before parents, so this never aborts a valid delete — it only catches an unexpected reference.
  db.pragma('journal_mode = WAL');
  try {
    console.log(`=== dedup-http-responses on ${DB} (${COMMIT ? 'COMMIT' : 'DRY-RUN'}) ===`);

    // --- Precompute per-row richness flags as indexed temp tables (fast point lookups) ---
    db.exec(`
      DROP TABLE IF EXISTS t_content; DROP TABLE IF EXISTS t_analyzed; DROP TABLE IF EXISTS t_apr;
      CREATE TEMP TABLE t_content(hr INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO t_content SELECT http_response_id FROM content_storage WHERE http_response_id IS NOT NULL;
      CREATE TEMP TABLE t_analyzed(hr INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO t_analyzed SELECT cs.http_response_id FROM content_storage cs JOIN content_analysis ca ON ca.content_id = cs.id WHERE cs.http_response_id IS NOT NULL;
      CREATE TEMP TABLE t_apr(hr INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO t_apr SELECT article_id FROM article_place_relations;
    `);

    // --- Duplicate key-groups (non-null fetched_at only) ---
    db.exec(`
      DROP TABLE IF EXISTS dupkeys;
      CREATE TEMP TABLE dupkeys AS
        SELECT url_id, fetched_at, request_started_at
        FROM http_responses WHERE fetched_at IS NOT NULL
        GROUP BY url_id, fetched_at, request_started_at HAVING COUNT(*) > 1;
      CREATE INDEX tmp_dupkeys ON dupkeys(url_id, fetched_at, request_started_at);
    `);

    // --- Loser rows + the keeper each maps to (richest-chain-first ranking) ---
    db.exec(`
      DROP TABLE IF EXISTS loser_map;
      CREATE TEMP TABLE loser_map AS
      SELECT id AS loser_id, keep_id FROM (
        SELECT hr.id,
          FIRST_VALUE(hr.id) OVER w AS keep_id,
          ROW_NUMBER()       OVER w AS rn
        FROM http_responses hr
        JOIN dupkeys d ON d.url_id = hr.url_id AND d.fetched_at = hr.fetched_at AND d.request_started_at = hr.request_started_at
        WINDOW w AS (
          PARTITION BY hr.url_id, hr.fetched_at, hr.request_started_at
          ORDER BY
            (SELECT 1 FROM t_analyzed x WHERE x.hr = hr.id) DESC,
            (SELECT 1 FROM t_apr      x WHERE x.hr = hr.id) DESC,
            (SELECT 1 FROM t_content  x WHERE x.hr = hr.id) DESC,
            hr.id ASC
        )
      ) WHERE rn > 1;
      CREATE INDEX tmp_loser ON loser_map(loser_id);
    `);

    const loserCount = db.prepare('SELECT COUNT(*) c FROM loser_map').get().c;
    const before = invariants(db);
    console.log('BEFORE:', JSON.stringify(before, null, 0));
    console.log('loser rows to remove:', loserCount);
    console.log('null-fetched_at rows left untouched:', db.prepare('SELECT COUNT(*) c FROM http_responses WHERE fetched_at IS NULL').get().c);

    if (loserCount === 0) { console.log('nothing to do'); db.close(); return 0; }

    db.exec('BEGIN');
    // Re-point place relations off losers onto their keeper before the cascade can fire.
    const reAttached = db.prepare(`
      UPDATE OR IGNORE article_place_relations
        SET article_id = (SELECT keep_id FROM loser_map WHERE loser_id = article_id)
        WHERE article_id IN (SELECT loser_id FROM loser_map)
    `).run().changes;
    // Children before parents (FK-safe).
    const delAnalysis = db.prepare('DELETE FROM content_analysis WHERE content_id IN (SELECT id FROM content_storage WHERE http_response_id IN (SELECT loser_id FROM loser_map))').run().changes;
    const delContent = db.prepare('DELETE FROM content_storage WHERE http_response_id IN (SELECT loser_id FROM loser_map)').run().changes;
    const delHttp = db.prepare('DELETE FROM http_responses WHERE id IN (SELECT loser_id FROM loser_map)').run().changes;

    const after = invariants(db);
    console.log('deleted:', JSON.stringify({ reAttached, delAnalysis, delContent, delHttp }));
    console.log('AFTER: ', JSON.stringify(after, null, 0));

    // --- Enforce losslessness. Any breach rolls the whole thing back. ---
    const problems = [];
    if (after.distinct_content_sha !== before.distinct_content_sha) problems.push(`distinct_content_sha changed ${before.distinct_content_sha} -> ${after.distinct_content_sha}`);
    if (after.distinct_analyzed_sha !== before.distinct_analyzed_sha) problems.push(`distinct_analyzed_sha changed ${before.distinct_analyzed_sha} -> ${after.distinct_analyzed_sha}`);
    if (after.url_rows !== before.url_rows) problems.push(`url_rows changed ${before.url_rows} -> ${after.url_rows}`);
    if (after.apr_rows !== before.apr_rows) problems.push(`article_place_relations count changed ${before.apr_rows} -> ${after.apr_rows} (relations lost)`);
    if (after.dup_groups !== 0) problems.push(`dup_groups still ${after.dup_groups} (dedup incomplete)`);
    if (after.http_rows !== before.http_rows - loserCount) problems.push(`http_rows delta wrong: expected -${loserCount}`);

    if (problems.length) {
      db.exec('ROLLBACK');
      console.log('\nINVARIANT VIOLATION — ROLLED BACK, no changes written:');
      problems.forEach((p) => console.log('  ✗ ' + p));
      db.close();
      return 2;
    }

    if (COMMIT) { db.exec('COMMIT'); console.log('\n✓ invariants hold — COMMITTED'); }
    else { db.exec('ROLLBACK'); console.log('\n✓ invariants hold — DRY-RUN, rolled back (pass --commit to write)'); }
    db.close();
    return 0;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* not in txn */ }
    db.close();
    console.error('ERROR (rolled back):', err && err.message);
    return 1;
  }
}

process.exit(main());
