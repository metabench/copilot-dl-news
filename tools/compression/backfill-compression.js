#!/usr/bin/env node
/**
 * tools/compression/backfill-compression.js
 *
 * Backfill compression tool for existing normalized content.
 * Compresses uncompressed content in the content_storage table.
 *
 * Usage:
 *   node tools/compression/backfill-compression.js              # Dry run (default)
 *   node tools/compression/backfill-compression.js --fix        # Apply changes
 *   node tools/compression/backfill-compression.js --age-days 30 # Only compress content older than 30 days
 *   node tools/compression/backfill-compression.js --limit 100  # Process only 100 items
 */

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite/v1');
const { compressAndStore } = require('../../src/utils/CompressionFacade');

// Progress bar utility
class ProgressBar {
  constructor(total, options = {}) {
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.width = options.width || 40;
    this.lastUpdate = 0;
    this.updateInterval = 1000; // Update every second
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
                        (current % Math.max(1, Math.floor(this.total / 20)) === 0); // Update every 5% progress
    
    if (!shouldUpdate && current < this.total) {
      return; // Don't update too frequently
    }
    this.lastUpdate = now;
    
    this.render();
  }

  render() {
    const percentage = Math.min(100, Math.round((this.current / this.total) * 100));
    const filled = Math.round((this.current / this.total) * this.width);
    const empty = this.width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.current / Math.max(elapsed, 1);
    const eta = this.current < this.total ? Math.round((this.total - this.current) / rate) : 0;
    
    const etaStr = eta > 0 ? `${Math.floor(eta / 60)}:${(eta % 60).toString().padStart(2, '0')}` : '--:--';
    const rateStr = rate.toFixed(1);
    
    const mbProcessed = (this.stats.bytesProcessed / 1024 / 1024).toFixed(1);
    const mbSaved = (this.stats.bytesSaved / 1024 / 1024).toFixed(1);
    
    const line = `\r[${bar}] ${percentage}% | ${this.current}/${this.total} | ${rateStr}/s | ETA ${etaStr} | ${mbProcessed}MB processed | ${mbSaved}MB saved`;
    
    process.stdout.write(line);
    // Ensure output is flushed immediately
    if (typeof process.stdout.flush === 'function') {
      process.stdout.flush();
    }
  }

  complete() {
    this.current = this.total;
    this.render();
    process.stdout.write('\n');
  }
}

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

// Default to dry-run mode, require --fix to apply changes
const dryRun = !process.argv.includes('--fix');

// Parse command line arguments
const limitIndex = process.argv.indexOf('--limit');
const limit = limitIndex !== -1 && process.argv[limitIndex + 1] 
  ? parseInt(process.argv[limitIndex + 1], 10) 
  : null;

const ageDaysIndex = process.argv.indexOf('--age-days');
const ageDays = ageDaysIndex !== -1 && process.argv[ageDaysIndex + 1] 
  ? parseInt(process.argv[ageDaysIndex + 1], 10) 
  : null;

const forceCompress = process.argv.includes('--force-compress');

function printHelp() {
  console.log(`
Compression Backfill Tool

Compresses uncompressed content in the content_storage table using age-based compression tiers.

USAGE:
  node tools/compression/backfill-compression.js [options]

OPTIONS:
  --help, -h              Show this help message
  --fix                   Apply compression changes (default: dry run only)
  --age-days <days>       Only compress content older than specified days
  --limit <number>        Process only the specified number of items
  --force-compress        Compress all uncompressed content regardless of age (for backfill)

EXAMPLES:
  node tools/compression/backfill-compression.js                    # Dry run all uncompressed content
  node tools/compression/backfill-compression.js --fix              # Compress all uncompressed content
  node tools/compression/backfill-compression.js --age-days 30      # Compress content older than 30 days
  node tools/compression/backfill-compression.js --limit 100        # Process only 100 items
  node tools/compression/backfill-compression.js --fix --limit 50   # Compress 50 items

COMPRESSION TIERS:
  Hot (< 7 days):         No compression
  Warm (7-30 days):       Brotli level 6
  Cold (30+ days):        Brotli level 11

The tool analyzes uncompressed content, estimates space savings, and applies appropriate
compression based on content age. Use --fix to actually apply compression changes.
`);
}

async function backfillCompression() {
  const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
  const db = ensureDatabase(dbPath);

  console.log('='.repeat(80));
  console.log('COMPRESSION BACKFILL TOOL');
  console.log('='.repeat(80));
  console.log(`Database: ${dbPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will apply changes)'}`);
  if (ageDays) console.log(`Age filter: ${ageDays} days or older`);
  if (limit) console.log(`Limit: ${limit} items`);
  if (forceCompress) console.log(`Force compress: enabled (compress all regardless of age)`);
  console.log('');

  try {
    // Check if content_storage table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='content_storage'
    `).get();

    if (!tableExists) {
      console.log('✗ content_storage table not found - run schema migration first');
      return;
    }

    // Build query for uncompressed content
    let whereClause = "WHERE (compression_type_id IS NULL OR compression_type_id = 1)"; // 1 = 'none'
    if (ageDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - ageDays);
      whereClause += ` AND created_at <= '${cutoffDate.toISOString()}'`;
    }

    // Count uncompressed content
    const uncompressedCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM content_storage
      ${whereClause}
    `).get()?.count || 0;

    console.log(`Found ${uncompressedCount} uncompressed items in content_storage`);

    if (uncompressedCount === 0) {
      console.log('✓ No uncompressed content found - backfill not needed');
      return;
    }

    // Get sample of uncompressed content for analysis
    const sampleQuery = `
      SELECT
        cs.id,
        cs.http_response_id,
        u.url,
        cs.uncompressed_size as content_length,
        cs.created_at,
        cs.storage_type as content_type
      FROM content_storage cs
      LEFT JOIN http_responses hr ON cs.http_response_id = hr.id
      LEFT JOIN urls u ON hr.url_id = u.id
      ${whereClause}
      ORDER BY cs.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const uncompressedItems = db.prepare(sampleQuery).all();

    console.log(`Found ${uncompressedItems.length} uncompressed items to process`);
    
    // Show summary stats
    let totalSize = 0;
    for (const item of uncompressedItems) {
      totalSize += item.content_length;
    }
    
    console.log(`Total uncompressed size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Estimate compression savings
    const estimatedCompressedSize = totalSize * 0.3; // Assume 70% compression ratio
    const savings = totalSize - estimatedCompressedSize;
    console.log(`Estimated compressed size: ${(estimatedCompressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Estimated space savings: ${(savings / 1024 / 1024).toFixed(2)} MB (${((savings / totalSize) * 100).toFixed(1)}%)`);

    if (dryRun) {
      console.log('\nDRY RUN COMPLETE');
      console.log(`Would compress ${uncompressedItems.length} items`);
      console.log('Run with --fix to apply changes');
      return;
    }

    // Live compression backfill with progress bar
    console.log('\nStarting compression backfill...');
    console.log('Progress will update in real-time below:');
    
    const progressBar = new ProgressBar(uncompressedItems.length);
    let compressed = 0;
    let errors = 0;
    let bytesProcessed = 0;
    let bytesSaved = 0;

    for (let i = 0; i < uncompressedItems.length; i++) {
      const item = uncompressedItems[i];
      
      try {
        // Get full content - need to reconstruct from storage
        const fullItem = db.prepare(`
          SELECT cs.*, u.url
          FROM content_storage cs
          LEFT JOIN http_responses hr ON cs.http_response_id = hr.id
          LEFT JOIN urls u ON hr.url_id = u.id
          WHERE cs.id = ?
        `).get(item.id);

        // For inline storage, content is in content_blob
        // For compressed storage, content is in content_blob (already compressed)
        let contentToCompress;
        if (fullItem.storage_type === 'db_inline') {
          contentToCompress = fullItem.content_blob;
        } else if (fullItem.storage_type === 'compressed') {
          // This shouldn't happen for uncompressed items, but handle it
          contentToCompress = fullItem.content_blob;
        } else {
          // Skip unknown storage types
          continue;
        }

        if (!contentToCompress) continue;

        const originalSize = contentToCompress.length;
        bytesProcessed += originalSize;

        // Determine compression type based on age (simulate lifecycle logic)
        const itemAge = (Date.now() - new Date(fullItem.created_at).getTime()) / (1000 * 60 * 60 * 24);
        let compressionType = 'brotli_6'; // Default warm tier

        if (forceCompress) {
          // Force compression for backfill regardless of age
          compressionType = itemAge > 30 ? 'brotli_11' : 'brotli_6';
        } else {
          // Normal age-based tiering
          if (itemAge < 7) {
            compressionType = null; // Hot tier - no compression
          } else if (itemAge > 30) {
            compressionType = 'brotli_11'; // Cold tier - high compression
          }
        }

        if (compressionType) {
          // Compress the existing content and update the record
          const compressionUtil = require('../../src/utils/CompressionFacade');
          const typeInfo = compressionUtil.getCompressionType(db, compressionType);
          
          const compressedResult = compressionUtil.compress(contentToCompress, {
            algorithm: typeInfo.algorithm,
            level: typeInfo.level,
            windowBits: typeInfo.window_bits,
            blockBits: typeInfo.block_bits
          });
          
          // Update the existing record with compressed content
          db.prepare(`
            UPDATE content_storage
            SET 
              storage_type = ?,
              compression_type_id = ?,
              content_blob = ?,
              content_sha256 = ?,
              compressed_size = ?,
              compression_ratio = ?
            WHERE id = ?
          `).run(
            typeInfo.algorithm === 'none' ? 'db_inline' : 'db_compressed',
            typeInfo.id,
            compressedResult.compressed,
            compressedResult.sha256,
            compressedResult.compressedSize,
            compressedResult.ratio,
            fullItem.id
          );

          compressed++;
          bytesSaved += (originalSize - compressedResult.compressedSize);
        } else {
          // Mark as processed but uncompressed (hot tier)
          db.prepare(`
            UPDATE content_storage
            SET compression_type_id = 1
            WHERE id = ?
          `).run(fullItem.id);
        }

      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error.message);
        errors++;
      }

      // Update progress bar
      progressBar.update(i + 1, {
        compressed,
        errors,
        bytesProcessed,
        bytesSaved
      });
    }

    progressBar.complete();
    
    console.log('\nCompression backfill complete!');
    console.log(`✓ Compressed: ${compressed} items`);
    if (errors > 0) {
      console.log(`⚠️ Errors: ${errors} items`);
    }
    console.log(`📊 Total processed: ${(bytesProcessed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`💾 Space saved: ${(bytesSaved / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error('Backfill failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  backfillCompression().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { backfillCompression };