#!/usr/bin/env node

/**
 * verify-place-hubs - Verify, validate, and normalize place hubs in the database
 * 
 * This tool uses the HubValidator to:
 * 1. Check which articles in the database are actually valid place hubs
 * 2. Normalize paginated URLs to front page URLs
 * 3. Validate normalized URLs by checking cache or fetching content
 * 
 * Usage:
 *   node tools/gazetteer/verify-place-hubs.js
 */

const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../../src/data/db/sqlite');
const HubValidator = require('../../src/hub-validation/HubValidator');

// Load configuration
const configPath = path.join(__dirname, '..', '..', 'config.json');
let config = { url: 'https://www.theguardian.com' };

try {
  const configData = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configData);
} catch (error) {
  console.warn(`Warning: Could not load config.json, using default URL`);
}

// Extract domain from URL
const domain = new URL(config.url).hostname;

// Initialize database
const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

async function verifyAndNormalizePlaceHubs() {
  // Initialize validator
  const validator = new HubValidator(db);
  await validator.initialize();

  // Query place_hubs table for entries marked as place hubs (not topic hubs)
  const query = `
    SELECT id, url, title, place_slug, topic_slug
    FROM place_hubs
    WHERE host LIKE ?
    AND place_slug IS NOT NULL
    ORDER BY title
  `;

  const placeHubs = db.prepare(query).all(`%${domain}%`);

  console.log(`\n🔍 Verifying and Normalizing Place Hubs (${config.url})\n`);
  console.log(`Found ${placeHubs.length} place hub entries to verify...\n`);
  console.log('─'.repeat(120));

  // Prepare delete statement
  const deleteStmt = db.prepare('DELETE FROM place_hubs WHERE id = ?');

  // Track statistics
  let validCount = 0;
  let invalidCount = 0;
  let normalizedCount = 0;
  let unchangedCount = 0;
  const deleted = [];

  // Validate each hub one by one
  for (let i = 0; i < placeHubs.length; i++) {
    const hub = placeHubs[i];
    const num = `${i + 1}.`.padEnd(6);
    const placeName = (hub.place_slug || '').split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    // First validate the hub itself
    const result = validator.validatePlaceHub(hub.title, hub.url);
    
    if (!result.isValid) {
      console.log(`${num}❌ ${placeName.padEnd(30)} - INVALID: ${result.reason}`);
      console.log(`      Deleting: ${hub.url}`);
      
      try {
        deleteStmt.run(hub.id);
        invalidCount++;
        deleted.push({
          id: hub.id,
          title: hub.title,
          url: hub.url,
          place_slug: hub.place_slug,
          reason: result.reason
        });
      } catch (error) {
        console.log(`      Error deleting: ${error.message}`);
      }
      continue;
    }
    
    // Hub is valid, now check if URL needs normalization
    const normalized = validator.normalizeHubUrl(hub.url);
    
    if (normalized === hub.url) {
      // URL is already normalized
      console.log(`${num}✅ ${placeName.padEnd(30)} - Valid (already normalized)`);
      unchangedCount++;
      validCount++;
    } else {
      // URL needs normalization - validate the normalized URL
      console.log(`${num}🔄 ${placeName.padEnd(30)} - Normalizing...`);
      console.log(`      Old: ${hub.url}`);
      console.log(`      New: ${normalized}`);
      
      const contentValid = await validator.validateHubContent(normalized, placeName);
      
      if (contentValid.isValid) {
        validator.updateStmt.run(normalized, hub.id);
        console.log(`      ✅ Validated and updated`);
        normalizedCount++;
        validCount++;
      } else {
        console.log(`      ⚠️  Normalized URL failed validation: ${contentValid.reason}`);
        console.log(`      Keeping original URL`);
        unchangedCount++;
        validCount++;
      }
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(120));
  console.log(`\n📊 Verification Summary:`);
  console.log(`   Total entries checked: ${placeHubs.length}`);
  console.log(`   ✅ Valid place hubs: ${validCount}`);
  console.log(`      - Already normalized: ${unchangedCount}`);
  console.log(`      - Newly normalized: ${normalizedCount}`);
  console.log(`   ❌ Invalid entries removed: ${invalidCount}`);
  if (placeHubs.length > 0) {
    console.log(`   Success rate: ${((validCount / placeHubs.length) * 100).toFixed(1)}%`);
  }
  console.log('');

  // Close database
  db.close();
}

// Run verification
verifyAndNormalizePlaceHubs().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

