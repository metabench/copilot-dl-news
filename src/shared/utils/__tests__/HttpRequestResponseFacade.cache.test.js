'use strict';

/**
 * HttpRequestResponseFacade — cache round-trip (c220).
 *
 * Written before the delegation of the facade's six remaining raw-SQL sites
 * to news-crawler-db's legacy-httpResponseCache. Two of these tests FAILED
 * against the pre-delegation code, which is what makes this a proof:
 *
 *   - "an expired entry is not served" failed because expiry was a raw STRING
 *     comparison between a JS ISO-8601 timestamp
 *     ("2026-08-06T02:03:57.807Z") and datetime('now')
 *     ("2026-08-06 02:04:57"). "T" (0x54) sorts above " " (0x20), so an entry
 *     that expired an hour ago compared as fresh; expiry only bit once the
 *     calendar DATE rolled over.
 *   - "an expired entry is evicted on a miss" failed because
 *     _cleanupExpiredEntry was unreachable — it ran only from the
 *     `_isExpired(latest)` branch, and the finder already filtered expired
 *     rows out in SQL, so `latest` was never expired. Measured on the live
 *     db: all 33 cache rows expired, all 33 still present.
 *
 * The rest is the contract that must survive the move unchanged.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDb } = require('../../../data/db/sqlite/ensureDb');
const { HttpRequestResponseFacade, HttpRequestResponseFacadeInstance } = require('../HttpRequestResponseFacade');

function tempDb(label) {
  return path.join(os.tmpdir(), `c220-${label}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.db`);
}
function cleanup(p) {
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} }
}

const RESPONSE = {
  status: 200,
  headers: { 'content-type': 'application/json', etag: 'W/"abc"' },
  body: { results: { bindings: [{ town: { value: 'Ipswich' } }] } }
};

let dbPath;
let db;
beforeEach(() => { dbPath = tempDb('httpcache'); db = ensureDb(dbPath); });
afterEach(() => { try { db.close(); } catch (_) {} cleanup(dbPath); });

describe('cache round-trip (contract — must survive the delegation)', () => {
  test('a cached response comes back with its body intact', async () => {
    const url = 'https://query.wikidata.org/sparql?q=1';
    await HttpRequestResponseFacade.cacheHttpResponse(db, {
      url, response: RESPONSE, metadata: { category: 'api-sparql' }
    });

    const hit = await HttpRequestResponseFacade.getCachedHttpResponse(db, url, { category: 'api-sparql' });

    expect(hit).not.toBeNull();
    expect(hit.cached).toBe(true);
    expect(hit.status).toBe(200);
    expect(hit.body).toEqual(RESPONSE.body);
  });

  test('a url that was never cached is a miss, not an error', async () => {
    const hit = await HttpRequestResponseFacade.getCachedHttpResponse(
      db, 'https://example.com/never-seen', { category: 'api-sparql' }
    );
    expect(hit).toBeNull();
  });

  test('the category is part of the identity — same url, other category, miss', async () => {
    const url = 'https://example.com/shared';
    await HttpRequestResponseFacade.cacheHttpResponse(db, {
      url, response: RESPONSE, metadata: { category: 'api-sparql' }
    });
    expect(await HttpRequestResponseFacade.getCachedHttpResponse(db, url, { category: 'api-wikidata' })).toBeNull();
  });

  test('caching writes the url row, the response row and the content row', async () => {
    const url = 'https://example.com/three-rows';
    const { httpResponseId, contentId, cacheKey } = await HttpRequestResponseFacade.cacheHttpResponse(db, {
      url, response: RESPONSE, metadata: { category: 'api-sparql' }
    });

    expect(typeof cacheKey).toBe('string');
    expect(db.prepare('SELECT COUNT(*) c FROM http_responses WHERE id = ?').get(httpResponseId).c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM content_storage WHERE id = ?').get(contentId).c).toBe(1);
    // c219: the url row carries its host.
    const urlRow = db.prepare('SELECT host FROM urls WHERE url = ?').get(url);
    expect(urlRow.host).toBe('example.com');
  });

  test('the instance wrapper accepts both `new F(db)` and `new F({ db })`', async () => {
    const url = 'https://example.com/instance';
    const a = new HttpRequestResponseFacadeInstance(db);
    const b = new HttpRequestResponseFacadeInstance({ db });
    await a.cacheHttpResponse({ url, response: RESPONSE, metadata: { category: 'api-sparql' } });
    const hit = await b.getCachedHttpResponse(url, { category: 'api-sparql' });
    expect(hit.body).toEqual(RESPONSE.body);
  });
});

describe('expiry — the defects this cycle closed', () => {
  // FAILED before the delegation: raw-string comparison read it as fresh.
  test('an entry that expired a minute ago is NOT served', async () => {
    const url = 'https://example.com/expired';
    await HttpRequestResponseFacade.cacheHttpResponse(db, {
      url, response: RESPONSE, metadata: { category: 'api-sparql', ttlMs: -60_000 }
    });

    const hit = await HttpRequestResponseFacade.getCachedHttpResponse(db, url, { category: 'api-sparql' });
    expect(hit).toBeNull();
  });

  // FAILED before the delegation: the cleanup path was unreachable.
  test('an expired entry is EVICTED on the miss, not left to accumulate', async () => {
    const url = 'https://example.com/evicted';
    const { httpResponseId } = await HttpRequestResponseFacade.cacheHttpResponse(db, {
      url, response: RESPONSE, metadata: { category: 'api-sparql', ttlMs: -60_000 }
    });
    expect(db.prepare('SELECT COUNT(*) c FROM http_responses WHERE id = ?').get(httpResponseId).c).toBe(1);

    await HttpRequestResponseFacade.getCachedHttpResponse(db, url, { category: 'api-sparql' });

    expect(db.prepare('SELECT COUNT(*) c FROM http_responses WHERE id = ?').get(httpResponseId).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM content_storage WHERE http_response_id = ?').get(httpResponseId).c).toBe(0);
  });

  test('eviction on a miss does not disturb a FRESH entry under another key', async () => {
    const stale = 'https://example.com/stale';
    const fresh = 'https://example.com/fresh';
    await HttpRequestResponseFacade.cacheHttpResponse(db, {
      url: stale, response: RESPONSE, metadata: { category: 'api-sparql', ttlMs: -60_000 }
    });
    await HttpRequestResponseFacade.cacheHttpResponse(db, {
      url: fresh, response: RESPONSE, metadata: { category: 'api-sparql', ttlMs: 60_000 }
    });

    await HttpRequestResponseFacade.getCachedHttpResponse(db, stale, { category: 'api-sparql' });

    const stillThere = await HttpRequestResponseFacade.getCachedHttpResponse(db, fresh, { category: 'api-sparql' });
    expect(stillThere).not.toBeNull();
    expect(stillThere.body).toEqual(RESPONSE.body);
  });
});
