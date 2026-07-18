'use strict';
// Durable runner for the extracted ingestAdminAreas() callable (A7).
// Drives the SAME code path the coming IngestAdminAreasTask will use, but
// from the CLI — so the callable is proven against REAL WDQS/wbgetentities,
// not just the jest mocks. Reads VERIFIED admin_class_map rows only.
// REQUIRES the Electron app stopped (writes data/news.db). Default DRY-RUN
// lists what would run; --apply ingests.
//
//   node tools/dev-bridge/checks/ingest-admin-areas.js --country FR
//   node tools/dev-bridge/checks/ingest-admin-areas.js --country FR,GB --limit 200 --apply
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const APPLY = process.argv.includes('--apply');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(name + '='));
  return eq ? eq.split('=')[1] : dflt;
};
const countries = String(arg('--country', '')).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
const limit = parseInt(arg('--limit', '200'), 10);
if (!countries.length) { console.error('usage: --country <ISO2[,ISO2...]> [--limit 200] [--apply]'); process.exit(1); }

const { listAdminClasses } = require('news-crawler-db');
const { ingestAdminAreas } = require(path.join(ROOT, 'src', 'tools', 'gazetteer', 'ingestAdminAreas'));
const Database = require(path.join(ROOT, '..', 'news-crawler-db', 'node_modules', 'better-sqlite3'));

(async () => {
  const db = new Database(path.join(ROOT, 'data', 'news.db'), { readonly: !APPLY, fileMustExist: true });
  try {
    for (const c of countries) {
      const verified = listAdminClasses(db, { countryCode: c, adminLevel: 2 });
      console.log(`${c}: ${verified.length} verified level-2 class(es): ${verified.map((v) => `${v.wikidataClassQid}->${v.placeKind}(walk=${v.subclassWalk})`).join(', ') || '(none)'}`);
    }
    if (!APPLY) { console.log('\ndry-run: pass --apply (app stopped) to ingest'); return; }

    const logger = { info: (m) => console.log(m), warn: (m) => console.warn(m) };
    const res = await ingestAdminAreas(db, { countries, limit, logger });
    console.log('\nRESULT:', JSON.stringify({ created: res.created, existing: res.existing, failed: res.failed }, null, 0));
    for (const [k, v] of Object.entries(res.byClass)) {
      console.log(`  ${k}: returned=${v.returned} created=${v.created} existing=${v.existing} failed=${v.failed}`);
    }
    if (res.errors.length) console.log('  errors:', res.errors.slice(0, 5).join(' | '));
  } finally { db.close(); }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
