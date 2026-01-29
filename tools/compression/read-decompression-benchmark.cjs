#!/usr/bin/env node

/**
 * read-decompression-benchmark.js - Benchmark decompression performance
 *
 * Measures the time it takes to read compressed articles from database and decompress them,
 * compared to just reading the compressed data without decompression.
 *
 * Usage:
 *   node tools/read-decompression-benchmark.js [options]
 *
 * Options:
 *   --limit <N>          Number of articles to test (default: 1000)
 *   --algorithm <alg>    Filter by compression algorithm (brotli, gzip, zstd, none)
 *   --level <N>          Filter by compression level
 *   --threads <N>        Number of worker threads for parallel processing (default: 1)
 *   --batch-size <N>     Articles per worker batch (default: 10)
 *   --verbose            Enable verbose output
 *   --help, -h           Show this help message
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const { openDatabase } = require('../src/db/sqlite/v1/connection');
const { decompress } = require('../src/utils/CompressionFacade');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m'
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(1)} μs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Read-Decompression Benchmark Tool

Benchmarks the performance of reading compressed articles from database and decompressing them,
compared to just reading the compressed data without decompression.

USAGE:
  node tools/read-decompression-benchmark.js [options]

OPTIONS:
  --limit <N>           Number of articles to test (default: 1000)
  --algorithm <alg>     Filter by compression algorithm: brotli, gzip, zstd, none
  --level <N>           Filter by compression level
  --threads <N>         Number of worker threads for parallel processing (default: 1)
  --batch-size <N>      Articles per worker batch (default: 10)
  --verbose             Enable verbose output for each article
  --help, -h            Show this help message

EXAMPLES:
  node tools/read-decompression-benchmark.js
  node tools/read-decompression-benchmark.js --limit 5000
  node tools/read-decompression-benchmark.js --algorithm brotli --level 6
  node tools/read-decompression-benchmark.js --threads 24 --batch-size 50
  node tools/read-decompression-benchmark.js --verbose --limit 100

OUTPUT:
  Shows read times, decompression times, throughput rates, and speedup estimates.
`);
  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);

let limit = 1000;
let filterAlgorithm = null;
let filterLevel = null;
let threads = 1;
let batchSize = 10;
let verbose = false;

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
        console.error('Error: --algorithm requires a value (brotli, gzip, zstd, none)');
        process.exit(1);
      }
      if (!['brotli', 'gzip', 'zstd', 'none'].includes(nextArg)) {
        console.error('Error: --algorithm must be brotli, gzip, zstd, or none');
        process.exit(1);
      }
      filterAlgorithm = nextArg;
      i++;
      break;
    case '--level':
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --level requires a numeric value');
        process.exit(1);
      }
      filterLevel = parseInt(nextArg, 10);
      if (isNaN(filterLevel) || filterLevel < 0) {
        console.error('Error: --level must be a non-negative integer');
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

console.log(`${colors.cyan}Read-Decompression Benchmark${colors.reset}`);
console.log(`Testing ${limit} articles${filterAlgorithm ? ` with ${filterAlgorithm}` : ''}${filterLevel !== null ? ` level ${filterLevel}` : ''}`);
console.log(`Using ${threads} thread${threads !== 1 ? 's' : ''}, batch size ${batchSize}`);
console.log();

// Open database
const db = openDatabase('./data/news.db', { readonly: true, fileMustExist: true });

// Build query to get articles
let query = `
  SELECT
    cs.id,
    cs.content_blob,
    cs.uncompressed_size,
    cs.compressed_size,
    ct.algorithm,
    ct.level,
    u.url
  FROM content_storage cs
  JOIN compression_types ct ON cs.compression_type_id = ct.id
  JOIN http_responses hr ON cs.http_response_id = hr.id
  JOIN urls u ON hr.url_id = u.id
  WHERE cs.content_blob IS NOT NULL
`;

const params = [];

if (filterAlgorithm) {
  query += ' AND ct.algorithm = ?';
  params.push(filterAlgorithm);
}

if (filterLevel !== null) {
  query += ' AND ct.level = ?';
  params.push(filterLevel);
}

query += ` ORDER BY RANDOM() LIMIT ${limit}`;

const stmt = db.prepare(query);
const articles = stmt.all(...params);

console.log(`Found ${articles.length} articles matching criteria\n`);

// Main benchmark execution
async function runBenchmark() {
  // Benchmark variables
  let totalReadTime = 0;
  let totalDecompressTime = 0;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  let successfulDecompressions = 0;
  let failedDecompressions = 0;

  const readTimes = [];
  const decompressTimes = [];
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

      // Time the read operation (simulated - in reality this is already done)
      const readStart = process.hrtime.bigint();
      const compressedData = article.content_blob;
      const readEnd = process.hrtime.bigint();
      const readTimeMs = Number(readEnd - readStart) / 1_000_000; // Convert to milliseconds

      totalReadTime += readTimeMs;
      totalCompressedBytes += compressedData.length;

      if (verbose) {
        console.log(`  Read time: ${formatTime(readTimeMs)} (${formatBytes(compressedData.length)})`);
      }

      // Time decompression
      let decompressTimeMs = 0;
      let decompressedData = null;
      let decompressionSuccess = false;

      if (article.algorithm !== 'none') {
        try {
          const decompressStart = process.hrtime.bigint();
          decompressedData = decompress(compressedData, article.algorithm);
          const decompressEnd = process.hrtime.bigint();
          decompressTimeMs = Number(decompressEnd - decompressStart) / 1_000_000;

          totalDecompressTime += decompressTimeMs;
          totalUncompressedBytes += decompressedData.length;
          successfulDecompressions++;

          decompressionSuccess = true;

          if (verbose) {
            console.log(`  Decompress time: ${formatTime(decompressTimeMs)} (${formatBytes(decompressedData.length)})`);
          }
        } catch (error) {
          failedDecompressions++;
          if (verbose) {
            console.log(`  ${colors.red}Decompression failed:${colors.reset} ${error.message}`);
          }
        }
      } else {
        // No compression - just copy the data
        decompressedData = compressedData;
        totalUncompressedBytes += decompressedData.length;
        successfulDecompressions++;

        if (verbose) {
          console.log(`  No decompression needed (${formatBytes(decompressedData.length)})`);
        }
      }

      // Collect statistics
      readTimes.push(readTimeMs);
      if (decompressionSuccess && article.algorithm !== 'none') {
        decompressTimes.push(decompressTimeMs);
        const ratio = compressedData.length / decompressedData.length;
        compressionRatios.push(ratio);
      }

      if (verbose) {
        const ratio = article.algorithm !== 'none' ? (compressedData.length / decompressedData.length) : 1;
        console.log(`  Compression ratio: ${ratio.toFixed(3)} (${article.algorithm}_${article.level})`);
        console.log();
      }
    }
  } else {
    // Multi-threaded processing
    console.log(`Running multi-threaded benchmark with ${threads} threads...\n`);

    // Create worker pool
    const workers = [];
    for (let i = 0; i < threads; i++) {
      const worker = new Worker(path.join(__dirname, 'decompression-benchmark-worker.js'));
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

        // Set up timeout (30 seconds per batch)
        const timeout = setTimeout(() => {
          worker.isProcessing = false;
          reject(new Error(`Worker timeout after 30 seconds for batch of ${batch.length} articles`));
        }, 30 * 1000);

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
          articles: batch
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
          totalReadTime += result.readTime / 1000; // Convert μs to ms
          totalCompressedBytes += result.compressedSize;

          if (result.success) {
            totalDecompressTime += result.decompressTime;
            totalUncompressedBytes += result.uncompressedSize;
            successfulDecompressions++;

            readTimes.push(result.readTime / 1000); // Convert to ms
            if (result.algorithm !== 'none') {
              decompressTimes.push(result.decompressTime);
              const ratio = result.compressedSize / result.uncompressedSize;
              compressionRatios.push(ratio);
            }
          } else {
            failedDecompressions++;
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
  const avgReadTime = totalReadTime / articles.length;
  const avgDecompressTime = decompressTimes.length > 0 ? totalDecompressTime / decompressTimes.length : 0;
  const avgCompressionRatio = compressionRatios.length > 0 ? compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length : 1;

  const readThroughput = totalCompressedBytes / (totalReadTime / 1000) / (1024 * 1024); // MB/s
  const decompressThroughput = totalUncompressedBytes / (totalDecompressTime / 1000) / (1024 * 1024); // MB/s

  // Calculate percentiles
  readTimes.sort((a, b) => a - b);
  decompressTimes.sort((a, b) => a - b);

  const p50Read = readTimes[Math.floor(readTimes.length * 0.5)];
  const p95Read = readTimes[Math.floor(readTimes.length * 0.95)];
  const p99Read = readTimes[Math.floor(readTimes.length * 0.99)];

  const p50Decompress = decompressTimes.length > 0 ? decompressTimes[Math.floor(decompressTimes.length * 0.5)] : 0;
  const p95Decompress = decompressTimes.length > 0 ? decompressTimes[Math.floor(decompressTimes.length * 0.95)] : 0;
  const p99Decompress = decompressTimes.length > 0 ? decompressTimes[Math.floor(decompressTimes.length * 0.99)] : 0;

  // Estimate performance without compression
  const estimatedReadTimeWithoutCompression = totalReadTime * (totalUncompressedBytes / totalCompressedBytes);
  const speedupWithoutCompression = totalReadTime / estimatedReadTimeWithoutCompression;

  // Output results
  console.log(`${colors.green}RESULTS:${colors.reset}`);
  console.log();

  console.log(`${colors.blue}Timing Statistics:${colors.reset}`);
  console.log(`  Average read time: ${formatTime(avgReadTime)}`);
  console.log(`  Average decompress time: ${formatTime(avgDecompressTime)}`);
  console.log(`  Total read time: ${formatTime(totalReadTime)}`);
  console.log(`  Total decompress time: ${formatTime(totalDecompressTime)}`);
  console.log();

  console.log(`${colors.blue}Read Time Percentiles:${colors.reset}`);
  console.log(`  50th percentile: ${formatTime(p50Read)}`);
  console.log(`  95th percentile: ${formatTime(p95Read)}`);
  console.log(`  99th percentile: ${formatTime(p99Read)}`);
  console.log();

  if (decompressTimes.length > 0) {
    console.log(`${colors.blue}Decompress Time Percentiles:${colors.reset}`);
    console.log(`  50th percentile: ${formatTime(p50Decompress)}`);
    console.log(`  95th percentile: ${formatTime(p95Decompress)}`);
    console.log(`  99th percentile: ${formatTime(p99Decompress)}`);
    console.log();
  }

  console.log(`${colors.blue}Throughput:${colors.reset}`);
  console.log(`  Read throughput: ${readThroughput.toFixed(1)} MB/s`);
  console.log(`  Decompress throughput: ${decompressThroughput.toFixed(1)} MB/s`);
  console.log();

  console.log(`${colors.blue}Compression Statistics:${colors.reset}`);
  console.log(`  Average compression ratio: ${avgCompressionRatio.toFixed(3)}`);
  console.log(`  Space saved: ${((1 - avgCompressionRatio) * 100).toFixed(1)}%`);
  console.log(`  Total compressed size: ${formatBytes(totalCompressedBytes)}`);
  console.log(`  Total uncompressed size: ${formatBytes(totalUncompressedBytes)}`);
  console.log();

  console.log(`${colors.blue}Success Rates:${colors.reset}`);
  console.log(`  Successful decompressions: ${successfulDecompressions}/${articles.length} (${(successfulDecompressions/articles.length*100).toFixed(1)}%)`);
  if (failedDecompressions > 0) {
    console.log(`  Failed decompressions: ${failedDecompressions} (${(failedDecompressions/articles.length*100).toFixed(1)}%)`);
  }
  console.log();

  console.log(`${colors.green}PERFORMANCE ESTIMATES:${colors.reset}`);
  console.log();

  console.log(`${colors.yellow}Reading without decompression:${colors.reset}`);
  console.log(`  Estimated total read time: ${formatTime(estimatedReadTimeWithoutCompression)}`);
  console.log(`  Speedup factor: ${speedupWithoutCompression.toFixed(2)}x`);
  console.log(`  Time saved: ${formatTime(totalReadTime - estimatedReadTimeWithoutCompression)}`);
  console.log();

  const combinedTime = totalReadTime + totalDecompressTime;
  const combinedThroughput = totalUncompressedBytes / (combinedTime / 1000) / (1024 * 1024);

  console.log(`${colors.yellow}Read + Decompress (current approach):${colors.reset}`);
  console.log(`  Combined time: ${formatTime(combinedTime)}`);
  console.log(`  Combined throughput: ${combinedThroughput.toFixed(1)} MB/s`);
  console.log(`  Articles per second: ${(articles.length / (combinedTime / 1000)).toFixed(1)}`);
  console.log();

  console.log(`${colors.yellow}Read without decompression:${colors.reset}`);
  console.log(`  Estimated throughput: ${(totalUncompressedBytes / (estimatedReadTimeWithoutCompression / 1000) / (1024 * 1024)).toFixed(1)} MB/s`);
  console.log(`  Estimated articles per second: ${(articles.length / (estimatedReadTimeWithoutCompression / 1000)).toFixed(1)}`);
  console.log();

  const timeDifference = combinedTime - estimatedReadTimeWithoutCompression;
  const percentageDifference = (timeDifference / estimatedReadTimeWithoutCompression) * 100;

  console.log(`${colors.cyan}SUMMARY:${colors.reset}`);
  if (timeDifference > 0) {
    console.log(`  Reading compressed data + decompressing takes ${Math.abs(percentageDifference).toFixed(1)}% MORE time than reading uncompressed data`);
    console.log(`  Decompression overhead: ${formatTime(timeDifference)} (${(timeDifference/combinedTime*100).toFixed(1)}% of total time)`);
  } else {
    console.log(`  Reading compressed data + decompressing takes ${Math.abs(percentageDifference).toFixed(1)}% LESS time than reading uncompressed data`);
    console.log(`  Decompression benefit: ${formatTime(Math.abs(timeDifference))} (${(Math.abs(timeDifference)/combinedTime*100).toFixed(1)}% of total time)`);
  }
}

// Run the benchmark
runBenchmark().catch(error => {
  console.error('Benchmark failed:', error.message);
  process.exit(1);
}).finally(() => {
  // Close database
  db.close();
});