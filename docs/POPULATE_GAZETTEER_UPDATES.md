#!/usr/bin/env node

/**
 * UPDATED populate-gazetteer.js - Key improvements for deduplication:
 * 
 * 1. Uses ingestion_runs table to track runs and prevent duplicate ingestion
 * 2. Uses generateCapitalExternalId() to create stable IDs for capitals
 * 3. Supports multi-country capitals (e.g., Jerusalem) via capital_of relation
 * 4. Special handling for known multi-capital countries (South Africa, Bolivia, etc.)
 * 5. Returns { placeId, created } from upsertPlace to track new vs updated
 * 
 * Key Changes:
 * - Line ~110: Check for completed ingestion run before proceeding
 * - Line ~145: Create ingestion run at start
 * - Line ~350: Use generateCapitalExternalId + findExistingPlace for capitals
 * - Line ~360: Multi-capital coordinate handling
 * - Line ~390: Use capital_of relation instead of admin_parent for capitals
 * - Line ~710: Complete ingestion run with statistics
 * 
 * Usage:
 *   node src/tools/populate-gazetteer.js --db=./data/news.db
 *   node src/tools/populate-gazetteer.js --db=./data/news.db --force=1  # Re-ingest
 */

// Add these imports near the top of the file (after existing requires)
const {
  createDeduplicationStatements,
  checkIngestionRun,
  startIngestionRun,
  completeIngestionRun,
  generateCapitalExternalId,
  addCapitalRelationship
} = require('../db/sqlite/queries/gazetteer.deduplication');

// Add after ensureGazetteer(raw) call (around line 38)
const dedupStmts = createDeduplicationStatements(raw);

// Add after option parsing (around line 60)
const force = String(getArg('force', '0')) === '1';

// Add this check BEFORE fetching countries (around line 110-120)
const runCheck = checkIngestionRun(dedupStmts, 'restcountries', 'v3.1', force);
if (runCheck.shouldSkip) {
  log(`[gazetteer] REST Countries v3.1 already ingested at ${new Date(runCheck.lastRun.completedAt).toISOString()}`);
  log(`[gazetteer] Created: ${runCheck.lastRun.placesCreated}, Updated: ${runCheck.lastRun.placesUpdated}`);
  log(`[gazetteer] Use --force=1 to re-ingest`);
  process.exit(0);
}

// Start ingestion run (after runCheck, around line 125)
const runId = startIngestionRun(dedupStmts, 'restcountries', 'v3.1', {
  offline,
  countriesFilter: countriesFilter.join(','),
  regionFilter,
  subregionFilter
});
log(`[gazetteer] Started ingestion run #${runId}`);

// Multi-capital coordinate mapping (add near top of file after imports)
const MULTI_CAPITAL_COORDS = {
  'ZA': {
    'pretoria': [-25.7461, 28.1881],      // Executive capital
    'cape town': [-33.9249, 18.4241],     // Legislative capital  
    'bloemfontein': [-29.1211, 26.2140]   // Judicial capital
  },
  'BO': {
    'la paz': [-16.4897, -68.1193],       // Administrative capital
    'sucre': [-19.0332, -65.2627]         // Constitutional capital
  },
  'MY': {
    'kuala lumpur': [3.1390, 101.6869],   // Historic capital
    'putrajaya': [2.9264, 101.6964]       // Administrative capital
  },
  'BN': {
    'bandar seri begawan': [4.8895, 114.9395],  // Primary
    'bangar': [4.7167, 115.0667]          // Temburong district capital
  },
  'NL': {
    'amsterdam': [52.3676, 4.9041],       // Constitutional capital
    'the hague': [52.0705, 4.3007]        // Administrative capital
  }
};

// REPLACE the capital handling section (around lines 343-386) with this:
// Capitals (as cities with parent link) - WITH DEDUPLICATION
const capList = is_array(c.capital) ? c.capital : (c.capital ? [c.capital] : []);
const capInfo = is_array(c.capitalInfo?.latlng) ? c.capitalInfo.latlng : null;

for (let capIndex = 0; capIndex < capList.length; capIndex++) {
  const cap = capList[capIndex];
  const normCap = normalizeName(cap);
  
  // Determine coordinates for this specific capital
  let coords = null;
  const multiCapital = MULTI_CAPITAL_COORDS[cc2];
  if (multiCapital && multiCapital[normCap]) {
    // Use known correct coordinates for multi-capital countries
    coords = multiCapital[normCap];
  } else if (capList.length === 1 && capInfo) {
    // Single capital - use provided coordinates
    coords = capInfo;
  } else if (capList.length > 1 && capIndex === 0 && capInfo) {
    // Multiple capitals, first one gets provided coordinates
    coords = capInfo;
  }
  // else coords remains null - will be enriched later from Wikidata
  
  // Generate stable external ID for this capital
  const capitalExtId = generateCapitalExternalId('restcountries', cc2, cap);
  
  // Check if capital already exists via external ID
  let cid = null;
  const existingCapital = dedupStmts.getPlaceByExternalId.get('restcountries', capitalExtId);
  
  if (existingCapital) {
    cid = existingCapital.id;
    // Update coordinates if we have better ones
    if (coords) {
      raw.prepare(`
        UPDATE places 
        SET lat = COALESCE(?, lat), 
            lng = COALESCE(?, lng),
            timezone = COALESCE(?, timezone)
        WHERE id = ?
      `).run(coords[0], coords[1], primTz, cid);
    }
  } else {
    // Create new capital city
    const res = insPlace.run({ 
      kind: 'city', 
      country_code: cc2, 
      population: null, 
      timezone: primTz, 
      lat: coords ? coords[0] : null, 
      lng: coords ? coords[1] : null, 
      bbox: null, 
      source: 'restcountries@v3.1', 
      extra: JSON.stringify({ role: 'capital' }) 
    });
    cid = res.lastInsertRowid;
    capitals++;
    
    // Register external ID to prevent future duplicates
    insertExternalId.run('restcountries', capitalExtId, cid);
  }
  
  // Add name
  insName.run(cid, cap, normCap, 'und', 'endonym', 1, 0); 
  names++;
  
  // Record attributes
  const cityFetchedAt = Date.now();
  if (coords) {
    recordAttribute(attributeStatements, {
      placeId: cid,
      attr: 'lat',
      value: coords[0],
      source: attrSource,
      fetchedAt: cityFetchedAt,
      metadata: { provider: 'restcountries', version: 'v3.1', role: 'capital' }
    });
    recordAttribute(attributeStatements, {
      placeId: cid,
      attr: 'lng',
      value: coords[1],
      source: attrSource,
      fetchedAt: cityFetchedAt,
      metadata: { provider: 'restcountries', version: 'v3.1', role: 'capital' }
    });
  }
  recordAttribute(attributeStatements, {
    placeId: cid,
    attr: 'role',
    value: 'capital',
    source: attrSource,
    fetchedAt: cityFetchedAt,
    metadata: { provider: 'restcountries', version: 'v3.1' }
  });
  
  // Link hierarchy using capital_of relation (supports multi-parent)
  addCapitalRelationship(dedupStmts, pid, cid, { 
    source: 'restcountries', 
    version: 'v3.1',
    capitalType: multiCapital && multiCapital[normCap] ? 
      (normCap.includes('pretoria') ? 'executive' :
       normCap.includes('cape') ? 'legislative' : 
       normCap.includes('bloemfontein') ? 'judicial' : 'administrative') 
      : 'primary'
  });
  
  // Set canonical name for the city
  try {
    const best = raw.prepare(`
      SELECT id FROM place_names 
      WHERE place_id=? 
      ORDER BY is_official DESC, is_preferred DESC, (lang='en') DESC, id ASC 
      LIMIT 1
    `).get(cid)?.id;
    if (best) updCanonical.run(best, cid);
  } catch (_) {}
}

// At the end of processing (around line 700-710), complete the ingestion run
completeIngestionRun(dedupStmts, runId, {
  countriesProcessed: countries,
  placesCreated: capitals + cityCount + countries, // Approximate
  placesUpdated: 0, // Could track this separately
  namesAdded: names
});
log(`[gazetteer] Completed ingestion run #${runId}`);

// ALSO: Update the Wikidata import section to use deduplication
// In the city ingestion part (around line 555-565), replace with:
if (importCities && wikidataCities) {
  // ... existing SPARQL fetch code ...
  
  for (const crow of wikidataCities) {
    // ... existing parsing code ...
    
    // Use upsertPlace with deduplication
    const { placeId: cid, created } = ingestQueries.upsertPlace(raw, statements, {
      wikidataQid: qid,
      kind: 'city',
      countryCode: crow.country_code,
      population: pop,
      lat,
      lng,
      source: 'wikidata',
      attributes: []
    });
    
    if (created) cityCount++;
    
    // Add names
    for (const nameEntry of namesArr) {
      ingestQueries.insertPlaceName(statements, cid, nameEntry);
      names++;
    }
  }
}

