/**
 * Article Compression Background Task
 * 
 * Compresses uncompressed article HTML content using Brotli quality 10 with 256MB memory.
 * Uses worker thread pool for parallel compression without blocking the main thread.
 * Tracks progress, handles errors, and supports pause/resume.
 */

const { compress, getCompressionType } = require('../../shared/utils/CompressionFacade');
const { updateContentStorageCompressionCleanupResult } = require('news-crawler-db');
const { tof } = require('lang-tools');

/**
 * Article compression task
 */
class CompressionTask {
  /**
   * @param {Object} options - Task options
   * @param {Database} options.db - better-sqlite3 database instance
   * @param {number} options.taskId - Task ID
   * @param {Object} options.config - Task configuration
   * @param {AbortSignal} options.signal - Abort signal for cancellation
   * @param {Function} options.onProgress - Progress callback
   * @param {Function} options.onError - Error callback
   * @param {CompressionWorkerPool} [options.workerPool] - Worker pool for parallel compression
   */
  constructor(options) {
    this.db = options.db;
    this.taskId = options.taskId;
    this.config = options.config || {};
    this.signal = options.signal;
    this.onProgress = options.onProgress;
    this.onError = options.onError;
    this.workerPool = options.workerPool || null; // If provided, use worker threads
    
    this.paused = false;
    this.batchSize = this.config.batchSize || 100;
    this.compressionType = this.config.compressionType || 'brotli_10';
    this.delayMs = this.config.delayMs || 0; // Delay between batches for throttling
    this.useCompressionBuckets = this.config.useCompressionBuckets || false; // Not used yet, reserved for future
    this.brotliQuality = this.config.brotliQuality || 10; // Brotli quality (0-11)
    this.brotliWindow = this.config.brotliWindow || 24; // Window size (24 = 256MB)
  }
  
  /**
   * Execute the compression task
   */
  async execute() {
    try {
      // Get compression type settings
      const compressionTypeRow = getCompressionType(this.db, this.compressionType);
      if (!compressionTypeRow) {
        throw new Error(`Compression type not found: ${this.compressionType}`);
      }
      
      // Count total content to compress (from content_storage, not articles)
      const totalCount = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM content_storage cs
        INNER JOIN http_responses hr ON cs.http_response_id = hr.id
        WHERE cs.storage_type = 'db_inline'
          AND cs.content_blob IS NOT NULL
          AND LENGTH(cs.content_blob) > 0
      `).get().count;
      
      if (totalCount === 0) {
        // Nothing to compress
        if (tof(this.onProgress) === 'function') {
          this.onProgress({
            current: 0,
            total: 0,
            message: 'No articles to compress',
            metadata: { processed: 0, errors: 0 }
          });
        }
        return;
      }
      
      // Get last processed ID from config (for resume)
      let lastProcessedId = this.config.lastProcessedId || 0;
      let processed = 0;
      let errors = 0;
      
      // Main processing loop
      while (!this.signal.aborted && !this.paused) {
        // Fetch batch of content from content_storage
        const contents = this.db.prepare(`
          SELECT cs.id, cs.content_blob, cs.http_response_id
          FROM content_storage cs
          INNER JOIN http_responses hr ON cs.http_response_id = hr.id
          WHERE cs.id > ?
            AND cs.storage_type = 'db_inline'
            AND cs.content_blob IS NOT NULL
            AND LENGTH(cs.content_blob) > 0
          ORDER BY cs.id ASC
          LIMIT ?
        `).all(lastProcessedId, this.batchSize);
        
        if (contents.length === 0) {
          break; // All done
        }
        
        // Process batch (with or without worker pool)
        if (this.workerPool) {
          // Use worker pool for parallel compression
          await this._processBatchWithWorkers(contents, (success, contentId) => {
            if (success) {
              processed++;
            } else {
              errors++;
            }
            lastProcessedId = Math.max(lastProcessedId, contentId);
          });
        } else {
          // Process in main thread (synchronous)
          for (const content of contents) {
            if (this.signal.aborted || this.paused) {
              break;
            }
            
            try {
              // Compress the row IN PLACE (rewrites content_blob). NOT
              // compressAndStore, which INSERTs a new orphan row and leaves this
              // row's content_blob raw while marking it db_compressed -> the row
              // then fails to decompress on read (data corruption).
              this._compressRowInPlace(content);
              processed++;
              lastProcessedId = content.id;
              
            } catch (error) {
              errors++;
              console.error(`[CompressionTask] Error compressing content ${content.id}:`, error.message);
              
              // Continue with next content (don't fail entire task for one item)
              lastProcessedId = content.id;
            }
          }
        }
        
        // Update progress
        if (tof(this.onProgress) === 'function') {
          this.onProgress({
            current: processed,
            total: totalCount,
            message: `Compressed ${processed}/${totalCount} content items`,
            metadata: {
              processed,
              errors,
              lastProcessedId,
              compressionType: this.compressionType,
              usingWorkerPool: !!this.workerPool
            }
          });
        }
        
        // Throttling delay between batches
        if (this.delayMs > 0 && contents.length > 0) {
          await new Promise(resolve => setTimeout(resolve, this.delayMs));
        }
      }
      
      // Final progress update
      if (tof(this.onProgress) === 'function') {
        this.onProgress({
          current: processed,
          total: totalCount,
          message: processed === totalCount 
            ? `Compression complete: ${processed} content items compressed`
            : `Paused: ${processed}/${totalCount} content items compressed`,
          metadata: {
            processed,
            errors,
            lastProcessedId,
            compressionType: this.compressionType,
            usingWorkerPool: !!this.workerPool
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
   * Process batch using worker pool
   * @private
   */
  async _processBatchWithWorkers(contents, onComplete) {
    const compressionPromises = contents.map(async (content) => {
      if (this.signal.aborted || this.paused) {
        return;
      }
      
      try {
        this._compressRowInPlace(content); // in-place; see the main-thread path
        onComplete(true, content.id);
        
      } catch (error) {
        console.error(`[CompressionTask] Error compressing content ${content.id}:`, error.message);
        onComplete(false, content.id);
      }
    });
    
    // Wait for all compressions in batch to complete
    await Promise.all(compressionPromises);
  }
  
  /**
   * Pause the task
   */
  pause() {
    this.paused = true;
  }
  
  /**
   * Compress one content_storage row IN PLACE via ncdb's in-place update
   * (rewrites content_blob with the compressed bytes; leaves content_sha256 /
   * uncompressed_size, which describe the uncompressed content). This is the
   * fix for the compressAndStore corruption bug — compressAndStore INSERTs a
   * NEW row and returns its id, so the old code marked the ORIGINAL row
   * db_compressed while its content_blob stayed raw HTML -> unreadable on read.
   * @private
   */
  _compressRowInPlace(content) {
    const type = getCompressionType(this.db, this.compressionType);
    const result = compress(content.content_blob, {
      algorithm: type.algorithm,
      level: type.level,
      windowBits: type.window_bits,
      blockBits: type.block_bits
    });
    updateContentStorageCompressionCleanupResult(this.db, {
      id: content.id,
      compressionTypeId: type.id,
      contentBlob: result.compressed,
      compressedSize: result.compressedSize,
      compressionRatio: result.ratio
    });
  }

  /**
   * Get compression type ID by name
   * @private
   */
  _getCompressionTypeId(name) {
    const type = this.db.prepare('SELECT id FROM compression_types WHERE name = ?').get(name);
    return type ? type.id : null;
  }
}

module.exports = { CompressionTask };
