'use strict';

/**
 * normalize-article-places — SPENT-MIGRATION pin (c216).
 *
 * This was picked as the next ncdb delegation target (15 raw-SQL sites, and
 * uniquely testable because normalizeArticlePlaces(dbPath) accepts a path
 * while its four siblings hardcode the live db). Building the harness first
 * — the c213 -> c214 pattern — is what revealed it should NOT be delegated:
 *
 *   the migration reads article_places.article_url and writes
 *   article_places.article_url_id, and in the CURRENT schema the source
 *   column does not exist at all. Measured columns are:
 *     id, place, place_kind, method, source, offset_start, offset_end,
 *     context, first_seen_at, article_url_id
 *
 * The migration is COMPLETE in the schema; the tool can now only detect that
 * and no-op. Moving 15 sites of dead SQL into news-crawler-db would be
 * relocating a corpse into a shared library, so it was not done. Two of its
 * siblings are in the same state (place_hubs, place_hub_unknown_terms);
 * whether the spent migrations should be retired is an owner call, since a
 * migration script is also a record of how the schema got here.
 *
 * What this file pins is therefore the behaviour that actually exists: on a
 * current-schema database the tool reports success without touching data.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDb } = require('../../../data/db/sqlite/ensureDb');
const { normalizeArticlePlaces } = require('../normalize-article-places');

function tempDbPath(label) {
  return path.join(os.tmpdir(), `c216-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
}

function cleanup(p) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(p + suffix, { force: true }); } catch (_) { /* best effort */ }
  }
}

let logSpy;
beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });

describe('normalizeArticlePlaces on the CURRENT schema', () => {
  it('detects the migration is already done and changes nothing', async () => {
    const dbPath = tempDbPath('spent');
    const db = ensureDb(dbPath);

    // Guard the premise itself: if a future schema re-introduces
    // article_url, this test should fail loudly rather than quietly pass.
    const columns = db.prepare('PRAGMA table_info(article_places)').all().map((c) => c.name);
    expect(columns).toContain('article_url_id');
    expect(columns).not.toContain('article_url');

    const placeId = db.prepare(
      "INSERT INTO places (kind, country_code, source) VALUES ('city','GB','test')"
    ).run().lastInsertRowid;
    // A row already carrying its url_id, as production rows now do.
    const urlId = db.prepare("INSERT INTO urls (url) VALUES ('https://a.example/news/one')").run().lastInsertRowid;
    db.prepare('INSERT INTO article_places (place, place_kind, article_url_id) VALUES (?,?,?)')
      .run('London', 'city', urlId);
    const before = db.prepare('SELECT id, article_url_id FROM article_places ORDER BY id').all();
    db.close();

    const result = await normalizeArticlePlaces(dbPath);

    expect(result.success).toBe(true);
    // c216: in the already-normalized branch `migrated` is the count of rows
    // that ARE migrated (article_url_id IS NOT NULL) — not rows this run
    // moved. One seeded row, therefore 1. The property that matters is that
    // the data is untouched, asserted next.
    expect(result.migrated).toBe(1);

    const after = ensureDb(dbPath);
    expect(after.prepare('SELECT id, article_url_id FROM article_places ORDER BY id').all()).toEqual(before);
    after.close();
    cleanup(dbPath);
  }, 60000);

  it('succeeds on an empty article_places table', async () => {
    const dbPath = tempDbPath('empty');
    ensureDb(dbPath).close();

    const result = await normalizeArticlePlaces(dbPath);

    expect(result.success).toBe(true);
    expect(result.migrated).toBe(0);
    cleanup(dbPath);
  }, 60000);

  it('is safely repeatable', async () => {
    const dbPath = tempDbPath('repeat');
    ensureDb(dbPath).close();

    const first = await normalizeArticlePlaces(dbPath);
    const second = await normalizeArticlePlaces(dbPath);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.migrated).toBe(0);
    cleanup(dbPath);
  }, 60000);
});
