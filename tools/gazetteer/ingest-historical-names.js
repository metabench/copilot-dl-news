const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../../src/data/db/sqlite');
// const fetch = require('node-fetch'); // Native fetch in Node 18+

const DB_PATH = path.join(__dirname, '../../data/gazetteer.db');
const CANDIDATES_PATH = path.join(__dirname, '../../data/knowledge/historical_names_candidates.json');

async function fetchWikidata(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  console.log(`🌐 Fetching Wikidata: ${qid}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const data = await res.json();
  return data.entities[qid];
}

function getClaimValue(entity, propId) {
  const claims = entity.claims[propId];
  if (!claims || !claims.length) return null;
  const mainSnak = claims[0].mainsnak;
  if (mainSnak.snaktype !== 'value') return null;
  return mainSnak.datavalue.value;
}

async function ingest() {
  console.log(`Opening database at ${DB_PATH}...`);
  const db = ensureDatabase(DB_PATH);

  console.log(`Reading candidates from ${CANDIDATES_PATH}...`);
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8'));

  const insertStmt = db.prepare(`
    INSERT INTO place_names (
      place_id, name, normalized, lang, name_kind, 
      is_preferred, is_official, source, valid_from, valid_to
    ) VALUES (
      ?, ?, ?, ?, ?, 
      0, 0, ?, ?, ?
    )
  `);

  const updateStmt = db.prepare(`
    UPDATE place_names 
    SET valid_from = COALESCE(?, valid_from),
        valid_to = COALESCE(?, valid_to),
        source = source || ',knowledge-base'
    WHERE id = ?
  `);

  const insertPlaceStmt = db.prepare(`
    INSERT INTO places (
      kind, country_code, wikidata_qid, source, lat, lng, population, status
    ) VALUES (
      ?, ?, ?, 'wikidata', ?, ?, ?, 'current'
    )
  `);

  const updatePlaceQidStmt = db.prepare('UPDATE places SET wikidata_qid = ? WHERE id = ?');

  const findPlaceByQid = db.prepare('SELECT id, canonical_name_id FROM places WHERE wikidata_qid = ?');
  const findPlaceByName = db.prepare(`
    SELECT p.id, p.canonical_name_id 
    FROM places p 
    JOIN place_names pn ON p.canonical_name_id = pn.id 
    WHERE pn.name = ? AND p.country_code = ?
  `);

  const findExistingName = db.prepare(`
    SELECT id, valid_from, valid_to 
    FROM place_names 
    WHERE place_id = ? AND name = ?
  `);

  let updated = 0;
  let inserted = 0;
  let skipped = 0;
  let created = 0;

  for (const candidate of candidates) {
    let place = null;

    if (candidate.wikidata_qid) {
      place = findPlaceByQid.get(candidate.wikidata_qid);
    }

    if (!place) {
      place = findPlaceByName.get(candidate.current_name, candidate.country_code);
      if (place && candidate.wikidata_qid) {
        console.log(`🔗 Linking ${candidate.current_name} to ${candidate.wikidata_qid}`);
        updatePlaceQidStmt.run(candidate.wikidata_qid, place.id);
        place.wikidata_qid = candidate.wikidata_qid; // Update local obj
      }
    }

    if (!place && candidate.wikidata_qid) {
      try {
        const entity = await fetchWikidata(candidate.wikidata_qid);
        const latLng = getClaimValue(entity, 'P625'); // Coordinate location
        const population = getClaimValue(entity, 'P1082'); // Population
        
        // Simple lat/lng extraction
        const lat = latLng ? latLng.latitude : null;
        const lng = latLng ? latLng.longitude : null;
        const pop = population ? parseInt(population.amount) : null;

        console.log(`🆕 Creating place from Wikidata: ${candidate.current_name}`);
        const info = insertPlaceStmt.run(
          'city', // Assume city for now
          candidate.country_code,
          candidate.wikidata_qid,
          lat,
          lng,
          pop
        );
        
        const newPlaceId = info.lastInsertRowid;
        
        // Add canonical name
        insertStmt.run(
          newPlaceId,
          candidate.current_name,
          candidate.current_name.toLowerCase(),
          'en',
          'endonym', // or official
          'wikidata',
          null,
          null
        );

        // Update canonical_name_id on place
        const nameId = db.prepare('SELECT id FROM place_names WHERE place_id = ? AND name = ?').get(newPlaceId, candidate.current_name).id;
        db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(nameId, newPlaceId);

        place = { id: newPlaceId };
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

    const existing = findExistingName.get(place.id, candidate.historical_name);

    if (existing) {
      // Update if dates are missing
      if (!existing.valid_from && !existing.valid_to) {
        console.log(`🔄 Updating ${candidate.historical_name} for place ${place.id}`);
        updateStmt.run(candidate.valid_from || null, candidate.valid_to || null, existing.id);
        updated++;
      } else {
        // console.log(`ℹ️  Skipping ${candidate.historical_name} (already has dates)`);
      }
    } else {
      // Insert new
      console.log(`➕ Adding ${candidate.historical_name} for place ${place.id}`);
      insertStmt.run(
        place.id,
        candidate.historical_name,
        candidate.historical_name.toLowerCase(), // Simple normalization
        'en', // Assuming English for now
        'historical',
        'knowledge-base',
        candidate.valid_from || null,
        candidate.valid_to || null
      );
      inserted++;
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Created:  ${created}`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
  
  db.close();
}

ingest().catch(console.error);

