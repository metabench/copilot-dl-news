'use strict';
// Gazetteer ADM2 coverage status — read-only, no WDQS, safe alongside the
// running app. Cross-references the VERIFIED admin_class_map seeds in
// config/admin-class-map.json against what is actually ingested in
// data/news.db, so the unattended gazetteer operation is legible: which
// countries' ADM2 are done, which verified seeds are still un-ingested
// (pending), and name/hierarchy quality per country.
//
//   node tools/dev-bridge/checks/gazetteer-status.js
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { readBootstrapJson } = require(path.join(ROOT, 'src', 'shared', 'utils', 'bootstrapGuard'));
const Database = require(path.join(ROOT, '..', 'news-crawler-db', 'node_modules', 'better-sqlite3'));

function main() {
  const seedDoc = readBootstrapJson(path.join(ROOT, 'config', 'admin-class-map.json'));
  const seeds = (seedDoc && Array.isArray(seedDoc.classes)) ? seedDoc.classes : [];
  const verifiedSeeds = seeds.filter((s) => s.verified);

  const db = new Database(path.join(ROOT, 'data', 'news.db'), { readonly: true, fileMustExist: true });
  try {
    // Per-country ADM2 (county-kind) coverage.
    const rows = db.prepare(`
      SELECT p.country_code AS cc, COUNT(*) AS total,
             SUM(CASE WHEN p.canonical_name_id IS NOT NULL THEN 1 ELSE 0 END) AS named,
             SUM(CASE WHEN p.adm2_code IS NOT NULL THEN 1 ELSE 0 END) AS coded
        FROM places p
       WHERE p.kind = 'county'
       GROUP BY p.country_code
       ORDER BY total DESC`).all();
    const parentedStmt = db.prepare(`
      SELECT COUNT(DISTINCT child_id) AS c FROM place_hierarchy
       WHERE relation = 'admin_parent'
         AND child_id IN (SELECT id FROM places WHERE kind='county' AND country_code=?)`);

    const byCountry = new Map(rows.map((r) => [r.cc, r]));
    let grandTotal = 0;

    console.log('=== Gazetteer ADM2 (county-kind) coverage ===');
    console.log('country | ingested | named | adm2_code | parented');
    for (const r of rows) {
      grandTotal += r.total;
      const parented = parentedStmt.get(r.cc).c;
      console.log(`  ${r.cc.padEnd(4)} | ${String(r.total).padStart(5)} | ${String(r.named).padStart(5)} | ${String(r.coded).padStart(5)} | ${String(parented).padStart(5)}`);
    }
    console.log(`  TOTAL county-level ADM2 places: ${grandTotal}`);

    // Verified seeds vs ingested reality.
    console.log('\n=== Verified admin_class_map seeds (config) ===');
    const pendingCountries = new Set();
    for (const s of verifiedSeeds) {
      const have = byCountry.get(s.countryCode);
      const ingested = have ? have.total : 0;
      const status = ingested > 0 ? 'ingested' : 'PENDING (verified, 0 places)';
      if (ingested === 0) pendingCountries.add(s.countryCode);
      console.log(`  ${s.countryCode} ${s.wikidataClassQid} (${s.label || s.placeKind}) walk=${s.subclassWalk ?? '?'} -> ${status}`);
    }

    const pending = [...pendingCountries];
    console.log(`\nverified seeds: ${verifiedSeeds.length} | countries with ADM2: ${rows.length}` +
      (pending.length ? ` | PENDING ingest: ${pending.join(', ')}` : ' | none pending'));
    // exit non-zero if a verified seed has no ingested places (actionable)
    if (pending.length) process.exitCode = 2;
  } finally {
    db.close();
  }
}

main();
