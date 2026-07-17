'use strict';
// A4: retire ISO-code junk place_page_mappings THROUGH the review API
// (docs/agents/PLACE_HUB_REVIEW_API.md) — every write audited with
// agent+reason; this script is an API-client session, not a DB writer.
//
// Junk pattern: URL tail is the bare ISO-3166 code of the mapped place
// (…/news/ad ↦ Andorra). semana.com's ~50 '/news/<cc>' rows are all
// "verified" for wildly implausible territories (Tokelau, Wallis&Futuna) —
// a bulk mis-verification from a catch-all-200 route. independent.co.uk's
// '/topic/<cc>' rows are pending guesses — except /topic/us, which is
// VERIFIED and plausibly a real topic page: it gets a classify probe and a
// report line instead of a blind rejection.
//
// Default DRY-RUN (prints the plan); --apply POSTs the rejections.
// Requires the unified app on 127.0.0.1:3170.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));

const APPLY = process.argv.includes('--apply');
const BASE = 'http://127.0.0.1:3170';
const AGENT = 'claude-loop-a4';

async function main() {
  const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });
  const rows = db.prepare(`
    SELECT m.id, m.place_id, m.host, m.url, m.page_kind, m.status,
           p.country_code,
           (SELECT pn.name FROM place_names pn WHERE pn.id = p.canonical_name_id) AS place_name
    FROM place_page_mappings m
    JOIN places p ON p.id = m.place_id
    WHERE m.url GLOB '*/[a-z][a-z]' OR m.url GLOB '*/[a-z][a-z]/'
    ORDER BY m.host, m.url
  `).all();
  db.close();

  const plan = { reject: [], review: [], skip: [] };
  // Junk generators seen live: semana.com AND eltiempo.com (same Colombian
  // publisher family) enumerate /news/<cc> for every ISO code; the
  // independent.co.uk /topic/<cc> rows are pattern guesses. The ISO-tail
  // shape on these host+path combinations is the junk signal, verified or
  // not (semana/eltiempo's "verified" rows are a bulk mis-verification).
  for (const r of rows) {
    const newsCcJunk = ['semana.com', 'eltiempo.com'].includes(r.host) && r.url.includes('/news/');
    const indyGuess = r.host === 'independent.co.uk' && r.url.includes('/topic/');
    if (newsCcJunk) {
      plan.reject.push(r);
    } else if (indyGuess && r.status !== 'verified') {
      plan.reject.push(r);
    } else if (indyGuess && r.status === 'verified') {
      plan.review.push(r); // e.g. /topic/us — classify, don't blind-reject
    } else {
      plan.skip.push(r);
    }
  }

  console.log(`candidates: ${rows.length} → reject ${plan.reject.length}, review ${plan.review.length}, skip ${plan.skip.length}`);
  for (const r of plan.skip) console.log(`  SKIP [${r.id}] ${r.host} ${r.url} → ${r.place_name}`);

  for (const r of plan.review) {
    const cls = await fetch(`${BASE}/api/v1/place-hubs/classify?url=${encodeURIComponent(r.url)}`,
      { signal: AbortSignal.timeout(15000) }).then((x) => x.json()).catch((e) => ({ error: e.message }));
    console.log(`  REVIEW [${r.id}] ${r.host} ${r.url} → ${r.place_name} (${r.status}); classify: ${JSON.stringify(cls).slice(0, 300)}`);
  }

  let posted = 0; let failed = 0;
  for (const r of plan.reject) {
    if (!APPLY) continue;
    const body = {
      action: 'reject-place-hub',
      url: r.url,
      host: r.host,
      placeId: r.place_id,
      agent: AGENT,
      reason: `ISO-code junk mapping: URL tail '${r.url.replace(/\/$/, '').split('/').pop()}' is the bare ISO code of ${r.place_name} (${r.country_code}); ` +
        (['semana.com', 'eltiempo.com'].includes(r.host)
          ? `part of a bulk /news/<cc> enumeration on ${r.host} (implausible territories incl. "verified" rows — catch-all 200 route). `
          : `unverified pattern-guess on independent.co.uk /topic/<cc>. `) +
        'Per docs/review/2026-07-17-place-hub-assessment.md gap A4.'
    };
    try {
      const res = await fetch(`${BASE}/api/v1/place-hubs/overrides`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { posted++; }
      else { failed++; console.log(`  FAIL [${r.id}] ${r.url}: ${res.status} ${JSON.stringify(j).slice(0, 200)}`); }
    } catch (e) { failed++; console.log(`  FAIL [${r.id}] ${r.url}: ${e.message}`); }
  }

  if (APPLY) console.log(`rejections posted: ${posted}, failed: ${failed}`);
  else console.log('(dry-run: no POSTs made; re-run with --apply)');

  // Post-state
  const db2 = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });
  const remaining = db2.prepare(`
    SELECT COUNT(*) n FROM place_page_mappings m JOIN places p ON p.id = m.place_id
    WHERE (m.url GLOB '*/[a-z][a-z]' OR m.url GLOB '*/[a-z][a-z]/')`).get().n;
  console.log('bare 2-letter mappings remaining:', remaining,
    '| audit rows:', db2.prepare('SELECT COUNT(*) n FROM place_hub_audit').get().n);
  db2.close();
  console.log(APPLY ? 'APPLY DONE' : 'DRY-RUN DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
