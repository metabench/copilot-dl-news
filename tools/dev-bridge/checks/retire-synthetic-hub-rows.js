'use strict';
// A-quirks: retire the synthetic bare-'hub' mapping batch + the malformed
// compound-URL mapping THROUGH the review API (audited, agent+reason).
// The 33 page_kind='hub' rows (ids ~6927-6959, one batch) are fabricated
// `www.<host>/world/ireland|united-kingdom` URLs across a host list that
// includes test infrastructure (httpbin.org, jsonplaceholder.typicode.com,
// test.com, test.example.com, place-hubs-crawl.local) and non-news hosts
// (play.google.com, news.ycombinator.com, manage.theguardian.com,
// cdn.arstechnica.net) — all "verified": a synthetic probe run, not real
// verification. Genuine ireland/uk coverage lives in country-hub rows.
// Default DRY-RUN; --apply POSTs. Requires the app on 127.0.0.1:3170.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const APPLY = process.argv.includes('--apply');
const BASE = 'http://127.0.0.1:3170';
const AGENT = 'claude-loop-quirks';

async function main() {
  const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });
  const bareHub = db.prepare(`
    SELECT m.id, m.place_id, m.host, m.url,
      (SELECT COUNT(*) FROM place_page_mappings c
       WHERE c.place_id = m.place_id AND c.host = m.host AND c.page_kind LIKE '%-hub') AS properRows
    FROM place_page_mappings m WHERE m.page_kind = 'hub' ORDER BY m.id`).all();
  const malformed = db.prepare(`
    SELECT id, place_id, host, url FROM place_page_mappings WHERE url LIKE '%+%'`).all();
  db.close();

  console.log(`bare-hub rows: ${bareHub.length}; malformed: ${malformed.length}`);
  for (const r of bareHub.slice(0, 5)) console.log(`  e.g. [${r.id}] ${r.host} ${r.url} (proper -hub rows for same place+host: ${r.properRows})`);

  let posted = 0; let failed = 0;
  const rejectOne = async (r, reason) => {
    if (!APPLY) return;
    try {
      const res = await fetch(`${BASE}/api/v1/place-hubs/overrides`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject-place-hub', url: r.url, host: r.host, placeId: r.place_id, agent: AGENT, reason }),
        signal: AbortSignal.timeout(20000)
      });
      if (res.ok) posted++; else { failed++; console.log(`  FAIL [${r.id}] ${r.url}: ${res.status}`); }
    } catch (e) { failed++; console.log(`  FAIL [${r.id}] ${r.url}: ${e.message}`); }
  };

  for (const r of bareHub) {
    await rejectOne(r, 'Synthetic probe batch: fabricated www.<host>/world/<place> URL with legacy bare page_kind=hub, "verified" across a host list including test infrastructure (httpbin, jsonplaceholder, test.com, place-hubs-crawl.local) — one contiguous id batch. Genuine coverage lives in -hub kind rows. Per ncdb docs/PLACE_HUB_SCHEMA.md quirk #3.');
  }
  for (const r of malformed) {
    await rejectOne(r, 'Malformed compound URL (plus-joined section paths world/asia-pacific+world/south-and-central-asia) — not a fetchable hub page. Per ncdb docs/PLACE_HUB_SCHEMA.md quirk #5.');
  }

  if (APPLY) console.log(`rejections posted: ${posted}, failed: ${failed}`);
  const db2 = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });
  console.log('bare-hub remaining:', db2.prepare("SELECT COUNT(*) n FROM place_page_mappings WHERE page_kind='hub'").get().n,
    '| malformed remaining:', db2.prepare("SELECT COUNT(*) n FROM place_page_mappings WHERE url LIKE '%+%'").get().n,
    '| audit rows:', db2.prepare('SELECT COUNT(*) n FROM place_hub_audit').get().n);
  db2.close();
  console.log(APPLY ? 'APPLY DONE' : 'DRY-RUN DONE');
}
main().catch((e) => { console.error(e); process.exit(1); });
