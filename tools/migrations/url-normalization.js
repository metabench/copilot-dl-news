#!/usr/bin/env node

/**
 * URL Normalization Migration Tool
 *
 * Populates url_id foreign key columns by migrating TEXT URL fields
 * to normalized references in the urls table.
 *
 * Usage:
 *   node tools/migrations/url-normalization.js --env=dev --batch-size=10000
 *   node tools/migrations/url-normalization.js --env=prod --batch-size=50000 --progress-interval=1000
 *   node tools/migrations/url-normalization.js --limit=100 --table=crawl_jobs  # Process only 100 records
 *   node tools/migrations/url-normalization.js --resume-from=crawl_jobs --resume-offset=50000  # Resume from last processed ID
 *
 * Options:
 *   --env: Environment (dev/prod) - affects database path
 *   --batch-size: Records to process per transaction (default: 1000)
 *   --progress-interval: Progress logging interval (default: 100)
 *   --dry-run: Show what would be done without making changes
 *   --table: Process only specific table (links, queue_events, crawl_jobs, errors, url_aliases)
 *   --resume-from: Resume from specific table (for interrupted migrations)
 *   --resume-offset: Resume from specific ID in table (default: 0)
 *   --limit: Maximum total records to process across all tables
 *   --max-records: Alias for --limit
 *   --verify: Verify each batch after processing to ensure data integrity
 */

const path = require('path');
const { ensureDatabase, openDatabase } = require('../../src/db/sqlite/v1');

// Configuration
const CONFIG = {
  dev: {
    dbPath: path.join(__dirname, '../../data/news.db'),
    verbose: true
  },
  prod: {
    dbPath: path.join(__dirname, '../../data/prod.db'),
    verbose: false
  },
  custom: null // Will be set from --db option
};

// Tables to migrate with their URL field mappings
const TABLES_TO_MIGRATE = {
  links: [
    { textField: 'src_url', idField: 'src_url_id' },
    { textField: 'dst_url', idField: 'dst_url_id' }
  ],
  queue_events: [
    { textField: 'url', idField: 'url_id' }
  ],
  crawl_jobs: [
    { textField: 'url', idField: 'url_id' }
  ],
  errors: [
    { textField: 'url', idField: 'url_id' }
  ],
  url_aliases: [
    { textField: 'url', idField: 'url_id' },
    { textField: 'alias_url', idField: 'alias_url_id' }
  ]
};

class URLNormalizationMigrator {
  constructor(options = {}) {
    this.env = options.env || 'dev';
    this.batchSize = parseInt(options['batch-size']) || parseInt(options.batchSize) || 1000;

    const progressIntervalArg =
      options.hasOwnProperty('progress-interval') ? options['progress-interval'] : options.progressInterval;
    if (progressIntervalArg !== undefined) {
      const parsedInterval = parseInt(progressIntervalArg, 10);
      this.progressInterval = Number.isNaN(parsedInterval) ? 1000 : parsedInterval;
    } else {
      this.progressInterval = 1000;
    }

    // Special case: 0 means disable periodic updates (show progress after each batch instead)
    if (this.progressInterval === 0) {
      this.progressInterval = null; // Will be handled differently
    }
    this.dryRun = options['dry-run'] || options.dryRun || false;
    this.specificTable = options.table;
    this.resumeFrom = options['resume-from'] || options.resumeFrom;
    this.customDbPath = options.db;
    this.limit = parseInt(options.limit) || parseInt(options['max-records']) || null; // New: limit total records processed
    this.resumeOffset = parseInt(options['resume-offset']) || 0; // New: resume from specific ID in table
    this.verify = options.verify || false; // New: verify batches after processing
    this.showIndividualUrls = options['show-individual-urls'] || options['show-each-url'] || false;
    this.checkRemaining = options['check-remaining'] || options['status'] || false; // New: show individual URLs being processed

    if (this.env === 'custom') {
      if (!this.customDbPath) {
        throw new Error('Custom environment requires --db=path/to/database.db');
      }
      this.config = {
        dbPath: path.resolve(this.customDbPath),
        verbose: false
      };
      // For custom databases, assume schema is already initialized
      this.db = openDatabase(this.config.dbPath);
    } else {
      this.config = CONFIG[this.env];
      this.db = ensureDatabase(this.config.dbPath);
    }
    this.stats = {
      totalProcessed: 0,
      totalUrlsCreated: 0,
      totalErrors: 0,
      startTime: Date.now(),
      tableStats: {},
      finalProgress: {} // New: track final progress for resumability
    };
  }

  checkRemainingBatches() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Remaining Batches Check`);
    console.log(`${'='.repeat(60)}`);

    const tables = this.getTablesToProcess();
    let totalRemainingRecords = 0;
    let totalRemainingBatches = 0;

    for (const tableName of tables) {
      const tableConfig = TABLES_TO_MIGRATE[tableName];
      if (!tableConfig) continue;

      // Count remaining records
      const whereClause = tableConfig.map(f => `${f.idField} IS NULL`).join(' AND ');
      const totalRecords = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE ${whereClause}
      `).get().count;

      if (totalRecords > 0) {
        const batches = Math.ceil(totalRecords / this.batchSize);
        console.log(`${tableName}: ${totalRecords.toLocaleString()} records remaining (${batches} batches of ${this.batchSize})`);
        totalRemainingRecords += totalRecords;
        totalRemainingBatches += batches;
      } else {
        console.log(`${tableName}: ✅ Complete (0 records remaining)`);
      }
    }

    console.log(`${'='.repeat(60)}`);
    console.log(`Total: ${totalRemainingRecords.toLocaleString()} records remaining`);
    console.log(`Total: ${totalRemainingBatches} batches of ${this.batchSize} remaining`);
    console.log(`${'='.repeat(60)}\n`);
  }

  async run() {
    // Handle check remaining mode
    if (this.checkRemaining) {
      try {
        await this.validateSchema();
        this.checkRemainingBatches();
        return;
      } catch (error) {
        console.error('\n❌ Check failed:', error.message);
        throw error;
      }
    }

    console.log(`\n🚀 URL Normalization Migration (${this.env}) - ${this.dryRun ? 'DRY RUN' : 'LIVE'}\n`);

    // Show performance expectations
    console.log(`📊 Performance Notes:`);
    console.log(`   • Large tables (>1M records) may take 5-15 minutes`);
    console.log(`   • Initial analysis can take 10-30 seconds per table`);
    if (this.progressInterval === null) {
      console.log(`   • Progress updates after each batch with ETA estimates`);
    } else {
      console.log(`   • Progress updates every ${this.progressInterval}ms with ETA estimates`);
    }
    console.log(`   • Process continues even if individual batches fail\n`);

    try {
      // Validate migration schema has been applied
      await this.validateSchema();

      // Get tables to process
      const tablesToProcess = this.getTablesToProcess();

      for (const tableName of tablesToProcess) {
        await this.migrateTable(tableName);
      }

      this.printSummary();

    } catch (error) {
      console.error('\n❌ Migration failed:', error.message);
      throw error;
    }
  }

  async validateSchema() {
    // Silently validate migration schema
    for (const [tableName, fields] of Object.entries(TABLES_TO_MIGRATE)) {
      for (const field of fields) {
        const columnExists = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM pragma_table_info(?)
          WHERE name = ?
        `).get(tableName, field.idField);

        if (!columnExists.count) {
          throw new Error(`Migration schema not applied: ${tableName}.${field.idField} column missing`);
        }
      }
    }
  }

  getTablesToProcess() {
    let tables = Object.keys(TABLES_TO_MIGRATE);

    if (this.resumeFrom) {
      const resumeIndex = tables.indexOf(this.resumeFrom);
      if (resumeIndex === -1) {
        throw new Error(`Unknown table for resume: ${this.resumeFrom}`);
      }
      tables = tables.slice(resumeIndex);
      console.log(`📍 Resuming from table: ${this.resumeFrom}`);
    }

    if (this.specificTable) {
      if (!tables.includes(this.specificTable)) {
        throw new Error(`Unknown table: ${this.specificTable}`);
      }
      tables = [this.specificTable];
    }

    return tables;
  }

  async migrateTable(tableName) {
    const tableConfig = TABLES_TO_MIGRATE[tableName];
    const tableStats = {
      processed: 0,
      urlsCreated: 0,
      errors: 0,
      startTime: Date.now()
    };

    // Initialize final progress tracking
    this.stats.finalProgress[tableName] = {
      lastId: this.resumeOffset > 0 ? this.resumeOffset : 0,
      processed: 0,
      totalRecords: 0
    };

    // Show the WHERE clause being used
    const whereClause = tableConfig.map(f => `${f.idField} IS NULL`).join(' AND ');

    // Detailed analysis phase with verbose output
    console.log(`\n📊 Analyzing table '${tableName}'...`);
    console.log(`   • Checking migration schema: ${tableConfig.map(f => `${f.idField} (for ${f.textField})`).join(', ')}`);
    console.log(`   • Finding records where: ${whereClause}`);
    console.log(`   • Running COUNT query on ${tableName} table... `);
    const countStart = Date.now();
    const totalRecords = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM ${tableName}
      WHERE ${whereClause}
    `).get().count;
    const countDuration = ((Date.now() - countStart) / 1000).toFixed(1);
    console.log(`✓ Found ${totalRecords.toLocaleString()} records (${countDuration}s)`);

    // Apply global limit if specified
    let effectiveTotal = totalRecords;
    if (this.limit && this.stats.totalProcessed + totalRecords > this.limit) {
      effectiveTotal = Math.max(0, this.limit - this.stats.totalProcessed);
      console.log(`   • Limiting to ${effectiveTotal.toLocaleString()} records (global limit: ${this.limit.toLocaleString()})`);
    }

    // Apply resume offset (now treated as last processed ID)
    let lastProcessedId = this.resumeOffset > 0 ? this.resumeOffset : 0;
    if (lastProcessedId > 0) {
      console.log(`   • Resuming from ID ${lastProcessedId.toLocaleString()}`);
    }

    if (effectiveTotal === 0) {
      console.log(`   • Result: No records need migration in ${tableName}`);
      console.log(`   ✓ ${tableName}: Skipped (0 records need processing)\n\n`);
      return;
    }

    console.log(`   • Planning: ${effectiveTotal.toLocaleString()} records will be processed in batches of ${this.batchSize}`);
    const totalBatches = Math.ceil(effectiveTotal / this.batchSize);
    console.log(`   • Estimated: ${totalBatches} batches total`);
    console.log(`   • Each batch: SELECT + UPDATE operations for up to ${this.batchSize} records`);

    console.log(`\n🚀 Starting migration of ${tableName}...`);

    // Show initial progress immediately
    const initialProgressLine = `  ${tableName}: 0.0% │ 0/${effectiveTotal.toLocaleString()} │ 0/sec │ ETA calculating...`;
    console.log(initialProgressLine);

    let lastProgressTime = Date.now();
    let lastProgressProcessed = 0;

    // Set up progress reporting with configurable interval
    // If progressInterval is null, we'll update after each batch instead
    let progressInterval = null;
    if (this.progressInterval !== null) {
      progressInterval = setInterval(() => {
        try {
          const now = Date.now();
          const percent = effectiveTotal > 0 ? ((tableStats.processed / effectiveTotal) * 100).toFixed(1) : '0.0';
          const elapsed = (now - tableStats.startTime) / 1000;
          const recentElapsed = (now - lastProgressTime) / 1000;
          const recentProcessed = tableStats.processed - lastProgressProcessed;
          const recentRate = recentElapsed > 0 ? Math.round(recentProcessed / recentElapsed) : 0;

          // Calculate ETA
          const remainingRecords = effectiveTotal - tableStats.processed;
          let eta = '';
          if (recentRate > 0 && remainingRecords > 0) {
            const etaSeconds = Math.ceil(remainingRecords / recentRate);
            if (etaSeconds < 60) {
              eta = ` ETA ${etaSeconds}s`;
            } else if (etaSeconds < 3600) {
              eta = ` ETA ${Math.floor(etaSeconds / 60)}m${etaSeconds % 60}s`;
            } else {
              const hours = Math.floor(etaSeconds / 3600);
              const minutes = Math.floor((etaSeconds % 3600) / 60);
              eta = ` ETA ${hours}h${minutes}m`;
            }
          } else if (tableStats.processed === 0) {
            eta = ' ETA calculating...';
          }

          const elapsedStr = elapsed < 60 ? `${elapsed.toFixed(0)}s` : `${Math.floor(elapsed / 60)}m${Math.floor(elapsed % 60)}s`;
          const progressLine = `  ${tableName}: ${percent}% │ ${tableStats.processed.toLocaleString()}/${effectiveTotal.toLocaleString()} │ ${recentRate}/sec │ ${elapsedStr}${eta}`;

          // Use console.log for consistent output (avoid ANSI escape issues)
          console.log(progressLine);

          lastProgressTime = now;
          lastProgressProcessed = tableStats.processed;
        } catch (error) {
          // Silently handle progress update errors to avoid breaking migration
          // This can happen if the terminal doesn't support ANSI codes
        }
      }, this.progressInterval);
    }

    // Process in batches using ID-based pagination (much more efficient than OFFSET)
    let batchCount = 0;
    let hasMoreRecords = true;

    try {

      console.log(`\n   📦 Processing ${totalBatches} batches (${this.batchSize} records each)...\n`);

      while (hasMoreRecords && (this.limit === null || this.stats.totalProcessed < this.limit)) {
        batchCount++;

        // Check if we've hit the global limit
        if (this.limit && this.stats.totalProcessed >= this.limit) {
          console.log(`\n   ⏹️  Global limit of ${this.limit.toLocaleString()} records reached`);
          break;
        }

        try {
          // Use synchronous transaction since better-sqlite3 doesn't support async
          const batchStart = Date.now();
          let batchRecords = []; // Store records for verification
          const transaction = this.db.transaction(() => {
            if (this.dryRun) {
              // In dry-run mode, count records that would be processed
              const countResult = this.db.prepare(`
                SELECT COUNT(*) as count
                FROM ${tableName}
                WHERE ${tableConfig.map(f => `${f.idField} IS NULL`).join(' AND ')}
                AND id > ?
                ORDER BY id
                LIMIT ?
              `).get(lastProcessedId, this.batchSize);

              if (countResult.count === 0) {
                return { processed: 0, records: [], hasMore: false }; // No more records to process
              }

              tableStats.processed += countResult.count;
              return { processed: countResult.count, records: [], hasMore: true };
            }

            // Get batch of records using ID-based pagination (much faster than OFFSET)
            const records = this.db.prepare(`
              SELECT id, ${tableConfig.map(f => f.textField).join(', ')}
              FROM ${tableName}
              WHERE ${tableConfig.map(f => `${f.idField} IS NULL`).join(' AND ')}
              AND id > ?
              ORDER BY id
              LIMIT ?
            `).all(lastProcessedId, this.batchSize);

            if (records.length === 0) {
              return { processed: 0, records: [], hasMore: false }; // No more records to process
            }

            // Process each record
            for (const record of records) {
              this.migrateRecord(tableName, record, tableConfig);
              lastProcessedId = record.id; // Update last processed ID
            }

            tableStats.processed += records.length;
            return { processed: records.length, records: records, hasMore: records.length === this.batchSize };
          });

          const result = transaction();
          const processed = result.processed;
          batchRecords = result.records;
          hasMoreRecords = result.hasMore;
          const batchDuration = Date.now() - batchStart;

          // Show progress after each batch if periodic updates are disabled
          if (this.progressInterval === null) {
            const now = Date.now();
            const percent = effectiveTotal > 0 ? ((tableStats.processed / effectiveTotal) * 100).toFixed(1) : '0.0';
            const elapsed = (now - tableStats.startTime) / 1000;
            const recentElapsed = (now - lastProgressTime) / 1000;
            const recentProcessed = tableStats.processed - lastProgressProcessed;
            const recentRate = recentElapsed > 0 ? Math.round(recentProcessed / recentElapsed) : 0;

            // Calculate ETA
            const remainingRecords = effectiveTotal - tableStats.processed;
            let eta = '';
            if (recentRate > 0 && remainingRecords > 0) {
              const etaSeconds = Math.ceil(remainingRecords / recentRate);
              if (etaSeconds < 60) {
                eta = ` ETA ${etaSeconds}s`;
              } else if (etaSeconds < 3600) {
                eta = ` ETA ${Math.floor(etaSeconds / 60)}m${etaSeconds % 60}s`;
              } else {
                const hours = Math.floor(etaSeconds / 3600);
                const minutes = Math.floor((etaSeconds % 3600) / 60);
                eta = ` ETA ${hours}h${minutes}m`;
              }
            } else if (tableStats.processed === 0) {
              eta = ' ETA calculating...';
            }

            const elapsedStr = elapsed < 60 ? `${elapsed.toFixed(0)}s` : `${Math.floor(elapsed / 60)}m${Math.floor(elapsed % 60)}s`;
            const progressLine = `  ${tableName}: ${percent}% │ ${tableStats.processed.toLocaleString()}/${effectiveTotal.toLocaleString()} │ ${recentRate}/sec │ ${elapsedStr}${eta}`;

            // For per-batch updates, print each progress on a new line
            console.log(progressLine);

            lastProgressTime = now;
            lastProgressProcessed = tableStats.processed;
          }

          // Verify batch integrity if enabled
          if (!this.dryRun && processed > 0 && batchRecords.length > 0) {
            // Get updated records for verification (after migration)
            const updatedRecords = this.db.prepare(`
              SELECT id, ${tableConfig.map(f => `${f.textField}, ${f.idField}`).join(', ')}
              FROM ${tableName}
              WHERE id IN (${batchRecords.map(() => '?').join(',')})
            `).all(...batchRecords.map(r => r.id));

            // Temporarily pause progress updates during verification
            console.log(''); // Start verification on new line
            this.verifyBatch(tableName, tableConfig, updatedRecords, batchCount, totalBatches);
            // Progress will resume automatically on next interval
          }

          // Log slow batches (>5 seconds) to stderr to avoid interfering with progress
          if (batchDuration > 5000) {
            console.log(''); // Start message on new line
            console.log(`   🐌 Slow batch ${batchCount}/${totalBatches} (${processed} records, ${batchDuration}ms)`);
            // Progress will resume automatically on next interval
          }

        } catch (error) {
          // Log errors to stderr to avoid interfering with progress
          console.log(''); // Start error message on new line
          console.log(`   ❌ Batch ${batchCount}/${totalBatches} failed: ${error.message}`);
          tableStats.errors++;
          // Continue with next batch (don't fail entire migration)
          offset += this.batchSize;
          // Progress will resume automatically on next interval
        }
      }
    } finally {
      // Clean up progress reporting
      if (progressInterval) {
        clearInterval(progressInterval);
      }

      // Ensure we end with a newline so terminal prompt appears correctly
      console.log('');

      // Show final progress
      const finalPercent = effectiveTotal > 0 ? ((tableStats.processed / effectiveTotal) * 100).toFixed(1) : '100.0';
      const finalElapsed = ((Date.now() - tableStats.startTime) / 1000).toFixed(0);
      const finalProgressLine = `  ${tableName}: ${finalPercent}% │ ${tableStats.processed.toLocaleString()}/${effectiveTotal.toLocaleString()} │ Complete │ ${finalElapsed}s`;
      console.log(finalProgressLine);

      // Update final progress tracking
      this.stats.finalProgress[tableName] = {
        lastId: lastProcessedId,
        processed: tableStats.processed,
        totalRecords: effectiveTotal,
        completed: tableStats.processed >= effectiveTotal
      };

      console.log(`   ✓ ${tableName} migration completed\n\n`);
    }

    tableStats.duration = Date.now() - tableStats.startTime;
    this.stats.tableStats[tableName] = tableStats;
    this.stats.totalProcessed += tableStats.processed;
    this.stats.totalUrlsCreated += tableStats.urlsCreated;
    this.stats.totalErrors += tableStats.errors;
  }

  migrateRecord(tableName, record, tableConfig) {
    const updates = {};

    for (const field of tableConfig) {
      const urlText = record[field.textField];
      if (!urlText) continue; // Skip null/empty URLs

      // Get or create URL ID
      const urlId = this.getOrCreateUrlId(urlText);
      if (urlId) {
        updates[field.idField] = urlId;

        // Show individual URL if requested
        if (this.showIndividualUrls) {
          // Get the normalized URL from the urls table
          const urlRecord = this.db.prepare('SELECT url FROM urls WHERE id = ?').get(urlId);
          const normalizedUrl = urlRecord ? urlRecord.url : 'NOT FOUND';
          console.log(`     • ${field.textField}: "${urlText}" → ID ${urlId} (${normalizedUrl})`);
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(record.id); // WHERE clause

      this.db.prepare(`
        UPDATE ${tableName}
        SET ${setClause}
        WHERE id = ?
      `).run(...values);
    }
  }

  verifyBatch(tableName, tableConfig, batchRecords, batchCount, totalBatches) {
    if (!this.verify) return; // Skip verification if not enabled

    const recordIds = batchRecords.map(r => r.id);

    // Show individual URLs if requested
    if (this.showIndividualUrls) {
      console.log(`   📋 URLs in this batch:`);
      for (const record of batchRecords) {
        for (const field of tableConfig) {
          const urlText = record[field.textField];
          const urlId = record[field.idField];
          if (urlText) {
            // Get the normalized URL from the urls table
            const urlRecord = this.db.prepare('SELECT url FROM urls WHERE id = ?').get(urlId);
            const normalizedUrl = urlRecord ? urlRecord.url : 'NOT FOUND';
            console.log(`     • ${field.textField}: "${urlText}" → ID ${urlId} (${normalizedUrl})`);
          }
        }
      }
    }

    // Check that all URL ID fields are populated
    for (const field of tableConfig) {
      const nullCount = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE id IN (${recordIds.map(() => '?').join(',')}) AND ${field.idField} IS NULL
      `).get(...recordIds).count;

      if (nullCount > 0) {
        throw new Error(`Verification failed: ${nullCount} records in batch still have NULL ${field.idField}`);
      }

      // Check that all URL IDs reference existing URLs
      const invalidCount = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM ${tableName} t
        LEFT JOIN urls u ON t.${field.idField} = u.id
        WHERE t.id IN (${recordIds.map(() => '?').join(',')}) AND t.${field.idField} IS NOT NULL AND u.id IS NULL
      `).get(...recordIds).count;

      if (invalidCount > 0) {
        throw new Error(`Verification failed: ${invalidCount} records reference non-existent URLs in ${field.idField}`);
      }
    }

    // Log successful verification with batch progress
    const remainingBatches = totalBatches - batchCount;
    console.log(`   ✅ Batch ${batchCount}/${totalBatches} verified: ${batchRecords.length} records OK (${remainingBatches} remaining)`);
  }

  getOrCreateUrlId(urlText) {
    // First try to find existing URL
    let urlRecord = this.db.prepare('SELECT id FROM urls WHERE url = ?').get(urlText);

    // URL doesn't exist, create it
    try {
      const result = this.db.prepare(`
        INSERT INTO urls (url, created_at, last_seen_at)
        VALUES (?, ?, ?)
      `).run(urlText, new Date().toISOString(), new Date().toISOString());

      this.stats.totalUrlsCreated++;
      return result.lastInsertRowid;
    } catch (error) {
      // Handle unique constraint violation (race condition)
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        urlRecord = this.db.prepare('SELECT id FROM urls WHERE url = ?').get(urlText);
        return urlRecord ? urlRecord.id : null;
      }
      throw error;
    }
  }

  printSummary() {
    const totalDuration = Date.now() - this.stats.startTime;
    const rate = Math.round(this.stats.totalProcessed / (totalDuration / 1000));
    const durationSec = (totalDuration / 1000).toFixed(1);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Migration Summary`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Records processed: ${this.stats.totalProcessed.toLocaleString()}`);
    console.log(`URLs created: ${this.stats.totalUrlsCreated.toLocaleString()}`);
    console.log(`Errors: ${this.stats.totalErrors}`);
    console.log(`Duration: ${durationSec}s (${rate} records/sec)`);

    if (this.dryRun) {
      console.log(`\n🔍 DRY RUN - No changes made`);
    }

    // Show final progress for resumability
    console.log(`\n📍 Final Progress (for resumability):`);
    for (const [tableName, progress] of Object.entries(this.stats.finalProgress)) {
      const status = progress.completed ? '✅ Complete' : '⏸️  Partial';
      console.log(`   ${tableName}: ${progress.processed.toLocaleString()}/${progress.totalRecords.toLocaleString()} records (${status})`);
      if (!progress.completed) {
        console.log(`     Resume with: --table=${tableName} --resume-offset=${progress.lastId}`);
      }
    }

    console.log(`${'='.repeat(60)}\n`);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      // Check if this arg contains '='
      if (arg.includes('=')) {
        const [k, value] = key.split('=');
        options[k] = value || true;
      } else {
        // Check if next arg exists and doesn't start with '--'
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          options[key] = args[i + 1];
          i++; // Skip the next arg since we consumed it
        } else {
          options[key] = true;
        }
      }
    }
  }

  return options;
}

// Main execution
async function main() {
  try {
    const options = parseArgs();

    // Handle --help flag
    if (options.help) {
      console.log(`
URL Normalization Migration Tool

Populates url_id foreign key columns by migrating TEXT URL fields
to normalized references in the urls table.

Usage:
  node tools/migrations/url-normalization.js --env=dev --batch-size=10000
  node tools/migrations/url-normalization.js --env=prod --batch-size=50000 --progress-interval=1000
  node tools/migrations/url-normalization.js --limit=100 --table=crawl_jobs  # Process only 100 records
  node tools/migrations/url-normalization.js --resume-from=crawl_jobs --resume-offset=50000  # Resume from offset

Options:
  --env: Environment (dev/prod) - affects database path
  --batch-size: Records to process per transaction (default: 1000)
  --progress-interval: Progress logging interval in milliseconds (default: 1000, 0 = per-batch updates)
  --dry-run: Show what would be done without making changes
  --table: Process only specific table (links, queue_events, crawl_jobs, errors, url_aliases)
  --resume-from: Resume from specific table (for interrupted migrations)
  --resume-offset: Resume from specific offset in table (default: 0)
  --limit: Maximum total records to process across all tables
  --max-records: Alias for --limit
  --verify: Verify each batch after processing to ensure data integrity
  --show-individual-urls: Show each URL being normalized and verified
  --show-each-url: Alias for --show-individual-urls
  --check-remaining: Check and report remaining batches without migrating
  --status: Alias for --check-remaining
  --help: Show this help message

Examples:
  # Basic migration
  node tools/migrations/url-normalization.js

  # Migration with verification
  node tools/migrations/url-normalization.js --verify

  # Migration with URL display (shows each URL being processed)
  node tools/migrations/url-normalization.js --show-individual-urls

  # Migration with verification and URL display
  node tools/migrations/url-normalization.js --verify --show-individual-urls

  # Test migration with small batch and URL display
  node tools/migrations/url-normalization.js --limit=100 --batch-size=10 --show-individual-urls

  # Resume interrupted migration
  node tools/migrations/url-normalization.js --resume-from=links --resume-offset=50000

  # Check remaining batches without migrating
  node tools/migrations/url-normalization.js --check-remaining
`);
      process.exit(0);
    }

    const migrator = new URLNormalizationMigrator(options);
    await migrator.run();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { URLNormalizationMigrator };