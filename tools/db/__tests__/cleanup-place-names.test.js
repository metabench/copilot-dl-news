'use strict';

/**
 * Unit tests for cleanup-place-names.js — the keeper/dedup logic + normalizer,
 * against an in-memory DB. No live DB. Proves: dedup by (place_id, normalized,
 * lang, name_kind); canonical-referenced rows are never deleted; distinct names
 * (incl. real NULL-normalized names) are preserved.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
const { normalizeName, plan } = require('../cleanup-place-names.js');

function db() {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE places (id INTEGER PRIMARY KEY, canonical_name_id INTEGER);
    CREATE TABLE place_names (id INTEGER PRIMARY KEY, place_id INTEGER, name TEXT, normalized TEXT, lang TEXT, name_kind TEXT);
  `);
  return d;
}
const ins = (d, id, place_id, name, normalized, lang, name_kind) =>
  d.prepare('INSERT INTO place_names VALUES (?,?,?,?,?,?)').run(id, place_id, name, normalized, lang, name_kind);

describe('normalizeName (byte-identical to ncdb)', () => {
  test.each([
    ['São Paulo', 'sao paulo'], ['München', 'munchen'], ['Zürich', 'zurich'],
    ['World', 'world'], ['  Spaced  ', 'spaced'],
  ])('%s → %s', (inp, exp) => expect(normalizeName(inp)).toBe(exp));
});

describe('plan() keeper/dedup logic', () => {
  test('collapses exact + case-variant duplicates to one row per normalized key', () => {
    const d = db();
    d.prepare('INSERT INTO places VALUES (999999, NULL)').run();
    ins(d, 1, 999999, 'Earth', null, 'en', 'common');
    ins(d, 2, 999999, 'Earth', null, 'en', 'common'); // exact dup
    ins(d, 3, 999999, 'World', null, 'en', 'alias');
    ins(d, 4, 999999, 'world', null, 'en', 'alias');  // case variant → same normalized "world"
    const p = plan(d);
    expect(p.deleteIds.sort()).toEqual([2, 4]);          // keep #1 (Earth), #3 (World)
    expect(p.updateRows.map((u) => u.id).sort()).toEqual([1, 3]);
    expect(p.updateRows.find((u) => u.id === 1).normalized).toBe('earth');
    expect(p.updateRows.find((u) => u.id === 3).normalized).toBe('world');
    d.close();
  });

  test('NEVER deletes a canonical-referenced row — it becomes the keeper', () => {
    const d = db();
    // canonical_name_id points at the 2nd (higher-id) duplicate, not the lowest.
    d.prepare('INSERT INTO places VALUES (5, 20)').run();
    ins(d, 10, 5, 'Foo', null, 'en', 'common');
    ins(d, 20, 5, 'Foo', null, 'en', 'common'); // canonical target (higher id)
    const p = plan(d);
    expect(p.deleteIds).toEqual([10]);                 // the NON-canonical dup is deleted
    expect(p.updateRows.map((u) => u.id)).toEqual([20]); // canonical row survives
    d.close();
  });

  test('distinct real names (all NULL-normalized) are all kept, just backfilled', () => {
    const d = db();
    d.prepare('INSERT INTO places VALUES (276, NULL)').run();
    ins(d, 100, 276, 'Palestinian Territories', null, 'en', 'colloquial');
    ins(d, 101, 276, 'Occupied Palestinian Territories', null, 'en', 'colloquial');
    ins(d, 102, 276, 'West Bank and Gaza', null, 'en', 'colloquial');
    const p = plan(d);
    expect(p.deleteIds).toEqual([]);                   // distinct names → nothing deleted
    expect(p.updateRows.map((u) => u.normalized).sort()).toEqual(
      ['occupied palestinian territories', 'palestinian territories', 'west bank and gaza']);
    d.close();
  });

  test('re-run/residual: a NULL row whose key already has a CLEAN row is DELETED (not backfilled)', () => {
    const d = db();
    d.prepare('INSERT INTO places VALUES (999999, NULL)').run();
    ins(d, 1, 999999, 'Earth', 'earth', 'en', 'common');  // already-clean survivor
    ins(d, 2, 999999, 'Earth', null, 'en', 'common');      // residual NULL dup of #1
    ins(d, 3, 999999, 'World', null, 'en', 'alias');       // residual NULL, no clean row for this key
    const p = plan(d);
    expect(p.deleteIds).toEqual([2]);                      // #2 collides with clean #1 → deleted
    expect(p.updateRows.map((u) => u.id)).toEqual([3]);    // #3 has no clean row → kept + backfilled
    expect(p.updateRows[0].normalized).toBe('world');
    d.close();
  });

  test('rows that already have a normalized value are untouched', () => {
    const d = db();
    d.prepare('INSERT INTO places VALUES (5, NULL)').run();
    ins(d, 1, 5, 'London', 'london', 'en', 'common'); // already normalized
    const p = plan(d);
    expect(p.deleteIds).toEqual([]);
    expect(p.updateRows).toEqual([]); // plan only considers NULL-normalized rows
    d.close();
  });
});
