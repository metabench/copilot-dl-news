'use strict';

/**
 * Multi-Language Places Check Script
 * 
 * Validates the multi-language place queries module:
 * - Query function exports
 * - Script detection
 * - Language expansion/fallback
 * - Name normalization
 */

const path = require('path');
const Database = require('better-sqlite3');
const { createMultiLanguagePlaceQueries } = require('../src/db/sqlite/v1/queries/multiLanguagePlaces');

const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Multi-Language Places Check');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Database: ${DB_PATH}\n`);

let db;
let queries;
let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`  ✅ ${desc}`);
    passed++;
  } else {
    console.log(`  ❌ ${desc}`);
    failed++;
  }
}

function checkSection(name, fn) {
  console.log(`\n┌─ ${name} ─────────────────────────────`);
  fn();
  console.log('└────────────────────────────────────────────');
}

try {
  db = new Database(DB_PATH, { readonly: true });
  queries = createMultiLanguagePlaceQueries(db);
  
  checkSection('Module Export', () => {
    check('createMultiLanguagePlaceQueries is function', typeof createMultiLanguagePlaceQueries === 'function');
    check('Returns queries object', typeof queries === 'object');
  });
  
  checkSection('Query Functions Exported', () => {
    const expectedFns = [
      'findByName',
      'getPlaceNames',
      'getPreferredName',
      'searchByPattern',
      'countByLanguage',
      'getAvailableLanguages',
      'normalizeName',
      'detectScript',
      'expandLanguage'
    ];
    
    for (const fn of expectedFns) {
      check(`${fn} is function`, typeof queries[fn] === 'function');
    }
  });
  
  checkSection('Script Detection', () => {
    const testCases = [
      { input: 'London', expected: 'Latn' },
      { input: '北京', expected: 'Hans' },  // Simplified Chinese chars
      { input: 'Москва', expected: 'Cyrl' },
      { input: 'القاهرة', expected: 'Arab' },
      { input: 'กรุงเทพ', expected: 'Thai' },
      { input: 'とうきょう', expected: 'Jpan' },  // Use hiragana which is unambiguously Japanese
      { input: '서울', expected: 'Kore' }
    ];
    
    for (const tc of testCases) {
      const result = queries.detectScript(tc.input);
      check(`detectScript('${tc.input}') → ${tc.expected}`, result.script === tc.expected);
      console.log(`    '${tc.input}' → script=${result.script}, lang=${result.lang}`);
    }
    
    // Special case: Han characters without kana could be Chinese or Japanese
    const tokyoKanji = queries.detectScript('東京');
    console.log(`    Note: '東京' (kanji only) → script=${tokyoKanji.script}, lang=${tokyoKanji.lang} (ambiguous without kana)`);
  });
  
  checkSection('Language Expansion', () => {
    const testCases = [
      { lang: 'en', minSize: 1 },     // Just English
      { lang: 'zh', minSize: 2 },     // Chinese → zh-Hans, zh-Hant fallbacks
      { lang: 'pt-BR', minSize: 2 },  // Brazilian Portuguese → pt fallback
      { lang: 'sr', minSize: 2 }      // Serbian → Latin/Cyrillic variants
    ];
    
    for (const tc of testCases) {
      const expanded = queries.expandLanguage(tc.lang);
      check(`expandLanguage('${tc.lang}') returns array`, Array.isArray(expanded));
      check(`Has at least ${tc.minSize} variants`, expanded.length >= tc.minSize);
      console.log(`    '${tc.lang}' → [${expanded.join(', ')}]`);
    }
  });
  
  checkSection('Name Normalization', () => {
    const testCases = [
      { input: 'London', expected: 'london' },
      { input: 'New York', expected: 'new york' },
      { input: '   Paris   ', expected: 'paris' },
      { input: 'São Paulo', expected: /s.o paulo|sao paulo/ },
      { input: 'BERLIN', expected: 'berlin' }
    ];
    
    for (const tc of testCases) {
      const result = queries.normalizeName(tc.input);
      const matches = tc.expected instanceof RegExp 
        ? tc.expected.test(result)
        : result === tc.expected;
      check(`normalizeName('${tc.input}') normalized correctly`, matches);
      console.log(`    '${tc.input}' → '${result}'`);
    }
  });
  
  checkSection('Find By Name (Database Query)', () => {
    // Try some common place names
    const testNames = ['London', 'Paris', 'Berlin', 'New York', 'Tokyo'];
    
    for (const name of testNames) {
      const results = queries.findByName(name, { limit: 5 });
      check(`findByName('${name}') returns array`, Array.isArray(results));
      console.log(`    '${name}' → ${results.length} results`);
      
      if (results.length > 0) {
        const first = results[0];
        check(`First result has place_id`, typeof first.place_id === 'number' || typeof first.place_id === 'bigint');
      }
    }
  });
  
  checkSection('Get Place Names (Multi-Language)', () => {
    // First find a place to get names for
    const londonResults = queries.findByName('London', { limit: 1 });
    
    if (londonResults.length > 0) {
      const placeId = Number(londonResults[0].place_id);
      const names = queries.getPlaceNames(placeId);
      
      check('getPlaceNames returns array', Array.isArray(names));
      console.log(`    Place ${placeId} has ${names.length} name variants`);
      
      if (names.length > 0) {
        // Show first few
        for (const name of names.slice(0, 3)) {
          console.log(`      - '${name.name}' (lang=${name.lang}, script=${name.script})`);
        }
      }
      
      // Check available languages
      const langs = queries.getAvailableLanguages(placeId);
      check('getAvailableLanguages returns array', Array.isArray(langs));
      console.log(`    Available languages: ${langs.slice(0, 10).join(', ')}${langs.length > 10 ? '...' : ''}`);
    } else {
      console.log('    ⚠️ No London results found, skipping detailed tests');
    }
  });
  
  checkSection('Get Preferred Name', () => {
    const londonResults = queries.findByName('London', { limit: 1 });
    
    if (londonResults.length > 0) {
      const placeId = Number(londonResults[0].place_id);
      
      const enName = queries.getPreferredName(placeId, 'en');
      const deName = queries.getPreferredName(placeId, 'de');
      const frName = queries.getPreferredName(placeId, 'fr');
      
      console.log(`    Preferred names for place ${placeId}:`);
      console.log(`      en: ${enName || '(none)'}`);
      console.log(`      de: ${deName || '(none)'}`);
      console.log(`      fr: ${frName || '(none)'}`);
      
      check('getPreferredName returns string or null', 
        enName === null || typeof enName === 'string');
    }
  });
  
  checkSection('Language Statistics', () => {
    const stats = queries.countByLanguage();
    check('countByLanguage returns array', Array.isArray(stats));
    
    if (stats.length > 0) {
      console.log('    Language distribution (top 10):');
      for (const row of stats.slice(0, 10)) {
        console.log(`      ${row.lang || 'und'}: ${row.cnt} names`);
      }
    }
  });
  
} catch (err) {
  console.error('\n❌ Check failed with error:', err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  if (db) db.close();
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
