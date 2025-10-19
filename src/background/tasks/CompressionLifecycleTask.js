/**
 * Age-Based Compression Lifecycle Background Task
 *
 * Automatically compresses content based on age thresholds:
 * - Content < 7 days: db_inline (no compression)
 * - Content 7-30 days: compress with brotli_6
 * - Content 30+ days: recompress with brotli_11
 *
 * Runs as a scheduled background task (daily at 2 AM).
 */

const { compressAndStore } = require('../../utils/compression');
const { tof } = require('lang-tools');

/**
 * Age-based compression lifecycle task
 */
class CompressionLifecycleTask {
  /**
   * @param {Object} options - Task options
   * @param {Database} options.db - better-sqlite3 database instance
   * @param {number} options.taskId - Task ID
   * @param {Object} options.config - Task configuration
   * @param {AbortSignal} options.signal - Abort signal for cancellation
   * @param {Function} options.onProgress - Progress callback
   * @param {Function} options.onError - Error callback
   */
  constructor(options) {
    this.db = options.db;
    this.taskId = options.taskId;
    this.config = options.config || {};
    this.signal = options.signal;
    this.onProgress = options.onProgress;
    this.onError = options.onError;

    // Age-based compression strategy
    this.ageStrategy = this.config.ageStrategy || {
      hot: { maxAgeDays: 7, compression: null }, // No compression for recent content
      warm: { maxAgeDays: 30, compression: 'brotli_6' }, // Balanced compression
      cold: { maxAgeDays: Infinity, compression: 'brotli_11' } // Max compression for old content
    };

    this.batchSize = this.config.batchSize || 100;
    this.delayMs = this.config.delayMs || 0; // Delay between batches for throttling
  }

  /**
   * Execute the compression lifecycle task
   */
  async execute() {
    try {
      // Process each age tier in order (hot → warm → cold)
      const tiers = [
        { name: 'hot', ...this.ageStrategy.hot },
        { name: 'warm', ...this.ageStrategy.warm },
        { name: 'cold', ...this.ageStrategy.cold }
      ];

      let totalProcessed = 0;
      let totalErrors = 0;

      for (const tier of tiers) {
        if (this.signal.aborted) {
          break;
        }

        const result = await this._processTier(tier);
        totalProcessed += result.processed;
        totalErrors += result.errors;

        // Progress update for each tier
        if (tof(this.onProgress) === 'function') {
          this.onProgress({
            current: totalProcessed,
            total: null, // Unknown total until all tiers processed
            message: `Processed ${tier.name} tier: ${result.processed} items`,
            metadata: {
              tier: tier.name,
              processed: result.processed,
              errors: result.errors,
              totalProcessed,
              totalErrors
            }
          });
        }
      }

      // Final progress update
      if (tof(this.onProgress) === 'function') {
        this.onProgress({
          current: totalProcessed,
          total: totalProcessed,
          message: `Lifecycle complete: ${totalProcessed} items processed`,
          metadata: {
            totalProcessed,
            totalErrors,
            tiersProcessed: tiers.length
          }
        });
      }

    } catch (error) {
      if (tof(this.onError) === 'function') {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Process a single age tier
   * @private
   */
  async _processTier(tier) {
    const { name, maxAgeDays, compression } = tier;
    let processed = 0;
    let errors = 0;
    let lastProcessedId = 0;

    // Skip if no compression needed for this tier
    if (!compression) {
      return { processed: 0, errors: 0 };
    }

    while (!this.signal.aborted) {
      // Find uncompressed content in this age range
      const contentToCompress = this.db.prepare(`
        SELECT cs.id, cs.content_blob, cs.http_response_id
        FROM content_storage cs
        INNER JOIN http_responses hr ON cs.http_response_id = hr.id
        WHERE cs.id > ?
          AND cs.storage_type = 'db_inline'
          AND cs.content_blob IS NOT NULL
          AND LENGTH(cs.content_blob) > 0
          AND hr.fetched_at < datetime('now', '-${maxAgeDays} days')
          ${name === 'warm' ? `AND hr.fetched_at >= datetime('now', '-${this.ageStrategy.hot.maxAgeDays} days')` : ''}
          ${name === 'cold' ? `AND hr.fetched_at < datetime('now', '-${this.ageStrategy.warm.maxAgeDays} days')` : ''}
        ORDER BY cs.id ASC
        LIMIT ?
      `).all(lastProcessedId, this.batchSize);

      if (contentToCompress.length === 0) {
        break; // No more content in this tier
      }

      // Process batch
      for (const content of contentToCompress) {
        if (this.signal.aborted) {
          break;
        }

        try {
          // Compress content using compressAndStore
          const result = compressAndStore(this.db, content.content_blob, {
            compressionType: compression,
            useCase: name === 'cold' ? 'max_compression' : 'balanced'
          });

          // Update content_storage record to point to compressed version
          this.db.prepare(`
            UPDATE content_storage
            SET storage_type = 'db_compressed',
                compression_type_id = ?,
                compressed_size = ?,
                compression_ratio = ?
            WHERE id = ?
          `).run(
            this._getCompressionTypeId(compression),
            result.compressedSize,
            result.ratio,
            content.id
          );

          processed++;
          lastProcessedId = content.id;

        } catch (error) {
          errors++;
          console.error(`[CompressionLifecycleTask] Error compressing content ${content.id} in ${name} tier:`, error.message);
          lastProcessedId = content.id; // Continue with next item
        }
      }

      // Throttling delay between batches
      if (this.delayMs > 0 && contentToCompress.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
    }

    return { processed, errors };
  }

  /**
   * Get compression type ID by name
   * @private
   */
  _getCompressionTypeId(name) {
    const type = this.db.prepare('SELECT id FROM compression_types WHERE name = ?').get(name);
    return type ? type.id : null;
  }

  /**
   * Pause the task
   */
  pause() {
    // Age-based tasks are typically short and don't need pausing
    // But implement for consistency
  }

  /**
   * Resume the task
   */
  resume() {
    // Age-based tasks are typically short and don't need resuming
    // But implement for consistency
  }
}

module.exports = { CompressionLifecycleTask };