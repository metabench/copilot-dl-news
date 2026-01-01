const { CliFormatter, COLORS, ICONS } = require('../../utils/CliFormatter');

/**
 * GazetteerTelemetry
 * Handles structured event emission and formatting for the gazetteer population tool.
 * Supports both human-readable CLI output and machine-readable JSON output.
 * 
 * Features:
 * - Colorful status indicators
 * - Progress spinners for long operations
 * - Structured tables for data summaries
 * - Phase/stage tracking with visual hierarchy
 */
class GazetteerTelemetry {
  constructor(options = {}) {
    this.jsonMode = options.jsonMode || false;
    this.verbose = options.verbose !== false;
    this.quiet = options.quiet || false;
    this.summaryFormat = typeof options.summaryFormat === 'string'
      ? options.summaryFormat.trim().toLowerCase()
      : 'ascii';

    if (this.summaryFormat !== 'json' && this.summaryFormat !== 'ascii') {
      this.summaryFormat = 'ascii';
    }

    const defaultCliStream = (!this.jsonMode && this.summaryFormat === 'json') ? process.stderr : process.stdout;
    this.cliStream = options.cliStream || defaultCliStream;
    this.summaryStream = options.summaryStream || process.stdout;
    this.errorStream = options.errorStream || process.stderr;

    this.fmt = new CliFormatter({ useEmojis: true });
    this.startTime = Date.now();
    this.currentPhase = null;
    this.spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.spinnerIndex = 0;
  }

  _writeLine(stream, text) {
    if (!stream) return;
    const value = text === undefined || text === null ? '' : String(text);
    if (value.endsWith('\n')) {
      stream.write(value);
      return;
    }
    stream.write(value + '\n');
  }

  _write(stream, text) {
    if (!stream) return;
    stream.write(text === undefined || text === null ? '' : String(text));
  }

  _cli(line) {
    this._writeLine(this.cliStream, line);
  }

  _cliRaw(text) {
    this._write(this.cliStream, text);
  }

  _summary(line) {
    this._writeLine(this.summaryStream, line);
  }

  _err(line) {
    this._writeLine(this.errorStream, line);
  }

  /**
   * Emit a structured event.
   * @param {string} type - Event type (e.g., 'progress', 'info', 'error', 'summary')
   * @param {object} data - Event payload
   */
  emit(type, data) {
    if (this.jsonMode) {
      console.log(JSON.stringify({ type, timestamp: Date.now(), ...data }));
    } else {
      this._formatForCli(type, data);
    }
  }

  /**
   * Start a new phase of work (e.g., 'Fetching countries', 'Importing cities')
   * @param {string} name - Phase name
   * @param {string} [icon] - Optional icon override
   */
  startPhase(name, icon = '🔄') {
    this.currentPhase = name;
    if (!this.quiet && !this.jsonMode) {
      this._cli(`\n${COLORS.bold(COLORS.cyan(`${icon} ${name}`))}`);
      this._cli(COLORS.dim('─'.repeat(Math.min(name.length + 4, 60))));
    }
    this.emit('phase_start', { phase: name });
  }

  /**
   * End the current phase with a status
   * @param {string} [status='complete'] - 'complete', 'skipped', 'error'
   * @param {string} [message] - Optional status message
   */
  endPhase(status = 'complete', message = null) {
    const icons = { complete: '✓', skipped: '○', error: '✖' };
    const colors = { complete: COLORS.success, skipped: COLORS.muted, error: COLORS.error };
    const icon = icons[status] || icons.complete;
    const color = colors[status] || colors.complete;
    
    if (!this.quiet && !this.jsonMode && this.currentPhase) {
      const msg = message ? ` - ${message}` : '';
      this._cli(color(`  ${icon} ${this.currentPhase}${msg}`));
    }
    this.emit('phase_end', { phase: this.currentPhase, status, message });
    this.currentPhase = null;
  }

  /**
   * Log an informational message.
   * @param {string} message 
   */
  info(message) {
    this.emit('info', { message });
  }

  /**
   * Log a warning message.
   * @param {string} message 
   */
  warn(message) {
    this.emit('warning', { message });
  }

  /**
   * Log an error message.
   * @param {string} message 
   * @param {Error} [error] 
   */
  error(message, error) {
    this.emit('error', { message, stack: error ? error.stack : undefined });
  }

  /**
   * Log a success message.
   * @param {string} message 
   */
  success(message) {
    this.emit('success', { message });
  }

  /**
   * Log a step within a phase
   * @param {string} message - Step description
   * @param {object} [data] - Optional data to include
   */
  step(message, data = {}) {
    this.emit('step', { message, ...data });
  }

  /**
   * Report progress on a long-running task.
   * @param {string} label - Task label
   * @param {number} current - Current count
   * @param {number} total - Total count
   * @param {string} [unit] - Unit of measurement (e.g., 'countries')
   */
  progress(label, current, total, unit = '') {
    this.emit('progress', { label, current, total, unit });
  }

  /**
   * Report a completed section or phase.
   * @param {string} title 
   */
  section(title) {
    this.emit('section', { title });
  }

  /**
   * Report a table of data.
   * @param {Array<object>} rows - Data rows
   * @param {object} [options] - Table options (columns, format)
   */
  table(rows, options) {
    this.emit('table', { rows, options });
  }

  /**
   * Report final summary statistics.
   * @param {object} stats 
   */
  summary(stats) {
    this.emit('summary', { stats, durationMs: Date.now() - this.startTime });
  }

  /**
   * Display a count statistic inline
   * @param {string} label 
   * @param {number} count 
   * @param {string} [icon] 
   */
  count(label, count, icon = '📊') {
    if (!this.quiet && !this.jsonMode && this.verbose) {
      this._cli(`  ${COLORS.muted(icon)} ${label}: ${COLORS.cyan(count.toLocaleString())}`);
    }
  }

  /**
   * Display a key-value pair
   * @param {string} key 
   * @param {*} value 
   */
  kvPair(key, value) {
    if (!this.quiet && !this.jsonMode && this.verbose) {
      this._cli(`  ${COLORS.muted('•')} ${key}: ${COLORS.info(value)}`);
    }
  }

  /**
   * Internal method to format events for the CLI.
   * @private
   */
  _formatForCli(type, data) {
    if (this.quiet && type !== 'error' && type !== 'summary') return;

    switch (type) {
      case 'info':
        if (this.verbose) {
          this._cli(`${COLORS.info('ℹ')} ${data.message}`);
        }
        break;
      case 'success':
        this._cli(`${COLORS.success('✓')} ${data.message}`);
        break;
      case 'warning':
        this._cli(`${COLORS.warning('⚠')} ${data.message}`);
        break;
      case 'error':
        this._cli(`${COLORS.error('✖')} ${COLORS.error(data.message)}`);
        if (data.stack && this.verbose) this._err(COLORS.dim(data.stack));
        break;
      case 'step':
        if (this.verbose) {
          this._cli(`  ${COLORS.muted('→')} ${data.message}`);
        }
        break;
      case 'progress':
        if (this.verbose && process.stdout.isTTY) {
          const pct = Math.round((data.current / data.total) * 100);
          const barWidth = 20;
          const filled = Math.floor((pct / 100) * barWidth);
          const empty = barWidth - filled;
          const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
          const unitStr = data.unit ? ` ${data.unit}` : '';
          this._cliRaw(`\r  ${COLORS.cyan(`[${bar}]`)} ${pct}% ${data.label} (${data.current}/${data.total}${unitStr})`);
          if (data.current === data.total) {
            this._cliRaw('\n');
          }
        }
        break;
      case 'section':
        this._cli(`\n${COLORS.bold(COLORS.accent(data.title))}`);
        this._cli(COLORS.dim('─'.repeat(data.title.length)));
        break;
      case 'table':
        // NOTE: CliFormatter currently prints to stdout; avoid tables when summaryFormat=json.
        if (this.summaryFormat !== 'json') {
          this.fmt.table(data.rows, data.options);
        }
        break;
      case 'summary':
        if (this.summaryFormat === 'json') {
          // Keep stdout deterministic for machine parsing.
          this._summary(JSON.stringify({ ...(data.stats || {}), durationMs: data.durationMs }));
        } else {
          this._renderSummary(data);
        }
        break;
    }
  }

  /**
   * Render a beautiful summary section
   * @private
   */
  _renderSummary(data) {
    const stats = data.stats || {};
    const durationSec = (data.durationMs / 1000).toFixed(2);
    
    this._cli('\n' + COLORS.bold(COLORS.cyan('╔══════════════════════════════════════════════════════════════╗')));
    this._cli(COLORS.bold(COLORS.cyan('║')) + COLORS.bold('  🌍 Gazetteer Population Complete                            ') + COLORS.bold(COLORS.cyan('║')));
    this._cli(COLORS.bold(COLORS.cyan('╚══════════════════════════════════════════════════════════════╝')));
    
    if (stats.message) {
      this._cli(`\n${COLORS.info('ℹ')} ${stats.message}`);
    }
    
    // Core statistics in a nice grid
    this._cli('\n' + COLORS.bold('📊 Statistics'));
    this._cli(COLORS.dim('─────────────────────────────────'));
    
    const statRows = [
      ['🏳️  Countries', stats.countries],
      ['🏛️  Capitals', stats.capitals],
      ['📝 Names Added', stats.names],
      ['🗺️  ADM1 Regions', stats.adm1],
      ['📍 ADM2 Regions', stats.adm2],
      ['🏙️  Cities', stats.cities]
    ].filter(([, v]) => v !== undefined && v !== null);
    
    for (const [label, value] of statRows) {
      const valStr = typeof value === 'number' ? value.toLocaleString() : String(value);
      this._cli(`  ${label.padEnd(20)} ${COLORS.cyan(valStr)}`);
    }
    
    // Cleanup stats if present
    if (stats.cleanup) {
      this._cli('\n' + COLORS.bold('🧹 Cleanup'));
      this._cli(COLORS.dim('─────────────────────────────────'));
      this._cli(`  ${'Merged'.padEnd(20)} ${COLORS.cyan(stats.cleanup.merged || 0)}`);
      this._cli(`  ${'Deleted'.padEnd(20)} ${COLORS.cyan(stats.cleanup.deleted || 0)}`);
    }
    
    // Source and timing
    this._cli('\n' + COLORS.bold('⚙️  Metadata'));
    this._cli(COLORS.dim('─────────────────────────────────'));
    if (stats.source) {
      this._cli(`  ${'Source'.padEnd(20)} ${COLORS.info(stats.source)}`);
    }
    this._cli(`  ${'Duration'.padEnd(20)} ${COLORS.success(durationSec + 's')}`);
    
    this._cli('\n' + COLORS.dim('═'.repeat(60)) + '\n');
  }
}

module.exports = { GazetteerTelemetry };
