#!/usr/bin/env node
'use strict';

/**
 * cleanup-place-names.js — de-duplicate + normalize the gazetteer `place_names`
 * table (owner-approved live-DB maintenance, 2026-07-23).
 *
 * Fixes a measured data defect: the synthetic sentinel `place_id=999999`
 * ("Earth"/"World" catch-all) accumulated duplicate rows that are only a few
 * distinct normalized names, because every row has `normalized = NULL` and SQLite
 * treats NULL as DISTINCT in the UNIQUE(place_id, normalized, lang, name_kind) index
 * — so repeated bootstrap inserts never collided. (Root cause fixed in ncdb's
 * seedBootstrapData; this tool sweeps the accumulated rows.)
 *
 * WHAT IT DOES (only touches rows with normalized IS NULL):
 *   Group them by (place_id, normalizeName(name), lang, name_kind). For each group:
 *     - if a CLEAN row (non-NULL normalized) already occupies that key → the NULL rows
 *       are duplicates of it → DELETE them all (the re-run / residual case);
 *     - else keep the lowest id (or a `canonical_name_id`-referenced row) + backfill
 *       its normalized, DELETE the rest. Re-runnable (idempotent).
 *
 * REFERENTIAL INTEGRITY (verified): nothing references `place_names.id` via a declared
 * FK; `places.canonical_name_id` (logical ref) is never deleted (canonical rows are kept).
 *
 * SAFETY: dry-run by default; `--commit` writes inside ONE transaction that VERIFIES
 * invariants and ROLLS BACK unless they all hold, then a post-commit foreign_key_check +
 * quick_check. Run on a COPY (copy-verify-swap) for large sweeps; safe in-place for a tiny
 * residual on a stopped DB. normalizeName is byte-identical to ncdb's (gazetteer.ts:17).
 *
 *   node tools/db/cleanup-place-names.js --db data/news-clean.db --commit
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));

const argv = process.argv.slice(2);
const getArg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DB = getArg('--db', path.join(ROOT, 'data', 'news.db'));
const COMMIT = argv.includes('--commit');

// EXACTLY ncdb's normalizeName (news-crawler-db/src/db/sqlite/access/gazetteer.ts:17).
function normalizeName(name) {
  return String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function counts(db) {
  const c = (q, ...a) => db.prepare(q).get(...a).c;
  return {
    place_names: c('SELECT COUNT(*) c FROM place_names'),
    null_normalized: c('SELECT COUNT(*) c FROM place_names WHERE normalized IS NULL'),
    distinct_places: c('SELECT COUNT(DISTINCT place_id) c FROM place_names'),
    sentinel_names: c('SELECT COUNT(*) c FROM place_names WHERE place_id=999999'),
    palestine_names: c('SELECT COUNT(*) c FROM place_names WHERE place_id=276'),
    dangling_canonical: c('SELECT COUNT(*) c FROM places WHERE canonical_name_id IS NOT NULL AND canonical_name_id NOT IN (SELECT id FROM place_names)'),
    unique_key_dups: c('SELECT COUNT(*) c FROM (SELECT place_id, normalized, lang, name_kind FROM place_names WHERE normalized IS NOT NULL GROUP BY place_id, normalized, lang, name_kind HAVING COUNT(*) > 1)'),
  };
}

/** Compute the delete-set + update-set from the NULL-normalized rows (pure, re-runnable). */
function plan(db) {
  const rows = db.prepare('SELECT id, place_id, name, lang, name_kind FROM place_names WHERE normalized IS NULL').all();
  const canonicalIds = new Set(db.prepare('SELECT canonical_name_id AS id FROM places WHERE canonical_name_id IS NOT NULL').all().map((r) => r.id));
  const cleanExists = db.prepare('SELECT 1 c FROM place_names WHERE normalized IS NOT NULL AND place_id = ? AND normalized = ? AND lang IS ? AND name_kind IS ? LIMIT 1');
  const groups = new Map();
  for (const r of rows) {
    const norm = normalizeName(r.name);
    const key = [r.place_id, norm, r.lang || '', r.name_kind || ''].join('');
    if (!groups.has(key)) groups.set(key, { norm, place_id: r.place_id, lang: r.lang == null ? null : r.lang, name_kind: r.name_kind == null ? null : r.name_kind, rows: [] });
    groups.get(key).rows.push(r);
  }
  const deleteIds = []; const updateRows = [];
  for (const g of groups.values()) {
    g.rows.sort((a, b) => a.id - b.id);
    if (cleanExists.get(g.place_id, g.norm, g.lang, g.name_kind)) {
      // A clean (non-NULL normalized) row already holds this key -> every NULL row here is a duplicate of it.
      for (const r of g.rows) deleteIds.push(r.id);
    } else {
      const keeper = g.rows.find((r) => canonicalIds.has(r.id)) || g.rows[0];
      for (const r of g.rows) { if (r.id !== keeper.id) deleteIds.push(r.id); }
      updateRows.push({ id: keeper.id, normalized: g.norm, name: keeper.name });
    }
  }
  return { deleteIds, updateRows, groupCount: groups.size, nullRows: rows.length };
}

function main() {
  const db = new Database(DB, COMMIT ? {} : { readonly: true, fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    const before = counts(db);
    const { deleteIds, updateRows, groupCount, nullRows } = plan(db);
    console.log('=== cleanup-place-names ===');
    console.log('BEFORE:', JSON.stringify(before));
    console.log(`NULL-normalized rows: ${nullRows} -> ${groupCount} distinct (place_id, normalized, lang, name_kind) groups`);
    console.log(`  DELETE ${deleteIds.length} duplicate rows; UPDATE normalized on ${updateRows.length} survivors`);
    updateRows.forEach((u) => console.log(`    #${u.id}  "${u.name}" -> "${u.normalized}"  (place ${db.prepare('SELECT place_id p FROM place_names WHERE id=?').get(u.id)?.p})`));

    if (!COMMIT) {
      console.log(`\nDRY-RUN: would delete ${deleteIds.length} rows + set normalized on ${updateRows.length}. Pass --commit.`);
      return 0;
    }

    const del = db.prepare('DELETE FROM place_names WHERE id = ?');
    const upd = db.prepare('UPDATE place_names SET normalized = ? WHERE id = ?');
    const tx = db.transaction(() => {
      for (const id of deleteIds) del.run(id);
      for (const u of updateRows) upd.run(u.normalized, u.id);

      const after = counts(db);
      const checks = [
        ['null_normalized == 0', after.null_normalized === 0],
        ['place_names == before - deleted', after.place_names === before.place_names - deleteIds.length],
        ['distinct_places unchanged (no place lost all names)', after.distinct_places === before.distinct_places],
        ['no unique-key duplicates remain', after.unique_key_dups === 0],
        ['no dangling canonical_name_id', after.dangling_canonical === 0],
      ];
      const failed = checks.filter(([, ok]) => !ok);
      console.log('\nVERIFY (inside txn):');
      checks.forEach(([name, ok]) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`));
      console.log('AFTER:', JSON.stringify(after));
      if (failed.length) throw new Error('INVARIANT FAILURE -> rolling back: ' + failed.map(([n]) => n).join('; '));
    });
    tx();

    const fk = db.prepare('PRAGMA foreign_key_check').all();
    const integ = db.prepare('PRAGMA quick_check').get();
    console.log(`\nforeign_key_check violations: ${fk.length}`);
    console.log(`quick_check: ${JSON.stringify(integ)}`);
    if (fk.length) throw new Error('foreign_key_check found violations post-commit');
    console.log('COMMITTED + integrity verified.');
    return 0;
  } finally { db.close(); }
}

if (require.main === module) process.exit(main());

module.exports = { normalizeName, plan, counts };
