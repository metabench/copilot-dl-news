const chalk = require('chalk');

/**
 * A utility for creating condensed, single-line, color-coded log output.
 * It is designed to bypass Jest's console buffering by writing directly
 * to process.stderr.
 */
class LogCondenser {
  constructor(options = {}) {
    this.startTime = options.startTime || Date.now();
  }

  /**
   * Returns the elapsed time in seconds as a formatted string.
   * @returns {string}
   */
  getTimestamp() {
    const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    return `[${String(elapsedSeconds).padStart(3, ' ')}s]`;
  }

  /**
   * Logs a standard informational message.
   * @param {string} type - The log type (e.g., 'STEP', 'MILE').
   * @param {string} message - The log message.
   */
  info(type, message) {
    const color = this.getColor('INFO');
    const time = this.getElapsedTime();
    const statusIndicator = this.getStatusIndicator('INFO');

    // Format: [ 1.2s] [•] STEP 1: Doing something
    const line = `${color(`[${statusIndicator}]`)} ${time} ${type.padEnd(10)} ${message}\n`;
    process.stderr.write(line);
  }

  /**
   * Logs a success message in green.
   * @param {string} type - The log type.
   * @param {string} message - The log message.
   */
  success(type, message) {
    const color = this.getColor('SUCCESS');
    const time = this.getElapsedTime();
    const statusIndicator = this.getStatusIndicator('SUCCESS');

    // Format: [ 1.2s] [✔] STEP 1: Doing something
    const line = `${color(`[${statusIndicator}]`)} ${time} ${type.padEnd(10)} ${message}\n`;
    process.stderr.write(line);
  }

  /**
   * Logs a warning message in orange.
   * @param {string} type - The log type.
   * @param {string} message - The log message.
   */
  warn(type, message) {
    const color = this.getColor('WARN');
    const time = this.getElapsedTime();
    const statusIndicator = this.getStatusIndicator('WARN');

    // Format: [ 1.2s] [⚠] STEP 1: Doing something
    const line = `${color(`[${statusIndicator}]`)} ${time} ${type.padEnd(10)} ${message}\n`;
    process.stderr.write(line);
  }

  /**
   * Logs an error message in red.
   * @param {string} type - The log type.
   * @param {string} message - The log message.
   */
  error(type, message) {
    const color = this.getColor('ERROR');
    const time = this.getElapsedTime();
    const statusIndicator = this.getStatusIndicator('ERROR');

    // Format: [ 1.2s] [✖] STEP 1: Doing something
    const line = `${color(`[${statusIndicator}]`)} ${time} ${type.padEnd(10)} ${message}\n`;
    process.stderr.write(line);
  }

  /**
   * Logs a telemetry event from the SSE stream in a condensed format.
   * @param {object} event - The SSE event object.
   */
  logSseEvent(event) {
    if (event.type === 'milestone') {
      this.info('MILE', `${event.data?.kind || 'unknown'}`);
    } else if (event.type === 'progress') {
      const p = event.data?.payload || event.data?.gazetteer?.payload || event.data;
      if (p?.phase === 'discovery') {
        this.info('DISC', `${p.totalCountries} countries, ~${p.estimatedTotal} cities, pop>${p.minPopulation}`);
      } else if (p?.phase === 'processing') {
        const pct = (p.percentComplete || 0).toFixed(0);
        const eta = p.timing?.estimatedRemainingMs ? `eta${Math.round(p.timing.estimatedRemainingMs/1000)}s` : '';
        this.info('PROC', `${p.countryCode}[${pct}%] +${p.citiesProcessed} cities ${eta}`.trim());
      } else if (p?.phase === 'complete' || p?.summary) {
        const s = p.summary || p;
        this.success('CMPL', `${s.recordsUpserted||s.totalUpserted||0} cities, ${s.countriesProcessed||0} countries`);
      }
    } else if (event.type === 'problem') {
      this.warn('PROB', `${event.data?.kind} - ${event.data?.message?.substring(0,50)}`);
    } else if (event.type === 'done') {
      this.success('DONE', 'Job completed');
    }
  }

  /**
   * Returns the elapsed time in seconds as a formatted string.
   * @returns {string}
   */
  getElapsedTime() {
    const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    return `${elapsedSeconds}s`;
  }

  /**
   * Returns the status indicator for a given level.
   * @param {string} level - The log level.
   * @returns {string}
   */
  getStatusIndicator(level) {
    switch (level) {
      case 'SUCCESS': return '✔';
      case 'WARN': return '⚠';
      case 'ERROR': return '✖';
      case 'INFO':
      default:
        return '•';
    }
  }

  /**
   * Returns the color for a given level.
   * @param {string} level - The log level.
   * @returns {function}
   */
  getColor(level) {
    switch (level) {
      case 'SUCCESS': return chalk.green;
      case 'WARN': return chalk.yellow;
      case 'ERROR': return chalk.red;
      case 'INFO':
      default:
        return chalk.white;
    }
  }
}

module.exports = { LogCondenser };
