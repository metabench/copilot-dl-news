#!/usr/bin/env node
/**
 * place-hub-discover.js — Discover place hub candidates from URL patterns
 * 
 * Usage:
 *   node tools/dev/place-hub-discover.js --host theguardian.com
 *   node tools/dev/place-hub-discover.js --host bbc.co.uk --pattern "/news/world-{slug}"
 *   node tools/dev/place-hub-discover.js --host theguardian.com --apply
 * 
 * @module tools/dev/place-hub-discover
 */
'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const path = require('path');
// CLI argument parsing
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
}

const HOST = flags.host || 'theguardian.com';
const PATTERN = flags.pattern || '/world/{slug}';
const APPLY = flags.apply || false;
const JSON_OUTPUT = flags.json || false;
const LIMIT = parseInt(flags.limit || '200', 10);

function getDb(readonly = true) {
  const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');
  return openNewsCrawlerDb(dbPath, { readonly });
}

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

/**
 * Extract slugs from URLs matching a pattern
 */
function extractSlugsFromPattern(db, host, pattern) {
  const listCandidateSlugs = getDbApi('listCandidatePlaceHubSlugsForPattern');
  const rows = listCandidateSlugs(db, { host, pattern, limit: LIMIT });
  const slugMap = new Map();
  for (const row of rows) {
    slugMap.set(row.slug, row.url);
  }
  return slugMap;
}

/**
 * Match slugs to places in the gazetteer - optimized with batch lookup
 * Deduplicates by place_id, preferring English slugs
 */
function matchSlugsToPlaces(db, slugs) {
  const matches = [];
  const unmatched = [];
  
  // Build a map of normalized place names to place data
  console.log('   Building place name index...');
  const placeIndex = new Map();
  const placeNames = getDbApi('listPlaceNamesForPlaceHubDiscoveryMatching')(db);
  
  for (const pn of placeNames) {
    // Index by normalized name
    if (pn.normalized) {
      const key = pn.normalized.toLowerCase();
      if (!placeIndex.has(key)) {
        placeIndex.set(key, { id: pn.place_id, name: pn.name, kind: pn.kind, lang: pn.lang });
      }
    }
    // Also index by name
    const nameKey = pn.name.toLowerCase();
    if (!placeIndex.has(nameKey)) {
      placeIndex.set(nameKey, { id: pn.place_id, name: pn.name, kind: pn.kind, lang: pn.lang });
    }
    // Index by slug form (with hyphens)
    const slugKey = pn.name.toLowerCase().replace(/\s+/g, '-');
    if (!placeIndex.has(slugKey)) {
      placeIndex.set(slugKey, { id: pn.place_id, name: pn.name, kind: pn.kind, lang: pn.lang });
    }
  }
  console.log(`   Indexed ${placeIndex.size} place name variants`);
  
  // Track which place_ids we've already matched (dedupe)
  const seenPlaceIds = new Map(); // place_id -> best match
  
  for (const [slug, url] of slugs) {
    // Try multiple normalizations
    const lookups = [
      slug.toLowerCase(),
      slug.replace(/-/g, ' ').toLowerCase(),
      slug.replace(/-/g, '').toLowerCase()
    ];
    
    let place = null;
    for (const lookup of lookups) {
      place = placeIndex.get(lookup);
      if (place) break;
    }
    
    if (place) {
      const existing = seenPlaceIds.get(place.id);
      // Prefer English matches, or first match if same language
      if (!existing || (place.lang === 'en' && existing.lang !== 'en')) {
        seenPlaceIds.set(place.id, {
          slug,
          url,
          place_id: place.id,
          place_name: place.name,
          place_kind: place.kind,
          lang: place.lang
        });
      }
    } else {
      unmatched.push({ slug, url });
    }
  }
  
  // Convert back to array and get English names
  const englishNames = new Map();
  if (seenPlaceIds.size > 0) {
    const preferredNames = getDbApi('listPreferredPlaceNamesForPlaceHubDiscovery')(db, [...seenPlaceIds.keys()]);
    for (const row of preferredNames) {
      if (!englishNames.has(row.place_id)) {
        englishNames.set(row.place_id, row.name);
      }
    }
  }
  
  for (const match of seenPlaceIds.values()) {
    // Override with English name if available
    const englishName = englishNames.get(match.place_id);
    if (englishName) {
      match.english_name = englishName;
    }
    matches.push(match);
  }
  
  return { matches, unmatched };
}

/**
 * Check which matches are already in place_page_mappings
 */
function filterExistingMappings(db, matches, host) {
  return getDbApi('splitPlaceHubMappingsByExistingHost')(db, matches, host);
}

/**
 * Insert new mappings
 */
function insertMappings(db, mappings, host) {
  return getDbApi('insertPendingPlaceHubDiscoveryMappings')(db, mappings, host);
}

// Main
async function main() {
  console.log(`\n=== Place Hub Discovery for ${HOST} ===`);
  console.log(`Pattern: ${PATTERN}`);
  console.log(`Apply: ${APPLY}\n`);
  
  const db = getDb(!APPLY); // readonly unless applying
  
  try {
    // 1. Extract slugs from URL patterns
    console.log('1. Extracting slugs from URLs...');
    const slugs = extractSlugsFromPattern(db, HOST, PATTERN);
    console.log(`   Found ${slugs.size} unique slugs\n`);
    
    // 2. Match slugs to places
    console.log('2. Matching slugs to gazetteer places...');
    const { matches, unmatched } = matchSlugsToPlaces(db, slugs);
    console.log(`   Matched: ${matches.length}`);
    console.log(`   Unmatched: ${unmatched.length}\n`);
    
    // 3. Filter out existing mappings
    console.log('3. Filtering existing mappings...');
    const { newMappings, existingMappings } = filterExistingMappings(db, matches, HOST);
    console.log(`   New: ${newMappings.length}`);
    console.log(`   Already mapped: ${existingMappings.length}\n`);
    
    // 4. Show results
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        host: HOST,
        pattern: PATTERN,
        totalSlugs: slugs.size,
        matched: matches.length,
        unmatched: unmatched.length,
        newMappings: newMappings.length,
        existingMappings: existingMappings.length,
        newMappingsList: newMappings,
        unmatchedList: unmatched.slice(0, 30)
      }, null, 2));
    } else {
      console.log('=== NEW MAPPINGS (not yet in DB) ===');
      for (const m of newMappings.slice(0, 50)) {
        console.log(`  ${m.place_name} (${m.place_kind}): ${m.url}`);
      }
      if (newMappings.length > 50) {
        console.log(`  ... and ${newMappings.length - 50} more`);
      }
      
      console.log('\n=== UNMATCHED SLUGS (no gazetteer match) ===');
      for (const u of unmatched.slice(0, 20)) {
        console.log(`  ${u.slug}: ${u.url}`);
      }
      if (unmatched.length > 20) {
        console.log(`  ... and ${unmatched.length - 20} more`);
      }
    }
    
    // 5. Apply if requested
    if (APPLY && newMappings.length > 0) {
      console.log('\n=== APPLYING NEW MAPPINGS ===');
      const inserted = insertMappings(db, newMappings, HOST);
      console.log(`Inserted ${inserted} new mappings with status 'pending'`);
    } else if (!APPLY && newMappings.length > 0) {
      console.log(`\n💡 Run with --apply to insert ${newMappings.length} new mappings`);
    }
    
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
