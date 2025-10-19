#!/usr/bin/env node

/**
 * compression-benchmark.js - Benchmark compression/decompression performance
 *
 * Compresses articles with specified settings and measures decompression time,
 * then estimates total time to process the entire dataset.
 *
 * Usage:
 *   node tools/compression-benchmark.js [options]
 *
 * Options:
 *   --limit <N>          Number of articles to test (default: 1000)
 *   --algorithm <alg>    Compression algorithm: brotli, gzip, none (default: brotli)
 *   --level <N>          Compression level (default: 6 for brotli, 6 for gzip)
 *   --window-bits <N>    Brotli window size in bits (default: 22)
 *   --threads <N>        Number of worker threads (default: 1)
 *   --batch-size <N>     Articles per worker batch (default: 10)
 *   --verbose            Enable verbose output
 *   --help, -h           Show this help message
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const { openDatabase } = require('../src/db/sqlite/v1/connection');
const { compress, decompress } = require('../src/utils/compression');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTime(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(1)} μs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Compression-Decompression Benchmark Tool

Compresses articles with specified settings, measures decompression performance,
and estimates total time to process the entire dataset. Compares performance
against current database compression settings to help choose optimal compression.

USAGE:
  node tools/compression-benchmark.js [options]

OPTIONS:
  --limit <N>           Number of articles to test (default: 1000)
  --algorithm <alg>     Compression algorithm: brotli, gzip, none (default: brotli)
  --level <N>           Compression level (0-11 for brotli, 0-9 for gzip, default: 6)
  --window-bits <N>     Brotli window size in bits (10-24, default: 22)
  --threads <N>         Number of worker threads (default: 1)
  --batch-size <N>      Articles per worker batch (default: 10)
  --compare-levels <list> Compare multiple compression levels (e.g., "2,6,11")
  --verbose             Enable verbose output for each article
  --help, -h            Show this help message

EXAMPLES:
  node tools/compression-benchmark.js
  node tools/compression-benchmark.js --algorithm brotli --level 6
  node tools/compression-benchmark.js --algorithm brotli --level 11 --window-bits 24
  node tools/compression-benchmark.js --algorithm gzip --level 9
  node tools/compression-benchmark.js --threads 8 --batch-size 25 --limit 5000
  node tools/compression-benchmark.js --verbose --limit 100

OUTPUT:
  Shows compression ratios, decompression times, throughput rates, and estimates
  for processing the entire dataset. Includes comparison with current database
  compression and detailed storage impact estimates showing absolute space
  differences and percentage changes in storage requirements.
`);
  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);

let limit = 1000;
let algorithm = 'brotli';
let level = 6;
let windowBits = 22;
let threads = 1;
let batchSize = 10;
let verbose = false;
let compareLevels = null; // New: comma-separated list of levels to compare

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];

  switch (arg) {
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
    case '--algorithm':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --algorithm requires a value (brotli, gzip, none)');
        process.exit(1);
      }
      if (!['brotli', 'gzip', 'none'].includes(nextArg)) {
        console.error('Error: --algorithm must be brotli, gzip, or none');
        process.exit(1);
      }
      algorithm = nextArg;
      i++;
      break;
    case '--level':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --level requires a numeric value');
        process.exit(1);
      }
      level = parseInt(nextArg, 10);
      if (isNaN(level) || level < 0) {
        console.error('Error: --level must be a non-negative integer');
        process.exit(1);
      }
      if (algorithm === 'gzip' && level > 9) {
        console.error('Error: gzip compression level must be 0-9');
        process.exit(1);
      }
      if (algorithm === 'brotli' && level > 11) {
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
      if (isNaN(windowBits) || windowBits < 10 || windowBits > 24) {
        console.error('Error: --window-bits must be 10-24');
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
    case '--batch-size':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --batch-size requires a numeric value');
        process.exit(1);
      }
      batchSize = parseInt(nextArg, 10);
      if (isNaN(batchSize) || batchSize < 1) {
        console.error('Error: --batch-size must be a positive integer');
        process.exit(1);
      }
      i++;
      break;
    case '--compare-levels':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --compare-levels requires a comma-separated list of levels (e.g., "2,6,11")');
        process.exit(1);
      }
      compareLevels = nextArg.split(',').map(l => parseInt(l.trim(), 10));
      for (const lvl of compareLevels) {
        if (isNaN(lvl) || lvl < 0 || (algorithm === 'gzip' && lvl > 9) || (algorithm === 'brotli' && lvl > 11)) {
          console.error(`Error: Invalid level ${lvl} for ${algorithm}`);
          process.exit(1);
        }
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

// Set default level based on algorithm
if (algorithm === 'gzip' && level === 6) {
  level = 6; // gzip default
} else if (algorithm === 'brotli' && level === 6) {
  level = 6; // brotli default
}

console.log(`${colors.cyan}Compression-Decompression Benchmark${colors.reset}`);
if (compareLevels) {
  console.log(`Comparing ${algorithm} levels: ${compareLevels.join(', ')}`);
} else {
  console.log(`Testing ${limit} articles with ${algorithm}${algorithm !== 'none' ? ` level ${level}` : ''}`);
}
if (algorithm === 'brotli') {
  console.log(`Brotli window size: ${windowBits} bits (${Math.pow(2, windowBits)} bytes)`);
}
console.log(`Using ${threads} thread${threads !== 1 ? 's' : ''}, batch size ${batchSize}`);
console.log();

// Open database
const db = openDatabase('./data/news.db', { readonly: true, fileMustExist: true });

// Get total count of articles with content
const totalArticles = db.prepare(`
  SELECT COUNT(*) as count
  FROM urls u
  INNER JOIN http_responses hr ON hr.url_id = u.id
  INNER JOIN content_storage cs ON cs.http_response_id = hr.id
  WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
`).get().count;

console.log(`Database contains ${totalArticles.toLocaleString()} articles with content\n`);

// Build query to get articles (preferring uncompressed ones for fair comparison)
let query = `
  SELECT
    u.id as url_id,
    u.url,
    cs.content_blob,
    cs.uncompressed_size,
    ct.algorithm as original_algorithm,
    ct.level as original_level
  FROM urls u
  INNER JOIN http_responses hr ON hr.url_id = u.id
  INNER JOIN content_storage cs ON cs.http_response_id = hr.id
  INNER JOIN compression_types ct ON cs.compression_type_id = ct.id
  WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
`;

// Prefer uncompressed articles for fair comparison, but use any if needed
query += ` ORDER BY CASE WHEN ct.algorithm = 'none' THEN 0 ELSE 1 END, RANDOM() LIMIT ${limit}`;

const stmt = db.prepare(query);
const articles = stmt.all();

console.log(`Selected ${articles.length} articles for testing\n`);

// Decompress articles that are compressed (to get original HTML)
console.log('Preparing test data...');
for (let i = 0; i < articles.length; i++) {
  const article = articles[i];

  if (article.original_algorithm !== 'none') {
    try {
      const decompressed = decompress(article.content_blob, article.original_algorithm);
      article.original_html = decompressed.toString('utf8');
      article.uncompressed_size = decompressed.length;
    } catch (error) {
      console.warn(`Warning: Failed to decompress article ${article.url_id}: ${error.message}`);
      // Skip this article
      articles.splice(i, 1);
      i--;
      continue;
    }
  } else {
    article.original_html = article.content_blob.toString('utf8');
  }

  // Remove the compressed blob to save memory
  delete article.content_blob;
}

console.log(`Prepared ${articles.length} articles for compression testing\n`);

// Main benchmark execution
async function runComparisonBenchmark() {
  console.log(`${colors.magenta}COMPRESSION LEVEL COMPARISON${colors.reset}`);
  console.log(`Testing ${compareLevels.length} compression levels on the same ${limit} articles\n`);

  // Get current database compression settings
  const currentStats = db.prepare(`
    SELECT
      ct.algorithm as current_algorithm,
      ct.level as current_level,
      ct.window_bits as current_window_bits,
      COUNT(*) as current_count
    FROM content_storage cs
    JOIN compression_types ct ON cs.compression_type_id = ct.id
    GROUP BY ct.algorithm, ct.level, ct.window_bits
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `).get();

  if (currentStats) {
    console.log(`${colors.cyan}CURRENT DATABASE SETTINGS:${colors.reset}`);
    console.log(`  Algorithm: ${currentStats.current_algorithm}`);
    if (currentStats.current_algorithm !== 'none') {
      console.log(`  Level: ${currentStats.current_level}`);
      if (currentStats.current_algorithm === 'brotli') {
        console.log(`  Window size: ${currentStats.current_window_bits} bits`);
      }
    }
    console.log(`  Articles: ${currentStats.current_count.toLocaleString()}\n`);
  }

  const results = [];

  for (let i = 0; i < compareLevels.length; i++) {
    const testLevel = compareLevels[i];
    console.log(`${colors.yellow}Testing ${algorithm} level ${testLevel}...${colors.reset}`);

    // Run benchmark for this level
    const result = await runSingleBenchmark(testLevel);
    results.push({
      level: testLevel,
      ...result
    });

    console.log(); // Add spacing between tests
  }

  // Display comparison table
  displayComparisonTable(results, currentStats);

  return results;
}

async function runSingleBenchmark(testLevel) {
  // Extract the core benchmark logic into a separate function
  // This is a simplified version focusing on decompression metrics

  // Get articles (reuse the same dataset)
  const stmt = db.prepare(`
    SELECT
      u.id as url_id,
      u.url,
      cs.content_blob,
      cs.uncompressed_size,
      ct.algorithm as original_algorithm,
      ct.level as original_level
    FROM urls u
    INNER JOIN http_responses hr ON hr.url_id = u.id
    INNER JOIN content_storage cs ON cs.http_response_id = hr.id
    INNER JOIN compression_types ct ON cs.compression_type_id = ct.id
    WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
    ORDER BY RANDOM() LIMIT ${limit}
  `);

  const testArticles = stmt.all();

  // Decompress articles that are compressed
  for (let i = 0; i < testArticles.length; i++) {
    const article = testArticles[i];
    if (article.original_algorithm !== 'none') {
      try {
        const decompressed = decompress(article.content_blob, article.original_algorithm);
        article.original_html = decompressed.toString('utf8');
        article.uncompressed_size = decompressed.length;
      } catch (error) {
        console.warn(`Warning: Failed to decompress article ${article.url_id}: ${error.message}`);
        testArticles.splice(i, 1);
        i--;
        continue;
      }
    } else {
      article.original_html = article.content_blob.toString('utf8');
    }
    delete article.content_blob;
  }

  // Run compression/decompression test
  let totalDecompressionTime = 0;
  let successfulDecompressions = 0;
  let totalOriginalBytes = 0;
  let totalCompressedBytes = 0;

  const decompressionTimes = [];

  if (threads === 1) {
    // Single-threaded
    for (const article of testArticles) {
      const originalSize = article.uncompressed_size;
      totalOriginalBytes += originalSize;

      if (algorithm !== 'none') {
        try {
          const result = compress(article.original_html, {
            algorithm,
            level: testLevel,
            windowBits: algorithm === 'brotli' ? windowBits : undefined
          });

          const decompressionStart = process.hrtime.bigint();
          const decompressed = decompress(result.compressed, algorithm);
          const decompressionEnd = process.hrtime.bigint();
          const decompressionTimeMs = Number(decompressionEnd - decompressionStart) / 1_000_000;

          totalDecompressionTime += decompressionTimeMs;
          successfulDecompressions++;
          decompressionTimes.push(decompressionTimeMs);
          totalCompressedBytes += result.compressedSize;

        } catch (error) {
          // Skip failed articles
        }
      }
    }
  } else {
    // Multi-threaded (with proper concurrency control)
    const workers = [];
    for (let i = 0; i < threads; i++) {
      const worker = new Worker(path.join(__dirname, 'compression-benchmark-worker.js'));
      worker.workerId = i + 1;
      worker.isProcessing = false;
      workers.push(worker);
    }

    const processBatch = async (batch) => {
      return new Promise((resolve, reject) => {
        const worker = workers.find(w => !w.isProcessing);
        if (!worker) {
          reject(new Error('No available workers'));
          return;
        }

        worker.isProcessing = true;
        const timeout = setTimeout(() => {
          worker.isProcessing = false;
          reject(new Error(`Worker timeout`));
        }, 60 * 1000);

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

        worker.postMessage({
          workerId: worker.workerId,
          articles: batch,
          algorithm,
          level: testLevel,
          windowBits
        });
      });
    };

    // Process all articles in batches with concurrency control (same as single benchmark)
    const processAllBatches = async () => {
      const promises = [];
      let batchIndex = 0;

      // Launch initial batches (up to number of workers)
      while (batchIndex < testArticles.length && promises.length < threads) {
        const batch = testArticles.slice(batchIndex, batchIndex + batchSize);
        promises.push(processBatch(batch));
        batchIndex += batchSize;
      }

      // Wait for batches to complete and launch more
      while (promises.length > 0) {
        const results = await Promise.race(promises);
        // Remove completed promise
        const index = promises.findIndex(p => p === Promise.race(promises));
        promises.splice(index, 1);

        // Process results
        for (const result of results) {
          if (result.decompressionSuccess && algorithm !== 'none') {
            totalDecompressionTime += result.decompressionTime;
            successfulDecompressions++;
            decompressionTimes.push(result.decompressionTime);
            totalOriginalBytes += result.originalSize;
            totalCompressedBytes += result.compressedSize;
          }
        }

        // Launch next batch if available
        if (batchIndex < testArticles.length) {
          const batch = testArticles.slice(batchIndex, batchIndex + batchSize);
          promises.push(processBatch(batch));
          batchIndex += batchSize;
        }
      }
    };

    try {
      await processAllBatches();
    } finally {
      // Terminate workers
      for (const worker of workers) {
        worker.terminate();
      }
    }
  }

  const avgDecompressionTime = decompressionTimes.length > 0 ? totalDecompressionTime / decompressionTimes.length : 0;
  const compressionRatio = totalCompressedBytes > 0 ? totalOriginalBytes / totalCompressedBytes : 1;
  const spaceSaved = ((1 - 1/compressionRatio) * 100);

  return {
    avgDecompressionTime,
    compressionRatio,
    spaceSaved,
    totalOriginalBytes,
    totalCompressedBytes,
    successfulDecompressions,
    articleCount: testArticles.length
  };
}

function displayComparisonTable(results, currentStats) {
  console.log(`${colors.cyan}DECOMPRESSION COMPARISON RESULTS${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(100)}${colors.reset}`);
  console.log();

  // Header
  console.log(`${colors.yellow}Level${colors.reset} | ${colors.yellow}Avg Decomp${colors.reset} | ${colors.yellow}Compression${colors.reset} | ${colors.yellow}Space Saved${colors.reset} | ${colors.yellow}Articles/sec${colors.reset} | ${colors.yellow}MB/s${colors.reset} | ${colors.yellow}Total MB/s${colors.reset}`);
  console.log(`${'-'.repeat(5)}|${'-'.repeat(11)}|${'-'.repeat(11)}|${'-'.repeat(11)}|${'-'.repeat(12)}|${'-'.repeat(5)}|${'-'.repeat(11)}`);

  // Results
  for (const result of results) {
    const articlesPerSec = Math.round(1000 / result.avgDecompressionTime);
    const decompTime = `${result.avgDecompressionTime.toFixed(1)}ms`;
    const compression = `${result.compressionRatio.toFixed(2)}:1`;
    const spaceSaved = `${result.spaceSaved.toFixed(1)}%`;
    const throughputMBs = (result.totalOriginalBytes / (result.avgDecompressionTime * result.successfulDecompressions / 1000) / (1024 * 1024)).toFixed(1);
    const totalThroughputMBs = (parseFloat(throughputMBs) * threads).toFixed(1);

    console.log(`${result.level.toString().padStart(5)} | ${decompTime.padStart(10)} | ${compression.padStart(10)} | ${spaceSaved.padStart(10)} | ${articlesPerSec.toString().padStart(11)} | ${throughputMBs.padStart(4)} | ${totalThroughputMBs.padStart(10)}`);
  }

  // Add current database row if available
  if (currentStats && currentStats.current_algorithm === algorithm) {
    const currentLevel = currentStats.current_level;
    const currentResult = results.find(r => r.level === currentLevel);
    if (currentResult) {
      const articlesPerSec = Math.round(1000 / currentResult.avgDecompressionTime);
      const decompTime = `${currentResult.avgDecompressionTime.toFixed(1)}ms`;
      const compression = `${currentResult.compressionRatio.toFixed(2)}:1`;
      const spaceSaved = `${currentResult.spaceSaved.toFixed(1)}%`;
      const throughputMBs = (currentResult.totalOriginalBytes / (currentResult.avgDecompressionTime * currentResult.successfulDecompressions / 1000) / (1024 * 1024)).toFixed(1);
      const totalThroughputMBs = (parseFloat(throughputMBs) * threads).toFixed(1);

      console.log(`${colors.green}${'CURR'.padStart(5)}${colors.reset} | ${decompTime.padStart(10)} | ${compression.padStart(10)} | ${spaceSaved.padStart(10)} | ${articlesPerSec.toString().padStart(11)} | ${throughputMBs.padStart(4)} | ${totalThroughputMBs.padStart(10)}`);
    }
  }

  console.log();

  // Performance analysis
  if (results.length >= 2) {
    const fastest = results.reduce((prev, curr) => prev.avgDecompressionTime < curr.avgDecompressionTime ? prev : curr);
    const slowest = results.reduce((prev, curr) => prev.avgDecompressionTime > curr.avgDecompressionTime ? prev : curr);
    const bestCompression = results.reduce((prev, curr) => prev.spaceSaved > curr.spaceSaved ? prev : curr);

    console.log(`${colors.green}PERFORMANCE ANALYSIS:${colors.reset}`);
    console.log(`  🏃 Fastest decompression: Level ${fastest.level} (${fastest.avgDecompressionTime.toFixed(1)}ms per article)`);
    console.log(`  🗜️  Best compression: Level ${bestCompression.level} (${bestCompression.spaceSaved.toFixed(1)}% space saved)`);

    if (fastest.level === bestCompression.level) {
      console.log(`  🎯 Level ${fastest.level} provides the best balance of speed and compression`);
    } else {
      const speedDiff = ((slowest.avgDecompressionTime - fastest.avgDecompressionTime) / fastest.avgDecompressionTime * 100).toFixed(1);
      const compressionDiff = (bestCompression.spaceSaved - fastest.spaceSaved).toFixed(1);
      console.log(`  ⚖️  Trade-off: Level ${fastest.level} is ${speedDiff}% faster but saves ${compressionDiff}% less space than level ${bestCompression.level}`);
    }
  }

  // Calculate full dataset estimates
  const totalArticles = db.prepare('SELECT COUNT(*) as count FROM urls u INNER JOIN http_responses hr ON hr.url_id = u.id INNER JOIN content_storage cs ON cs.http_response_id = hr.id WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL').get().count;

  console.log();
  console.log(`${colors.cyan}FULL DATASET ESTIMATES (${totalArticles.toLocaleString()} articles):${colors.reset}`);

  for (const result of results) {
    const totalDecompTime = (result.avgDecompressionTime * totalArticles) / 1000; // seconds
    const totalThroughputMBs = (result.totalOriginalBytes / result.successfulDecompressions) * totalArticles / totalDecompTime / (1024 * 1024);
    const multithreadedThroughputMBs = totalThroughputMBs * threads;

    console.log(`  Level ${result.level}: ${formatTime(totalDecompTime)} total (${totalThroughputMBs.toFixed(1)} MB/s per-thread, ${multithreadedThroughputMBs.toFixed(1)} MB/s total)`);
  }

  // Current database estimate
  if (currentStats && currentStats.current_algorithm === algorithm) {
    const currentLevel = currentStats.current_level;
    const currentResult = results.find(r => r.level === currentLevel);
    if (currentResult) {
      const totalDecompTime = (currentResult.avgDecompressionTime * totalArticles) / 1000;
      const totalThroughputMBs = (currentResult.totalOriginalBytes / currentResult.successfulDecompressions) * totalArticles / totalDecompTime / (1024 * 1024);
      const multithreadedThroughputMBs = totalThroughputMBs * threads;

      console.log(`  ${colors.green}Current (Level ${currentLevel}): ${formatTime(totalDecompTime)} total (${totalThroughputMBs.toFixed(1)} MB/s per-thread, ${multithreadedThroughputMBs.toFixed(1)} MB/s total)${colors.reset}`);
    }
  }

  console.log();
}

async function runBenchmark() {
  if (compareLevels) {
    return runComparisonBenchmark();
  }

  // Single benchmark logic (existing code)
  // ... existing single benchmark code ...
  // Benchmark variables
  let totalCompressionTime = 0;
  let totalDecompressionTime = 0;
  let totalOriginalBytes = 0;
  let totalCompressedBytes = 0;
  let successfulCompressions = 0;
  let successfulDecompressions = 0;

  const compressionTimes = [];
  const decompressionTimes = [];
  const compressionRatios = [];

  if (threads === 1) {
    // Single-threaded processing
    console.log('Running single-threaded benchmark...\n');

    // Process each article
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];

      if (verbose) {
        console.log(`${colors.yellow}Article ${i + 1}/${articles.length}:${colors.reset} ${article.url.substring(0, 60)}...`);
      }

      const originalSize = article.uncompressed_size;
      totalOriginalBytes += originalSize;

      // Time compression
      let compressionTimeMs = 0;
      let compressedData = null;
      let compressionSuccess = false;

      if (algorithm !== 'none') {
        try {
          const compressionStart = process.hrtime.bigint();
          const result = compress(article.original_html, {
            algorithm,
            level,
            windowBits: algorithm === 'brotli' ? windowBits : undefined
          });
          const compressionEnd = process.hrtime.bigint();
          compressionTimeMs = Number(compressionEnd - compressionStart) / 1_000_000;

          compressedData = result.compressed;
          totalCompressedBytes += result.compressedSize;
          successfulCompressions++;

          compressionSuccess = true;

          if (verbose) {
            console.log(`  Compression time: ${formatTime(compressionTimeMs)} (${formatBytes(result.compressedSize)})`);
          }
        } catch (error) {
          if (verbose) {
            console.log(`  ${colors.red}Compression failed:${colors.reset} ${error.message}`);
          }
          continue;
        }
      } else {
        compressedData = Buffer.from(article.original_html, 'utf8');
        totalCompressedBytes += originalSize;
        successfulCompressions++;
        compressionSuccess = true;

        if (verbose) {
          console.log(`  No compression needed (${formatBytes(originalSize)})`);
        }
      }

      // Time decompression
      let decompressionTimeMs = 0;
      let decompressionSuccess = false;

      if (algorithm !== 'none' && compressionSuccess) {
        try {
          const decompressionStart = process.hrtime.bigint();
          const decompressed = decompress(compressedData, algorithm);
          const decompressionEnd = process.hrtime.bigint();
          decompressionTimeMs = Number(decompressionEnd - decompressionStart) / 1_000_000;

          totalDecompressionTime += decompressionTimeMs;
          successfulDecompressions++;

          decompressionSuccess = true;

          if (verbose) {
            console.log(`  Decompression time: ${formatTime(decompressionTimeMs)} (${formatBytes(decompressed.length)})`);
          }
        } catch (error) {
          if (verbose) {
            console.log(`  ${colors.red}Decompression failed:${colors.reset} ${error.message}`);
          }
        }
      } else if (algorithm === 'none') {
        // No decompression needed
        successfulDecompressions++;
        decompressionSuccess = true;

        if (verbose) {
          console.log(`  No decompression needed`);
        }
      }

      // Collect statistics
      if (compressionSuccess) {
        compressionTimes.push(compressionTimeMs);
        if (decompressionSuccess && algorithm !== 'none') {
          decompressionTimes.push(decompressionTimeMs);
          const ratio = compressedData.length / originalSize;
          compressionRatios.push(ratio);
        }
      }

      if (verbose) {
        const ratio = algorithm !== 'none' && compressedData ? (compressedData.length / originalSize) : 1;
        console.log(`  Compression ratio: ${ratio.toFixed(3)} (${algorithm}_${level})`);
        console.log();
      }
    }
  } else {
    // Multi-threaded processing
    console.log(`Running multi-threaded benchmark with ${threads} threads...\n`);

    // Create worker pool
    const workers = [];
    for (let i = 0; i < threads; i++) {
      const worker = new Worker(path.join(__dirname, 'compression-benchmark-worker.js'));
      worker.workerId = i + 1;
      worker.isProcessing = false;
      workers.push(worker);
    }

    // Process articles in batches
    const processBatch = async (batch) => {
      return new Promise((resolve, reject) => {
        // Find available worker
        const worker = workers.find(w => !w.isProcessing);
        if (!worker) {
          reject(new Error('No available workers'));
          return;
        }

        worker.isProcessing = true;

        // Set up timeout (60 seconds per batch)
        const timeout = setTimeout(() => {
          worker.isProcessing = false;
          reject(new Error(`Worker timeout after 60 seconds for batch of ${batch.length} articles`));
        }, 60 * 1000);

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
          algorithm,
          level,
          windowBits
        });
      });
    };

    // Process all articles in batches with concurrency control
    const processAllBatches = async () => {
      const promises = [];
      let batchIndex = 0;

      // Launch initial batches (up to number of workers)
      while (batchIndex < articles.length && promises.length < threads) {
        const batch = articles.slice(batchIndex, batchIndex + batchSize);
        promises.push(processBatch(batch));
        batchIndex += batchSize;
      }

      // Wait for batches to complete and launch more
      while (promises.length > 0) {
        const results = await Promise.race(promises);
        // Remove completed promise
        const index = promises.findIndex(p => p === Promise.race(promises));
        promises.splice(index, 1);

        // Process results
        for (const result of results) {
          if (result.compressionSuccess) {
            totalCompressionTime += result.compressionTime;
            totalOriginalBytes += result.originalSize;
            totalCompressedBytes += result.compressedSize;
            successfulCompressions++;

            compressionTimes.push(result.compressionTime);

            if (result.decompressionSuccess && algorithm !== 'none') {
              totalDecompressionTime += result.decompressionTime;
              successfulDecompressions++;
              decompressionTimes.push(result.decompressionTime);
              compressionRatios.push(result.compressionRatio);
            } else if (algorithm === 'none') {
              successfulDecompressions++;
            }
          }
        }

        // Launch next batch if available
        if (batchIndex < articles.length) {
          const batch = articles.slice(batchIndex, batchIndex + batchSize);
          promises.push(processBatch(batch));
          batchIndex += batchSize;
        }
      }
    };

    try {
      await processAllBatches();
    } finally {
      // Terminate workers
      for (const worker of workers) {
        worker.terminate();
      }
    }
  }

  // Calculate statistics
  const avgCompressionTime = compressionTimes.length > 0 ? totalCompressionTime / compressionTimes.length : 0;
  const avgDecompressionTime = decompressionTimes.length > 0 ? totalDecompressionTime / decompressionTimes.length : 0;
  const avgCompressionRatio = compressionRatios.length > 0 ? compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length : 1;

  const compressionThroughput = totalOriginalBytes / (totalCompressionTime / 1000) / (1024 * 1024); // MB/s
  const decompressionThroughput = totalOriginalBytes / (totalDecompressionTime / 1000) / (1024 * 1024); // MB/s

  // Calculate percentiles
  compressionTimes.sort((a, b) => a - b);
  decompressionTimes.sort((a, b) => a - b);

  const p50Compression = compressionTimes.length > 0 ? compressionTimes[Math.floor(compressionTimes.length * 0.5)] : 0;
  const p95Compression = compressionTimes.length > 0 ? compressionTimes[Math.floor(compressionTimes.length * 0.95)] : 0;
  const p99Compression = compressionTimes.length > 0 ? compressionTimes[Math.floor(compressionTimes.length * 0.99)] : 0;

  const p50Decompression = decompressionTimes.length > 0 ? decompressionTimes[Math.floor(decompressionTimes.length * 0.5)] : 0;
  const p95Decompression = decompressionTimes.length > 0 ? decompressionTimes[Math.floor(decompressionTimes.length * 0.95)] : 0;
  const p99Decompression = decompressionTimes.length > 0 ? decompressionTimes[Math.floor(decompressionTimes.length * 0.99)] : 0;

  // Output results
  console.log(`${colors.green}RESULTS:${colors.reset}`);
  console.log();

  console.log(`${colors.blue}Compression Settings:${colors.reset}`);
  console.log(`  Algorithm: ${algorithm}`);
  if (algorithm !== 'none') {
    console.log(`  Level: ${level}`);
    if (algorithm === 'brotli') {
      console.log(`  Window size: ${windowBits} bits (${Math.pow(2, windowBits)} bytes)`);
    }
  }
  console.log();

  console.log(`${colors.blue}Timing Statistics:${colors.reset}`);
  if (algorithm !== 'none') {
    console.log(`  Average compression time: ${formatTime(avgCompressionTime)}`);
    console.log(`  Average decompression time: ${formatTime(avgDecompressionTime)}`);
    console.log(`  Total compression time: ${formatTime(totalCompressionTime)}`);
    console.log(`  Total decompression time: ${formatTime(totalDecompressionTime)}`);
  } else {
    console.log(`  No compression/decompression needed`);
  }
  console.log();

  if (compressionTimes.length > 0) {
    console.log(`${colors.blue}Compression Time Percentiles:${colors.reset}`);
    console.log(`  50th percentile: ${formatTime(p50Compression)}`);
    console.log(`  95th percentile: ${formatTime(p95Compression)}`);
    console.log(`  99th percentile: ${formatTime(p99Compression)}`);
    console.log();
  }

  if (decompressionTimes.length > 0) {
    console.log(`${colors.blue}Decompression Time Percentiles:${colors.reset}`);
    console.log(`  50th percentile: ${formatTime(p50Decompression)}`);
    console.log(`  95th percentile: ${formatTime(p95Decompression)}`);
    console.log(`  99th percentile: ${formatTime(p99Decompression)}`);
    console.log();
  }

  console.log(`${colors.blue}Throughput:${colors.reset}`);
  if (algorithm !== 'none') {
    console.log(`  Compression throughput: ${compressionThroughput.toFixed(1)} MB/s`);
    console.log(`  Decompression throughput: ${decompressionThroughput.toFixed(1)} MB/s`);
  }
  console.log();

  console.log(`${colors.blue}Compression Statistics:${colors.reset}`);
  console.log(`  Average compression ratio: ${avgCompressionRatio.toFixed(3)}`);
  console.log(`  Space saved: ${((1 - avgCompressionRatio) * 100).toFixed(1)}%`);
  console.log(`  Total original size: ${formatBytes(totalOriginalBytes)}`);
  console.log(`  Total compressed size: ${formatBytes(totalCompressedBytes)}`);
  console.log();

  console.log(`${colors.blue}Success Rates:${colors.reset}`);
  console.log(`  Successful compressions: ${successfulCompressions}/${articles.length} (${(successfulCompressions/articles.length*100).toFixed(1)}%)`);
  if (algorithm !== 'none') {
    console.log(`  Successful decompressions: ${successfulDecompressions}/${articles.length} (${(successfulDecompressions/articles.length*100).toFixed(1)}%)`);
  }
  console.log();

  console.log(`${colors.magenta}DATASET ESTIMATES:${colors.reset}`);
  console.log();

  // Calculate estimates for full dataset
  const fullDatasetArticles = totalArticles;
  const estimatedCompressionTime = (totalCompressionTime / articles.length) * fullDatasetArticles;
  const estimatedDecompressionTime = (totalDecompressionTime / articles.length) * fullDatasetArticles;

  console.log(`${colors.yellow}Full Dataset (${fullDatasetArticles.toLocaleString()} articles):${colors.reset}`);
  if (algorithm !== 'none') {
    console.log(`  Estimated compression time: ${formatTime(estimatedCompressionTime)}`);
    console.log(`  Estimated decompression time: ${formatTime(estimatedDecompressionTime)}`);
    console.log(`  Estimated total compressed size: ${formatBytes(totalCompressedBytes / articles.length * fullDatasetArticles)}`);
    console.log(`  Estimated space savings: ${formatBytes(totalOriginalBytes / articles.length * fullDatasetArticles - totalCompressedBytes / articles.length * fullDatasetArticles)}`);
  } else {
    console.log(`  No compression needed`);
    console.log(`  Total uncompressed size: ${formatBytes(totalOriginalBytes / articles.length * fullDatasetArticles)}`);
  }
  console.log();

  console.log(`${colors.yellow}Performance Projections:${colors.reset}`);
  const articlesPerSecond = articles.length / ((totalCompressionTime + totalDecompressionTime) / 1000);
  const fullDatasetTime = (fullDatasetArticles / articlesPerSecond);
  console.log(`  Articles per second: ${articlesPerSecond.toFixed(1)}`);
  console.log(`  Estimated time for full dataset: ${formatTime(fullDatasetTime * 1000)}`);
  console.log(`  Decompression throughput: ${decompressionThroughput.toFixed(1)} MB/s`);
  console.log();

  console.log(`${colors.cyan}COMPRESSION COMPARISON:${colors.reset}`);
  console.log();

  // Compare with current database compression
  const currentStats = db.prepare(`
    SELECT
      ct.algorithm as current_algorithm,
      ct.level as current_level,
      ct.window_bits as current_window_bits,
      AVG(cs.compression_ratio) as current_avg_ratio,
      COUNT(*) as current_count,
      AVG(cs.uncompressed_size) as current_avg_uncompressed,
      AVG(cs.compressed_size) as current_avg_compressed
    FROM content_storage cs
    JOIN compression_types ct ON cs.compression_type_id = ct.id
    WHERE cs.content_blob IS NOT NULL
    GROUP BY ct.algorithm, ct.level, ct.window_bits
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `).get();

  if (currentStats) {
    const currentCompressionRatio = currentStats.current_avg_ratio || 1;
    const proposedCompressionRatio = algorithm !== 'none' ? avgCompressionRatio : 1;

    console.log(`${colors.blue}Current Database Compression:${colors.reset}`);
    console.log(`  Algorithm: ${currentStats.current_algorithm || 'none'}`);
    if (currentStats.current_algorithm && currentStats.current_algorithm !== 'none') {
      console.log(`  Level: ${currentStats.current_level || 'N/A'}`);
      if (currentStats.current_algorithm === 'brotli') {
        console.log(`  Window size: ${currentStats.current_window_bits || 'default'} bits`);
      }
    }
    console.log(`  Average compression ratio: ${currentCompressionRatio.toFixed(3)}`);
    console.log(`  Space saved: ${((1 - currentCompressionRatio) * 100).toFixed(1)}%`);
    console.log();

    console.log(`${colors.blue}Proposed Compression Settings:${colors.reset}`);
    console.log(`  Algorithm: ${algorithm}`);
    if (algorithm !== 'none') {
      console.log(`  Level: ${level}`);
      if (algorithm === 'brotli') {
        console.log(`  Window size: ${windowBits} bits (${Math.pow(2, windowBits)} bytes)`);
      }
    }
    console.log(`  Average compression ratio: ${proposedCompressionRatio.toFixed(3)}`);
    console.log(`  Space saved: ${((1 - proposedCompressionRatio) * 100).toFixed(1)}%`);
    console.log();

    // Performance comparison
    console.log(`${colors.green}Performance Comparison:${colors.reset}`);

    // Estimate current decompression speed (based on existing benchmark data)
    const currentDecompressionTimePerArticle = 1.3; // ms - typical from existing benchmark
    const proposedDecompressionTimePerArticle = avgDecompressionTime;

    const currentTotalDecompressionTime = (currentDecompressionTimePerArticle * fullDatasetArticles) / 1000;
    const proposedTotalDecompressionTime = (proposedDecompressionTimePerArticle * fullDatasetArticles) / 1000;

    console.log(`  Current decompression: ${formatTime(currentDecompressionTimePerArticle)} per article`);
    console.log(`  Proposed decompression: ${formatTime(proposedDecompressionTimePerArticle)} per article`);
    console.log(`  Speed difference: ${proposedDecompressionTimePerArticle > currentDecompressionTimePerArticle ? 'SLOWER' : 'FASTER'} by ${Math.abs((proposedDecompressionTimePerArticle - currentDecompressionTimePerArticle) / currentDecompressionTimePerArticle * 100).toFixed(1)}%`);
    console.log();

    // Calculate absolute space impact estimates
    const currentAvgCompressedSize = currentStats.current_avg_compressed;
    const proposedAvgCompressedSize = algorithm !== 'none' ? (totalCompressedBytes / articles.length) : (totalOriginalBytes / articles.length);

    // Read speed impact estimates
    const currentReadThroughputArticles = 1000 / currentDecompressionTimePerArticle; // articles per second
    const proposedReadThroughputArticles = 1000 / proposedDecompressionTimePerArticle; // articles per second
    const currentReadThroughputMB = (currentAvgCompressedSize * currentReadThroughputArticles) / (1024 * 1024); // MB/s
    const proposedReadThroughputMB = (proposedAvgCompressedSize * proposedReadThroughputArticles) / (1024 * 1024); // MB/s

    console.log(`${colors.cyan}Read Speed Impact:${colors.reset}`);
    console.log(`  Current read speed: ${currentReadThroughputArticles.toFixed(0)} articles/sec (${currentReadThroughputMB.toFixed(1)} MB/s)`);
    console.log(`  Proposed read speed: ${proposedReadThroughputArticles.toFixed(0)} articles/sec (${proposedReadThroughputMB.toFixed(1)} MB/s)`);
    console.log(`  ${colors.yellow}Read speed difference: ${proposedReadThroughputArticles > currentReadThroughputArticles ? 'FASTER' : 'SLOWER'} by ${Math.abs((proposedReadThroughputArticles - currentReadThroughputArticles) / currentReadThroughputArticles * 100).toFixed(1)}%${colors.reset}`);
    console.log(`  ${colors.yellow}Time to read full dataset: Current ${formatTime(currentTotalDecompressionTime * 1000)} vs Proposed ${formatTime(proposedTotalDecompressionTime * 1000)}${colors.reset}`);
    console.log(`  ${colors.yellow}Time savings: ${proposedTotalDecompressionTime < currentTotalDecompressionTime ? 'SAVE' : 'ADD'} ${formatTime(Math.abs((proposedTotalDecompressionTime - currentTotalDecompressionTime) * 1000))}${colors.reset}`);
    console.log();

    // Space comparison
    const currentSpaceSavings = (1 - currentCompressionRatio) * 100;
    const proposedSpaceSavings = (1 - proposedCompressionRatio) * 100;
    const spaceDifference = proposedSpaceSavings - currentSpaceSavings;

    console.log(`  Current space savings: ${currentSpaceSavings.toFixed(1)}%`);
    console.log(`  Proposed space savings: ${proposedSpaceSavings.toFixed(1)}%`);
    console.log(`  Space difference: ${spaceDifference > 0 ? '+' : ''}${spaceDifference.toFixed(1)}% ${spaceDifference > 0 ? 'more' : 'less'} compression`);
    console.log();

    console.log(`${colors.green}Storage Impact Estimate:${colors.reset}`);
    console.log(`  Current total compressed size: ${formatBytes(currentTotalCompressed)}`);
    console.log(`  Proposed total compressed size: ${formatBytes(proposedTotalCompressed)}`);
    console.log(`  ${colors.yellow}Space difference: ${absoluteSpaceDifference > 0 ? '+' : ''}${formatBytes(Math.abs(absoluteSpaceDifference))} ${absoluteSpaceDifference > 0 ? 'more' : 'less'} storage needed${colors.reset}`);
    console.log(`  ${colors.yellow}Storage change: ${relativeSpaceChange > 0 ? '+' : ''}${relativeSpaceChange.toFixed(1)}% ${relativeSpaceChange > 0 ? 'increase' : 'decrease'} in storage requirements${colors.reset}`);
    console.log();

    const currentTotalCompressed = currentAvgCompressedSize * fullDatasetArticles;
    const proposedTotalCompressed = proposedAvgCompressedSize * fullDatasetArticles;
    const absoluteSpaceDifference = proposedTotalCompressed - currentTotalCompressed;
    const relativeSpaceChange = (absoluteSpaceDifference / currentTotalCompressed) * 100;

    // Recommendations
    console.log(`${colors.magenta}RECOMMENDATIONS:${colors.reset}`);

    const compressionGain = proposedSpaceSavings - currentSpaceSavings;
    const speedPenalty = ((proposedDecompressionTimePerArticle - currentDecompressionTimePerArticle) / currentDecompressionTimePerArticle) * 100;

    if (algorithm === 'none') {
      console.log(`  📂 No compression - maximum read speed, minimum space savings`);
      console.log(`     Use this if decompression speed is critical and storage space is plentiful`);
    } else if (proposedCompressionRatio < 0.1) {
      console.log(`  ⚠️  Excellent compression ratio (${(proposedCompressionRatio * 100).toFixed(1)}% of original size)`);
      console.log(`     ${speedPenalty > 50 ? '⚠️ HIGH speed penalty' : speedPenalty > 20 ? '🤔 Moderate speed penalty' : '✅ Acceptable speed cost'} for ${compressionGain.toFixed(1)}% better compression`);
    } else if (proposedCompressionRatio < 0.2) {
      console.log(`  ✅ Very good compression ratio (${(proposedCompressionRatio * 100).toFixed(1)}% of original size)`);
      console.log(`     ${speedPenalty > 30 ? '⚠️ Significant speed penalty' : '✅ Good balance'} for ${compressionGain.toFixed(1)}% better compression`);
    } else if (proposedCompressionRatio < 0.3) {
      console.log(`  🤔 Good compression ratio (${(proposedCompressionRatio * 100).toFixed(1)}% of original size)`);
      console.log(`     ${speedPenalty > 10 ? '⚠️ Speed penalty' : '✅ Balanced choice'} for ${compressionGain.toFixed(1)}% better compression`);
    } else if (proposedCompressionRatio < 0.5) {
      console.log(`  ⚠️ Moderate compression (${(proposedCompressionRatio * 100).toFixed(1)}% of original size)`);
      console.log(`     Consider higher compression level for better space savings`);
    } else {
      console.log(`  ❌ Poor compression ratio (${(proposedCompressionRatio * 100).toFixed(1)}% of original size)`);
      console.log(`     Consider different algorithm or higher compression level`);
    }

    // Specific advice for high compression levels
    if (algorithm === 'brotli' && level >= 10) {
      console.log(`  🚨 High compression level (${level}) - expect slow compression and high memory usage`);
      console.log(`     Only use for archival storage where compression ratio is more important than speed`);
    } else if (algorithm === 'brotli' && level >= 8) {
      console.log(`  ⚠️ High compression level (${level}) - good compression but slower than levels 4-6`);
      console.log(`     Consider level 6 for better speed/compression balance`);
    } else if (algorithm === 'brotli' && level <= 3) {
      console.log(`  🏃 Fast compression level (${level}) - quick but less compression than levels 4-6`);
      console.log(`     Consider level 6 for better compression with acceptable speed`);
    } else if (algorithm === 'brotli' && level === 6) {
      console.log(`  🎯 Level 6 is generally the sweet spot for Brotli - good compression, reasonable speed`);
    }

    // Window size advice for Brotli
    if (algorithm === 'brotli' && windowBits > 24) {
      console.log(`  🚨 Large window size (${windowBits} bits = ${Math.pow(2, windowBits)} bytes)`);
      console.log(`     High memory usage, diminishing returns above 24 bits`);
    } else if (algorithm === 'brotli' && windowBits < 22) {
      console.log(`  ℹ️ Small window size (${windowBits} bits) - faster but less compression`);
    }
  } else {
    console.log(`  No current compression data available for comparison`);
  }

  console.log();
}

// Run the benchmark
runBenchmark().catch(error => {
  console.error('Benchmark failed:', error.message);
  process.exit(1);
}).finally(() => {
  // Close database
  db.close();
});