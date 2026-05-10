'use strict';

/**
 * Export module index
 * 
 * Exports all export-related classes and utilities.
 * 
 * @module export
 */

const { ExportService, DEFAULT_BATCH_SIZE } = require('./ExportService');
const { JsonFormatter, JsonlFormatter, createJsonlStream } = require('./formatters/JsonFormatter');
const { CsvFormatter, createCsvStream, DEFAULT_FIELDS } = require('./formatters/CsvFormatter');
const { RssFormatter } = require('./formatters/RssFormatter');
const { AtomFormatter } = require('./formatters/AtomFormatter');
const { ScheduledExporter, CronParser, loadExportConfig, DEFAULT_CONFIG } = require('./ScheduledExporter');

module.exports = {
  // Main service
  ExportService,
  DEFAULT_BATCH_SIZE,

  // Formatters
  JsonFormatter,
  JsonlFormatter,
  CsvFormatter,
  RssFormatter,
  AtomFormatter,

  // Stream creators
  createJsonlStream,
  createCsvStream,

  // Scheduling
  ScheduledExporter,
  CronParser,
  loadExportConfig,
  DEFAULT_CONFIG,
  DEFAULT_FIELDS
};
