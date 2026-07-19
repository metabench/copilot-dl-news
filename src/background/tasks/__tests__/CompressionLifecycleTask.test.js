'use strict';

// CompressionLifecycleTask — age-based in-place recompression. These tests pin
// the fixes made when wiring it: (1) correct tier age windows (hot/warm/cold),
// (2) IN-PLACE compression (regression guard against the compressAndStore
// INSERT-orphan bug that left content_blob raw + unreadable), (3) dryRun
// default = no-op, (4) maxRows cap. Runs against a fresh temp DB — never prod.

const path = require('path');
const os = require('os');
const fs = require('fs');
const { CompressionLifecycleTask } = require('../CompressionLifecycleTask');
const { ensureDb } = require('../../../data/db/sqlite');
const { compress, retrieveAndDecompress } = require('../../../shared/utils/CompressionFacade');

const HTML = (n) => Buffer.from('<html><body>' + ('article body '.repeat(200)) + n + '</body></html>');

function makeDb() {
  const tmpDir = path.join(os.tmpdir(), 'clt-tests');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, `clt-${process.pid}-${Date.now()}-${Math.random()}.db`);
  const db = ensureDb(dbPath);
  db.pragma('foreign_keys = OFF'); // seed http_responses without urls rows
  return { db, dbPath };
}

let nextHr = 1;
function seedRow(db, { ageDays, html }) {
  const hrId = nextHr++;
  db.prepare(`INSERT INTO http_responses (id, url_id, request_started_at, fetched_at, http_status)
              VALUES (?, 1, datetime('now', ?), datetime('now', ?), 200)`)
    .run(hrId, `-${ageDays} days`, `-${ageDays} days`);
  const sha = compress(html, { algorithm: 'none', level: 0 }).sha256; // sha of uncompressed
  const info = db.prepare(`INSERT INTO content_storage
      (storage_type, content_blob, content_sha256, uncompressed_size, http_response_id)
      VALUES ('db_inline', ?, ?, ?, ?)`).run(html, sha, html.length, hrId);
  return info.lastInsertRowid;
}

function fakeSignal() { return { aborted: false }; }
function collect() { const calls = []; return { fn: (p) => calls.push(p), calls }; }

describe('CompressionLifecycleTask', () => {
  let db, dbPath;
  beforeEach(() => { ({ db, dbPath } = makeDb()); nextHr = 1; });
  afterEach(() => { try { db.close(); } catch (_) {} try { fs.unlinkSync(dbPath); } catch (_) {} });

  const storageOf = (id) => db.prepare('SELECT storage_type, compression_type_id, content_blob FROM content_storage WHERE id = ?').get(id);

  it('bands rows into the correct age tiers (hot untouched, warm brotli_6, cold brotli_11)', async () => {
    const hot = seedRow(db, { ageDays: 3, html: HTML('hot') });
    const warm = seedRow(db, { ageDays: 15, html: HTML('warm') });
    const cold = seedRow(db, { ageDays: 60, html: HTML('cold') });

    const task = new CompressionLifecycleTask({ db, taskId: 1, config: { dryRun: false, maxRows: 0 }, signal: fakeSignal(), onProgress: () => {}, onError: () => {} });
    await task.execute();

    expect(storageOf(hot).storage_type).toBe('db_inline'); // hot never compressed
    expect(storageOf(warm).storage_type).toBe('db_compressed');
    expect(storageOf(warm).compression_type_id).toBe(11); // brotli_6
    expect(storageOf(cold).storage_type).toBe('db_compressed');
    expect(storageOf(cold).compression_type_id).toBe(16); // brotli_11
  });

  it('compresses IN PLACE and round-trips (regression: no INSERT-orphan, blob is real compressed bytes)', async () => {
    const html = HTML('roundtrip');
    const warm = seedRow(db, { ageDays: 15, html });
    const before = db.prepare("SELECT COUNT(*) c FROM content_storage").get().c;

    const task = new CompressionLifecycleTask({ db, taskId: 1, config: { dryRun: false, maxRows: 0 }, signal: fakeSignal(), onProgress: () => {}, onError: () => {} });
    await task.execute();

    // no new orphan content_storage row was inserted
    expect(db.prepare("SELECT COUNT(*) c FROM content_storage").get().c).toBe(before);
    expect(db.prepare("SELECT COUNT(*) c FROM content_storage WHERE http_response_id IS NULL").get().c).toBe(0);
    // the stored blob is now compressed (smaller) AND decompresses back to the original
    expect(storageOf(warm).content_blob.length).toBeLessThan(html.length);
    const roundTripped = retrieveAndDecompress(db, warm);
    const buf = Buffer.isBuffer(roundTripped) ? roundTripped : Buffer.from(roundTripped);
    expect(buf.equals(html)).toBe(true);
  });

  it('dryRun is the DEFAULT and writes nothing', async () => {
    const warm = seedRow(db, { ageDays: 15, html: HTML('dry') });
    const blobBefore = storageOf(warm).content_blob;
    const prog = collect();

    const task = new CompressionLifecycleTask({ db, taskId: 1, config: {}, signal: fakeSignal(), onProgress: prog.fn, onError: () => {} });
    await task.execute();

    expect(storageOf(warm).storage_type).toBe('db_inline'); // untouched
    expect(storageOf(warm).content_blob.equals(blobBefore)).toBe(true);
    const final = prog.calls[prog.calls.length - 1].metadata;
    expect(final.dryRun).toBe(true);
    expect(final.totalProcessed).toBe(0);
    expect(final.totalSkipped).toBeGreaterThan(0);
  });

  it('caps total rows touched at maxRows', async () => {
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push(seedRow(db, { ageDays: 15, html: HTML('w' + i) }));

    const task = new CompressionLifecycleTask({ db, taskId: 1, config: { dryRun: false, maxRows: 2, batchSize: 5 }, signal: fakeSignal(), onProgress: () => {}, onError: () => {} });
    await task.execute();

    const compressed = ids.filter((id) => storageOf(id).storage_type === 'db_compressed').length;
    expect(compressed).toBe(2);
    expect(ids.filter((id) => storageOf(id).storage_type === 'db_inline').length).toBe(4);
  });

  it('completes cleanly when nothing is eligible (only hot rows)', async () => {
    seedRow(db, { ageDays: 2, html: HTML('young') });
    const prog = collect();
    const task = new CompressionLifecycleTask({ db, taskId: 1, config: { dryRun: false }, signal: fakeSignal(), onProgress: prog.fn, onError: () => {} });
    await expect(task.execute()).resolves.toBeUndefined();
    expect(prog.calls[prog.calls.length - 1].total).toBe(0);
  });

  it('stops when the abort signal is set', async () => {
    for (let i = 0; i < 6; i++) seedRow(db, { ageDays: 15, html: HTML('a' + i) });
    const signal = { aborted: false };
    const task = new CompressionLifecycleTask({ db, taskId: 1, config: { dryRun: false, maxRows: 0, batchSize: 1, delayMs: 0 }, signal, onProgress: () => { signal.aborted = true; }, onError: () => {} });
    await task.execute();
    const compressed = db.prepare("SELECT COUNT(*) c FROM content_storage WHERE storage_type='db_compressed'").get().c;
    expect(compressed).toBeLessThan(6); // aborted before finishing all
  });
});
