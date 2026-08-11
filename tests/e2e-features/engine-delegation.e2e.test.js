'use strict';

/**
 * ENGINE DELEGATION — proven by an actual crawl, not by inspection.
 *
 * The extraction moved ~200 files out of src/core/crawler into
 * news-crawler-itself. Two kinds of proof were used per slice: a structural
 * fingerprint (exports, arity, prototype methods) and the re-pointed unit
 * suites. Neither can see the failure that matters most — that the RUNNING
 * crawler never reaches the moved code.
 *
 * The cautionary case is real and recent. On 2026-08-04 the fetch-cluster slice
 * left ProcessingServices.js binding the package's named bag as if it were the
 * class. The require RESOLVED. Every suite stayed green. entry-loads passed.
 * `container.get('fetchPipeline')` failed outright for SEVEN DAYS, and nothing
 * noticed because the crawler had not run since 2026-07-18.
 *
 * So this test runs a real crawl against a local fixture site and asserts that
 * the delegated package was actually EXECUTED — recorded by hooking Module._load
 * in the crawl process, not inferred from source.
 *
 * Local fixture only: 127.0.0.1, no third-party host, so it exercises the engine
 * without touching the owner-gated politeness question. Budget is well under the
 * 3-minute ceiling — the crawl itself takes ~8s.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const {
  spawnGuardianFixture, getFreePort, waitForHttpOk, stopChild
} = require('../helpers/guardianFixtureCrawl');

const REPO = path.resolve(__dirname, '..', '..');
const RECORDER = path.join(REPO, 'tests', 'helpers', 'delegationRecorder.js');
const MINI_CRAWL = path.join(REPO, 'tools', 'dev', 'mini-crawl.js');

// Budgets. The crawl measures ~8s; these are ceilings, not expectations, and the
// whole suite stays far below the 3-minute limit.
const CRAWL_TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 150_000;

let Database;
try {
  Database = require(path.join(REPO, 'node_modules/news-crawler-db/node_modules/better-sqlite3'));
} catch (_) {
  // Reviewed swallow: better-sqlite3 resolves from news-crawler-db's own
  // node_modules here. If that changes, the assertions below fail loudly on a
  // null Database rather than silently skipping.
  Database = null;
}

describe('engine delegation — a real crawl reaches the extracted package', () => {
  let fixture = null;
  let tmpDir = null;
  let dbPath = null;
  let recordPath = null;
  let crawl = null;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-delegation-'));
    dbPath = path.join(tmpDir, 'e2e.db');
    recordPath = path.join(tmpDir, 'delegated.json');

    const port = await getFreePort();
    fixture = spawnGuardianFixture({ port, pages: 30 });
    const base = `http://127.0.0.1:${port}`;
    const up = await waitForHttpOk(`${base}/`);
    if (!up) throw new Error('guardian fixture server did not come up');

    crawl = await new Promise((resolve) => {
      const started = Date.now();
      const child = spawn(
        process.execPath,
        ['-r', RECORDER, MINI_CRAWL, `${base}/page/1`, '--max-pages', '8', '--db', dbPath],
        { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DELEGATION_RECORD: recordPath } }
      );
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ code: 'TIMEOUT', ms: Date.now() - started, out });
      }, CRAWL_TIMEOUT_MS);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, ms: Date.now() - started, out });
      });
    });
  }, TEST_TIMEOUT_MS);

  afterAll(() => {
    if (fixture) stopChild(fixture.child);
    // Reviewed swallow: leftover temp files are noise, not a test failure.
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  test('the crawl completes inside its budget', () => {
    expect(crawl.code).toBe(0);
    expect(crawl.ms).toBeLessThan(CRAWL_TIMEOUT_MS);
  });

  test('it really performed HTTP — responses are recorded in the database', () => {
    expect(Database).not.toBeNull();
    const db = new Database(dbPath, { readonly: true });
    try {
      const responses = db.prepare('SELECT COUNT(*) c FROM http_responses').get().c;
      const urls = db.prepare('SELECT url FROM urls').all().map((r) => r.url);
      // A crawl that wrote nothing would pass a "did it exit 0" check and prove
      // nothing at all, which is the whole failure mode this test exists for.
      expect(responses).toBeGreaterThan(0);
      expect(urls.some((u) => u.includes('/page/1'))).toBe(true);
      // robots.txt means the politeness path ran, not just a bare fetch.
      expect(urls.some((u) => u.endsWith('/robots.txt'))).toBe(true);
    } finally {
      db.close();
    }
  });

  test('the extracted package was EXECUTED, not merely resolvable', () => {
    const loaded = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    // Measured 2026-08-11: 152 files across 31 root entry points. The floor is
    // deliberately well below that — this guards against the package falling out
    // of the crawl path entirely, not against normal drift.
    expect(loaded.length).toBeGreaterThan(50);
  });

  test('the specific subsystems a crawl depends on came from the package', () => {
    const loaded = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    const roots = new Set(
      loaded.filter((f) => f.split('/').length === 2).map((f) => path.posix.basename(f, '.js'))
    );
    // Each of these is a delegated subsystem the crawl provably cannot do
    // without. fetch-pipeline is named explicitly because it is the one that was
    // silently broken for seven days.
    for (const entry of ['fetch-pipeline', 'politeness', 'crawl-operations', 'crawl-control', 'operation-schemas']) {
      expect(roots).toContain(entry);
    }
  });

  test('no delegated file was loaded from a stale monorepo copy', () => {
    const loaded = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    // Every recorded path must sit inside the package. A path that also contains
    // src/core/crawler would mean a copy survived the delete and shadowed it.
    for (const f of loaded) {
      expect(f.startsWith('news-crawler-itself/')).toBe(true);
      expect(f).not.toContain('src/core/crawler/');
    }
  });
});
