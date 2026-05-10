'use strict';

/**
 * sync-ledger-live.test.js — Integration test that validates the ledger
 * lifecycle: append → confirm → prune, with a forced prune-failure round
 * that asserts pruneRetries is recorded, then a successful round that
 * clears it.
 *
 * Uses a small Express mock server + better-sqlite3 in-memory DB.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const {
  loadLedger,
  saveLedger,
  appendBatch,
  markConfirmed,
  markPruned,
  recordPruneFailure,
  findUnpruned,
  generateBatchId,
  getLastWatermark,
  emptyLedger,
} = require('../../../tools/crawl/lib/sync-ledger');

// ── Tiny mock export+prune server ──────────────────────────

function createMockServer({ failPruneOnce = true } = {}) {
  let pruneCallCount = 0;
  let shouldFailPrune = failPruneOnce;

  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      status TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE http_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      http_status INTEGER
    );
    CREATE TABLE content_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      http_response_id INTEGER NOT NULL,
      content_blob BLOB
    );
    CREATE TABLE discovered_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url_id INTEGER,
      target_url TEXT
    );
  `);

  // Seed 5 URLs
  for (let i = 1; i <= 5; i++) {
    const ts = `2026-05-09T10:00:0${i}Z`;
    db.prepare('INSERT INTO urls (url, status, updated_at) VALUES (?, ?, ?)').run(`https://example.com/${i}`, 'fetched', ts);
    const rid = db.prepare('INSERT INTO http_responses (url_id, http_status) VALUES (?, ?)').run(i, 200).lastInsertRowid;
    db.prepare('INSERT INTO content_storage (http_response_id, content_blob) VALUES (?, ?)').run(rid, Buffer.from(`content-${i}`));
    db.prepare('INSERT INTO discovered_links (source_url_id, target_url) VALUES (?, ?)').run(i, `https://example.com/${i}/next`);
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.url.startsWith('/api/export/batch')) {
      // Return first 3 URLs as a batch
      const urls = db.prepare('SELECT * FROM urls ORDER BY id LIMIT 3').all();
      const urlIds = urls.map(u => u.id);
      const responses = db.prepare(`SELECT * FROM http_responses WHERE url_id IN (${urlIds.join(',')})`).all();
      const watermark = urls[urls.length - 1]?.updated_at || null;
      res.end(JSON.stringify({ urls, httpResponses: responses, content: [], links: [], watermark }));
      return;
    }

    if (req.url === '/api/export/prune' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        pruneCallCount++;
        if (shouldFailPrune) {
          shouldFailPrune = false; // only fail once
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: 'Simulated prune failure' }));
          return;
        }
        const parsed = JSON.parse(body);
        const urlIds = parsed.urlIds || [];
        // Delete matching responses
        const deleted = { httpResponses: 0, content: 0, links: 0, urls: 0 };
        for (const uid of urlIds) {
          const resp = db.prepare('SELECT id FROM http_responses WHERE url_id = ?').all(uid);
          for (const r of resp) {
            deleted.content += db.prepare('DELETE FROM content_storage WHERE http_response_id = ?').run(r.id).changes;
          }
          deleted.httpResponses += db.prepare('DELETE FROM http_responses WHERE url_id = ?').run(uid).changes;
          deleted.links += db.prepare('DELETE FROM discovered_links WHERE source_url_id = ?').run(uid).changes;
        }
        res.end(JSON.stringify({ ok: true, deleted, retained: { urls: urlIds.length } }));
      });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return {
    server,
    db,
    getPruneCallCount: () => pruneCallCount,
    listen: () => new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(server.address().port);
      });
    }),
    close: () => new Promise((resolve) => {
      db.close();
      server.close(resolve);
    }),
  };
}

describe('sync-ledger live integration', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-live-'));
  });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  test('full lifecycle: append → confirm → prune-fail → retry → prune-success', async () => {
    const mock = createMockServer({ failPruneOnce: true });
    const port = await mock.listen();
    const ledgerFile = path.join(dir, 'ledger.json');

    try {
      // 1. Create a ledger entry simulating an exported batch
      let ledger = emptyLedger();
      const batchId = generateBatchId();
      ledger = appendBatch(ledger, {
        batchId,
        exportedAt: new Date().toISOString(),
        watermark: '2026-05-09T10:00:03Z',
        urlIds: [1, 2, 3],
      });
      saveLedger(ledgerFile, ledger);

      // 2. Mark confirmed (simulating post-ingest verification)
      ledger = markConfirmed(ledger, batchId, new Date().toISOString());
      saveLedger(ledgerFile, ledger);

      // 3. Attempt prune — it should fail on first try
      const unpruned = findUnpruned(ledger);
      expect(unpruned.length).toBe(1);
      expect(unpruned[0].batchId).toBe(batchId);

      // First prune attempt — mock will 500
      try {
        const pruneRes = await httpPost(`http://127.0.0.1:${port}/api/export/prune`, {
          before: unpruned[0].watermark,
          urlIds: unpruned[0].urlIds,
        });
        if (!pruneRes.ok) throw new Error('Prune failed');
        ledger = markPruned(ledger, batchId, { at: new Date().toISOString(), deleted: pruneRes.deleted });
      } catch (e) {
        ledger = recordPruneFailure(ledger, batchId);
      }
      saveLedger(ledgerFile, ledger);

      // 4. Assert failure was recorded
      const reloaded = loadLedger(ledgerFile);
      const entry = reloaded.entries.find(e => e.batchId === batchId);
      expect(entry.pruneRetries).toBe(1);
      expect(entry.prunedAt).toBeNull();
      expect(mock.getPruneCallCount()).toBe(1);

      // 5. Second attempt — should succeed now
      const unpruned2 = findUnpruned(reloaded);
      expect(unpruned2.length).toBe(1);

      const pruneRes2 = await httpPost(`http://127.0.0.1:${port}/api/export/prune`, {
        before: unpruned2[0].watermark,
        urlIds: unpruned2[0].urlIds,
      });
      expect(pruneRes2.ok).toBe(true);

      let ledger2 = loadLedger(ledgerFile);
      ledger2 = markPruned(ledger2, batchId, {
        at: new Date().toISOString(),
        deleted: pruneRes2.deleted,
      });
      saveLedger(ledgerFile, ledger2);

      // 6. Final assertions
      const final = loadLedger(ledgerFile);
      const finalEntry = final.entries.find(e => e.batchId === batchId);
      expect(finalEntry.prunedAt).not.toBeNull();
      expect(finalEntry.pruneRetries).toBe(1); // recorded the first failure
      expect(finalEntry.deleted.httpResponses).toBe(3);
      expect(findUnpruned(final).length).toBe(0);
      expect(mock.getPruneCallCount()).toBe(2);
    } finally {
      await mock.close();
    }
  });

  test('legacy watermark migration preserves lastWatermark when ledger file absent', () => {
    const legacyFile = path.join(dir, '.crawl-remote-watermark.json');
    fs.writeFileSync(legacyFile, JSON.stringify({ lastWatermark: 'wm-legacy', totalPulled: 100 }));

    const ledgerFile = path.join(dir, '.crawl-remote-ledger.json');
    const ledger = loadLedger(ledgerFile);
    expect(getLastWatermark(ledger)).toBe('wm-legacy');
    expect(ledger.totalPulled).toBe(100);
    expect(ledger.entries).toEqual([]);
  });
});

// ── HTTP helper ──────────────────────────────────────────────

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 5000,
    }, (res) => {
      let buf = '';
      res.on('data', d => { buf += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch { resolve({ ok: false, raw: buf }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}
