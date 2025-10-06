/**
 * Article Compression Background Task
 * 
 * Compresses uncompressed article HTML content using Brotli quality 10 with 256MB memory.
 * Uses worker thread pool for parallel compression without blocking the main thread.
 * Tracks progress, handles errors, and supports pause/resume.
 */

const { compress, getCompressionType } = require('../../utils/compression');
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
      
      // Count total articles to compress
      const totalCount = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM articles
        WHERE html IS NOT NULL
          AND html != ''
          AND compressed_html IS NULL
          AND compression_bucket_id IS NULL
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
        // Fetch batch of articles
        const articles = this.db.prepare(`
          SELECT id, html
          FROM articles
          WHERE id > ?
            AND html IS NOT NULL
            AND html != ''
            AND compressed_html IS NULL
            AND compression_bucket_id IS NULL
          ORDER BY id ASC
          LIMIT ?
        `).all(lastProcessedId, this.batchSize);
        
        if (articles.length === 0) {
          break; // All done
        }
        
        // Process batch (with or without worker pool)
        if (this.workerPool) {
          // Use worker pool for parallel compression
          await this._processBatchWithWorkers(articles, compressionTypeRow, (success, articleId) => {
            if (success) {
              processed++;
            } else {
              errors++;
            }
            lastProcessedId = Math.max(lastProcessedId, articleId);
          });
        } else {
          // Process in main thread (synchronous)
          for (const article of articles) {
            if (this.signal.aborted || this.paused) {
              break;
            }
            
            try {
              // Compress HTML with Brotli quality 10
              const result = compress(article.html, {
                algorithm: compressionTypeRow.algorithm,
                level: compressionTypeRow.level,
                windowBits: compressionTypeRow.window_bits,
                blockBits: compressionTypeRow.block_bits
              });
              
              // Store compressed HTML
              this.db.prepare(`
                UPDATE articles
                SET compressed_html = ?,
                    compression_type_id = ?,
                    original_size = ?,
                    compressed_size = ?,
                    compression_ratio = ?
                WHERE id = ?
              `).run(
                result.compressed,
                compressionTypeRow.id,
                result.uncompressedSize,
                result.compressedSize,
                result.ratio,
                article.id
              );
              
              processed++;
              lastProcessedId = article.id;
              
            } catch (error) {
              errors++;
              console.error(`[CompressionTask] Error compressing article ${article.id}:`, error.message);
              
              // Continue with next article (don't fail entire task for one article)
              lastProcessedId = article.id;
            }
          }
        }
        
        // Update progress
        if (tof(this.onProgress) === 'function') {
          this.onProgress({
            current: processed,
            total: totalCount,
            message: `Compressed ${processed}/${totalCount} articles`,
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
        if (this.delayMs > 0 && articles.length > 0) {
          await new Promise(resolve => setTimeout(resolve, this.delayMs));
        }
      }
      
      // Final progress update
      if (tof(this.onProgress) === 'function') {
        this.onProgress({
          current: processed,
          total: totalCount,
          message: processed === totalCount 
            ? `Compression complete: ${processed} articles compressed`
            : `Paused: ${processed}/${totalCount} articles compressed`,
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
  async _processBatchWithWorkers(articles, compressionTypeRow, onComplete) {
    const compressionPromises = articles.map(async (article) => {
      if (this.signal.aborted || this.paused) {
        return;
      }
      
      try {
        // Compress using worker pool
        const result = await this.workerPool.compress(article.html, article.id);
        
        // Store compressed HTML
        this.db.prepare(`
          UPDATE articles
          SET compressed_html = ?,
              compression_type_id = ?,
              original_size = ?,
              compressed_size = ?,
              compression_ratio = ?
          WHERE id = ?
        `).run(
          result.compressed,
          compressionTypeRow.id,
          result.originalSize,
          result.compressedSize,
          result.ratio,
          article.id
        );
        
        onComplete(true, article.id);
        
      } catch (error) {
        console.error(`[CompressionTask] Error compressing article ${article.id}:`, error.message);
        onComplete(false, article.id);
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
   * Resume the task
   */
  resume() {
    this.paused = false;
  }
}

module.exports = { CompressionTask };
