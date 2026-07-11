const { loadSitemaps } = require('../sitemap');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`;

function makeRes({ status = 200, etag = null, lastModified = null, body = null } = {}) {
  const headers = new Map();
  headers.set('content-type', 'application/xml');
  if (etag) headers.set('etag', etag);
  if (lastModified) headers.set('last-modified', lastModified);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers.get(String(k).toLowerCase()) || null },
    text: async () => body
  };
}

// In-memory stand-in for the DB-backed cache (news-crawler-db sitemap_cache
// accessors — same {get,set} contract the coordinator wires in).
function makeCache() {
  const store = new Map();
  return {
    store,
    get: async (url) => store.get(url) || null,
    set: async (url, rec) => { store.set(url, { ...rec, url }); }
  };
}

describe('loadSitemaps conditional fetching via injected DB cache (hub-loop P0)', () => {
  test('200 with validators primes the cache; revalidation sends conditional headers and 304 reuses the body', async () => {
    const cache = makeCache();
    const seenHeaders = [];
    let call = 0;
    const fetchImpl = async (url, options) => {
      call++;
      seenHeaders.push(options.headers || {});
      if (call === 1) return makeRes({ status: 200, etag: '"v1"', lastModified: 'Tue, 07 Jul 2026 10:00:00 GMT', body: XML });
      return makeRes({ status: 304, etag: '"v1"' });
    };
    const opts = (pushed, fetches) => ({
      cache, cacheTtlSeconds: 0, fetchImpl,
      push: (u) => pushed.push(u),
      onFetch: (info) => fetches.push(info)
    });

    const pushed1 = []; const fetches1 = [];
    const n1 = await loadSitemaps('https://example.com', 'example.com', ['https://example.com/sitemap.xml'], opts(pushed1, fetches1));
    expect(n1).toBe(2);
    expect(seenHeaders[0]['If-None-Match']).toBeUndefined();
    expect(fetches1[0].status).toBe(200);
    expect(cache.store.size).toBe(1); // primed

    const pushed2 = []; const fetches2 = [];
    const n2 = await loadSitemaps('https://example.com', 'example.com', ['https://example.com/sitemap.xml'], opts(pushed2, fetches2));
    expect(seenHeaders[1]['If-None-Match']).toBe('"v1"');
    expect(seenHeaders[1]['If-Modified-Since']).toBe('Tue, 07 Jul 2026 10:00:00 GMT');
    expect(fetches2[0].status).toBe(304);
    expect(fetches2[0].bytes).toBe(0);
    expect(n2).toBe(2);
    expect(pushed2).toEqual(pushed1); // discovery intact from cached body
  });

  test('changed sitemap (200 on revalidation) replaces the cached body', async () => {
    const cache = makeCache();
    let call = 0;
    const XML2 = XML.replace('/b</loc>', '/c</loc>');
    const fetchImpl = async () => {
      call++;
      if (call === 1) return makeRes({ status: 200, etag: '"v1"', body: XML });
      return makeRes({ status: 200, etag: '"v2"', body: XML2 });
    };
    const base = { cache, cacheTtlSeconds: 0, fetchImpl };
    const p1 = [];
    await loadSitemaps('https://example.com', 'example.com', ['https://example.com/sitemap.xml'], { ...base, push: (u) => p1.push(u) });
    const p2 = [];
    await loadSitemaps('https://example.com', 'example.com', ['https://example.com/sitemap.xml'], { ...base, push: (u) => p2.push(u) });
    expect(p2).toContain('https://example.com/c');
    expect(cache.store.get('https://example.com/sitemap.xml').etag).toBe('"v2"');
  });

  test('TTL > 0 skips the network entirely within the window', async () => {
    const cache = makeCache();
    let call = 0;
    const fetchImpl = async () => { call++; return makeRes({ status: 200, etag: '"v1"', body: XML }); };
    const base = { cache, cacheTtlSeconds: 3600, fetchImpl };
    const p1 = [];
    await loadSitemaps('https://example.com', 'example.com', ['https://example.com/sitemap.xml'], { ...base, push: (u) => p1.push(u) });
    const p2 = []; const f2 = [];
    await loadSitemaps('https://example.com', 'example.com', ['https://example.com/sitemap.xml'], { ...base, push: (u) => p2.push(u), onFetch: (i) => f2.push(i) });
    expect(call).toBe(1);      // no second network round-trip
    expect(f2.length).toBe(0); // no synthetic ledger row for a non-request
    expect(p2).toEqual(p1);
  });

  test('no cache injected → plain unconditional fetching still works', async () => {
    let call = 0;
    const headersSeen = [];
    const fetchImpl = async (url, options) => { call++; headersSeen.push(options.headers); return makeRes({ status: 200, body: XML }); };
    const p = [];
    const n = await loadSitemaps('https://example.com', 'example.com', ['https://example.com/sitemap.xml'], { fetchImpl, push: (u) => p.push(u) });
    expect(n).toBe(2);
    expect(headersSeen[0]['If-None-Match']).toBeUndefined();
  });

  test('a throwing cache never breaks sitemap loading (best-effort)', async () => {
    const boomCache = { get: async () => { throw new Error('db down'); }, set: async () => { throw new Error('db down'); } };
    const fetchImpl = async () => makeRes({ status: 200, body: XML });
    const p = [];
    const n = await loadSitemaps('https://example.com', 'example.com', ['https://example.com/sitemap.xml'], { cache: boomCache, fetchImpl, push: (u) => p.push(u) });
    expect(n).toBe(2);
  });
});
