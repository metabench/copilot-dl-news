'use strict';
// Live exercise of PlaceHubUrlIndex against news.db:
// seed priors → learn from verified hubs → classify samples → health check.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
process.chdir(REPO_ROOT);
const { PlaceHubUrlIndex } = require(path.join(REPO_ROOT, 'src', 'services', 'placeHubs', 'PlaceHubUrlIndex'));

const index = PlaceHubUrlIndex.open({});
console.log('[priors] newly seeded:', index.store.seedGlobalPriors());

for (const host of ['theguardian.com', 'aljazeera.com']) {
  const report = index.learnFromVerifiedHubs(host);
  console.log(`[learn:${host}]`, JSON.stringify({
    verifiedHubRows: report.verifiedHubRows,
    templates: report.templatesConsidered,
    saved: report.patternsSaved
  }));
}

const samples = [
  'https://www.theguardian.com/world/andorra',        // known-gap country (unknown-terms top hit)
  'https://www.theguardian.com/world/gibraltar',
  'https://www.theguardian.com/football',             // non-geo veto expected
  'https://www.theguardian.com/world/2026/jul/16/x',  // article-shaped
  'https://www.aljazeera.com/where/kenya',
  'https://www.bbc.com/news/world/europe',            // NEW host — priors only
  'https://www.lemonde.fr/world/france'               // NEW host — priors only
];
for (const url of samples) {
  const r = index.classifyUrl(url);
  console.log(`[classify] ${url}\n  -> candidate=${r.isPlaceHubCandidate} conf=${r.confidence.toFixed(2)} place=${r.place ? r.place.name + '/' + r.place.kind : '-'} via=${r.provenance || '-'} reasons=${r.reasons.join(',')}`);
}

for (const host of ['theguardian.com', 'aljazeera.com']) {
  console.log(`[health:${host}]`, JSON.stringify(index.assessStructureHealth(host, { apply: true })));
}
console.log('[patterns in db]', JSON.stringify(index.db.prepare(
  "SELECT domain, scope, COUNT(*) n, ROUND(AVG(accuracy),2) acc FROM place_hub_url_patterns GROUP BY domain, scope"
).all()));
index.close();
