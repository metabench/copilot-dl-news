'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const NewsDatabase = require('../db');
const { recordPlaceHubSeed, resolveHandle } = require('news-crawler-itself/place-hubs');

describe('placeHubs data helper', () => {
  let tmpDir;
  let dbPath;
  let db;
  let handle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'place-hubs-'));
    dbPath = path.join(tmpDir, 'news.db');
    db = new NewsDatabase(dbPath);
    handle = resolveHandle(db);
    handle.exec(`
      DELETE FROM place_hubs;
    `);
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (_) { /* noop */ }
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('inserts evidence for new hub seeds', () => {
    const inserted = recordPlaceHubSeed(db, {
      host: 'example.com',
      url: 'https://example.com/world/',
      evidence: {
        by: 'unit-test',
        reason: 'section-prediction'
      }
    });
    expect(inserted).toBe(true);

    // place_hubs keys pages by url_id — the old url-column SELECT here failed
    // on every run (this suite spent months in the known-51 because of it).
    const row = handle.prepare('SELECT ph.host, u.url, ph.evidence FROM place_hubs ph JOIN urls u ON u.id = ph.url_id WHERE ph.host = ? AND u.url = ?').get('example.com', 'https://example.com/world/');
    expect(row).toBeTruthy();
    expect(row.host).toBe('example.com');
    expect(row.url).toBe('https://example.com/world/');
    expect(row.evidence).toEqual(expect.any(String));
    expect(JSON.parse(row.evidence)).toMatchObject({
      by: 'unit-test',
      reason: 'section-prediction'
    });
  });

  test('ignores duplicate seeds gracefully', () => {
    recordPlaceHubSeed(db, {
      host: 'example.com',
      url: 'https://example.com/world/',
      evidence: { by: 'unit-test' }
    });

    const second = recordPlaceHubSeed(db, {
      host: 'example.com',
      url: 'https://example.com/world/',
      evidence: { by: 'unit-test' }
    });
    expect(second).toBe(false);

    const count = handle.prepare('SELECT COUNT(*) AS c FROM place_hubs ph JOIN urls u ON u.id = ph.url_id WHERE ph.host = ? AND u.url = ?').get('example.com', 'https://example.com/world/').c;
    expect(count).toBe(1);
  });
});
