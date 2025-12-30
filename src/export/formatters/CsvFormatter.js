'use strict';

/**
 * CSV Formatter for data export
 * 
 * Features:
 * - Proper escaping of quotes, newlines, and commas
 * - Configurable field selection
 * - Header row generation
 * - Streaming support
 * 
 * @module CsvFormatter
 */

const { Transform } = require('stream');

/**
 * Default fields for different data types
 */
const DEFAULT_FIELDS = {
  articles: ['id', 'title', 'url', 'host', 'published_at', 'fetched_at', 'word_count', 'category'],
  domains: ['host', 'article_count', 'first_crawled', 'last_crawled'],
  analytics: ['date', 'article_count', 'domain_count']
};

/**
 * CSV Formatter class
 */
class CsvFormatter {
  /**
   * Create CSV Formatter
   * @param {Object} options - Formatter options
   * @param {string} [options.delimiter=','] - Field delimiter
   * @param {string} [options.newline='\n'] - Row separator
   * @param {boolean} [options.includeHeader=true] - Include header row
   */
  constructor(options = {}) {
    this.delimiter = options.delimiter || ',';
    this.newline = options.newline || '\n';
    this.includeHeader = options.includeHeader !== false;
  }

  /**
   * Format data as CSV
   * @param {Array} data - Array of objects to format
   * @param {Object} metadata - Export metadata
   * @returns {string} CSV string
   */
  format(data, metadata = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    // Determine fields to include
    const dataType = metadata.type || 'articles';
    const fields = metadata.fields || this._inferFields(data[0], dataType);

    const lines = [];

    // Add header row
    if (this.includeHeader) {
      lines.push(this.formatHeader(fields));
    }

    // Add data rows
    for (const item of data) {
      lines.push(this.formatRow(item, fields));
    }

    return lines.join(this.newline) + this.newline;
  }

  /**
   * Format header row
   * @param {string[]} fields - Field names
   * @returns {string} Header row
   */
  formatHeader(fields) {
    return fields.map(f => this.escapeField(f)).join(this.delimiter);
  }

  /**
   * Format a single data row
   * @param {Object} item - Data item
   * @param {string[]} fields - Fields to include
   * @returns {string} CSV row
   */
  formatRow(item, fields) {
    if (!fields) {
      fields = Object.keys(item);
    }

    return fields.map(field => {
      const value = this._getNestedValue(item, field);
      return this.escapeField(value);
    }).join(this.delimiter);
  }

  /**
   * Escape a field value for CSV
   * RFC 4180 compliant escaping
   * @param {*} value - Value to escape
   * @returns {string} Escaped value
   */
  escapeField(value) {
    if (value === null || value === undefined) {
      return '';
    }

    // Convert to string
    let str = String(value);

    // Check if escaping is needed
    const needsEscape = str.includes('"') ||
                        str.includes(this.delimiter) ||
                        str.includes('\n') ||
                        str.includes('\r');

    if (needsEscape) {
      // Escape double quotes by doubling them
      str = str.replace(/"/g, '""');
      // Wrap in quotes
      str = `"${str}"`;
    }

    return str;
  }

  /**
   * Get content type
   * @returns {string} Content-Type header
   */
  getContentType() {
    return 'text/csv; charset=utf-8';
  }

  /**
   * Infer fields from data item
   * @private
   */
  _inferFields(item, dataType) {
    if (DEFAULT_FIELDS[dataType]) {
      // Filter to only include fields that exist in the item
      const available = new Set(Object.keys(item));
      return DEFAULT_FIELDS[dataType].filter(f => available.has(f));
    }
    return Object.keys(item);
  }

  /**
   * Get nested value from object using dot notation
   * @private
   */
  _getNestedValue(obj, path) {
    if (!path.includes('.')) {
      return obj[path];
    }

    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }
    return value;
  }
}

/**
 * Create a Transform stream that converts objects to CSV rows
 * @param {Object} options - Stream options
 * @param {string[]} [options.fields] - Fields to include
 * @param {boolean} [options.includeHeader=true] - Include header row
 * @returns {Transform} Transform stream
 */
function createCsvStream(options = {}) {
  const formatter = new CsvFormatter(options);
  let headerEmitted = false;
  const fields = options.fields;

  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      try {
        const itemFields = fields || Object.keys(chunk);

        // Emit header on first chunk
        if (!headerEmitted && formatter.includeHeader) {
          this.push(formatter.formatHeader(itemFields) + formatter.newline);
          headerEmitted = true;
        }

        const row = formatter.formatRow(chunk, itemFields);
        callback(null, row + formatter.newline);
      } catch (err) {
        callback(err);
      }
    }
  });
}

module.exports = {
  CsvFormatter,
  createCsvStream,
  DEFAULT_FIELDS
};
