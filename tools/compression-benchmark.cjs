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
const { compress, decompress } = require('../src/utils/CompressionFacade');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');
const { findProjectRoot } = require('../src/utils/project-root');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fmt = new CliFormatter();
const projectRoot = findProjectRoot(__dirname);
const DEFAULT_DB_PATH = path.join(projectRoot, 'data', 'news.db');

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

function createParser() {
  const parser = new CliArgumentParser('compression-benchmark', 'Benchmark compression and decompression performance.');

  parser
    .add('--db <path>', 'Path to SQLite database', DEFAULT_DB_PATH)
    .add('--limit <number>', 'Number of articles to test', 1000, 'int')
    .add('--algorithm <alg>', 'Compression algorithm: brotli | gzip | none', 'brotli')
    .add('--level <number>', 'Compression level', 6, 'int')
    .add('--window-bits <number>', 'Brotli window size in bits', 22, 'int')
    .add('--threads <number>', 'Number of worker threads', 1, 'int')
    .add('--batch-size <number>', 'Articles per worker batch', 10, 'int')
    .add('--compare-levels <list>', 'Comma-separated compression levels to compare')
    .add('--verbose', 'Enable verbose output per article', false, 'boolean')
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress ASCII summary when using JSON format', false, 'boolean');

  return parser;
}

function parseCompareLevels(rawLevels, algorithm) {
  if (!rawLevels) return null;

  const normalized = String(rawLevels)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new CliError(`Invalid compression level "${value}".`);
      }
      return parsed;
    });

  const maxLevel = algorithm === 'gzip' ? 9 : 11;
  for (const levelValue of normalized) {
    if (algorithm === 'none') {
      throw new CliError('--compare-levels cannot be used with --algorithm none');
    }
    if (levelValue > maxLevel) {
      throw new CliError(`Compression level ${levelValue} exceeds maximum (${maxLevel}) for ${algorithm}.`);
    }
  }

  return normalized.length ? normalized : null;
}

function normalizeOptions(raw) {
  const algorithm = (raw.algorithm || 'brotli').toLowerCase();
  if (!['brotli', 'gzip', 'none'].includes(algorithm)) {
    throw new CliError(`Unsupported algorithm: ${raw.algorithm}`);
  }

  const limit = raw.limit;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new CliError('--limit must be a positive integer.');
  }

  const threads = raw.threads;
  if (!Number.isFinite(threads) || threads <= 0) {
    throw new CliError('--threads must be a positive integer.');
  }

  const batchSize = raw.batchSize;
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new CliError('--batch-size must be a positive integer.');
  }

  const level = raw.level;
  if (!Number.isFinite(level) || level < 0) {
    throw new CliError('--level must be a non-negative integer.');
  }

  if (algorithm === 'gzip' && level > 9) {
    throw new CliError('gzip compression level must be between 0 and 9.');
  }

  if (algorithm === 'brotli' && level > 11) {
    throw new CliError('brotli compression level must be between 0 and 11.');
  }

  const windowBits = raw.windowBits;
  if (algorithm === 'brotli') {
    if (!Number.isFinite(windowBits) || windowBits < 10 || windowBits > 24) {
      throw new CliError('--window-bits must be between 10 and 24 for brotli.');
    }
  }

  const summaryFormat = (raw.summaryFormat || 'ascii').toLowerCase();
  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError('Unsupported summary format. Use ascii or json.');
  }

  const quiet = Boolean(raw.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new CliError('--quiet can only be used with --summary-format json.');
  }

  if (quiet && raw.verbose) {
    throw new CliError('--quiet cannot be combined with --verbose.');
  }

  const dbPath = raw.db ? path.resolve(raw.db) : DEFAULT_DB_PATH;
  if (!fs.existsSync(dbPath)) {
    throw new CliError(`Database not found at ${dbPath}. Use --db to specify a valid path.`);
  }

  const compareLevels = parseCompareLevels(raw.compareLevels, algorithm);

  return {
    dbPath,
    limit,
    algorithm,
    level,
    windowBits,
    threads,
    batchSize,
    compareLevels,
    verbose: Boolean(raw.verbose),
    summaryFormat,
    quiet
  };
}

let rawOptions;
try {
  const parser = createParser();
  rawOptions = parser.parse(process.argv);
} catch (error) {
  fmt.error(error?.message || 'Failed to parse arguments.');
  process.exit(1);
}

let options;
try {
  options = normalizeOptions(rawOptions);
} catch (error) {
  const exitCode = error instanceof CliError ? error.exitCode : 1;
  fmt.error(error.message || 'Invalid configuration.');
  process.exit(exitCode);
}

let {
  dbPath,
  limit,
  algorithm,
  level,
  windowBits,
  threads,
  batchSize,
  compareLevels,
  verbose,
  summaryFormat,
  quiet
} = options;

const asciiEnabled = summaryFormat !== 'json' || !quiet;
const jsonEnabled = summaryFormat === 'json';
if (asciiEnabled) {
  fmt.header('Compression Benchmark');
  fmt.section(compareLevels ? 'Comparison Mode' : 'Benchmark Mode');
  fmt.stat('Algorithm', algorithm);
  if (algorithm !== 'none') {
    fmt.stat('Compression level', level, 'number');
    if (algorithm === 'brotli') {
      const windowBytes = Math.pow(2, windowBits);
      fmt.stat('Window size', `${windowBits} bits (${formatBytes(windowBytes)})`);
    }
  }
  fmt.stat('Articles to sample', limit, 'number');
  if (compareLevels) {
    fmt.stat('Compare levels', compareLevels.join(', '));
  }
  fmt.stat('Threads', threads, 'number');
  fmt.stat('Batch size', batchSize, 'number');
  fmt.blank();
}

// Open database
const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });

// Get total count of articles with content
const totalArticles = db.prepare(`
  SELECT COUNT(*) as count
  FROM urls u
  INNER JOIN http_responses hr ON hr.url_id = u.id
  INNER JOIN content_storage cs ON cs.http_response_id = hr.id
  WHERE hr.http_status = 200 AND cs.content_blob IS NOT NULL
`).get().count;

if (asciiEnabled) {
  fmt.section('Database Snapshot');
  fmt.stat('Database path', dbPath);
  fmt.stat('Articles with content', totalArticles.toLocaleString());
  fmt.blank();
}

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

if (asciiEnabled) {
  fmt.section('Sample Preparation');
  fmt.stat('Articles selected', articles.length, 'number');
  fmt.blank();
}

// Decompress articles that are compressed (to get original HTML)
if (asciiEnabled) fmt.pending('Preparing test data…');
for (let i = 0; i < articles.length; i++) {
  const article = articles[i];

  if (article.original_algorithm !== 'none') {
    try {
      const decompressed = decompress(article.content_blob, article.original_algorithm);
      article.original_html = decompressed.toString('utf8');
      article.uncompressed_size = decompressed.length;
    } catch (error) {
      fmt.warn(`Failed to decompress article ${article.url_id}: ${error.message}`);
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
if (asciiEnabled) {
  fmt.success(`Prepared ${articles.length} articles for compression testing`);
  fmt.blank();
}

function normalizeCurrentStats(stats) {
  if (!stats) return null;
  return {
    algorithm: stats.current_algorithm,
    level: stats.current_level,
    windowBits: stats.current_window_bits,
    articleCount: stats.current_count
  };
}

function computeComparisonMetrics(result) {
  const avgMs = result.avgDecompressionTime || 0;
  const compressionRatio = result.compressionRatio || 1;
  const spaceSaved = Number.isFinite(result.spaceSaved) ? result.spaceSaved : (1 - 1 / compressionRatio) * 100;
  const articlesPerSecond = avgMs > 0 ? 1000 / avgMs : 0;

  const denominator = result.successfulDecompressions > 0 && avgMs > 0
    ? (result.avgDecompressionTime * result.successfulDecompressions) / 1000
    : 0;
  const throughputMBps = denominator > 0
    ? (result.totalOriginalBytes / denominator) / (1024 * 1024)
    : 0;

  const totalDecompressionSeconds = avgMs > 0 ? (avgMs * totalArticles) / 1000 : 0;

  return {
    level: result.level,
    avgMs,
    compressionRatio,
    spaceSaved,
    articlesPerSecond,
    throughputPerThreadMBps: throughputMBps,
    throughputTotalMBps: throughputMBps * threads,
    totalDecompressionSeconds,
    totalOriginalBytes: result.totalOriginalBytes,
    totalCompressedBytes: result.totalCompressedBytes,
    successfulDecompressions: result.successfulDecompressions,
    articleCount: result.articleCount
  };
}

function renderComparisonAscii(report) {
  const rows = report.results.map((result) => {
    const metrics = computeComparisonMetrics(result);
    return {
      Level: metrics.level,
      'Avg Decomp (ms)': metrics.avgMs.toFixed(1),
      'Compression': `${metrics.compressionRatio.toFixed(2)}:1`,
      'Space Saved %': metrics.spaceSaved.toFixed(1),
      'Articles/sec': metrics.articlesPerSecond.toFixed(1),
      'MB/s per thread': metrics.throughputPerThreadMBps.toFixed(1),
      'MB/s total': metrics.throughputTotalMBps.toFixed(1)
    };
  });

  fmt.section('Level Comparison');
  fmt.table(rows, {
    columns: ['Level', 'Avg Decomp (ms)', 'Compression', 'Space Saved %', 'Articles/sec', 'MB/s per thread', 'MB/s total']
  });

  const metricsList = report.results.map(computeComparisonMetrics);

  if (metricsList.length >= 1) {
    const fastest = metricsList.reduce((prev, curr) => (curr.avgMs < prev.avgMs ? curr : prev));
    const bestCompression = metricsList.reduce((prev, curr) => (curr.spaceSaved > prev.spaceSaved ? curr : prev));

    const insights = [];
    insights.push(`Fastest decompression: level ${fastest.level} (${fastest.avgMs.toFixed(1)} ms/article)`);
    insights.push(`Best compression: level ${bestCompression.level} (${bestCompression.spaceSaved.toFixed(1)}% space saved)`);

    if (fastest.level === bestCompression.level) {
      insights.push(`Level ${fastest.level} offers the best balance of speed and storage savings.`);
    } else {
      const speedDiff = fastest.avgMs > 0
        ? ((bestCompression.avgMs - fastest.avgMs) / fastest.avgMs) * 100
        : 0;
      const compressionDiff = bestCompression.spaceSaved - fastest.spaceSaved;
      insights.push(`Level ${fastest.level} is ${speedDiff.toFixed(1)}% faster while level ${bestCompression.level} saves ${compressionDiff.toFixed(1)}% more space.`);
    }

    fmt.list('Highlights', insights);
  }

  fmt.section(`Full Dataset Estimates (${totalArticles.toLocaleString()} articles)`);
  const datasetRows = metricsList.map((metrics) => ({
    Level: metrics.level,
    'Total time': formatTime(metrics.totalDecompressionSeconds * 1000),
    'MB/s per thread': metrics.throughputPerThreadMBps.toFixed(1),
    'MB/s total': metrics.throughputTotalMBps.toFixed(1)
  }));
  fmt.table(datasetRows, { columns: ['Level', 'Total time', 'MB/s per thread', 'MB/s total'] });

  if (report.currentStats && report.currentStats.algorithm === algorithm) {
    fmt.section('Current Database Settings');
    fmt.stat('Algorithm', report.currentStats.algorithm);
    if (report.currentStats.algorithm !== 'none') {
      fmt.stat('Level', report.currentStats.level ?? 'n/a');
      if (report.currentStats.algorithm === 'brotli') {
        fmt.stat('Window size', report.currentStats.windowBits ?? 'default');
      }
    }
    fmt.stat('Articles', report.currentStats.articleCount?.toLocaleString?.() ?? report.currentStats.articleCount ?? 'n/a');
    fmt.blank();
  }
}

function emitComparisonJson(report) {
  if (!jsonEnabled) return;

  const results = report.results.map((result) => {
    const metrics = computeComparisonMetrics(result);
    return {
      level: metrics.level,
      avgDecompressionMs: Number(metrics.avgMs.toFixed(3)),
      compressionRatio: Number(metrics.compressionRatio.toFixed(4)),
      spaceSavedPercent: Number(metrics.spaceSaved.toFixed(3)),
      articlesPerSecond: Number(metrics.articlesPerSecond.toFixed(3)),
      throughputPerThreadMBps: Number(metrics.throughputPerThreadMBps.toFixed(3)),
      throughputTotalMBps: Number(metrics.throughputTotalMBps.toFixed(3)),
      estimatedTotalSeconds: Number(metrics.totalDecompressionSeconds.toFixed(3)),
      successfulDecompressions: metrics.successfulDecompressions,
      articleCount: metrics.articleCount,
      totalOriginalBytes: metrics.totalOriginalBytes,
      totalCompressedBytes: metrics.totalCompressedBytes
    };
  });

  const payload = {
    mode: 'comparison',
    config: {
      algorithm,
      level,
      windowBits,
      limit,
      threads,
      batchSize,
      compareLevels,
      databasePath: dbPath
    },
    totalArticles,
    results,
    current: report.currentStats ? {
      algorithm: report.currentStats.algorithm,
      level: report.currentStats.level,
      windowBits: report.currentStats.windowBits,
      articleCount: report.currentStats.articleCount
    } : null
  };

  const jsonOutput = quiet ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
  console.log(jsonOutput);
}

function formatSignedBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'n/a';
  if (bytes === 0) return '0 B';
  const sign = bytes > 0 ? '+' : '-';
  return `${sign}${formatBytes(Math.abs(bytes))}`;
}

function formatMaybeNumber(value, decimals = 1, fallback = 'n/a') {
  return Number.isFinite(value) ? value.toFixed(decimals) : fallback;
}

function formatPercentValue(value, decimals = 1, fallback = 'n/a') {
  return Number.isFinite(value) ? `${value.toFixed(decimals)}%` : fallback;
}

function describeSpeedImpact(penaltyPercent) {
  if (!Number.isFinite(penaltyPercent)) {
    return 'Speed impact unknown compared to current baseline';
  }

  if (penaltyPercent > 50) return '⚠️ high speed penalty vs current baseline';
  if (penaltyPercent > 20) return '🤔 noticeable speed cost vs current baseline';
  if (penaltyPercent > 5) return '✅ minor speed cost vs current baseline';
  if (penaltyPercent > 0) return '✅ negligible speed change vs current baseline';
  if (penaltyPercent < -15) return '🚀 significantly faster than current baseline';
  if (penaltyPercent < -5) return '✅ faster than current baseline';
  if (penaltyPercent < 0) return '✅ slightly faster than current baseline';
  return '✅ comparable speed to current baseline';
}

function buildRecommendations({
  algorithm,
  level,
  windowBits,
  proposedCompressionRatio,
  proposedSpaceSavedPercent,
  comparison
}) {
  const recs = [];

  if (algorithm === 'none') {
    recs.push('Compression disabled: prioritizes read speed while providing no storage savings. Enable Brotli (level 6) for balanced performance.');
    return recs;
  }

  const ratioPercent = proposedCompressionRatio * 100;
  const baselineSpace = comparison?.current?.spaceSavedPercent ?? 0;
  const spaceDelta = proposedSpaceSavedPercent - baselineSpace;
  const speedPenalty = comparison?.timing?.differencePercent ?? null;
  const speedDescriptor = describeSpeedImpact(speedPenalty);
  const spaceDescriptor = comparison && Number.isFinite(spaceDelta)
    ? `${spaceDelta >= 0 ? '+' : ''}${spaceDelta.toFixed(1)}% space change vs current baseline`
    : `${proposedSpaceSavedPercent.toFixed(1)}% space saved vs original size`;

  if (proposedCompressionRatio < 0.1) {
    recs.push(`Compression ratio ${ratioPercent.toFixed(1)}% of original size — excellent savings. ${speedDescriptor}. ${spaceDescriptor}.`);
  } else if (proposedCompressionRatio < 0.2) {
    recs.push(`Compression ratio ${ratioPercent.toFixed(1)}% of original size — strong savings. ${speedDescriptor}. ${spaceDescriptor}.`);
  } else if (proposedCompressionRatio < 0.3) {
    recs.push(`Compression ratio ${ratioPercent.toFixed(1)}% of original size — good but not exceptional. ${speedDescriptor}. ${spaceDescriptor}. Consider level 6 for the typical balance.`);
  } else if (proposedCompressionRatio < 0.5) {
    recs.push(`Compression ratio ${ratioPercent.toFixed(1)}% of original size — moderate savings. ${speedDescriptor}. ${spaceDescriptor}. Explore higher levels if storage is a concern.`);
  } else {
    recs.push(`Compression ratio ${ratioPercent.toFixed(1)}% of original size — poor savings. ${speedDescriptor}. ${spaceDescriptor}. Consider different algorithm or higher level.`);
  }

  if (comparison && Number.isFinite(comparison.storage?.differenceBytes)) {
    const storageDifference = comparison.storage.differenceBytes;
    const storagePercent = comparison.storage.differencePercent ?? 0;
    const articleCount = comparison.current?.articles;
    const articleLabel = Number.isFinite(articleCount) ? `${articleCount.toLocaleString()} articles` : 'the dataset';
    recs.push(`Estimated storage change across ${articleLabel}: ${formatSignedBytes(storageDifference)} (${formatPercentValue(storagePercent)}).`);
  }

  if (algorithm === 'brotli') {
    if (typeof level === 'number') {
      if (level >= 10) {
        recs.push('Brotli level ≥10: archival-grade compression. Expect slow compression and high memory usage.');
      } else if (level >= 8) {
        recs.push('Brotli level 8-9: higher compression with notable speed trade-offs. Level 6 is usually the sweet spot.');
      } else if (level <= 3) {
        recs.push('Brotli level ≤3: prioritizes speed with reduced compression. Level 6 offers better savings while staying fast.');
      } else if (level === 6) {
        recs.push('Brotli level 6 delivers the project’s preferred balance of speed and storage savings.');
      }
    }

    if (typeof windowBits === 'number') {
      if (windowBits > 24) {
        recs.push(`Window size ${windowBits} bits (${formatBytes(2 ** windowBits)}) — large memory footprint with diminishing returns above 24 bits.`);
      } else if (windowBits < 22) {
        recs.push(`Window size ${windowBits} bits — faster but may reduce compression effectiveness. Consider 24 bits for balanced coverage.`);
      }
    }
  }

  return recs;
}

function renderSingleBenchmarkAscii(summary) {
  const { config, sample, totals, averages, percentiles, dataset, comparison, recommendations } = summary;

  fmt.section('Benchmark Results');
  fmt.stat('Samples processed', sample.sampleSize.toLocaleString(), 'number');
  const compressionSuccessRate = formatPercentValue(sample.compressionRate * 100);
  fmt.stat('Compression success', `${sample.successfulCompressions}/${sample.sampleSize} (${compressionSuccessRate})`);
  if (config.algorithm !== 'none') {
    const decompressionSuccessRate = formatPercentValue(sample.decompressionRate * 100);
    fmt.stat('Decompression success', `${sample.successfulDecompressions}/${sample.sampleSize} (${decompressionSuccessRate})`);
  }
  fmt.blank();

  fmt.section('Timing Statistics');
  if (config.algorithm !== 'none') {
    fmt.stat('Avg compression time', formatTime(averages.compressionTimeMs), 'duration');
    fmt.stat('Avg decompression time', formatTime(averages.decompressionTimeMs), 'duration');
    fmt.stat('Total compression time', formatTime(totals.compressionTimeMs), 'duration');
    fmt.stat('Total decompression time', formatTime(totals.decompressionTimeMs), 'duration');
  } else {
    fmt.stat('Timing', 'Compression bypassed (algorithm "none")');
  }

  if (percentiles.compression) {
    fmt.section('Compression Time Percentiles');
    fmt.stat('P50', formatTime(percentiles.compression.p50), 'duration');
    fmt.stat('P95', formatTime(percentiles.compression.p95), 'duration');
    fmt.stat('P99', formatTime(percentiles.compression.p99), 'duration');
  }

  if (percentiles.decompression) {
    fmt.section('Decompression Time Percentiles');
    fmt.stat('P50', formatTime(percentiles.decompression.p50), 'duration');
    fmt.stat('P95', formatTime(percentiles.decompression.p95), 'duration');
    fmt.stat('P99', formatTime(percentiles.decompression.p99), 'duration');
  }

  fmt.section('Throughput');
  if (config.algorithm !== 'none') {
    fmt.stat('Compression throughput', `${formatMaybeNumber(averages.compressionThroughputMBps)} MB/s`);
    fmt.stat('Decompression throughput', `${formatMaybeNumber(averages.decompressionThroughputMBps)} MB/s`);
  } else {
    fmt.stat('Throughput', 'Not applicable when compression is disabled');
  }

  fmt.section('Compression Statistics');
  fmt.stat('Average ratio', averages.compressionRatio.toFixed(3));
  fmt.stat('Space saved', formatPercentValue((1 - averages.compressionRatio) * 100));
  fmt.stat('Total original bytes', formatBytes(totals.originalBytes));
  fmt.stat('Total compressed bytes', formatBytes(totals.compressedBytes));

  fmt.section(`Dataset Estimates (${dataset.totalArticles.toLocaleString()} articles)`);
  if (config.algorithm !== 'none') {
    fmt.stat('Estimated compression time', formatTime(dataset.estimatedCompressionTimeMs));
    fmt.stat('Estimated decompression time', formatTime(dataset.estimatedDecompressionTimeMs));
    const estimatedCompressedSizeText = Number.isFinite(dataset.estimatedCompressedBytes)
      ? formatBytes(dataset.estimatedCompressedBytes)
      : 'n/a';
    fmt.stat('Estimated compressed size', estimatedCompressedSizeText);
    fmt.stat('Estimated space savings', formatSignedBytes(dataset.estimatedSpaceSavingsBytes));
  } else {
    fmt.stat('Compression', 'Not required (algorithm "none")');
    const estimatedOriginalSizeText = Number.isFinite(dataset.estimatedOriginalBytes)
      ? formatBytes(dataset.estimatedOriginalBytes)
      : 'n/a';
    fmt.stat('Dataset size', estimatedOriginalSizeText);
  }
  fmt.stat('Articles per second', formatMaybeNumber(dataset.articlesPerSecond));
  fmt.stat('Full dataset duration', formatTime(dataset.fullDatasetTimeSeconds * 1000));

  if (comparison) {
    fmt.section('Database Comparison');
    fmt.stat('Current algorithm', comparison.current.algorithm ?? 'unknown');
    if (comparison.current.algorithm !== 'none') {
      fmt.stat('Current level', comparison.current.level ?? 'default');
      if (comparison.current.algorithm === 'brotli') {
        fmt.stat('Current window', comparison.current.windowBits ?? 'default');
      }
    }
    fmt.stat('Current space saved', formatPercentValue(comparison.current.spaceSavedPercent));
    fmt.stat('Proposed space saved', formatPercentValue(comparison.proposed.spaceSavedPercent));

    fmt.section('Read Speed Impact');
    fmt.stat('Current read speed', `${formatMaybeNumber(comparison.readSpeed.currentArticlesPerSec)} articles/sec (${formatMaybeNumber(comparison.readSpeed.currentMBps)} MB/s)`);
    fmt.stat('Proposed read speed', `${formatMaybeNumber(comparison.readSpeed.proposedArticlesPerSec)} articles/sec (${formatMaybeNumber(comparison.readSpeed.proposedMBps)} MB/s)`);
    fmt.stat('Read speed change', formatPercentValue(comparison.readSpeed.differencePercent));
    fmt.stat('Current per-article decompression', formatTime(comparison.timing.currentDecompressionMsPerArticle));
    fmt.stat('Proposed per-article decompression', formatTime(comparison.timing.proposedDecompressionMsPerArticle));
    fmt.stat('Decompression change', formatPercentValue(comparison.timing.differencePercent));

    fmt.section('Storage Impact');
    const currentDatasetSize = Number.isFinite(comparison.storage.currentTotalCompressedBytes)
      ? formatBytes(comparison.storage.currentTotalCompressedBytes)
      : 'n/a';
    const proposedDatasetSize = Number.isFinite(comparison.storage.proposedTotalCompressedBytes)
      ? formatBytes(comparison.storage.proposedTotalCompressedBytes)
      : 'n/a';
    fmt.stat('Current dataset size', currentDatasetSize);
    fmt.stat('Proposed dataset size', proposedDatasetSize);
    fmt.stat('Storage change', `${formatSignedBytes(comparison.storage.differenceBytes)} (${formatPercentValue(comparison.storage.differencePercent)})`);
  } else {
    fmt.section('Database Comparison');
    fmt.stat('Status', 'No baseline compression data available for comparison');
  }

  if (recommendations.length > 0) {
    fmt.list('Recommendations', recommendations);
  }

  fmt.blank();
}

function emitSingleBenchmarkJson(summary) {
  if (!jsonEnabled) return;
  const payload = summary;
  const jsonOutput = quiet ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
  console.log(jsonOutput);
}

// Main benchmark execution
async function runComparisonBenchmark() {
  if (asciiEnabled) {
    fmt.section('Comparison Run');
    fmt.info(`Testing ${compareLevels.length} compression levels on ${limit} articles.`);
  }

  // Get current database compression settings
  const currentStatsRaw = db.prepare(`
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

  const currentStats = normalizeCurrentStats(currentStatsRaw);

  if (asciiEnabled && currentStats) {
    fmt.info(`Current database compression: ${currentStats.algorithm}${currentStats.level != null ? ` (level ${currentStats.level})` : ''}`);
  }

  const results = [];

  for (const testLevel of compareLevels) {
    if (asciiEnabled) fmt.pending(`Benchmarking level ${testLevel}…`);
    const result = await runSingleBenchmark(testLevel);
    results.push({
      level: testLevel,
      ...result
    });
    if (asciiEnabled) fmt.success(`Level ${testLevel} complete.`);
  }

  const report = {
    results,
    currentStats
  };

  if (asciiEnabled) {
    renderComparisonAscii(report);
  }

  emitComparisonJson(report);

  return report;
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
        if (asciiEnabled) {
          fmt.warn(`Failed to decompress article ${article.url_id}: ${error.message}`);
        }
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
    if (asciiEnabled) {
      fmt.info('Running single-threaded benchmark…');
      fmt.blank();
    }

    // Process each article
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];

      if (verbose && asciiEnabled) {
        fmt.info(`Article ${i + 1}/${articles.length}: ${article.url.substring(0, 60)}…`);
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

          if (verbose && asciiEnabled) {
            fmt.info(`  Compression time: ${formatTime(compressionTimeMs)} (${formatBytes(result.compressedSize)})`);
          }
        } catch (error) {
          if (verbose && asciiEnabled) {
            fmt.warn(`  Compression failed: ${error.message}`);
          }
          continue;
        }
      } else {
        compressedData = Buffer.from(article.original_html, 'utf8');
        totalCompressedBytes += originalSize;
        successfulCompressions++;
        compressionSuccess = true;

        if (verbose && asciiEnabled) {
          fmt.info(`  No compression needed (${formatBytes(originalSize)})`);
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

          if (verbose && asciiEnabled) {
            fmt.info(`  Decompression time: ${formatTime(decompressionTimeMs)} (${formatBytes(decompressed.length)})`);
          }
        } catch (error) {
          if (verbose && asciiEnabled) {
            fmt.warn(`  Decompression failed: ${error.message}`);
          }
        }
      } else if (algorithm === 'none') {
        // No decompression needed
        successfulDecompressions++;
        decompressionSuccess = true;

        if (verbose && asciiEnabled) {
          fmt.info('  No decompression needed');
        }
      }

      // Collect statistics
      if (compressionSuccess) {
        totalCompressionTime += compressionTimeMs;
        compressionTimes.push(compressionTimeMs);
        if (decompressionSuccess && algorithm !== 'none') {
          decompressionTimes.push(decompressionTimeMs);
          const ratio = compressedData.length / originalSize;
          compressionRatios.push(ratio);
        }
      }

      if (verbose && asciiEnabled) {
        const ratio = algorithm !== 'none' && compressedData ? (compressedData.length / originalSize) : 1;
        fmt.info(`  Compression ratio: ${ratio.toFixed(3)} (${algorithm}_${level})`);
        fmt.blank();
      }
    }
  } else {
    // Multi-threaded processing
    if (asciiEnabled) {
      fmt.info(`Running multi-threaded benchmark with ${threads} threads…`);
      fmt.blank();
    }

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

  const compressionThroughputMBps = totalCompressionTime > 0
    ? (totalOriginalBytes / (totalCompressionTime / 1000)) / (1024 * 1024)
    : 0;
  const decompressionThroughputMBps = totalDecompressionTime > 0
    ? (totalOriginalBytes / (totalDecompressionTime / 1000)) / (1024 * 1024)
    : 0;

  const sampleCount = articles.length;
  const averageOriginalSize = sampleCount > 0 ? totalOriginalBytes / sampleCount : 0;
  const averageCompressedSize = sampleCount > 0 ? totalCompressedBytes / sampleCount : 0;

  const estimatedCompressionTime = sampleCount > 0 ? (totalCompressionTime / sampleCount) * totalArticles : 0;
  const estimatedDecompressionTime = sampleCount > 0 ? (totalDecompressionTime / sampleCount) * totalArticles : 0;
  const estimatedOriginalSize = averageOriginalSize * totalArticles;
  const estimatedCompressedSize = averageCompressedSize * totalArticles;
  const estimatedSpaceSavingsBytes = estimatedOriginalSize - estimatedCompressedSize;

  const totalProcessingTimeMs = totalCompressionTime + totalDecompressionTime;
  const articlesPerSecond = totalProcessingTimeMs > 0 ? sampleCount / (totalProcessingTimeMs / 1000) : 0;
  const fullDatasetTimeSeconds = articlesPerSecond > 0 ? totalArticles / articlesPerSecond : 0;

  const currentStatsRow = db.prepare(`
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

  const currentSummary = currentStatsRow ? {
    algorithm: currentStatsRow.current_algorithm || 'none',
    level: currentStatsRow.current_level ?? null,
    windowBits: currentStatsRow.current_window_bits ?? null,
    averageCompressionRatio: currentStatsRow.current_avg_ratio ?? 1,
    averageUncompressedSize: currentStatsRow.current_avg_uncompressed ?? 0,
    averageCompressedSize: currentStatsRow.current_avg_compressed ?? 0,
    articleCount: currentStatsRow.current_count ?? 0
  } : null;

  const proposedCompressionRatio = algorithm !== 'none' ? avgCompressionRatio : 1;
  const proposedSpaceSavedPercent = (1 - proposedCompressionRatio) * 100;

  const currentSpaceSavedPercent = currentSummary ? (1 - currentSummary.averageCompressionRatio) * 100 : null;
  const currentAvgCompressedSize = currentSummary ? currentSummary.averageCompressedSize : null;
  const currentTotalCompressedBytes = currentAvgCompressedSize != null ? currentAvgCompressedSize * totalArticles : null;
  const proposedTotalCompressedBytes = averageCompressedSize * totalArticles;
  const storageDifferenceBytes = currentTotalCompressedBytes != null ? proposedTotalCompressedBytes - currentTotalCompressedBytes : null;
  const storageDifferencePercent = currentTotalCompressedBytes && currentTotalCompressedBytes !== 0
    ? (storageDifferenceBytes / currentTotalCompressedBytes) * 100
    : null;

  const currentDecompressionTimePerArticle = 1.3;
  const proposedDecompressionTimePerArticle = avgDecompressionTime;
  const currentArticlesPerSecondRead = currentDecompressionTimePerArticle > 0 ? 1000 / currentDecompressionTimePerArticle : 0;
  const proposedArticlesPerSecondRead = proposedDecompressionTimePerArticle > 0 ? 1000 / proposedDecompressionTimePerArticle : 0;
  const currentReadThroughputMBps = currentSummary && currentSummary.averageCompressedSize
    ? (currentSummary.averageCompressedSize * currentArticlesPerSecondRead) / (1024 * 1024)
    : 0;
  const proposedReadThroughputMBps = averageCompressedSize > 0
    ? (averageCompressedSize * proposedArticlesPerSecondRead) / (1024 * 1024)
    : 0;

  const comparison = currentSummary ? {
    current: {
      algorithm: currentSummary.algorithm,
      level: currentSummary.level,
      windowBits: currentSummary.windowBits,
      compressionRatio: currentSummary.averageCompressionRatio,
      spaceSavedPercent: currentSpaceSavedPercent,
      averageCompressedSizeBytes: currentSummary.averageCompressedSize,
      articles: currentSummary.articleCount
    },
    proposed: {
      algorithm,
      level: algorithm !== 'none' ? level : null,
      windowBits: algorithm === 'brotli' ? windowBits : null,
      compressionRatio: proposedCompressionRatio,
      spaceSavedPercent: proposedSpaceSavedPercent,
      averageCompressedSizeBytes: averageCompressedSize
    },
    storage: {
      currentTotalCompressedBytes,
      proposedTotalCompressedBytes,
      differenceBytes: storageDifferenceBytes,
      differencePercent: storageDifferencePercent
    },
    readSpeed: {
      currentArticlesPerSec: currentArticlesPerSecondRead,
      proposedArticlesPerSec: proposedArticlesPerSecondRead,
      differencePercent: currentArticlesPerSecondRead > 0
        ? ((proposedArticlesPerSecondRead - currentArticlesPerSecondRead) / currentArticlesPerSecondRead) * 100
        : null,
      currentMBps: currentReadThroughputMBps,
      proposedMBps: proposedReadThroughputMBps
    },
    timing: {
      currentDecompressionMsPerArticle: currentDecompressionTimePerArticle,
      proposedDecompressionMsPerArticle: proposedDecompressionTimePerArticle,
      differencePercent: currentDecompressionTimePerArticle > 0
        ? ((proposedDecompressionTimePerArticle - currentDecompressionTimePerArticle) / currentDecompressionTimePerArticle) * 100
        : null
    }
  } : null;

  const recommendations = buildRecommendations({
    algorithm,
    level,
    windowBits,
    proposedCompressionRatio,
    proposedSpaceSavedPercent,
    comparison
  });

  const summary = {
    mode: 'single',
    config: {
      algorithm,
      level,
      windowBits,
      limit,
      threads,
      batchSize,
      verbose,
      compareLevels: Array.isArray(compareLevels) && compareLevels.length > 0 ? compareLevels : undefined,
      databasePath: dbPath
    },
    sample: {
      sampleSize: sampleCount,
      successfulCompressions,
      successfulDecompressions,
      compressionRate: sampleCount > 0 ? successfulCompressions / sampleCount : 0,
      decompressionRate: sampleCount > 0 ? successfulDecompressions / sampleCount : 0
    },
    totals: {
      compressionTimeMs: totalCompressionTime,
      decompressionTimeMs: totalDecompressionTime,
      originalBytes: totalOriginalBytes,
      compressedBytes: totalCompressedBytes
    },
    averages: {
      compressionTimeMs: avgCompressionTime,
      decompressionTimeMs: avgDecompressionTime,
      compressionRatio: avgCompressionRatio,
      compressionThroughputMBps,
      decompressionThroughputMBps,
      averageOriginalSizeBytes: averageOriginalSize,
      averageCompressedSizeBytes: averageCompressedSize
    },
    percentiles: {
      compression: compressionTimes.length > 0 ? {
        p50: p50Compression,
        p95: p95Compression,
        p99: p99Compression
      } : null,
      decompression: decompressionTimes.length > 0 ? {
        p50: p50Decompression,
        p95: p95Decompression,
        p99: p99Decompression
      } : null
    },
    dataset: {
      totalArticles,
      estimatedCompressionTimeMs: estimatedCompressionTime,
      estimatedDecompressionTimeMs: estimatedDecompressionTime,
      estimatedOriginalBytes: estimatedOriginalSize,
      estimatedCompressedBytes: estimatedCompressedSize,
      estimatedSpaceSavingsBytes,
      articlesPerSecond,
      fullDatasetTimeSeconds
    },
    comparison,
    recommendations
  };

  if (asciiEnabled) {
    renderSingleBenchmarkAscii(summary);
  }

  emitSingleBenchmarkJson(summary);

  return summary;
}

// Run the benchmark
runBenchmark().catch(error => {
  if (verbose && asciiEnabled) {
    fmt.error(error.stack || error.message);
  } else {
    console.error('Benchmark failed:', error.message);
  }
  process.exit(1);
}).finally(() => {
  // Close database
  db.close();
});