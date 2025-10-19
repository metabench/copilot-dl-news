/**
 * Database queries for analyzing 429 rate limit errors and download statistics
 */

const { nowMs } = require('../../../crawler/utils');

/**
 * Analyze 429 rate limit errors and download statistics
 */
class RateLimitAnalysisQueries {
  constructor(db) {
    this.db = db;
  }

  /**
   * Find the most recent 429 error for analysis
   * @returns {Object|null} Latest 429 error with timestamp
   */
  getLatest429Error() {
    try {
      const row = this.db.prepare(`
        SELECT
          hr.fetched_at,
          u.host,
          hr.http_status,
          COALESCE(cs.uncompressed_size, hr.bytes_downloaded, 0) as content_size_bytes,
          u.url
        FROM http_responses hr
        INNER JOIN urls u ON hr.url_id = u.id
        LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
        WHERE hr.http_status = 429
        ORDER BY hr.fetched_at DESC
        LIMIT 1
      `).get();

      return row || null;
    } catch (error) {
      console.error('[RateLimitAnalysis] Error getting latest 429 error:', error);
      return null;
    }
  }

  /**
   * Get download statistics for a time window before a 429 error
   * @param {string} beforeTimestamp - ISO timestamp to analyze before
   * @param {number} minutesBefore - Minutes to look back (1, 2, or 5)
   * @param {string} host - Host to filter by (optional)
   * @returns {Object} Download statistics
   */
  getDownloadStatsBefore429(beforeTimestamp, minutesBefore, host = null) {
    try {
      const beforeTime = new Date(beforeTimestamp);
      const afterTime = new Date(beforeTime.getTime() - (minutesBefore * 60 * 1000));

      const afterTimestamp = afterTime.toISOString();

      let query = `
        SELECT
          COUNT(*) as total_downloads,
          SUM(COALESCE(cs.uncompressed_size, hr.bytes_downloaded, 0)) as total_bytes_downloaded,
          AVG(COALESCE(cs.uncompressed_size, hr.bytes_downloaded, 0)) as avg_bytes_per_download,
          MIN(COALESCE(cs.uncompressed_size, hr.bytes_downloaded, 0)) as min_bytes_per_download,
          MAX(COALESCE(cs.uncompressed_size, hr.bytes_downloaded, 0)) as max_bytes_per_download,
          SUM(CASE WHEN hr.http_status >= 200 AND hr.http_status < 300 THEN COALESCE(cs.uncompressed_size, hr.bytes_downloaded, 0) ELSE 0 END) as successful_bytes_downloaded,
          COUNT(CASE WHEN hr.http_status >= 200 AND hr.http_status < 300 THEN 1 END) as successful_downloads,
          COUNT(CASE WHEN hr.http_status >= 400 THEN 1 END) as error_downloads
        FROM http_responses hr
        INNER JOIN urls u ON hr.url_id = u.id
        LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
        WHERE hr.fetched_at >= ? AND hr.fetched_at < ?
      `;

      const params = [afterTimestamp, beforeTimestamp];

      if (host) {
        query += ` AND u.host = ?`;
        params.push(host);
      }

      const row = this.db.prepare(query).get(...params);

      return {
        timeWindowMinutes: minutesBefore,
        totalDownloads: row.total_downloads || 0,
        totalBytesDownloaded: row.total_bytes_downloaded || 0,
        totalMB: Math.round((row.total_bytes_downloaded || 0) / (1024 * 1024) * 100) / 100,
        avgBytesPerDownload: Math.round(row.avg_bytes_per_download || 0),
        minBytesPerDownload: row.min_bytes_per_download || 0,
        maxBytesPerDownload: row.max_bytes_per_download || 0,
        successfulBytesDownloaded: row.successful_bytes_downloaded || 0,
        successfulMB: Math.round((row.successful_bytes_downloaded || 0) / (1024 * 1024) * 100) / 100,
        successfulDownloads: row.successful_downloads || 0,
        errorDownloads: row.error_downloads || 0,
        successRate: row.total_downloads > 0 ? Math.round((row.successful_downloads / row.total_downloads) * 100) : 0
      };
    } catch (error) {
      console.error('[RateLimitAnalysis] Error getting download stats:', error);
      return {
        timeWindowMinutes: minutesBefore,
        totalDownloads: 0,
        totalBytesDownloaded: 0,
        totalMB: 0,
        avgBytesPerDownload: 0,
        minBytesPerDownload: 0,
        maxBytesPerDownload: 0,
        successfulBytesDownloaded: 0,
        successfulMB: 0,
        successfulDownloads: 0,
        errorDownloads: 0,
        successRate: 0
      };
    }
  }

  /**
   * Get comprehensive 429 error analysis
   * @param {string} host - Host to analyze (optional)
   * @returns {Object} Complete 429 analysis
   */
  get429Analysis(host = null) {
    try {
      const latest429 = this.getLatest429Error();
      if (!latest429) {
        return {
          has429Errors: false,
          message: 'No 429 errors found in database'
        };
      }

      const analysis = {
        has429Errors: true,
        latest429: {
          timestamp: latest429.fetched_at,
          host: latest429.host,
          url: latest429.url,
          responseSize: latest429.content_size_bytes
        },
        downloadStats: {}
      };

      // Get stats for different time windows
      const timeWindows = [1, 2, 5];
      for (const minutes of timeWindows) {
        analysis.downloadStats[`last${minutes}Minutes`] =
          this.getDownloadStatsBefore429(latest429.fetched_at, minutes, host || latest429.host);
      }

      return analysis;
    } catch (error) {
      console.error('[RateLimitAnalysis] Error in 429 analysis:', error);
      return {
        has429Errors: false,
        error: error.message
      };
    }
  }

  /**
   * Get rate limit patterns for a host
   * @param {string} host - Host to analyze
   * @param {number} hours - Hours of history to analyze
   * @returns {Object} Rate limit pattern analysis
   */
  getRateLimitPatterns(host, hours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total_requests,
          COUNT(CASE WHEN http_status = 429 THEN 1 END) as rate_limit_errors,
          COUNT(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 END) as successful_requests,
          COUNT(CASE WHEN http_status >= 400 THEN 1 END) as error_requests,
          MIN(fetched_at) as first_request,
          MAX(fetched_at) as last_request
        FROM http_responses hr
        INNER JOIN urls u ON hr.url_id = u.id
        WHERE u.host = ? AND hr.fetched_at >= ?
      `).get(host, cutoffTime);

      if (!stats || stats.total_requests === 0) {
        return {
          host,
          hasData: false,
          message: `No request data found for ${host} in the last ${hours} hours`
        };
      }

      // Calculate rates per hour
      const timeSpanHours = (new Date(stats.last_request) - new Date(stats.first_request)) / (1000 * 60 * 60);
      const requestsPerHour = timeSpanHours > 0 ? stats.total_requests / timeSpanHours : 0;
      const rateLimitErrorsPerHour = timeSpanHours > 0 ? stats.rate_limit_errors / timeSpanHours : 0;

      return {
        host,
        hasData: true,
        timeSpanHours: Math.round(timeSpanHours * 100) / 100,
        totalRequests: stats.total_requests,
        rateLimitErrors: stats.rate_limit_errors,
        successfulRequests: stats.successful_requests,
        errorRequests: stats.error_requests,
        requestsPerHour: Math.round(requestsPerHour * 100) / 100,
        rateLimitErrorsPerHour: Math.round(rateLimitErrorsPerHour * 100) / 100,
        rateLimitErrorRate: stats.total_requests > 0 ? Math.round((stats.rate_limit_errors / stats.total_requests) * 100) : 0,
        firstRequest: stats.first_request,
        lastRequest: stats.last_request
      };
    } catch (error) {
      console.error('[RateLimitAnalysis] Error getting rate limit patterns:', error);
      return {
        host,
        hasData: false,
        error: error.message
      };
    }
  }
}

module.exports = {
  RateLimitAnalysisQueries
};