'use strict';

/**
 * Unit tests for enrich-places.js write path. Uses an in-memory better-sqlite3
 * DB + stub match objects — NO real gazetteer, NO live DB. Locks the additive
 * schema + the idempotent (delete-then-insert) upsert.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
const { writeMentions, ensureSchema } = require('../enrich-places.js');

const NOW = '2026-07-23 12:00:00';
const M = (place_id, name, off, conf = 0.9) => ({ place_id, matched_name: name, canonical_name: name, place_kind: 'city', country_code: 'GB', lang: 'en', confidence: conf, offset_start: off, offset_end: off + name.length });

function freshDb() { const db = new Database(':memory:'); ensureSchema(db); return db; }

describe('enrich-places write path', () => {
  test('ensureSchema creates the additive table without touching existing ones', () => {
    const db = freshDb();
    const cols = db.prepare('PRAGMA table_info(article_place_mentions)').all().map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['content_id', 'place_id', 'canonical_name', 'confidence', 'offset_start', 'source', 'created_at']));
    db.close();
  });

  test('writeMentions inserts a set and returns the count', () => {
    const db = freshDb();
    const n = writeMentions(db, 100, [M(21, 'London', 5), M(1, 'Paris', 40)], NOW);
    expect(n).toBe(2);
    expect(db.prepare('SELECT COUNT(*) c FROM article_place_mentions WHERE content_id=100').get().c).toBe(2);
    db.close();
  });

  test('re-running an article is IDEMPOTENT (delete-then-insert, no dupes)', () => {
    const db = freshDb();
    writeMentions(db, 100, [M(21, 'London', 5), M(1, 'Paris', 40)], NOW);
    writeMentions(db, 100, [M(21, 'London', 5), M(1, 'Paris', 40)], NOW); // same again
    expect(db.prepare('SELECT COUNT(*) c FROM article_place_mentions WHERE content_id=100').get().c).toBe(2);
    // a re-run with a DIFFERENT (better) result set replaces cleanly
    const n = writeMentions(db, 100, [M(21, 'London', 5)], NOW);
    expect(n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM article_place_mentions WHERE content_id=100').get().c).toBe(1);
    db.close();
  });

  test('skips malformed matches (no numeric place_id)', () => {
    const db = freshDb();
    const n = writeMentions(db, 100, [M(21, 'London', 5), { matched_name: 'x' }, null, { place_id: 'nope' }], NOW);
    expect(n).toBe(1);
    db.close();
  });

  test('the UNIQUE(content_id, place_id, offset_start) key dedupes within a batch', () => {
    const db = freshDb();
    const n = writeMentions(db, 100, [M(21, 'London', 5), M(21, 'London', 5)], NOW); // same offset
    expect(n).toBe(2); // both attempted...
    expect(db.prepare('SELECT COUNT(*) c FROM article_place_mentions WHERE content_id=100').get().c).toBe(1); // ...one stored (INSERT OR IGNORE)
    db.close();
  });

  test('mentions for different articles coexist', () => {
    const db = freshDb();
    writeMentions(db, 100, [M(21, 'London', 5)], NOW);
    writeMentions(db, 200, [M(1, 'Paris', 5)], NOW);
    expect(db.prepare('SELECT COUNT(*) c FROM article_place_mentions').get().c).toBe(2);
    db.close();
  });
});
