'use strict';

/**
 * JSON and JSONL Formatters for data export
 * 
 * JSON: Standard JSON with metadata wrapper
 * JSONL: Newline-delimited JSON for streaming large datasets
 * 
 * @module JsonFormatter
 */

const { Transform } = require('stream');

/**
 * JSON Formatter
 * Formats data as a JSON object with metadata wrapper
 */
class JsonFormatter {
  /**
   * Format data as JSON
   * @param {Array|Object} data - Data to format
   * @param {Object} metadata - Export metadata
   * @returns {string} JSON string
   */
  format(data, metadata = {}) {
    const output = {
      exported_at: metadata.exportedAt || new Date().toISOString(),
      type: metadata.type || 'export',
      count: Array.isArray(data) ? data.length : 1,
      query: metadata.query || {},
      data: data
    };

    return JSON.stringify(output, null, 2);
  }

  /**
   * Get content type
   * @returns {string} Content-Type header
   */
  getContentType() {
    return 'application/json; charset=utf-8';
  }
}

/**
 * JSONL (Newline-Delimited JSON) Formatter
 * Each line is a valid JSON object
 */
class JsonlFormatter {
  /**
   * Format data as JSONL
   * @param {Array} data - Array of objects to format
   * @param {Object} metadata - Export metadata (ignored for JSONL)
   * @returns {string} JSONL string
   */
  format(data, metadata = {}) {
    if (!Array.isArray(data)) {
      return JSON.stringify(data) + '\n';
    }

    return data.map(item => JSON.stringify(item)).join('\n') + (data.length > 0 ? '\n' : '');
  }

  /**
   * Format a single item as JSONL line
   * @param {Object} item - Single item to format
   * @returns {string} JSON line with newline
   */
  formatLine(item) {
    return JSON.stringify(item) + '\n';
  }

  /**
   * Get content type
   * @returns {string} Content-Type header
   */
  getContentType() {
    return 'application/x-ndjson; charset=utf-8';
  }
}

/**
 * Create a Transform stream that converts objects to JSONL
 * @param {Object} options - Stream options
 * @returns {Transform} Transform stream
 */
function createJsonlStream(options = {}) {
  const formatter = new JsonlFormatter();

  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      try {
        const line = formatter.formatLine(chunk);
        callback(null, line);
      } catch (err) {
        callback(err);
      }
    }
  });
}

module.exports = {
  JsonFormatter,
  JsonlFormatter,
  createJsonlStream
};
