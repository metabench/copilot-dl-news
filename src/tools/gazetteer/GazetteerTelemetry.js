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
    this.fmt = new CliFormatter({ useEmojis: true });
    this.startTime = Date.now();
    this.currentPhase = null;
    this.spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.spinnerIndex = 0;
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
      console.log(`\n${COLORS.bold(COLORS.cyan(`${icon} ${name}`))}`);
      console.log(COLORS.dim('─'.repeat(Math.min(name.length + 4, 60))));
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
      console.log(color(`  ${icon} ${this.currentPhase}${msg}`));
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
      console.log(`  ${COLORS.muted(icon)} ${label}: ${COLORS.cyan(count.toLocaleString())}`);
    }
  }

  /**
   * Display a key-value pair
   * @param {string} key 
   * @param {*} value 
   */
  kvPair(key, value) {
    if (!this.quiet && !this.jsonMode && this.verbose) {
      console.log(`  ${COLORS.muted('•')} ${key}: ${COLORS.info(value)}`);
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
          console.log(`${COLORS.info('ℹ')} ${data.message}`);
        }
        break;
      case 'success':
        console.log(`${COLORS.success('✓')} ${data.message}`);
        break;
      case 'warning':
        console.log(`${COLORS.warning('⚠')} ${data.message}`);
        break;
      case 'error':
        console.log(`${COLORS.error('✖')} ${COLORS.error(data.message)}`);
        if (data.stack && this.verbose) console.error(COLORS.dim(data.stack));
        break;
      case 'step':
        if (this.verbose) {
          console.log(`  ${COLORS.muted('→')} ${data.message}`);
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
          process.stdout.write(`\r  ${COLORS.cyan(`[${bar}]`)} ${pct}% ${data.label} (${data.current}/${data.total}${unitStr})`);
          if (data.current === data.total) {
            process.stdout.write('\n');
          }
        }
        break;
      case 'section':
        console.log(`\n${COLORS.bold(COLORS.accent(data.title))}`);
        console.log(COLORS.dim('─'.repeat(data.title.length)));
        break;
      case 'table':
        this.fmt.table(data.rows, data.options);
        break;
      case 'summary':
        this._renderSummary(data);
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
    
    console.log('\n' + COLORS.bold(COLORS.cyan('╔══════════════════════════════════════════════════════════════╗')));
    console.log(COLORS.bold(COLORS.cyan('║')) + COLORS.bold('  🌍 Gazetteer Population Complete                            ') + COLORS.bold(COLORS.cyan('║')));
    console.log(COLORS.bold(COLORS.cyan('╚══════════════════════════════════════════════════════════════╝')));
    
    if (stats.message) {
      console.log(`\n${COLORS.info('ℹ')} ${stats.message}`);
    }
    
    // Core statistics in a nice grid
    console.log('\n' + COLORS.bold('📊 Statistics'));
    console.log(COLORS.dim('─────────────────────────────────'));
    
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
      console.log(`  ${label.padEnd(20)} ${COLORS.cyan(valStr)}`);
    }
    
    // Cleanup stats if present
    if (stats.cleanup) {
      console.log('\n' + COLORS.bold('🧹 Cleanup'));
      console.log(COLORS.dim('─────────────────────────────────'));
      console.log(`  ${'Merged'.padEnd(20)} ${COLORS.cyan(stats.cleanup.merged || 0)}`);
      console.log(`  ${'Deleted'.padEnd(20)} ${COLORS.cyan(stats.cleanup.deleted || 0)}`);
    }
    
    // Source and timing
    console.log('\n' + COLORS.bold('⚙️  Metadata'));
    console.log(COLORS.dim('─────────────────────────────────'));
    if (stats.source) {
      console.log(`  ${'Source'.padEnd(20)} ${COLORS.info(stats.source)}`);
    }
    console.log(`  ${'Duration'.padEnd(20)} ${COLORS.success(durationSec + 's')}`);
    
    console.log('\n' + COLORS.dim('═'.repeat(60)) + '\n');
  }
}

module.exports = { GazetteerTelemetry };
