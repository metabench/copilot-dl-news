/**
 * src/utils/CompressionAnalytics.js
 *
 * Analytics and monitoring utilities for the compression system.
 * Tracks compression performance, effectiveness, and system health.
 */

const { ensureDatabase } = require('../db/sqlite/v1');
const { compressionConfig } = require('../config/compression');

class CompressionAnalytics {
  constructor(options = {}) {
    this.db = options.db || null;
    this.dbPath = options.dbPath || null;
    this.logger = options.logger || console;
    this.enabled = options.enabled !== false;
  }

  /**
   * Get database connection
   */
  _getDb() {
    if (this.db) return this.db;
    if (!this.dbPath) {
      throw new Error('Database path not provided');
    }
    this.db = ensureDatabase(this.dbPath);
    return this.db;
  }

  /**
   * Record compression operation metrics
   */
  async recordCompressionMetrics(operation) {
    if (!this.enabled) return;

    try {
      const db = this._getDb();
      const metrics = {
        operation_type: operation.type || 'unknown',
        content_id: operation.contentId || null,
        original_size: operation.originalSize || 0,
        compressed_size: operation.compressedSize || 0,
        compression_ratio: operation.compressionRatio || 0,
        compression_type: operation.compressionType || null,
        processing_time_ms: operation.processingTimeMs || 0,
        success: operation.success !== false,
        error_message: operation.error || null,
        created_at: new Date().toISOString()
      };

      // Insert metrics into compression_metrics table
      // Note: This table may not exist yet - we'll handle gracefully
      const insert = db.prepare(`
        INSERT OR IGNORE INTO compression_metrics
        (operation_type, content_id, original_size, compressed_size,
         compression_ratio, compression_type, processing_time_ms,
         success, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insert.run(
        metrics.operation_type,
        metrics.content_id,
        metrics.original_size,
        metrics.compressed_size,
        metrics.compression_ratio,
        metrics.compression_type,
        metrics.processing_time_ms,
        metrics.success ? 1 : 0,
        metrics.error_message,
        metrics.created_at
      );

    } catch (error) {
      // Log but don't fail - analytics should not break compression
      this.logger.warn('[CompressionAnalytics] Failed to record metrics:', error.message);
    }
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(timeRange = '24 hours') {
    try {
      const db = this._getDb();

      // Convert time range to SQL
      const timeFilter = this._getTimeFilter(timeRange);

      const stats = db.prepare(`
        SELECT
          COUNT(*) as total_operations,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_operations,
          AVG(compression_ratio) as avg_compression_ratio,
          AVG(processing_time_ms) as avg_processing_time_ms,
          SUM(original_size) as total_original_size,
          SUM(compressed_size) as total_compressed_size,
          SUM(original_size - compressed_size) as total_space_saved
        FROM compression_metrics
        WHERE created_at >= ?
      `).get(timeFilter);

      if (!stats) {
        return {
          total_operations: 0,
          successful_operations: 0,
          success_rate: 0,
          avg_compression_ratio: 0,
          avg_processing_time_ms: 0,
          total_original_size: 0,
          total_compressed_size: 0,
          total_space_saved: 0,
          space_saved_mb: 0
        };
      }

      const successRate = stats.total_operations > 0
        ? (stats.successful_operations / stats.total_operations) * 100
        : 0;

      return {
        ...stats,
        success_rate: Math.round(successRate * 100) / 100,
        space_saved_mb: Math.round((stats.total_space_saved || 0) / (1024 * 1024) * 100) / 100
      };

    } catch (error) {
      this.logger.warn('[CompressionAnalytics] Failed to get stats:', error.message);
      return null;
    }
  }

  /**
   * Get compression type effectiveness
   */
  getCompressionTypeStats(timeRange = '24 hours') {
    try {
      const db = this._getDb();
      const timeFilter = this._getTimeFilter(timeRange);

      const typeStats = db.prepare(`
        SELECT
          compression_type,
          COUNT(*) as operations,
          AVG(compression_ratio) as avg_ratio,
          AVG(processing_time_ms) as avg_time_ms,
          SUM(original_size) as total_original,
          SUM(compressed_size) as total_compressed,
          SUM(original_size - compressed_size) as space_saved
        FROM compression_metrics
        WHERE created_at >= ? AND success = 1 AND compression_type IS NOT NULL
        GROUP BY compression_type
        ORDER BY space_saved DESC
      `).all(timeFilter);

      return typeStats.map(stat => ({
        ...stat,
        space_saved_mb: Math.round((stat.space_saved || 0) / (1024 * 1024) * 100) / 100,
        avg_ratio_percent: Math.round((stat.avg_ratio || 0) * 100 * 100) / 100
      }));

    } catch (error) {
      this.logger.warn('[CompressionAnalytics] Failed to get type stats:', error.message);
      return [];
    }
  }

  /**
   * Get content storage summary
   */
  getStorageSummary() {
    try {
      const db = this._getDb();

      // Get total storage stats
      const totalStats = db.prepare(`
        SELECT
          COUNT(*) as total_items,
          SUM(uncompressed_size) as total_uncompressed_size,
          SUM(compressed_size) as total_compressed_size,
          AVG(compression_ratio) as avg_compression_ratio
        FROM content_storage
        WHERE compression_type_id IS NOT NULL AND compression_type_id != 1
      `).get();

      // Get breakdown by compression type
      const typeBreakdown = db.prepare(`
        SELECT
          ct.name as compression_type,
          COUNT(*) as item_count,
          SUM(cs.uncompressed_size) as uncompressed_size,
          SUM(cs.compressed_size) as compressed_size,
          AVG(cs.compression_ratio) as avg_ratio
        FROM content_storage cs
        LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
        WHERE cs.compression_type_id IS NOT NULL AND cs.compression_type_id != 1
        GROUP BY cs.compression_type_id, ct.name
        ORDER BY SUM(cs.uncompressed_size - cs.compressed_size) DESC
      `).all();

      // Get uncompressed items count
      const uncompressedCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM content_storage
        WHERE compression_type_id IS NULL OR compression_type_id = 1
      `).get()?.count || 0;

      return {
        total_items: totalStats?.total_items || 0,
        uncompressed_items: uncompressedCount,
        total_uncompressed_size: totalStats?.total_uncompressed_size || 0,
        total_compressed_size: totalStats?.total_compressed_size || 0,
        total_space_saved: (totalStats?.total_uncompressed_size || 0) - (totalStats?.total_compressed_size || 0),
        avg_compression_ratio: totalStats?.avg_compression_ratio || 0,
        compression_types: typeBreakdown.map(item => ({
          ...item,
          space_saved: (item.uncompressed_size || 0) - (item.compressed_size || 0),
          space_saved_mb: Math.round(((item.uncompressed_size || 0) - (item.compressed_size || 0)) / (1024 * 1024) * 100) / 100
        }))
      };

    } catch (error) {
      this.logger.warn('[CompressionAnalytics] Failed to get storage summary:', error.message);
      return null;
    }
  }

  /**
   * Check system health and performance thresholds
   */
  checkHealth() {
    const stats = this.getCompressionStats('1 hour');

    if (!stats) {
      return {
        status: 'unknown',
        message: 'Unable to retrieve compression statistics'
      };
    }

    const issues = [];

    // Check success rate
    if (stats.success_rate < compressionConfig.monitoring.thresholds.errorRateMax * 100) {
      issues.push(`Low success rate: ${stats.success_rate}% (threshold: ${compressionConfig.monitoring.thresholds.errorRateMax * 100}%)`);
    }

    // Check average processing time
    if (stats.avg_processing_time_ms > compressionConfig.monitoring.thresholds.processingTimeMaxMs) {
      issues.push(`High processing time: ${stats.avg_processing_time_ms}ms (threshold: ${compressionConfig.monitoring.thresholds.processingTimeMaxMs}ms)`);
    }

    // Check compression ratio
    if (stats.avg_compression_ratio < compressionConfig.monitoring.thresholds.compressionRatioMin) {
      issues.push(`Low compression ratio: ${(stats.avg_compression_ratio * 100).toFixed(1)}% (threshold: ${compressionConfig.monitoring.thresholds.compressionRatioMin * 100}%)`);
    }

    return {
      status: issues.length === 0 ? 'healthy' : 'warning',
      message: issues.length === 0 ? 'All metrics within thresholds' : issues.join('; '),
      stats
    };
  }

  /**
   * Clean up old metrics data
   */
  cleanupOldMetrics(daysToKeep = 30) {
    try {
      const db = this._getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deleted = db.prepare(`
        DELETE FROM compression_metrics
        WHERE created_at < ?
      `).run(cutoffDate.toISOString());

      this.logger.info(`[CompressionAnalytics] Cleaned up ${deleted.changes} old metrics records`);
      return deleted.changes;

    } catch (error) {
      this.logger.warn('[CompressionAnalytics] Failed to cleanup metrics:', error.message);
      return 0;
    }
  }

  /**
   * Convert time range to SQL datetime filter
   */
  _getTimeFilter(timeRange) {
    const now = new Date();
    let hours = 24; // default

    if (timeRange.includes('hour')) {
      hours = parseInt(timeRange.split(' ')[0]) || 1;
    } else if (timeRange.includes('day')) {
      hours = (parseInt(timeRange.split(' ')[0]) || 1) * 24;
    } else if (timeRange.includes('week')) {
      hours = (parseInt(timeRange.split(' ')[0]) || 1) * 24 * 7;
    }

    const cutoff = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    return cutoff.toISOString();
  }
}

module.exports = { CompressionAnalytics };