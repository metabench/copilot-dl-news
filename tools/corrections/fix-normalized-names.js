#!/usr/bin/env node

/**
 * fix-normalized-names.js - Re-normalize place names that have empty normalized values
 *
 * Problem: The normalizeName function was incorrectly handling non-Latin scripts,
 * causing names in Arabic, Chinese, Cyrillic, etc. to be normalized to empty strings.
 *
 * Solution: Re-run normalization on all names with empty normalized values.
 *
 * Usage:
 *   node tools/corrections/fix-normalized-names.js              # Dry run (default)
 *   node tools/corrections/fix-normalized-names.js --fix        # Apply changes
 */

const { ensureDatabase } = require('../../src/db/sqlite');
const { normalizeName } = require('../../src/db/sqlite/queries/gazetteer.utils');
const path = require('path');

function getArg(name, fallback) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const v = a.split('=')[1];
  return v === undefined ? fallback : v;
}

// Default to dry-run mode, require --fix to apply changes
const dryRun = !process.argv.includes('--fix');

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log('\n🔍 Finding place names with empty normalized values...');
if (dryRun) console.log('(DRY RUN MODE - no changes will be made)\n');

const namesToFix = db.prepare(`
  SELECT id, name, normalized, lang
  FROM place_names
  WHERE normalized = '' AND name != ''
  ORDER BY lang, name
`).all();

console.log(`Found ${namesToFix.length} place names with empty normalized values`);

if (namesToFix.length === 0) {
  console.log('\n✓ All place names have valid normalized values!');
  db.close();
  process.exit(0);
}

// Show breakdown by language
const byLang = {};
for (const name of namesToFix) {
  byLang[name.lang] = (byLang[name.lang] || 0) + 1;
}
console.log('\nBreakdown by language:');
for (const [lang, count] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${lang}: ${count}`);
}
console.log('');

const updateNormalized = db.prepare(`
  UPDATE place_names
  SET normalized = ?
  WHERE id = ?
`);

let fixedCount = 0;
let skippedCount = 0;

for (const nameRecord of namesToFix) {
  const newNormalized = normalizeName(nameRecord.name);

  if (!newNormalized) {
    console.log(`⚠ Name "${nameRecord.name}" (${nameRecord.lang}) still normalizes to empty - skipping`);
    skippedCount++;
    continue;
  }

  if (dryRun) {
    console.log(`Would update: "${nameRecord.name}" (${nameRecord.lang})`);
    console.log(`  Old normalized: '${nameRecord.normalized}'`);
    console.log(`  New normalized: '${newNormalized}'`);
    console.log('');
  } else {
    try {
      updateNormalized.run(newNormalized, nameRecord.id);
      console.log(`✓ Fixed "${nameRecord.name}" (${nameRecord.lang}) → "${newNormalized}"`);
      fixedCount++;
    } catch (err) {
      console.error(`✗ Error fixing name ${nameRecord.id}: ${err.message}`);
      skippedCount++;
    }
  }
}

console.log(`\n${'='.repeat(60)}`);
if (dryRun) {
  console.log('DRY RUN COMPLETE');
  console.log(`Would fix ${namesToFix.length - skippedCount} place names`);
  if (skippedCount > 0) console.log(`Would skip ${skippedCount} names (still empty after normalization)`);
  console.log('\nRun with --fix to apply changes');
} else {
  console.log('✓ FIXES APPLIED');
  console.log(`Fixed ${fixedCount} place names`);
  if (skippedCount > 0) console.log(`Skipped ${skippedCount} names`);
  console.log('\n✓ Normalized values updated!');
}

db.close();