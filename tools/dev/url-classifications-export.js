#!/usr/bin/env node
/**
 * url-classifications-export.js — Export URL classifications for verification
 * 
 * Exports a sample of URLs from the database with their classifications
 * (article/hub/nav) so humans or AI agents can verify accuracy.
 * 
 * Usage:
 *   node tools/dev/url-classifications-export.js --sample 200 --json
 *   node tools/dev/url-classifications-export.js --host theguardian.com
 *   node tools/dev/url-classifications-export.js --unclassified --limit 50
 */
'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const path = require('path');
// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  sample: 200,
  host: null,
  json: false,
  unclassified: false,
  limit: null,
  help: false,
  stratified: true,  // Try to get balanced sample of article types
  showSignals: false // Show URL pattern signals
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') flags.help = true;
  else if (arg === '--json') flags.json = true;
  else if (arg === '--unclassified') flags.unclassified = true;
  else if (arg === '--show-signals') flags.showSignals = true;
  else if (arg === '--no-stratified') flags.stratified = false;
  else if (arg === '--sample' && args[i + 1]) flags.sample = parseInt(args[++i], 10);
  else if (arg === '--host' && args[i + 1]) flags.host = args[++i];
  else if (arg === '--limit' && args[i + 1]) flags.limit = parseInt(args[++i], 10);
}

if (flags.limit) flags.sample = flags.limit;

if (flags.help) {
  console.log(`
URL Classifications Export — Verify classification accuracy

Usage:
  node tools/dev/url-classifications-export.js [options]

Options:
  --sample <n>      Number of URLs to export (default: 200)
  --host <domain>   Filter by host (e.g., theguardian.com)
  --unclassified    Export URLs without classifications
  --json            Output as JSON
  --show-signals    Include URL pattern analysis signals
  --no-stratified   Don't try to balance article types
  --help            Show this help

Examples:
  # Export 200 random classified URLs
  node tools/dev/url-classifications-export.js

  # Export 50 Guardian URLs as JSON
  node tools/dev/url-classifications-export.js --host theguardian.com --sample 50 --json

  # Find unclassified URLs
  node tools/dev/url-classifications-export.js --unclassified --limit 100
`);
  process.exit(0);
}

// Database path
const dbPath = path.join(__dirname, '../../data/news.db');

// URL pattern analysis
function analyzeUrlSignals(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);
    
    return {
      host: parsed.hostname,
      pathDepth: segments.length,
      hasDate: /\/\d{4}\/\d{2}\/\d{2}\//.test(pathname) || /\/\d{4}\/\w{3}\/\d{2}\//.test(pathname),
      hasArticleWord: /\/(article|story|post|news|blog|commentary|opinion|review)\//i.test(pathname),
      hasHubWord: /\/(section|category|topic|tag|author|archive|index|collection)\//i.test(pathname),
      hasVideoWord: /\/(video|watch|live)\//i.test(pathname),
      hasGalleryWord: /\/(gallery|pictures|photos|images)\//i.test(pathname),
      hasLongSlug: segments.length > 0 && segments[segments.length - 1].length > 30,
      endsWithNumber: /\/\d+$/.test(pathname),
      firstSegment: segments[0] || null,
      lastSegment: segments[segments.length - 1] || null
    };
  } catch {
    return null;
  }
}

function inferClassification(url, signals) {
  // High-confidence article indicators
  if (signals.hasDate && signals.hasLongSlug) return { inferred: 'article', reason: 'date+long-slug' };
  if (signals.hasArticleWord) return { inferred: 'article', reason: 'article-keyword' };
  if (signals.hasDate && signals.pathDepth >= 4) return { inferred: 'article', reason: 'date+deep-path' };
  
  // High-confidence hub indicators
  if (signals.hasHubWord) return { inferred: 'hub', reason: 'hub-keyword' };
  if (signals.pathDepth === 1) return { inferred: 'hub', reason: 'shallow-path' };
  
  // Video/gallery are typically not articles
  if (signals.hasVideoWord) return { inferred: 'video', reason: 'video-keyword' };
  if (signals.hasGalleryWord) return { inferred: 'gallery', reason: 'gallery-keyword' };
  
  // Ambiguous
  if (signals.pathDepth >= 3 && signals.hasLongSlug) return { inferred: 'likely-article', reason: 'deep-path+long-slug' };
  
  return { inferred: 'unknown', reason: 'no-clear-signals' };
}

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

// Main
async function main() {
  let db;
  try {
    db = openNewsCrawlerDb(dbPath, { readonly: true });
  } catch (err) {
    console.error(`Failed to open database: ${err.message}`);
    process.exit(1);
  }

  try {
    const getStats = getDbApi('getUrlClassificationExportStats');
    const listExportRows = getDbApi('listUrlClassificationExportRows');

    // Get total counts first
    const stats = getStats(db);

    if (!flags.json) {
      console.log('\n=== Database Classification Stats ===');
      console.log(`Total URLs: ${stats.total_urls}`);
      console.log(`  article: ${stats.article_count}`);
      console.log(`  hub: ${stats.hub_count}`);
      console.log(`  nav: ${stats.nav_count}`);
      console.log(`  null: ${stats.null_count}`);
      console.log('');
    }

    const urls = listExportRows(db, {
      sample: flags.sample,
      host: flags.host,
      unclassified: flags.unclassified,
      stratified: flags.stratified
    });

    // Analyze each URL
    const results = urls.map(row => {
      const signals = analyzeUrlSignals(row.url);
      const inference = signals ? inferClassification(row.url, signals) : { inferred: 'error', reason: 'parse-failed' };
      
      const match = row.classification === inference.inferred || 
                    (row.classification === 'article' && inference.inferred === 'likely-article');
      
      const result = {
        id: row.id,
        url: row.url,
        host: row.host,
        dbClassification: row.classification || 'null',
        wordCount: row.word_count,
        contentSize: row.content_size,
        httpStatus: row.http_status,
        inferredType: inference.inferred,
        inferenceReason: inference.reason,
        classificationMatch: match ? 'YES' : 'MISMATCH'
      };

      if (flags.showSignals && signals) {
        result.signals = signals;
      }

      return result;
    });

    // Compute accuracy stats
    const articleUrls = results.filter(r => r.dbClassification === 'article');
    const hubUrls = results.filter(r => r.dbClassification === 'hub');
    const mismatches = results.filter(r => r.classificationMatch === 'MISMATCH');

    if (flags.json) {
      console.log(JSON.stringify({
        stats,
        sampleSize: results.length,
        articleCount: articleUrls.length,
        hubCount: hubUrls.length,
        mismatchCount: mismatches.length,
        mismatches: mismatches.slice(0, 20),  // First 20 mismatches
        urls: results
      }, null, 2));
    } else {
      console.log(`=== Sample of ${results.length} URLs ===\n`);
      
      // Summary
      console.log(`Classification breakdown:`);
      console.log(`  article: ${articleUrls.length}`);
      console.log(`  hub: ${hubUrls.length}`);
      console.log(`  Mismatches (DB vs URL inference): ${mismatches.length}\n`);

      // Show mismatches first (most interesting for verification)
      if (mismatches.length > 0) {
        console.log(`\n=== MISMATCHES (Review These) ===\n`);
        for (const m of mismatches.slice(0, 30)) {
          console.log(`URL: ${m.url}`);
          console.log(`  DB says: ${m.dbClassification} | URL pattern says: ${m.inferredType} (${m.inferenceReason})`);
          console.log(`  Word count: ${m.wordCount}, Size: ${m.contentSize} bytes`);
          console.log('');
        }
      }

      // Show sample of articles
      console.log(`\n=== Sample ARTICLES ===\n`);
      for (const a of articleUrls.slice(0, 20)) {
        const marker = a.classificationMatch === 'YES' ? '✓' : '✗';
        console.log(`${marker} ${a.url}`);
        console.log(`   Words: ${a.wordCount}, Inferred: ${a.inferredType} (${a.inferenceReason})`);
      }

      // Show sample of hubs if any
      if (hubUrls.length > 0) {
        console.log(`\n=== Sample HUBS ===\n`);
        for (const h of hubUrls.slice(0, 10)) {
          const marker = h.classificationMatch === 'YES' ? '✓' : '✗';
          console.log(`${marker} ${h.url}`);
          console.log(`   Words: ${h.wordCount}, Inferred: ${h.inferredType} (${h.inferenceReason})`);
        }
      }
    }

  } finally {
    await closeDb(db);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
