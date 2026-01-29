#!/usr/bin/env node

/**
 * compress-uncompressed-records.js - Compress uncompressed records using Brotli level 6
 *
 * This script finds all uncompressed records in content_storage and compresses them
 * using Brotli level 6 with 22-bit windows (matching the existing optimal settings).
 */

const path = require('path');
const { openDatabase } = require('../src/data/db/sqlite/v1/connection');
const { compress } = require('../src/shared/utils/CompressionFacade');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m'
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main(options = {}) {
  const useColors = process.stdout.isTTY;
  const banner = useColors ? `${colors.cyan || ''}` : '';
  console.log(`${banner}🗜️  Compressing uncompressed records with Brotli level 6...${useColors ? colors.reset : ''}\n`);

  const dbPath = options.dbPath || path.join(__dirname, '..', 'data', 'news.db');
  const db = openDatabase(dbPath, { readonly: false, fileMustExist: true });

  try {
    // Get Brotli level 6 compression type
    const brotli6Type = db.prepare(`
      SELECT * FROM compression_types
      WHERE algorithm = 'brotli' AND level = 6 AND window_bits = 22
    `).get();

    if (!brotli6Type) {
      throw new Error('Brotli level 6 (22-bit) compression type not found in database');
    }

    console.log(`Using compression type: ${brotli6Type.name} (ID: ${brotli6Type.id})`);

    // Find all uncompressed records
    const uncompressedRecords = db.prepare(`
      SELECT cs.id, cs.content_blob, cs.uncompressed_size
      FROM content_storage cs
      WHERE cs.compression_type_id IS NULL  -- Uncompressed records
        AND cs.content_blob IS NOT NULL
    `).all();

    console.log(`Found ${uncompressedRecords.length} uncompressed records to compress\n`);

    if (uncompressedRecords.length === 0) {
      console.log(`${colors.green}No uncompressed records found. All records are already compressed!${colors.reset}`);
      return {
        processed: 0,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        averageRatio: 1,
        spaceSavedPercent: 0,
        totalTimeSeconds: 0
      };
    }

    // Prepare update statement
    const updateStmt = db.prepare(`
      UPDATE content_storage
      SET compression_type_id = ?,
          content_blob = ?,
          compressed_size = ?,
          compression_ratio = ?,
          storage_type = 'db_compressed'
      WHERE id = ?
    `);

    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    let processed = 0;
    const startTime = Date.now();

    // Process records in batches to show progress
    const batchSize = 100;
    for (let i = 0; i < uncompressedRecords.length; i += batchSize) {
      const batch = uncompressedRecords.slice(i, i + batchSize);

      // Process batch
      for (const record of batch) {
        try {
          // Compress the content
          const result = compress(record.content_blob, {
            algorithm: 'brotli',
            level: 6,
            windowBits: 22
          });

          // Update the record
          updateStmt.run(
            brotli6Type.id,
            result.compressed,
            result.compressedSize,
            result.ratio,
            record.id
          );

          totalOriginalSize += result.uncompressedSize;
          totalCompressedSize += result.compressedSize;
          processed++;

          // Progress update every 50 records
          if (processed % 50 === 0 || processed === uncompressedRecords.length) {
            const progress = Math.round((processed / uncompressedRecords.length) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = processed / elapsed;
            const eta = (uncompressedRecords.length - processed) / rate;

            console.log(`${colors.cyan}Progress: ${processed}/${uncompressedRecords.length} (${progress}%)${colors.reset} | ${rate.toFixed(1)}/s | ETA: ${Math.round(eta)}s`);
          }

        } catch (error) {
          console.error(`${colors.red}Error compressing record ${record.id}: ${error.message}${colors.reset}`);
        }
      }
    }

    // Final statistics
    const totalRatio = totalCompressedSize / totalOriginalSize;
    const spaceSaved = ((1 - totalRatio) * 100).toFixed(1);
    const totalTime = (Date.now() - startTime) / 1000;

    console.log(`\n${colors.green}✅ Compression complete!${colors.reset}`);
    console.log(`📊 Processed: ${processed} records`);
    console.log(`📏 Original size: ${formatBytes(totalOriginalSize)}`);
    console.log(`📦 Compressed size: ${formatBytes(totalCompressedSize)}`);
    console.log(`🗜️  Average ratio: ${totalRatio.toFixed(3)}`);
    console.log(`💾 Space saved: ${spaceSaved}%`);
    console.log(`⏱️  Time taken: ${totalTime.toFixed(1)}s (${(processed / totalTime).toFixed(1)} records/s)`);

    return {
      processed,
      totalOriginalSize,
      totalCompressedSize,
      averageRatio: totalRatio,
      spaceSavedPercent: Number(spaceSaved),
      totalTimeSeconds: totalTime
    };

  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = { main };