#!/usr/bin/env node
'use strict';
// Instantiate a real CrawlerDb against a SAMPLE db and inspect what
// resolveHandle would find — the live crawl's dbAdapter is this object.
const fs = require('fs');
const path = require('path');
const SRC = ['data/samples/hub-p1-sample.db', 'data/samples/c6-fail-probe.db']
  .map((c) => path.resolve(process.cwd(), c)).find((p) => fs.existsSync(p));
const DB = path.resolve(process.cwd(), 'data/samples/hub-p0-crawlerdb.db');
if (fs.existsSync(DB)) fs.unlinkSync(DB);
fs.copyFileSync(SRC, DB);

const out = {};
(async () => {
  try {
    const mod = require('../../src/core/crawler/dbClient');
    const CrawlerDb = mod.CrawlerDb || mod.default || mod;
    const dbAdapter = new CrawlerDb({ dbPath: DB, domain: 'example.com', logger: { log(){}, warn(){}, error(){} } });
    if (typeof dbAdapter.init === 'function') { try { await dbAdapter.init(); } catch (e) { out.initError = e.message; } }
    else if (typeof dbAdapter.ensureReady === 'function') { try { await dbAdapter.ensureReady(); } catch (e) { out.initError = e.message; } }

    // Describe the chain resolveHandle would walk.
    const describe = (o, d = 0) => {
      if (!o || d > 6) return null;
      const info = { type: typeof o, hasPrepare: typeof o.prepare === 'function',
        hasGetDb: typeof o.getDb === 'function', hasGetHandle: typeof o.getHandle === 'function', hasDbProp: !!o.db };
      if (info.hasPrepare) return info;
      if (info.hasGetDb) { try { info.getDb = describe(o.getDb(), d + 1); } catch (e) { info.getDbErr = e.message; } }
      else if (info.hasDbProp) { info.db = describe(o.db, d + 1); }
      return info;
    };
    out.chain = describe(dbAdapter);

    // Actually attempt the functional accessor round-trip via the live adapter.
    const { sitemapCacheUpsert, sitemapCacheGet } = require('news-crawler-db');
    out.upsert = sitemapCacheUpsert(dbAdapter, { url: 'https://x/n.xml', body: '<u/>', etag: '"p"', fetchedAt: new Date().toISOString() });
    const got = sitemapCacheGet(dbAdapter, 'https://x/n.xml');
    out.roundTrip = got && got.etag === '"p"' ? 'OK' : { got };
  } catch (e) { out.error = e.message; out.stack = (e.stack || '').split('\n').slice(0, 3).join(' | '); }
  console.log(JSON.stringify(out, null, 1));
})();
