#!/usr/bin/env node
'use strict';

/**
 * Backfill body_text, byline, and authors columns for FTS5 indexing
 * 
 * This script:
 *   1. Finds articles with analysis_json but no body_text
 *   2. Extracts text from stored HTML using Readability
 *   3. Extracts authors using HtmlArticleExtractor
 *   4. Updates content_analysis with body_text, byline, authors
 * 
 * Usage:
 *   node tools/fts-backfill.js [--limit 1000] [--batch-size 100] [--dry-run]
 */

const Database = require('better-sqlite3');
const path = require('path');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  limit: 10000,
  batchSize: 100,
  dryRun: false,
  verbose: false,
  dbPath: path.join(__dirname, '..', 'data', 'news.db')
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--batch-size' && args[i + 1]) {
    options.batchSize = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--dry-run') {
    options.dryRun = true;
  } else if (args[i] === '--verbose' || args[i] === '-v') {
    options.verbose = true;
  } else if (args[i] === '--db' && args[i + 1]) {
    options.dbPath = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
FTS5 Backfill Tool

Populates body_text, byline, and authors columns for full-text search indexing.

Usage:
  node tools/fts-backfill.js [options]

Options:
  --limit <n>       Maximum articles to process (default: 10000)
  --batch-size <n>  Articles per batch (default: 100)
  --dry-run         Show what would be done without making changes
  --verbose, -v     Verbose output
  --db <path>       Database path (default: data/news.db)
  --help, -h        Show this help
    `);
    process.exit(0);
  }
}

// Open database
const db = new Database(options.dbPath);
db.pragma('journal_mode = WAL');

// Check if required columns exist
const columns = db.pragma('table_info(content_analysis)');
const columnNames = columns.map(c => c.name);
const requiredColumns = ['body_text', 'byline', 'authors'];
const missingColumns = requiredColumns.filter(c => !columnNames.includes(c));

if (missingColumns.length > 0) {
  console.error(`Missing columns in content_analysis: ${missingColumns.join(', ')}`);
  console.error('Run the migration first: npm run db:migrate');
  process.exit(1);
}

// Prepare statements
const getArticlesNeedingBackfill = db.prepare(`
  SELECT 
    ca.id,
    ca.content_id,
    ca.title,
    ca.analysis_json,
    u.url,
    cs.content_blob,
    cs.storage_type,
    ct.algorithm AS compression_algorithm
  FROM content_analysis ca
  JOIN content_storage cs ON ca.content_id = cs.id
  JOIN http_responses hr ON cs.http_response_id = hr.id
  JOIN urls u ON hr.url_id = u.id
  LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
  WHERE ca.body_text IS NULL
    AND cs.content_blob IS NOT NULL
  ORDER BY ca.id
  LIMIT ?
`);

const updateArticle = db.prepare(`
  UPDATE content_analysis
  SET body_text = ?,
      byline = ?,
      authors = ?
  WHERE id = ?
`);

/**
 * Extract text from HTML using Readability
 */
function extractText(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    dom.window.close();
    
    if (!article || !article.textContent) {
      return { text: null, byline: null };
    }
    
    return {
      text: article.textContent.trim().replace(/\s+/g, ' '),
      byline: article.byline || null
    };
  } catch (err) {
    return { text: null, byline: null, error: err.message };
  }
}

/**
 * Extract authors from HTML
 */
function extractAuthors(html, url) {
  try {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    const authors = [];

    // Extract from JSON-LD
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const articles = Array.isArray(data) ? data : [data];
        for (const item of articles) {
          if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle') {
            if (item.author) {
              const articleAuthors = Array.isArray(item.author) ? item.author : [item.author];
              for (const author of articleAuthors) {
                if (typeof author === 'string') {
                  authors.push(author);
                } else if (author.name) {
                  authors.push(author.name);
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    // Extract from meta tags
    const metaSelectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="DC.creator"]'
    ];

    for (const selector of metaSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const content = element.getAttribute('content');
        if (content) {
          authors.push(...content.split(/[,;&]/).map(s => s.trim()).filter(s => s));
        }
      }
    }

    dom.window.close();

    // Deduplicate
    const uniqueAuthors = [...new Set(authors.map(a => a.toLowerCase()))];
    return uniqueAuthors.slice(0, 10); // Limit to 10 authors
  } catch (err) {
    return [];
  }
}

/**
 * Decompress content if needed
 */
function decompressContent(blob, algorithm) {
  if (!blob) return null;
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  
  if (!algorithm || algorithm === 'none') {
    return buffer.toString('utf8');
  }

  try {
    const zlib = require('zlib');
    if (algorithm === 'gzip') {
      return zlib.gunzipSync(buffer).toString('utf8');
    } else if (algorithm === 'brotli') {
      return zlib.brotliDecompressSync(buffer).toString('utf8');
    } else if (algorithm === 'deflate') {
      return zlib.inflateSync(buffer).toString('utf8');
    }
  } catch (err) {
    // Try as raw text
    return buffer.toString('utf8');
  }
  
  return buffer.toString('utf8');
}

// Main backfill logic
async function run() {
  console.log('FTS5 Backfill Tool');
  console.log('==================');
  console.log(`Database: ${options.dbPath}`);
  console.log(`Limit: ${options.limit}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log();

  const startTime = Date.now();
  let processed = 0;
  let updated = 0;
  let errors = 0;

  const articles = getArticlesNeedingBackfill.all(options.limit);
  console.log(`Found ${articles.length} articles needing backfill`);

  if (articles.length === 0) {
    console.log('Nothing to do.');
    db.close();
    return;
  }

  // Process in batches
  for (let i = 0; i < articles.length; i += options.batchSize) {
    const batch = articles.slice(i, i + options.batchSize);
    const batchStart = Date.now();

    const updates = [];

    for (const article of batch) {
      processed++;

      try {
        // Decompress content
        const html = decompressContent(article.content_blob, article.compression_algorithm);
        if (!html) {
          if (options.verbose) {
            console.log(`  [${article.id}] No HTML content`);
          }
          continue;
        }

        // Extract text and byline
        const extraction = extractText(html, article.url);
        if (!extraction.text) {
          if (options.verbose) {
            console.log(`  [${article.id}] Failed to extract text`);
          }
          continue;
        }

        // Extract authors
        const authors = extractAuthors(html, article.url);

        updates.push({
          id: article.id,
          body_text: extraction.text,
          byline: extraction.byline,
          authors: authors.length > 0 ? JSON.stringify(authors) : null
        });
      } catch (err) {
        errors++;
        if (options.verbose) {
          console.log(`  [${article.id}] Error: ${err.message}`);
        }
      }
    }

    // Apply updates in a transaction
    if (updates.length > 0 && !options.dryRun) {
      const updateTx = db.transaction((rows) => {
        for (const row of rows) {
          updateArticle.run(row.body_text, row.byline, row.authors, row.id);
        }
      });
      updateTx(updates);
      updated += updates.length;
    } else {
      updated += updates.length; // Count for dry run
    }

    const batchMs = Date.now() - batchStart;
    const progress = Math.round((i + batch.length) / articles.length * 100);
    console.log(`  Batch ${Math.floor(i / options.batchSize) + 1}: ${updates.length} updates (${batchMs}ms) [${progress}%]`);
  }

  const totalMs = Date.now() - startTime;

  console.log();
  console.log('Summary');
  console.log('-------');
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Duration: ${totalMs}ms`);
  console.log(`Rate: ${Math.round(processed / (totalMs / 1000))} articles/sec`);

  if (options.dryRun) {
    console.log();
    console.log('(Dry run - no changes made)');
  }

  db.close();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
