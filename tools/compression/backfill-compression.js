#!/usr/bin/env node
/**
 * Backfill compression for normalized content.
 *
 * Database reads, compression-type lookup, and content_storage updates live in
 * news-crawler-db. This CLI owns argument parsing and progress output only.
 */

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

class ProgressBar {
  constructor(total, options = {}) {
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.width = options.width || 40;
    this.lastUpdate = 0;
    this.updateInterval = 1000;
    this.stats = {
      compressed: 0,
      errors: 0,
      bytesProcessed: 0,
      bytesSaved: 0
    };
  }

  update(current, stats = {}) {
    this.current = current;
    Object.assign(this.stats, stats);

    const now = Date.now();
    const shouldUpdate = (now - this.lastUpdate >= this.updateInterval) ||
      (current === this.total) ||
      (current % Math.max(1, Math.floor(this.total / 20)) === 0);

    if (!shouldUpdate && current < this.total) {
      return;
    }
    this.lastUpdate = now;
    this.render();
  }

  render() {
    const percentage = this.total > 0 ? Math.min(100, Math.round((this.current / this.total) * 100)) : 100;
    const filled = this.total > 0 ? Math.round((this.current / this.total) * this.width) : this.width;
    const empty = this.width - filled;
    const bar = '#'.repeat(filled) + '-'.repeat(empty);
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.current / Math.max(elapsed, 1);
    const eta = this.current < this.total ? Math.round((this.total - this.current) / rate) : 0;
    const etaStr = eta > 0 ? `${Math.floor(eta / 60)}:${(eta % 60).toString().padStart(2, '0')}` : '--:--';
    const mbProcessed = (this.stats.bytesProcessed / 1024 / 1024).toFixed(1);
    const mbSaved = (this.stats.bytesSaved / 1024 / 1024).toFixed(1);

    process.stdout.write(`\r[${bar}] ${percentage}% | ${this.current}/${this.total} | ${rate.toFixed(1)}/s | ETA ${etaStr} | ${mbProcessed}MB processed | ${mbSaved}MB saved`);
  }

  complete() {
    this.current = this.total;
    this.render();
    process.stdout.write('\n');
  }
}

function printHelp() {
  console.log(`
Compression Backfill Tool

Compresses uncompressed content in content_storage using age-based compression tiers.

USAGE:
  node tools/compression/backfill-compression.js [options]

OPTIONS:
  --help, -h              Show this help message
  --fix                   Apply compression changes (default: dry run only)
  --age-days <days>       Only compress content older than specified days
  --limit <number>        Process only the specified number of items
  --force-compress        Compress all uncompressed content regardless of age

COMPRESSION TIERS:
  Hot (< 7 days):         No compression
  Warm (7-30 days):       Brotli level 6
  Cold (30+ days):        Brotli level 11
`);
}

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

function readPositiveIntFlag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || !argv[index + 1]) return null;
  const value = Number.parseInt(argv[index + 1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function closeDb(db) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
}

async function backfillCompression() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  const dryRun = !argv.includes('--fix');
  const limit = readPositiveIntFlag(argv, '--limit');
  const ageDays = readPositiveIntFlag(argv, '--age-days');
  const forceCompress = argv.includes('--force-compress');
  const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
  const getPlan = getDbApi('getContentStorageCompressionBackfillPlan');
  const processItem = getDbApi('processContentStorageCompressionBackfillItem');
  const db = openNewsCrawlerDb(dbPath);

  console.log('='.repeat(80));
  console.log('COMPRESSION BACKFILL TOOL');
  console.log('='.repeat(80));
  console.log(`Database: ${dbPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will apply changes)'}`);
  if (ageDays) console.log(`Age filter: ${ageDays} days or older`);
  if (limit) console.log(`Limit: ${limit} items`);
  if (forceCompress) console.log('Force compress: enabled');
  console.log('');

  try {
    const plan = getPlan(db, { ageDays, limit });
    if (!plan.tableExists) {
      console.log('content_storage table not found - run schema migration first');
      return;
    }

    console.log(`Found ${plan.uncompressedCount} uncompressed items in content_storage`);
    if (plan.uncompressedCount === 0) {
      console.log('No uncompressed content found - backfill not needed');
      return;
    }

    console.log(`Found ${plan.items.length} uncompressed items to process`);
    console.log(`Total uncompressed size: ${(plan.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Estimated compressed size: ${(plan.estimatedCompressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Estimated space savings: ${(plan.estimatedSavings / 1024 / 1024).toFixed(2)} MB`);

    if (dryRun) {
      console.log('\nDRY RUN COMPLETE');
      console.log(`Would process ${plan.items.length} items`);
      console.log('Run with --fix to apply changes');
      return;
    }

    console.log('\nStarting compression backfill...');
    const progressBar = new ProgressBar(plan.items.length);
    let compressed = 0;
    let errors = 0;
    let bytesProcessed = 0;
    let bytesSaved = 0;

    for (let i = 0; i < plan.items.length; i++) {
      const item = plan.items[i];
      try {
        const result = processItem(db, item.id, { forceCompress });
        if (result.compressed) compressed++;
        bytesProcessed += result.bytesProcessed || 0;
        bytesSaved += result.bytesSaved || 0;
      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error.message);
        errors++;
      }

      progressBar.update(i + 1, {
        compressed,
        errors,
        bytesProcessed,
        bytesSaved
      });
    }

    progressBar.complete();
    console.log('\nCompression backfill complete.');
    console.log(`Compressed: ${compressed} items`);
    if (errors > 0) console.log(`Errors: ${errors} items`);
    console.log(`Total processed: ${(bytesProcessed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Space saved: ${(bytesSaved / 1024 / 1024).toFixed(2)} MB`);
  } finally {
    closeDb(db);
  }
}

if (require.main === module) {
  backfillCompression().catch(error => {
    console.error('Unhandled error:', error.message || error);
    process.exit(1);
  });
}

module.exports = { backfillCompression };
