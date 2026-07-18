'use strict';
// A7 auto-discovery: rank the P31 classes of a country's administrative
// entities on Wikidata and (with --apply) write them into admin_class_map
// as provenance='auto-discovered', verified=0 candidates. Ingestion
// ignores unverified rows by design — flipping `verified` is the human
// review step (owner directive: judgment calls stay bootstrapped/reviewed).
//
// Level and place_kind CANNOT be inferred reliably from counts alone:
// rows are stamped with the caller's --level hypothesis and a provisional
// place_kind 'region' (schema NOT NULL); review corrects both.
//
// Usage:
//   node tools/dev-bridge/checks/discover-admin-classes.js --country FR
//   node ... --country FR,DE --level 2 --min-instances 3 --apply
// REQUIRES the Electron app stopped when using --apply (DB write).
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const APPLY = process.argv.includes('--apply');
const arg = (name, dflt) => {
  const i = process.argv.findIndex((a) => a === name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(name + '='));
  return eq ? eq.split('=')[1] : dflt;
};
const countries = String(arg('--country', '')).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
const level = parseInt(arg('--level', '2'), 10);
const minInstances = parseInt(arg('--min-instances', '3'), 10);
if (!countries.length) { console.error('usage: --country <ISO2[,ISO2...]> [--level 2] [--min-instances 3] [--apply]'); process.exit(1); }

// Discovery walks the P150 (contains-administrative-entity) chain from
// the country: depth 1 = ADM1, depth 2 = ADM2... — the chain depth IS the
// admin level, so the level stamp is structural, not a guess. This shape
// is bounded at every step (a country has tens of ADM1s, each with tens-
// to-hundreds of children) where the earlier P17-fan-out + P279*-scoping
// form 504'd WDQS on FR/DE. COUNT(DISTINCT ?x) dedupes path derivations
// (rule 14).
function buildQuery(iso2, depth) {
  const hops = [];
  let prev = '?country';
  for (let i = 1; i <= depth; i++) {
    const v = i === depth ? '?x' : `?l${i}`;
    hops.push(`${prev} wdt:P150 ${v} .`);
    prev = v;
  }
  return `SELECT ?class ?classLabel (COUNT(DISTINCT ?x) AS ?n) WHERE {
  ?country wdt:P297 "${iso2}".
  ${hops.join('\n  ')}
  ?x wdt:P31 ?class .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?class ?classLabel ORDER BY DESC(?n) LIMIT 15`;
}

async function discover(iso2) {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(buildQuery(iso2, level));
  const res = await fetch(url, { headers: { 'User-Agent': 'copilot-dl-news/1.0 (admin-class discovery)' }, signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`WDQS HTTP ${res.status}`);
  const json = await res.json();
  return (json.results?.bindings || [])
    .map((b) => ({
      qid: (b.class?.value || '').split('/').pop(),
      label: b.classLabel?.value || '',
      instances: parseInt(b.n?.value || '0', 10)
    }))
    .filter((r) => r.qid && r.instances >= minInstances);
}

(async () => {
  const findings = [];
  for (const iso2 of countries) {
    try {
      console.log(`\n== ${iso2} (level hypothesis: ${level}, min instances: ${minInstances})`);
      const rows = await discover(iso2);
      for (const r of rows) console.log(`  ${r.qid.padEnd(12)} ×${String(r.instances).padEnd(7)} ${r.label}`);
      if (!rows.length) console.log('  (no admin classes found — WDQS may have timed out upstream)');
      findings.push({ iso2, rows });
    } catch (e) {
      console.log(`  ERROR for ${iso2}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!APPLY) {
    console.log('\ndry-run: pass --apply (app stopped) to write verified=0 candidates');
    return;
  }

  const Database = require(path.join(ROOT, '..', 'news-crawler-db', 'node_modules', 'better-sqlite3'));
  const { seedAdminClassMap, listAdminClasses } = require('news-crawler-db');
  const db = new Database(path.join(ROOT, 'data', 'news.db'), { fileMustExist: true });
  try {
    for (const { iso2, rows } of findings) {
      const seedRows = rows.map((r) => ({
        countryCode: iso2,
        adminLevel: level,
        wikidataClassQid: r.qid,
        placeKind: 'region', // provisional — review corrects with `verified`
        label: `${r.label} (auto: ${r.instances} instances)`,
        provenance: 'auto-discovered',
        verified: 0,
        subclassWalk: 0 // candidates start conservative: direct P31 only
      }));
      const result = seedAdminClassMap(db, seedRows);
      console.log(`${iso2}: created=${result.created} updated=${result.updated} existing=${result.existing} failed=${result.failed}`);
      const visible = listAdminClasses(db, { countryCode: iso2 }); // verifiedOnly default
      console.log(`${iso2}: verified rows visible to ingestion: ${visible.length} (must exclude the new candidates)`);
    }
  } finally { db.close(); }
})();
