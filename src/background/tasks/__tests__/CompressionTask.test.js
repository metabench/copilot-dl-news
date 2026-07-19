'use strict';

// CompressionTask (article-compression) — regression guard for the
// compressAndStore corruption bug: compressAndStore INSERTs a NEW content_storage
// row and returns its id, so the old code marked the ORIGINAL row db_compressed
// while its content_blob stayed raw HTML -> unreadable on read. The fix
// compresses IN PLACE. These tests prove a processed row round-trips and no
// orphan row is created. Runs against a fresh temp DB — never prod.

const path = require('path');
const os = require('os');
const fs = require('fs');
const { CompressionTask } = require('../CompressionTask');
const { ensureDb } = require('../../../data/db/sqlite');
const { compress, retrieveAndDecompress } = require('../../../shared/utils/CompressionFacade');

const HTML = (n) => Buffer.from('<html><body>' + ('news article body text '.repeat(300)) + n + '</body></html>');

function makeDb() {
  const tmpDir = path.join(os.tmpdir(), 'ct-tests');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, `ct-${process.pid}-${Date.now()}-${Math.random()}.db`);
  const db = ensureDb(dbPath);
  db.pragma('foreign_keys = OFF');
  return { db, dbPath };
}

let nextHr = 1;
function seedInline(db, html) {
  const hrId = nextHr++;
  db.prepare(`INSERT INTO http_responses (id, url_id, request_started_at, fetched_at, http_status)
              VALUES (?, 1, datetime('now'), datetime('now'), 200)`).run(hrId);
  const sha = compress(html, { algorithm: 'none', level: 0 }).sha256;
  const info = db.prepare(`INSERT INTO content_storage
      (storage_type, content_blob, content_sha256, uncompressed_size, http_response_id)
      VALUES ('db_inline', ?, ?, ?, ?)`).run(html, sha, html.length, hrId);
  return info.lastInsertRowid;
}

describe('CompressionTask (in-place compression, corruption regression)', () => {
  let db, dbPath;
  beforeEach(() => { ({ db, dbPath } = makeDb()); nextHr = 1; });
  afterEach(() => { try { db.close(); } catch (_) {} try { fs.unlinkSync(dbPath); } catch (_) {} });

  const storageOf = (id) => db.prepare('SELECT storage_type, compression_type_id, content_blob FROM content_storage WHERE id = ?').get(id);

  it('compresses db_inline rows IN PLACE and they round-trip (no orphan, blob decompresses to original)', async () => {
    const html = HTML('a');
    const id = seedInline(db, html);
    const before = db.prepare('SELECT COUNT(*) c FROM content_storage').get().c;

    const task = new CompressionTask({ db, taskId: 1, config: { compressionType: 'brotli_6', batchSize: 10 }, signal: { aborted: false }, onProgress: () => {}, onError: () => {} });
    await task.execute();

    // in place: no new orphan row, original flipped to db_compressed
    expect(db.prepare('SELECT COUNT(*) c FROM content_storage').get().c).toBe(before);
    expect(db.prepare('SELECT COUNT(*) c FROM content_storage WHERE http_response_id IS NULL').get().c).toBe(0);
    expect(storageOf(id).storage_type).toBe('db_compressed');
    expect(storageOf(id).compression_type_id).toBe(11); // brotli_6
    // the stored blob is really compressed AND decompresses back to the original
    expect(storageOf(id).content_blob.length).toBeLessThan(html.length);
    const rt = retrieveAndDecompress(db, id);
    expect((Buffer.isBuffer(rt) ? rt : Buffer.from(rt)).equals(html)).toBe(true);
  });

  it('leaves nothing unreadable across a multi-row batch', async () => {
    const htmls = [HTML('x'), HTML('y'), HTML('z')];
    const ids = htmls.map((h) => seedInline(db, h));

    const task = new CompressionTask({ db, taskId: 1, config: { compressionType: 'brotli_6', batchSize: 2 }, signal: { aborted: false }, onProgress: () => {}, onError: () => {} });
    await task.execute();

    ids.forEach((id, i) => {
      expect(storageOf(id).storage_type).toBe('db_compressed');
      const rt = retrieveAndDecompress(db, id);
      expect((Buffer.isBuffer(rt) ? rt : Buffer.from(rt)).equals(htmls[i])).toBe(true);
    });
  });
});
