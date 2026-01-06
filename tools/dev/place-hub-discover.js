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

const path = require('path');
const Database = require('better-sqlite3');

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
  return new Database(dbPath, { readonly });
}

/**
 * Extract slugs from URLs matching a pattern
 */
function extractSlugsFromPattern(db, host, pattern) {
  // Convert pattern like "/world/{slug}" to regex-ish SQL
  // Pattern: /world/{slug} -> URLs like https://www.example.com/world/ukraine
  
  // Build SQL LIKE pattern
  const patternParts = pattern.split('{slug}');
  if (patternParts.length !== 2) {
    throw new Error(`Pattern must contain exactly one {slug}: ${pattern}`);
  }
  
  const [prefix, suffix] = patternParts;
  const likePattern = `https://www.${host}${prefix}%${suffix}`;
  
  console.log(`Searching for: ${likePattern}`);
  
  // Find distinct slugs
  const query = `
    SELECT DISTINCT 
      url,
      CASE 
        WHEN url LIKE ? 
        THEN substr(url, ?, 
             CASE 
               WHEN instr(substr(url, ?), '/') > 0 
               THEN instr(substr(url, ?), '/') - 1
               ELSE length(substr(url, ?))
             END)
        ELSE NULL
      END as slug
    FROM urls 
    WHERE host = ?
      AND url LIKE ?
      AND url NOT GLOB 'https://www.${host}${prefix}[0-9]*'
    ORDER BY slug
    LIMIT ?
  `;
  
  const prefixLen = `https://www.${host}${prefix}`.length + 1;
  
  const rows = db.prepare(query).all(
    likePattern,
    prefixLen, prefixLen, prefixLen, prefixLen,
    `www.${host}`,
    likePattern,
    LIMIT
  );
  
  // Deduplicate and clean slugs
  const slugMap = new Map();
  for (const row of rows) {
    let slug = row.slug;
    if (!slug || slug.length <= 2 || slug.match(/^\d+$/)) continue;
    
    // Strip query strings
    const qPos = slug.indexOf('?');
    if (qPos > 0) {
      slug = slug.slice(0, qPos);
    }
    
    // Skip non-place slugs
    const skipPatterns = ['live', 'article', 'video', 'gallery', 'series', 
      'ng-interactive', 'commentisfree', 'from-the-archive-blog'];
    if (skipPatterns.includes(slug.toLowerCase())) continue;
    
    if (!slugMap.has(slug)) {
      // Build clean URL (without query string)
      const cleanUrl = row.url.split('?')[0];
      slugMap.set(slug, cleanUrl);
    }
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
  
  // Load all country/region names for fast lookup
  const placeNames = db.prepare(`
    SELECT pn.place_id, pn.name, pn.normalized, pn.lang, p.kind
    FROM place_names pn
    JOIN places p ON p.id = pn.place_id
    WHERE p.kind IN ('country', 'territory', 'region', 'continent')
  `).all();
  
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
  const englishQuery = db.prepare(`
    SELECT place_id, name FROM place_names
    WHERE place_id IN (${[...seenPlaceIds.keys()].join(',')})
      AND (lang = 'en' OR lang = 'eng' OR lang = 'und')
      AND is_preferred = 1
  `);
  if (seenPlaceIds.size > 0) {
    for (const row of englishQuery.all()) {
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
  const newMappings = [];
  const existingMappings = [];
  
  // Normalize host (remove www.)
  const normalizedHost = host.replace(/^www\./, '');
  
  for (const match of matches) {
    const existing = db.prepare(`
      SELECT id FROM place_page_mappings
      WHERE place_id = ? AND host = ?
    `).get(match.place_id, normalizedHost);
    
    if (existing) {
      existingMappings.push(match);
    } else {
      newMappings.push(match);
    }
  }
  
  return { newMappings, existingMappings };
}

/**
 * Insert new mappings
 */
function insertMappings(db, mappings, host) {
  const normalizedHost = host.replace(/^www\./, '');
  const now = new Date().toISOString();
  
  const insert = db.prepare(`
    INSERT INTO place_page_mappings 
      (place_id, host, url, page_kind, status, first_seen_at, evidence)
    VALUES (?, ?, ?, 'country-hub', 'pending', ?, ?)
  `);
  
  let inserted = 0;
  const transaction = db.transaction(() => {
    for (const m of mappings) {
      const evidence = JSON.stringify({
        source: 'place-hub-discover',
        discovered_at: now,
        slug: m.slug,
        place_kind: m.place_kind
      });
      insert.run(m.place_id, normalizedHost, m.url, now, evidence);
      inserted++;
    }
  });
  
  transaction();
  return inserted;
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
