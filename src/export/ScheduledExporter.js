'use strict';

/**
 * ScheduledExporter - Cron-based scheduled exports
 * 
 * Features:
 * - Configurable cron schedules
 * - Multiple output formats
 * - Daily snapshot directories
 * - Retention policy
 * 
 * @module ScheduledExporter
 */

const fs = require('fs');
const path = require('path');
const { ExportService } = require('./ExportService');

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  enabled: false,
  schedule: '0 2 * * *', // 2 AM daily
  retentionDays: 30,
  formats: ['jsonl', 'json'],
  outputDir: 'data/exports/daily',
  types: ['articles', 'domains']
};

/**
 * Simple cron parser for common patterns
 * Supports: minute hour dayOfMonth month dayOfWeek
 */
class CronParser {
  /**
   * Parse cron expression
   * @param {string} expression - Cron expression (5 fields)
   * @returns {Object} Parsed schedule
   */
  static parse(expression) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${expression}. Expected 5 fields.`);
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    return {
      minute: this._parseField(minute, 0, 59),
      hour: this._parseField(hour, 0, 23),
      dayOfMonth: this._parseField(dayOfMonth, 1, 31),
      month: this._parseField(month, 1, 12),
      dayOfWeek: this._parseField(dayOfWeek, 0, 6)
    };
  }

  /**
   * Parse a single cron field
   * @private
   */
  static _parseField(field, min, max) {
    if (field === '*') {
      return null; // Any value
    }

    // Handle step values (*/5)
    if (field.startsWith('*/')) {
      const step = parseInt(field.substring(2), 10);
      const values = [];
      for (let i = min; i <= max; i += step) {
        values.push(i);
      }
      return values;
    }

    // Handle ranges (1-5)
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      const values = [];
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
      return values;
    }

    // Handle lists (1,3,5)
    if (field.includes(',')) {
      return field.split(',').map(Number);
    }

    // Single value
    return [parseInt(field, 10)];
  }

  /**
   * Check if current time matches schedule
   * @param {Object} schedule - Parsed schedule
   * @param {Date} date - Date to check
   * @returns {boolean} True if matches
   */
  static matches(schedule, date = new Date()) {
    const minute = date.getMinutes();
    const hour = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1;
    const dayOfWeek = date.getDay();

    return (
      (schedule.minute === null || schedule.minute.includes(minute)) &&
      (schedule.hour === null || schedule.hour.includes(hour)) &&
      (schedule.dayOfMonth === null || schedule.dayOfMonth.includes(dayOfMonth)) &&
      (schedule.month === null || schedule.month.includes(month)) &&
      (schedule.dayOfWeek === null || schedule.dayOfWeek.includes(dayOfWeek))
    );
  }

  /**
   * Get next run time
   * @param {Object} schedule - Parsed schedule
   * @param {Date} from - Starting date
   * @returns {Date} Next run time
   */
  static getNextRun(schedule, from = new Date()) {
    const next = new Date(from);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(next.getMinutes() + 1);

    // Search up to 1 year ahead
    const maxDate = new Date(from);
    maxDate.setFullYear(maxDate.getFullYear() + 1);

    while (next < maxDate) {
      if (this.matches(schedule, next)) {
        return next;
      }
      next.setMinutes(next.getMinutes() + 1);
    }

    return null;
  }
}

/**
 * ScheduledExporter class
 */
class ScheduledExporter {
  /**
   * Create ScheduledExporter
   * @param {Object} options - Exporter options
   * @param {Object} options.exportService - ExportService instance
   * @param {Object} [options.config] - Schedule configuration
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.exportService = options.exportService;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.logger = options.logger || console;
    this.timer = null;
    this.running = false;
    this.lastRun = null;
    this.schedule = null;

    if (this.config.schedule) {
      try {
        this.schedule = CronParser.parse(this.config.schedule);
      } catch (err) {
        this.logger.error('[ScheduledExporter] Invalid cron expression:', err.message);
      }
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    if (!this.config.enabled) {
      this.logger.log('[ScheduledExporter] Scheduled exports disabled');
      return;
    }

    if (!this.exportService) {
      this.logger.error('[ScheduledExporter] ExportService not configured');
      return;
    }

    if (this.timer) {
      this.stop();
    }

    this.running = true;
    this._scheduleNext();
    this.logger.log('[ScheduledExporter] Started with schedule:', this.config.schedule);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.logger.log('[ScheduledExporter] Stopped');
  }

  /**
   * Run export immediately
   * @param {Date} [date] - Date for directory naming (defaults to now)
   * @returns {Object} Export result
   */
  async runExport(date = new Date()) {
    const dateStr = this._formatDate(date);
    const outputDir = path.join(this.config.outputDir, dateStr);

    try {
      // Ensure output directory exists
      fs.mkdirSync(outputDir, { recursive: true });

      const results = {
        date: dateStr,
        directory: outputDir,
        exports: [],
        errors: []
      };

      // Export each type in each format
      for (const type of this.config.types) {
        for (const format of this.config.formats) {
          try {
            const filename = `${type}.${format === 'jsonl' ? 'jsonl' : format}`;
            const filePath = path.join(outputDir, filename);

            let data;
            if (type === 'articles') {
              data = this.exportService.exportArticles(format, {
                since: this._getYesterdayDate(date)
              });
            } else if (type === 'domains') {
              if (format === 'rss' || format === 'atom') {
                continue; // Skip feeds for domains
              }
              data = this.exportService.exportDomains(format, {});
            } else if (type === 'analytics') {
              if (format === 'rss' || format === 'atom') {
                continue;
              }
              data = this.exportService.exportAnalytics(format, { period: '1d' });
            }

            fs.writeFileSync(filePath, data, 'utf8');
            results.exports.push({
              type,
              format,
              file: filePath,
              size: fs.statSync(filePath).size
            });

          } catch (err) {
            results.errors.push({
              type,
              format,
              error: err.message
            });
            this.logger.error(`[ScheduledExporter] Export failed for ${type}.${format}:`, err.message);
          }
        }
      }

      // Write manifest
      const manifestPath = path.join(outputDir, 'manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify({
        exportedAt: date.toISOString(),
        exports: results.exports,
        errors: results.errors
      }, null, 2), 'utf8');

      this.lastRun = date;
      this.logger.log(`[ScheduledExporter] Export complete: ${results.exports.length} files in ${outputDir}`);

      // Cleanup old exports (use export date for retention calculation)
      await this._cleanupOldExports(date);

      return results;

    } catch (err) {
      this.logger.error('[ScheduledExporter] Export failed:', err);
      throw err;
    }
  }

  /**
   * Get export history
   * @param {number} limit - Maximum entries to return
   * @returns {Array} Export history
   */
  getHistory(limit = 30) {
    const baseDir = this.config.outputDir;
    if (!fs.existsSync(baseDir)) {
      return [];
    }

    const entries = fs.readdirSync(baseDir)
      .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
      .sort()
      .reverse()
      .slice(0, limit);

    return entries.map(name => {
      const dir = path.join(baseDir, name);
      const manifestPath = path.join(dir, 'manifest.json');

      let manifest = null;
      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch {
          // Ignore parse errors
        }
      }

      return {
        date: name,
        directory: dir,
        manifest
      };
    });
  }

  /**
   * Get next scheduled run time
   * @returns {Date|null} Next run time
   */
  getNextRun() {
    if (!this.schedule) {
      return null;
    }
    return CronParser.getNextRun(this.schedule);
  }

  /**
   * Get scheduler status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      running: this.running,
      schedule: this.config.schedule,
      lastRun: this.lastRun,
      nextRun: this.getNextRun(),
      outputDir: this.config.outputDir,
      formats: this.config.formats,
      types: this.config.types,
      retentionDays: this.config.retentionDays
    };
  }

  // Private methods

  /**
   * Schedule next export run
   * @private
   */
  _scheduleNext() {
    if (!this.running || !this.schedule) {
      return;
    }

    const nextRun = CronParser.getNextRun(this.schedule);
    if (!nextRun) {
      this.logger.error('[ScheduledExporter] Could not determine next run time');
      return;
    }

    const delay = nextRun.getTime() - Date.now();
    this.logger.log(`[ScheduledExporter] Next run at ${nextRun.toISOString()} (in ${Math.round(delay / 1000 / 60)} minutes)`);

    this.timer = setTimeout(async () => {
      try {
        await this.runExport();
      } catch (err) {
        this.logger.error('[ScheduledExporter] Scheduled export failed:', err);
      }

      // Schedule next run
      if (this.running) {
        this._scheduleNext();
      }
    }, delay);

    // Don't block process exit
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Cleanup old export directories
   * @param {Date} [referenceDate] - Date to calculate retention from (default: now)
   * @private
   */
  async _cleanupOldExports(referenceDate = new Date()) {
    const baseDir = this.config.outputDir;
    if (!fs.existsSync(baseDir)) {
      return;
    }

    const cutoffDate = new Date(referenceDate);
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    const cutoffStr = this._formatDate(cutoffDate);

    const entries = fs.readdirSync(baseDir)
      .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
      .filter(name => name < cutoffStr);

    for (const name of entries) {
      const dir = path.join(baseDir, name);
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        this.logger.log(`[ScheduledExporter] Cleaned up old export: ${name}`);
      } catch (err) {
        this.logger.error(`[ScheduledExporter] Failed to cleanup ${name}:`, err.message);
      }
    }
  }

  /**
   * Format date as YYYY-MM-DD
   * @private
   */
  _formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get yesterday's date
   * @private
   */
  _getYesterdayDate(date = new Date()) {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
}

/**
 * Load configuration from file
 * @param {string} configPath - Path to config file
 * @returns {Object} Configuration
 */
function loadExportConfig(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

module.exports = {
  ScheduledExporter,
  CronParser,
  loadExportConfig,
  DEFAULT_CONFIG
};
