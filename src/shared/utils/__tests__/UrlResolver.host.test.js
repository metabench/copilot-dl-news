'use strict';

/**
 * UrlResolver / HttpRequestResponseFacade — url-row shape (c219).
 *
 * The `urls` table has at least EIGHT different insert shapes across this
 * repo and news-crawler-db. Two of them live here and disagree:
 *
 *   UrlResolver            INSERT OR IGNORE INTO urls (url, created_at)
 *   HttpRequestResponse-   INSERT INTO urls (url, host, created_at,
 *   Facade                                   last_seen_at)
 *
 * Measured on the live db (read-only, 2026-08-05): of 1,867,208 url rows,
 * 91,013 (4.9%) have a NULL host and 90,088 a NULL last_seen_at. Which
 * writer produced which row is NOT determinable from here — eight writers
 * share the table — so this file does not claim a cause. What it pins is
 * that the two writers in THIS repo now agree, via ncdb's existing
 * `ensureUrlId` primitive.
 *
 * This matters now rather than in principle: UrlResolver's only callers are
 * the two migrations that have NOT yet run (normalize-fetches, 54,485 rows,
 * and normalize-place-hub-candidates, 673). Running them on the old code
 * would have added fresh host-less rows to the pile.
 *
 * Structure is deliberate. The first block is the CONTRACT that must not
 * change under the repoint — it passed before and must pass after. The
 * second block is the DIVERGENCE being closed; it failed before the
 * repoint, which is what makes this a differential proof rather than a
 * hope.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDb } = require('../../../data/db/sqlite/ensureDb');
const { UrlResolver } = require('../UrlResolver');

function tempDb(label) {
  return path.join(os.tmpdir(), `c219-${label}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.db`);
}
function cleanup(p) {
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} }
}

let dbPath;
let db;
beforeEach(() => { dbPath = tempDb('urlresolver'); db = ensureDb(dbPath); });
afterEach(() => { try { db.close(); } catch (_) {} cleanup(dbPath); });

describe('UrlResolver contract (must survive the repoint unchanged)', () => {
  test('ensureUrlId returns a stable id and is idempotent', () => {
    const r = new UrlResolver(db);
    const first = r.ensureUrlId('https://example.com/a');
    const second = r.ensureUrlId('https://example.com/a');
    expect(first).toBe(second);
    expect(db.prepare("SELECT COUNT(*) c FROM urls WHERE url = 'https://example.com/a'").get().c).toBe(1);
  });

  test('ensureUrlId rejects a non-string', () => {
    const r = new UrlResolver(db);
    expect(() => r.ensureUrlId(null)).toThrow();
    expect(() => r.ensureUrlId(42)).toThrow();
  });

  test('batchResolve maps every url to its id and dedupes the input', () => {
    const r = new UrlResolver(db);
    const urls = ['https://a.example/1', 'https://b.example/2', 'https://a.example/1'];
    const map = r.batchResolve(urls);
    expect(map.size).toBe(2);
    expect(map.get('https://a.example/1')).toBe(r.ensureUrlId('https://a.example/1'));
    expect(map.get('https://b.example/2')).toBe(r.ensureUrlId('https://b.example/2'));
  });

  test('batchResolve on an empty list returns an empty map, no rows written', () => {
    const r = new UrlResolver(db);
    expect(r.batchResolve([]).size).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM urls').get().c).toBe(0);
  });

  test('getUrlById round-trips, and returns null for an unknown id', () => {
    const r = new UrlResolver(db);
    const id = r.ensureUrlId('https://example.com/round-trip');
    expect(r.getUrlById(id)).toBe('https://example.com/round-trip');
    expect(r.getUrlById(999999999)).toBeNull();
  });
});

describe('urls-row shape — the divergence this cycle closes', () => {
  // FAILED before the repoint: UrlResolver inserted (url, created_at) only.
  test('ensureUrlId populates host', () => {
    const r = new UrlResolver(db);
    const id = r.ensureUrlId('https://News.Example.COM/story/1');
    const row = db.prepare('SELECT host, created_at, last_seen_at FROM urls WHERE id = ?').get(id);
    expect(row.host).toBe('news.example.com'); // ncdb lowercases
    expect(row.created_at).toBeTruthy();
    expect(row.last_seen_at).toBeTruthy();
  });

  test('batchResolve populates host for every row too', () => {
    const r = new UrlResolver(db);
    r.batchResolve(['https://one.example/a', 'https://two.example/b']);
    const hostless = db.prepare('SELECT COUNT(*) c FROM urls WHERE host IS NULL').get().c;
    expect(hostless).toBe(0);
  });

  test('a url that cannot be parsed still resolves, with a null host', () => {
    // deriveHost returns null rather than throwing — a malformed url must
    // not take down a 54,485-row migration mid-batch.
    const r = new UrlResolver(db);
    const id = r.ensureUrlId('not-a-valid-url');
    expect(typeof id).toBe('number');
    expect(db.prepare('SELECT host FROM urls WHERE id = ?').get(id).host).toBeNull();
  });

  test('an existing host-less row is backfilled rather than duplicated', () => {
    // The 91,013 rows already in production are the reason this matters.
    db.prepare("INSERT INTO urls (url, created_at) VALUES ('https://legacy.example/x', datetime('now'))").run();
    const before = db.prepare('SELECT COUNT(*) c FROM urls').get().c;

    const r = new UrlResolver(db);
    const id = r.ensureUrlId('https://legacy.example/x');

    expect(db.prepare('SELECT COUNT(*) c FROM urls').get().c).toBe(before); // no duplicate
    expect(db.prepare('SELECT host FROM urls WHERE id = ?').get(id).host).toBe('legacy.example');
  });
});
