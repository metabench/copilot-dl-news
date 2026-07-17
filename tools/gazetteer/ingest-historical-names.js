const fs = require('fs');
const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
// Native fetch is available in Node 18+.

const DB_PATH = path.join(__dirname, '../../data/news.db');
const CANDIDATES_PATH = path.join(__dirname, '../../data/knowledge/historical_names_candidates.json');

function getHistoricalNamesApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'findOrLinkHistoricalNamePlace',
    'createHistoricalNameWikidataPlace',
    'ingestHistoricalPlaceNameForPlace'
  ];

  for (const name of required) {
    if (typeof dbModule[name] !== 'function') {
      throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
  }

  return dbModule;
}

async function fetchWikidata(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  console.log(`🌐 Fetching Wikidata: ${qid}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const data = await res.json();
  return data.entities[qid];
}

function getClaimValue(entity, propId) {
  const claims = entity?.claims?.[propId];
  if (!claims || !claims.length) return null;
  const mainSnak = claims[0].mainsnak;
  if (mainSnak.snaktype !== 'value') return null;
  return mainSnak.datavalue.value;
}

function wikidataEntityToPlaceData(entity, candidate) {
  const latLng = getClaimValue(entity, 'P625');
  const population = getClaimValue(entity, 'P1082');

  return {
    kind: 'city',
    countryCode: candidate.country_code,
    wikidataQid: candidate.wikidata_qid,
    currentName: candidate.current_name,
    lat: latLng ? latLng.latitude : null,
    lng: latLng ? latLng.longitude : null,
    population: population ? parseInt(population.amount, 10) : null
  };
}

async function createPlaceFromWikidata(api, db, candidate) {
  const entity = await fetchWikidata(candidate.wikidata_qid);
  const placeData = wikidataEntityToPlaceData(entity, candidate);

  console.log(`🆕 Creating place from Wikidata: ${candidate.current_name}`);
  return api.createHistoricalNameWikidataPlace(db, placeData);
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

async function ingest() {
  console.log(`Opening database at ${DB_PATH}...`);
  const api = getHistoricalNamesApi();
  const db = openNewsCrawlerDb(DB_PATH);

  try {
    console.log(`Reading candidates from ${CANDIDATES_PATH}...`);
    const candidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8'));

    let updated = 0;
    let inserted = 0;
    let skipped = 0;
    let created = 0;

    for (const candidate of candidates) {
      const resolved = api.findOrLinkHistoricalNamePlace(db, candidate);
      let place = resolved.place;

      if (resolved.linked) {
        console.log(`🔗 Linking ${candidate.current_name} to ${candidate.wikidata_qid}`);
      }

      if (!place && candidate.wikidata_qid) {
        try {
          place = await createPlaceFromWikidata(api, db, candidate);
          created++;
        } catch (err) {
          console.error(`❌ Failed to create place ${candidate.current_name}:`, err.message);
        }
      }

      if (!place) {
        console.warn(`⚠️  Place not found and could not be created: ${candidate.current_name}`);
        skipped++;
        continue;
      }

      const result = api.ingestHistoricalPlaceNameForPlace(db, candidate, place.id);
      if (result.action === 'updated') {
        console.log(`🔄 Updating ${candidate.historical_name} for place ${place.id}`);
        updated++;
      } else if (result.action === 'inserted') {
        console.log(`➕ Adding ${candidate.historical_name} for place ${place.id}`);
        inserted++;
      }
    }

    console.log('\nSummary:');
    console.log(`  Created:  ${created}`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Updated:  ${updated}`);
    console.log(`  Skipped:  ${skipped}`);
  } finally {
    await closeDb(db);
  }
}

if (require.main === module) {
  ingest().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  getHistoricalNamesApi,
  fetchWikidata,
  getClaimValue,
  wikidataEntityToPlaceData,
  createPlaceFromWikidata,
  ingest
};
