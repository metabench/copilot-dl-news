#!/usr/bin/env node

/**
 * export-pages - Export successfully downloaded pages to a new minimal database
 *
 * Usage:
 *   node tools/export-pages.js [options]
 *
 * Options:
 *   --output-file <file>     Output database file (default: exported-pages.db)
 *   --extraction-mode <mode> Content extraction mode: raw, article-plus (default: raw)
 *   --compression-method <method>  Compression method: none, gzip, brotli (default: brotli)
 *   --compression-level <N>  Compression level (default: 11 for brotli, 9 for gzip)
 *   --window-bits <N>        Brotli window size in bits (default: 24, max 16MB)
 *   --help, -h               Show this help message
 *
 * Examples:
 *   node tools/export-pages.js
 *   node tools/export-pages.js --output-file my-export.db --extraction-mode article-plus --compression-method brotli --compression-level 11 --window-bits 24
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const { Worker } = require('worker_threads');
const { openDatabase } = require('../src/db/sqlite/v1/connection');
const { decompress } = require('../src/utils/compression');
const { HtmlArticleExtractor } = require('../src/utils/HtmlArticleExtractor');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',  // Orange/amber color
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m'
};

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ${Math.round(seconds%60)}s`;
  return `${Math.floor(seconds/3600)}h ${Math.floor((seconds%3600)/60)}m`;
}

function debug(message) {
  if (verbose) {
    console.log(`${colors.yellow}[DEBUG] ${message}${colors.reset}`);
  }
}

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Export Pages Tool

Exports all successfully downloaded pages from the database to a new minimal SQLite database.
Only includes the most recent version of each page (deduplicated by URL) and excludes error data.

USAGE:
  node tools/export-pages.js [options]

OPTIONS:
  --output-file <file>        Output database file (default: exported-pages.db)
  --extraction-mode <mode>    Content extraction mode: raw, article-plus (default: raw)
  --compression-method <method>  Compression method: none, gzip, brotli (default: brotli)
  --compression-level <N>     Compression level (0-9 for gzip, 0-11 for brotli, default: 11)
  --window-bits <N>           Brotli window size in bits (10-30, default: 24)
  --threads <N>               Number of compression threads (default: CPU count)
  --worker-batch-size <N>     Articles per worker batch (default: 10)
  --limit <N>                 Limit number of articles to export (for testing)
  --verbose                   Enable verbose debug output
  --help, -h                  Show this help message

EXAMPLES:
  node tools/export-pages.js
  node tools/export-pages.js --output-file my-export.db
  node tools/export-pages.js --extraction-mode article-plus --compression-method brotli --compression-level 11 --window-bits 24
  node tools/export-pages.js --extraction-mode article-plus --compression-method brotli --compression-level 11 --window-bits 30 --threads 24
  node tools/export-pages.js --extraction-mode raw --compression-method gzip --compression-level 9
  node tools/export-pages.js --extraction-mode raw --compression-method none

SCHEMA:
  The exported database contains:
  - articles table: id, url, canonical_url, host, title, date, section, html, crawled_at
  - compression_types table: id, name, level, window_bits
  - Indexes on url, canonical_url, host, crawled_at
  - If article-plus mode: extracted_text, word_count, metadata, extraction_success columns
  - If compressing: compressed_html, compression_type_id, original_size, compressed_size, compression_ratio columns
`);
  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);

let outputFile = 'exported-pages.db';
let extractionMode = 'raw';
let compressionMethod = 'brotli';
let compressionLevel = 11;
let windowBits = 24;
let limit = null;
let threads = os.cpus().length;
let workerBatchSize = 10;
let verbose = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];

  switch (arg) {
    case '--output-file':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --output-file requires a value');
        process.exit(1);
      }
      outputFile = nextArg;
      i++;
      break;
    case '--extraction-mode':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --extraction-mode requires a value (raw, article-plus)');
        process.exit(1);
      }
      if (!['raw', 'article-plus'].includes(nextArg)) {
        console.error('Error: --extraction-mode must be raw or article-plus');
        process.exit(1);
      }
      extractionMode = nextArg;
      i++;
      break;
    case '--compression-method':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --compression-method requires a value (none, gzip, brotli)');
        process.exit(1);
      }
      if (!['none', 'gzip', 'brotli'].includes(nextArg)) {
        console.error('Error: --compression-method must be none, gzip, or brotli');
        process.exit(1);
      }
      compressionMethod = nextArg;
      i++;
      break;
    case '--compression-level':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --compression-level requires a numeric value');
        process.exit(1);
      }
      compressionLevel = parseInt(nextArg, 10);
      if (isNaN(compressionLevel) || compressionLevel < 0) {
        console.error('Error: --compression-level must be a non-negative integer');
        process.exit(1);
      }
      if (compressionMethod === 'gzip' && compressionLevel > 9) {
        console.error('Error: gzip compression level must be 0-9');
        process.exit(1);
      }
      if (compressionMethod === 'brotli' && compressionLevel > 11) {
        console.error('Error: brotli compression level must be 0-11');
        process.exit(1);
      }
      i++;
      break;
    case '--window-bits':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --window-bits requires a numeric value');
        process.exit(1);
      }
      windowBits = parseInt(nextArg, 10);
      if (isNaN(windowBits) || windowBits < 10 || windowBits > 30) {
        console.error('Error: --window-bits must be 10-30');
        process.exit(1);
      }
      i++;
      break;
    case '--limit':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --limit requires a numeric value');
        process.exit(1);
      }
      limit = parseInt(nextArg, 10);
      if (isNaN(limit) || limit < 1) {
        console.error('Error: --limit must be a positive integer');
        process.exit(1);
      }
      i++;
      break;
    case '--threads':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --threads requires a numeric value');
        process.exit(1);
      }
      threads = parseInt(nextArg, 10);
      if (isNaN(threads) || threads < 1) {
        console.error('Error: --threads must be a positive integer');
        process.exit(1);
      }
      i++;
      break;
    case '--worker-batch-size':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --worker-batch-size requires a numeric value');
        process.exit(1);
      }
      workerBatchSize = parseInt(nextArg, 10);
      if (isNaN(workerBatchSize) || workerBatchSize < 1) {
        console.error('Error: --worker-batch-size must be a positive integer');
        process.exit(1);
      }
      i++;
      break;
    case '--verbose':
      verbose = true;
      break;
    default:
      if (arg.startsWith('--')) {
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
      } else {
        console.error(`Unexpected argument: ${arg}`);
        process.exit(1);
      }
  }
}

// Validate compression settings
if (compressionMethod === 'none') {
  compressionLevel = 0;
} else if (compressionMethod === 'gzip' && compressionLevel > 9) {
  console.error('Error: gzip compression level must be 0-9');
  process.exit(1);
} else if (compressionMethod === 'brotli' && compressionLevel > 11) {
  console.error('Error: brotli compression level must be 0-11');
  process.exit(1);
}

console.log(`Exporting pages to: ${outputFile}`);
console.log(`Extraction mode: ${extractionMode}`);
console.log(`Compression: ${compressionMethod}${compressionMethod !== 'none' ? ` (level ${compressionLevel})` : ''}`);
if (compressionMethod === 'brotli') {
  console.log(`Brotli window size: ${windowBits} bits (${Math.pow(2, windowBits)} bytes)`);
}
console.log(`Threads: ${threads} compression threads, ${workerBatchSize} articles per batch`);

// Run the export process
runExport().catch(error => {
  console.error('Export failed:', error.message);
  process.exit(1);
});

async function runExport() {
  // Initialize source database (read-only, existing)
  const sourceDbPath = path.join(__dirname, '..', 'data', 'news.db');
  if (!fs.existsSync(sourceDbPath)) {
    console.error(`Error: Source database not found: ${sourceDbPath}`);
    process.exit(1);
  }

  const sourceDb = openDatabase(sourceDbPath, { readonly: true, fileMustExist: true });

  // Check if required tables exist (normalized schema)
  const requiredTables = ['urls', 'http_responses', 'content_storage', 'content_analysis'];
  for (const table of requiredTables) {
    const exists = sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) {
      console.error(`Error: Required table '${table}' not found in source database`);
      process.exit(1);
    }
  }

  // Count total articles (successful downloads with content)
  const totalCount = sourceDb.prepare(`
    SELECT COUNT(*) as count
    FROM urls u
    INNER JOIN http_responses hr ON hr.url_id = u.id
    INNER JOIN content_storage cs ON cs.http_response_id = hr.id
    WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
  `).get().count;
  console.log(`Found ${totalCount} articles with content in source database`);

  // Get most recent article per URL (normalized schema) - ensure uniqueness
  const articlesQuery = `
    SELECT DISTINCT
      u.id,
      u.url,
      u.canonical_url,
      u.host,
      ca.title,
      ca.date,
      ca.section,
      cs.content_blob AS html,
      ct.algorithm AS compression_algorithm,
      hr.fetched_at AS crawled_at
    FROM urls u
    INNER JOIN http_responses hr ON hr.url_id = u.id
    INNER JOIN content_storage cs ON cs.http_response_id = hr.id
    INNER JOIN compression_types ct ON cs.compression_type_id = ct.id
    INNER JOIN content_analysis ca ON ca.content_id = cs.id
    INNER JOIN (
      SELECT u2.url, MAX(hr2.fetched_at) as max_crawled
      FROM urls u2
      INNER JOIN http_responses hr2 ON hr2.url_id = u2.id
      INNER JOIN content_storage cs2 ON cs2.http_response_id = hr2.id
      WHERE hr2.http_status = 200 AND cs2.content_blob IS NOT NULL
      GROUP BY u2.url
    ) latest ON u.url = latest.url AND hr.fetched_at = latest.max_crawled
    WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
    ORDER BY hr.fetched_at DESC
  `;

  // Get articles in chunks to avoid memory issues
  const getArticlesChunk = (offset, chunkSize) => {
    const query = articlesQuery + ` LIMIT ${chunkSize} OFFSET ${offset}`;
    return sourceDb.prepare(query).all();
  };

  // Count total articles for progress tracking
  const totalArticles = sourceDb.prepare(`
    SELECT COUNT(*) as count
    FROM urls u
    INNER JOIN http_responses hr ON hr.url_id = u.id
    INNER JOIN content_storage cs ON cs.http_response_id = hr.id
    WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
  `).get().count;

  const articlesToProcess = limit || totalArticles;
  console.log(`Will process ${articlesToProcess} articles in chunks to avoid memory issues`);

  // Process articles in chunks
  const chunkSize = 1000; // Process 1000 articles at a time
  let processedTotal = 0;

  // Create output database (new empty database)
  const outputDbPath = path.resolve(outputFile);

  // Delete existing file if it exists
  if (fs.existsSync(outputDbPath)) {
    console.log(`Removing existing output file: ${outputFile}`);
    fs.unlinkSync(outputDbPath);
  }

  const outputDb = openDatabase(outputDbPath, { readonly: false, fileMustExist: false });

  // Create minimal schema
  console.log('Creating minimal schema...');

  const schemaSQL = `
    CREATE TABLE articles (
      id INTEGER PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      canonical_url TEXT,
      host TEXT,
      title TEXT,
      date TEXT,
      section TEXT,
      html BLOB,
      crawled_at TEXT NOT NULL
    );

    CREATE TABLE compression_types (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      level INTEGER,
      window_bits INTEGER
    );

    CREATE INDEX idx_articles_url ON articles(url);
    CREATE INDEX idx_articles_canonical ON articles(canonical_url);
    CREATE INDEX idx_articles_host ON articles(host);
    CREATE INDEX idx_articles_crawled_at ON articles(crawled_at);
  `;

  outputDb.exec(schemaSQL);

  // Add ArticlePlus columns if using article-plus extraction
  if (extractionMode === 'article-plus') {
    console.log('Adding ArticlePlus extraction columns to schema...');

    outputDb.exec(`
      ALTER TABLE articles ADD COLUMN extracted_text TEXT;
      ALTER TABLE articles ADD COLUMN word_count INTEGER;
      ALTER TABLE articles ADD COLUMN metadata TEXT;
      ALTER TABLE articles ADD COLUMN extraction_success BOOLEAN;
    `);
  }

  // Add compression columns if compressing
  let compressionTypeId = null;
  if (compressionMethod !== 'none') {
    console.log('Adding compression columns to schema...');

    outputDb.exec(`
      ALTER TABLE articles ADD COLUMN compressed_html BLOB;
      ALTER TABLE articles ADD COLUMN compression_type_id INTEGER REFERENCES compression_types(id);
      ALTER TABLE articles ADD COLUMN original_size INTEGER;
      ALTER TABLE articles ADD COLUMN compressed_size INTEGER;
      ALTER TABLE articles ADD COLUMN compression_ratio REAL;
    `);

    // Insert compression type
    const insertCompressionType = outputDb.prepare(`
      INSERT INTO compression_types (name, level, window_bits)
      VALUES (?, ?, ?)
    `);
    insertCompressionType.run(compressionMethod, compressionLevel, compressionMethod === 'brotli' ? windowBits : null);
    compressionTypeId = outputDb.prepare('SELECT last_insert_rowid() as id').get().id;
  }

  // Prepare insert statement
  const insertArticle = outputDb.prepare(`
    INSERT INTO articles (
      url, canonical_url, host, title, date, section, html, crawled_at
      ${extractionMode === 'article-plus' ? ', extracted_text, word_count, metadata, extraction_success' : ''}
      ${compressionMethod !== 'none' ? ', compressed_html, compression_type_id, original_size, compressed_size, compression_ratio' : ''}
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?
      ${extractionMode === 'article-plus' ? ', ?, ?, ?, ?' : ''}
      ${compressionMethod !== 'none' ? ', ?, ?, ?, ?, ?' : ''}
    )
  `);

// Create worker pool for parallel compression
function createWorkerPool(size) {
  const workers = [];
  for (let i = 0; i < size; i++) {
    const worker = new Worker(path.join(__dirname, 'compression-worker.js'));
    worker.workerId = i + 1; // Assign worker ID (1-based)
    worker.isProcessing = false;
    workers.push(worker);
  }
  return workers;
}  // Process a batch of articles through worker threads
  async function processBatchWithWorkers(batch, workers) {
    return new Promise((resolve, reject) => {
      // Find available worker
      const worker = workers.find(w => !w.isProcessing);
      if (!worker) {
        reject(new Error('No available workers'));
        return;
      }

      worker.isProcessing = true;

      // Set up timeout (5 minutes per batch)
      const timeout = setTimeout(() => {
        worker.isProcessing = false;
        reject(new Error(`Worker timeout after 5 minutes for batch of ${batch.length} articles`));
      }, 5 * 60 * 1000);

      // Handle worker response
      const messageHandler = (message) => {
        clearTimeout(timeout);
        worker.isProcessing = false;
        worker.removeListener('message', messageHandler);
        worker.removeListener('error', errorHandler);

        if (message.success) {
          resolve(message.results);
        } else {
          reject(new Error(`Worker error: ${message.error}`));
        }
      };

      const errorHandler = (error) => {
        clearTimeout(timeout);
        worker.isProcessing = false;
        worker.removeListener('message', messageHandler);
        worker.removeListener('error', errorHandler);
        reject(error);
      };

      worker.on('message', messageHandler);
      worker.on('error', errorHandler);

      // Send batch to worker
      worker.postMessage({
        workerId: worker.workerId,
        articles: batch,
        extractionMode,
        compressionMethod,
        compressionLevel,
        windowBits
      });
    });
  }

  // Terminate all workers
  function terminateWorkers(workers) {
    for (const worker of workers) {
      worker.terminate();
    }
  }

// Compress and insert articles
console.log('Exporting articles...');

const workers = createWorkerPool(threads);
let processed = 0;
const batchSize = workerBatchSize;
const startTime = Date.now();

  // Process a chunk of articles with concurrency control
  async function processArticlesChunk(articles) {
    const promises = [];
    let batchIndex = 0;

    // Launch initial batches (up to number of workers) - don't await, launch in parallel
    while (batchIndex < articles.length && promises.length < threads) {
      launchBatch(batchIndex, articles, promises);
      batchIndex += batchSize;
    }

    // Wait for batches to complete and launch more as workers become available
    while (promises.length > 0) {
      await Promise.race(promises);
      // Remove completed promises
      const remainingPromises = [];
      for (const p of promises) {
        if (!p.isSettled) {
          remainingPromises.push(p);
        }
      }
      promises.length = 0;
      promises.push(...remainingPromises);

      // Launch next batch if available
      if (batchIndex < articles.length) {
        launchBatch(batchIndex, articles, promises);
        batchIndex += batchSize;
      }
    }
  }

  const launchBatch = async (startIndex, articles, promises) => {
    const batch = articles.slice(startIndex, startIndex + batchSize);

    // Launch batch processing (decompression now happens in worker threads)
    const promise = processBatchWithWorkers(batch, workers).then((compressedBatch) => {
      // Insert compressed results
      outputDb.transaction(() => {
        for (const result of compressedBatch) {
          try {
            if (compressionMethod !== 'none' && result.success) {
              insertArticle.run(
                result.url, result.canonical_url, result.host,
                result.title, result.date, result.section, result.html, result.crawled_at,  // html kept for reference
                ...(extractionMode === 'article-plus' ? [result.extractedText, result.wordCount, result.metadata, result.extractionSuccess] : []),
                result.compressedHtml, compressionTypeId, result.originalSize, result.compressedSize, result.compressionRatio
              );
            } else {
              insertArticle.run(
                result.url, result.canonical_url, result.host,
                result.title, result.date, result.section, result.html, result.crawled_at,
                ...(extractionMode === 'article-plus' ? [result.extractedText, result.wordCount, result.metadata, result.extractionSuccess] : [])
              );
            }
          } catch (error) {
            console.warn(`Warning: Failed to insert article ${result.id}: ${error.message}`);
          }
        }
      })();

      processed += batch.length;
      processedTotal += batch.length;
      const now = Date.now();
      const totalElapsed = (now - startTime) / 1000;
      const overallRate = processedTotal / totalElapsed;
      const remaining = articlesToProcess - processedTotal;
      const eta = remaining / overallRate;
      const progress = Math.round(processedTotal/articlesToProcess*100);

      console.log(`✓ ${processedTotal}/${articlesToProcess} (${progress}%) | ${overallRate.toFixed(1)}/s overall | ETA: ${formatTime(eta)}`);
    });

    // Mark promise as not settled initially
    promise.isSettled = false;
    promise.then(() => { promise.isSettled = true; }, () => { promise.isSettled = true; });

    promises.push(promise);
  };

try {
  // Process articles in chunks
  for (let offset = 0; offset < articlesToProcess; offset += chunkSize) {
    const chunkLimit = Math.min(chunkSize, articlesToProcess - offset);
    console.log(`Processing chunk ${Math.floor(offset/chunkSize) + 1}: articles ${offset + 1}-${offset + chunkLimit}`);

    const articles = getArticlesChunk(offset, chunkLimit);
    console.log(`Loaded ${articles.length} articles from database`);

    // Process this chunk with concurrency control
    await processArticlesChunk(articles);
  }
} finally {
  terminateWorkers(workers);
}
  const exportedCount = outputDb.prepare('SELECT COUNT(*) as count FROM articles').get().count;
  console.log(`\n✓ Export completed successfully`);
  console.log(`📊 Exported ${exportedCount} articles to ${outputFile}`);
  console.log(`📁 File saved to: ${outputDbPath}`);

  if (extractionMode === 'article-plus') {
    const extractionStats = outputDb.prepare(`
      SELECT
        COUNT(*) as total_articles,
        SUM(CASE WHEN extraction_success = 1 THEN 1 ELSE 0 END) as successful_extractions,
        AVG(word_count) as avg_word_count,
        SUM(word_count) as total_words
      FROM articles
      WHERE extraction_success IS NOT NULL
    `).get();

    if (extractionStats.total_articles > 0) {
      const successRate = (extractionStats.successful_extractions / extractionStats.total_articles * 100).toFixed(1);
      console.log(`📝 ArticlePlus extraction stats:`);
      console.log(`   Success rate: ${successRate}% (${extractionStats.successful_extractions}/${extractionStats.total_articles})`);
      console.log(`   Average word count: ${extractionStats.avg_word_count?.toFixed(0) || 'N/A'}`);
      console.log(`   Total words extracted: ${extractionStats.total_words?.toLocaleString() || 'N/A'}`);
    }
  }

  if (compressionMethod !== 'none') {
    const compressionStats = outputDb.prepare(`
      SELECT
        AVG(compression_ratio) as avg_ratio,
        MIN(compression_ratio) as min_ratio,
        MAX(compression_ratio) as max_ratio,
        SUM(original_size) as total_original,
        SUM(compressed_size) as total_compressed
      FROM articles
      WHERE compressed_html IS NOT NULL
    `).get();

    if (compressionStats.total_original > 0) {
      const overallRatio = compressionStats.total_original / compressionStats.total_compressed;
      console.log(`🗜️  Compression stats:`);
      console.log(`   Average ratio: ${compressionStats.avg_ratio?.toFixed(2) || 'N/A'}`);
      console.log(`   Best ratio: ${compressionStats.min_ratio?.toFixed(2) || 'N/A'}`);
      console.log(`   Worst ratio: ${compressionStats.max_ratio?.toFixed(2) || 'N/A'}`);
      console.log(`   Overall ratio: ${overallRatio.toFixed(2)}`);
      console.log(`   Space saved: ${((1 - 1/overallRatio) * 100).toFixed(1)}%`);
    }
  }

  // Close databases
  sourceDb.close();
  outputDb.close();

  console.log('\n🎉 Export complete!');
}