'use strict';

/**
 * DecisionLogger – immutable record of arbitration decisions.
 */
class DecisionLogger {
  constructor({ emit = null, logger = console } = {}) {
    this.entries = [];
    this.emit = emit;
    this.logger = logger;
  }

  log(entry) {
    const record = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
    this.entries.push(record);
    if (typeof this.emit === 'function') {
      try {
        this.emit('planner-decision', record);
      } catch (error) {
        this._log('warn', 'DecisionLogger emit failed', error?.message || error);
      }
    }
    return record;
  }

  list(limit = 50) {
    return this.entries.slice(-limit);
  }

  _log(level, message, meta) {
    const logger = this.logger || console;
    try {
      if (level === 'warn' && typeof logger.warn === 'function') {
        logger.warn(message, meta);
      } else if (level === 'error' && typeof logger.error === 'function') {
        logger.error(message, meta);
      } else if (typeof logger.log === 'function') {
        logger.log(message, meta);
      }
    } catch (_) {}
  }
}

module.exports = {
  DecisionLogger
};
