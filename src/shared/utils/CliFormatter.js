/**
 * CliFormatter — Centralized output formatting with consistent colors, emojis, and styles.
 * 
 * Provides a unified API for beautiful CLI output across all tools:
 * - Colored text with consistent palette
 * - Emoji indicators for status and context
 * - Structured output (tables, sections, headers, lists)
 * - Progress tracking with visual bars
 * 
 * @example
 * const fmt = new CliFormatter();
 * fmt.header('My Tool');
 * fmt.section('Results');
 * fmt.stat('Total items', 1234);
 * fmt.table([{ name: 'Item 1', status: 'ok' }]);
 * fmt.success('Done!');
 */

let chalkInstance = null;
try {
  const chalkModule = require('chalk');
  chalkInstance = chalkModule && chalkModule.default ? chalkModule.default : chalkModule;
} catch (error) {
  chalkInstance = null;
}

const createColorizer = (chalkFn, fallbackCode) => {
  if (chalkInstance && typeof chalkFn === 'function') {
    return chalkFn;
  }

  return (text) => {
    if (!process.stdout.isTTY) return text;
    return `\x1b[${fallbackCode}m${text}\x1b[0m`;
  };
};

const COLORS = {
  success: createColorizer(chalkInstance && chalkInstance.green, 32),
  error: createColorizer(chalkInstance && chalkInstance.red, 31),
  warning: createColorizer(chalkInstance && chalkInstance.yellow, 33),
  info: createColorizer(chalkInstance && chalkInstance.blue, 34),
  muted: createColorizer(chalkInstance && chalkInstance.gray, 90),
  accent: createColorizer(chalkInstance && chalkInstance.magenta, 35),
  cyan: createColorizer(chalkInstance && chalkInstance.cyan, 36),
  bold: createColorizer(chalkInstance && chalkInstance.bold, 1),
  dim: createColorizer(chalkInstance && chalkInstance.dim, 2),
  inverse: createColorizer(chalkInstance && chalkInstance.inverse, 7),
};

/**
 * Centralized emoji/icon set - consistent across all CLI output.
 * Each category groups related icons for easy discovery.
 */
const ICONS = {
  // Status indicators
  success: '✓',
  error: '✖',
  warning: '⚠',
  info: 'ℹ',
  pending: '⏳',
  complete: '✅',
  
  // Domain-specific icons
  geography: '🌍',
  compass: '🧭',
  database: '🗄',
  schema: '🗂',
  table: '📊',
  list: '📋',
  settings: '⚙',
  
  // Visual connectors (for ASCII art)
  arrow: '→',
  bullet: '•',
  dash: '─',
  pipe: '│',
  corner_tl: '┌',
  corner_tr: '┐',
  corner_bl: '└',
  corner_br: '┘',
  h_line: '═',
  v_line: '│',
  cross: '┼',
};

let lexicon = null;
try {
  lexicon = require('../../tools/dev/i18n/lexicon');
} catch (error) {
  lexicon = null;
}

const HAS_LEXICON = Boolean(lexicon);
const DEFAULT_LANGUAGE_MODE = 'en';

function normalizeLanguageMode(mode) {
  if (typeof mode !== 'string') {
    return DEFAULT_LANGUAGE_MODE;
  }
  const normalized = mode.trim().toLowerCase();
  if (normalized === 'zh' || normalized === 'cn' || normalized === 'zh-cn') {
    return 'zh';
  }
  if (normalized === 'bilingual' || normalized === 'en-zh' || normalized === 'zh-en') {
    return 'bilingual';
  }
  return DEFAULT_LANGUAGE_MODE;
}

/**
 * CliFormatter class - provides beautiful formatted output for CLI tools.
 */
class CliFormatter {
  /**
   * Create a new CliFormatter instance.
   * @param {Object} options Configuration options
   * @param {number} [options.width=80] Terminal width for wrapping/formatting
   * @param {boolean} [options.useEmojis=true] Include emojis in output (set false for systems without emoji support)
   * @param {number} [options.indent=0] Base indentation level (spaces)
   */
  constructor(options = {}) {
    this.width = options.width || 80;
    this.useEmojis = options.useEmojis !== false;
    this.indent = options.indent || 0;
    this.languageMode = normalizeLanguageMode(options.languageMode || DEFAULT_LANGUAGE_MODE);
  }

  /**
   * Expose colors and icons for direct use (advanced scenarios)
   */
  get COLORS() {
    return COLORS;
  }

  get ICONS() {
    return ICONS;
  }

  /**
   * Internal helper - format a message with icon, label, and content.
   * @private
   */
  _format(color, icon, labelKey, fallbackLabel, content, options = {}) {
    const label = this._resolveLabel(labelKey, fallbackLabel, options);
    const iconStr = this.useEmojis && icon ? `${icon} ` : '';
    const prefix = `${color(`[${iconStr}${label}]`)} `;
    return `${prefix}${content}`;
  }

  /**
   * Internal helper - indent text by current indent level.
   * @private
   */
  _indent(text = '', extra = 0) {
    const spaces = ' '.repeat(this.indent + extra);
    return `${spaces}${text}`;
  }

  _resolveLabel(labelKey, fallbackLabel, options = {}) {
    const english = options.english || fallbackLabel || labelKey;
    if (!HAS_LEXICON || !labelKey) {
      return english;
    }

    const mode = normalizeLanguageMode(options.languageMode || this.languageMode);

    if (options.chineseOnly || mode === 'zh') {
      const alias = lexicon.getPrimaryAlias(labelKey);
      return alias || english;
    }

    if (mode === 'bilingual') {
      return lexicon.formatLabel(labelKey, { english, englishFirst: options.englishFirst !== false });
    }

    if (options.englishFirst === false) {
      return lexicon.formatLabel(labelKey, { english, englishFirst: false });
    }

    return english;
  }

  setLanguageMode(mode) {
    this.languageMode = normalizeLanguageMode(mode);
  }

  getLanguageMode() {
    return this.languageMode;
  }

  isChineseMode() {
    return this.languageMode === 'zh';
  }

  translateLabel(labelKey, fallbackLabel, options = {}) {
    return this._resolveLabel(labelKey, fallbackLabel, options);
  }

  // ========== SIMPLE MESSAGES ==========

  /**
   * Print a success message (green with checkmark).
   * @param {string} message The message to display
   */
  success(message) {
    console.log(this._format(COLORS.success, ICONS.complete, 'success', 'OK', message));
  }

  /**
   * Print an error message (red with X).
   * @param {string} message The message to display
   */
  error(message) {
    console.log(this._format(COLORS.error, ICONS.error, 'error', 'ERROR', message));
  }

  /**
   * Print a warning message (yellow with caution icon).
   * @param {string} message The message to display
   */
  warn(message) {
    console.log(this._format(COLORS.warning, ICONS.warning, 'warning', 'WARN', message));
  }

  /**
   * Print an info message (blue with info icon).
   * @param {string} message The message to display
   */
  info(message) {
    console.log(this._format(COLORS.info, ICONS.info, 'info', 'INFO', message));
  }

  /**
   * Print a pending/processing message (with hourglass icon).
   * @param {string} message The message to display
   */
  pending(message) {
    console.log(this._format(COLORS.cyan, ICONS.pending, 'pending', 'WAIT', message));
  }

  /**
   * Print a settings/configuration message.
   * @param {string} message The message to display
   */
  settings(message) {
    console.log(this._format(COLORS.info, ICONS.settings, 'settings', 'CFG', message));
  }

  // ========== STRUCTURAL ELEMENTS ==========

  /**
   * Print a header with decorative box.
   * @param {string} title The header title
   * @example
   * fmt.header('Gazetteer Analysis');
   * // Outputs: ╔ Gazetteer Analysis ═══════════════════════════════════════
   */
  header(title) {
    const remaining = this.width - title.length - 4; // Account for ╔ and spaces
    const line = ICONS.h_line.repeat(Math.max(0, remaining));
    console.log(`\n${COLORS.bold(COLORS.cyan(`${ICONS.corner_tl} ${title} ${line}`))}`);
  }

  /**
   * Print a footer (dividing line).
   * @example
   * fmt.footer();
   * // Outputs: ═══════════════════════════════════════════════════════════════════════════════
   */
  footer() {
    const line = ICONS.h_line.repeat(this.width);
    console.log(`${COLORS.cyan(line)}\n`);
  }

  /**
   * Print a section header (smaller than header, with underline).
   * @param {string} title The section title
   * @example
   * fmt.section('Summary');
   * // Outputs:
   * // Summary
   * // ───────
   */
  section(title) {
    console.log(`\n${COLORS.bold(COLORS.accent(title))}`);
    console.log(COLORS.dim(ICONS.dash.repeat(title.length)));
  }

  /**
   * Print a blank line.
   */
  blank() {
    console.log();
  }

  // ========== DATA DISPLAY ==========

  /**
   * Print a statistic line (label padded left, value on right).
   * @param {string} label The statistic label
   * @param {*} value The statistic value
   * @param {string} [format='default'] Format type: 'default', 'number', 'file-size', 'duration'
   * @example
   * fmt.stat('Total items', 1234567);
   * fmt.stat('Duration', '2.5s', 'duration');
   */
  stat(label, value, format = 'default') {
    const padded = String(label).padEnd(30);
    let colored = value;

    if (format === 'number') {
      colored = COLORS.cyan(value);
    } else if (format === 'duration') {
      colored = COLORS.cyan(value);
    } else if (format === 'file-size') {
      colored = COLORS.cyan(value);
    }

    console.log(this._indent(`${padded} ${colored}`, 2));
  }

  /**
   * Print a bullet list.
   * @param {string} title List title
   * @param {string[]} items List items
   * @example
   * fmt.list('Issues found', ['Bad refs', 'Orphan edges', 'Duplicates']);
   * // Outputs:
   * // Issues found:
   * //   • Bad refs
   * //   • Orphan edges
   * //   • Duplicates
   */
  list(title, items) {
    console.log(`\n${title}:`);
    for (const item of items) {
      console.log(this._indent(`${COLORS.muted(ICONS.bullet)} ${item}`, 2));
    }
  }

  /**
   * Print a formatted ASCII table.
   * @param {Array<Object>} rows Array of objects (each object is a row)
   * @param {Object} [options] Table options
   * @param {string[]} [options.columns] Column order (if not all columns, if empty uses all from first row)
   * @param {Object<string, Function>} [options.format] Format functions per column: { columnName: (value) => formatted }
   * @example
   * fmt.table([
   *   { domain: 'bbc.com', status: 'active', score: 0.98 },
   *   { domain: 'example.com', status: 'error', score: 0.00 }
   * ], {
   *   format: {
   *     status: (v) => v === 'error' ? fmt.COLORS.error(v) : fmt.COLORS.success(v)
   *   }
   * });
   */
  table(rows, options = {}) {
    if (!rows || rows.length === 0) {
      console.log(this._indent('(no data)', 2));
      return;
    }

    // Determine columns
    const cols = options.columns || Object.keys(rows[0]);
    if (cols.length === 0) return;

    const colWidths = {};
    const formatFuncs = options.format || {};

    // Calculate column widths
    for (const col of cols) {
      colWidths[col] = Math.max(
        col.length,
        ...rows.map(r => String(r[col] || '').length)
      );
    }

    // Header row
    const header = cols
      .map(col => COLORS.bold(String(col).padEnd(colWidths[col])))
      .join(` ${ICONS.pipe} `);
    console.log(this._indent(header, 2));

    // Separator
    const sep = cols
      .map(col => ICONS.dash.repeat(colWidths[col]))
      .join(`${ICONS.dash}${ICONS.cross}${ICONS.dash}`);
    console.log(this._indent(sep, 2));

    // Data rows
    for (const row of rows) {
      const line = cols
        .map(col => {
          const val = String(row[col] || '');
          const formatted = formatFuncs[col] ? formatFuncs[col](row[col]) : val;
          return String(formatted).padEnd(colWidths[col]);
        })
        .join(` ${ICONS.pipe} `);
      console.log(this._indent(line, 2));
    }

    console.log();
  }

  /**
   * Render a compact list where each entry fits on a single line.
   * @param {Array<*>} items Items to render
   * @param {Object} [options]
   * @param {function(*, number): string} [options.labelFormatter] Label builder (defaults to index + 1)
   * @param {function(*, number): (string|string[])} [options.renderSegments] Segment builder per entry
   * @param {string} [options.joiner=' | '] Separator between segments
   * @param {number} [options.indent=2] Left indent for each line
   * @param {string} [options.emptyMessage='(no entries)'] Message when list is empty
   */
  denseList(items, options = {}) {
    const entries = Array.isArray(items) ? items : [];
    const indent = Number.isFinite(options.indent) ? options.indent : 2;
    if (entries.length === 0) {
      const emptyMessage = options.emptyMessage || '(no entries)';
      console.log(this._indent(emptyMessage, indent));
      console.log();
      return;
    }

    const labelFormatter = typeof options.labelFormatter === 'function'
      ? options.labelFormatter
      : ((_, index) => `${index + 1}.`);

    const labels = entries.map((entry, index) => {
      const raw = labelFormatter(entry, index);
      return raw === undefined || raw === null ? '' : String(raw);
    });
    const labelWidth = labels.reduce((max, label) => Math.max(max, label.length), 0);

    const joiner = typeof options.joiner === 'string' ? options.joiner : ' | ';
    const renderSegments = typeof options.renderSegments === 'function'
      ? options.renderSegments
      : ((entry) => [String(entry)]);

    entries.forEach((entry, index) => {
      const label = labels[index];
      const rawSegments = renderSegments(entry, index);
      const segmentsArray = Array.isArray(rawSegments) ? rawSegments : [rawSegments];
      const segments = segmentsArray
        .map((segment) => (segment === undefined || segment === null ? '' : String(segment).trim()))
        .filter((segment) => segment.length > 0);

      const prefix = labelWidth > 0 && label.length > 0 ? `${label.padEnd(labelWidth)} ` : label;
      const lineBody = segments.join(joiner);
      const composed = lineBody ? `${prefix}${lineBody}` : prefix.trimEnd();
      console.log(this._indent(composed.trimEnd(), indent));
    });

    console.log();
  }

  /**
   * Print a progress bar.
   * @param {string} label Progress label
   * @param {number} current Current progress value
   * @param {number} total Total value
   * @param {Object} [options] Options
   * @param {number} [options.barWidth=20] Width of progress bar in characters
   * @example
   * fmt.progress('Processing', 250, 1000);
   * // Outputs: Processing [████████░░░░░░░░░░] 25%
   */
  progress(label, current, total, options = {}) {
    const barWidth = options.barWidth || 20;
    const pct = Math.round((current / total) * 100);
    const filled = Math.floor((pct / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
    const pctStr = `${pct.toString().padStart(3)}%`;
    console.log(this._indent(`${label} ${COLORS.cyan(`[${bar}]`)} ${pctStr}`, 2));
  }

  /**
   * Print a summary section with stats.
   * @param {Object<string, *>} stats Key-value pairs of statistics
   * @example
   * fmt.summary({
   *   'Total processed': 1000,
   *   'Successful': 950,
   *   'Failed': 50,
   *   'Duration': '2.5s'
   * });
   */
  summary(stats) {
    this.section('Summary');
    for (const [label, value] of Object.entries(stats)) {
      this.stat(label, value);
    }
  }

  /**
   * Print a boxed message (decorative).
   * @param {string} content Content to box (can be multiline)
   * @param {Object} [options] Box options
   * @param {string} [options.color='muted'] Color name from COLORS palette
   * @param {boolean} [options.padding=true] Add padding inside box
   * @example
   * fmt.box('Important notice\nRead this carefully', { color: 'warning' });
   */
  box(content, options = {}) {
    const lines = content.split('\n');
    const maxWidth = Math.max(...lines.map(l => l.length));
    const borderColor = COLORS[options.color || 'muted'];
    const padding = options.padding !== false;

    const width = maxWidth + (padding ? 4 : 2);

    console.log(borderColor(`${ICONS.corner_tl}${ICONS.h_line.repeat(width)}${ICONS.corner_tr}`));

    for (const line of lines) {
      const padded = padding ? ` ${line.padEnd(maxWidth)} ` : line.padEnd(maxWidth);
      console.log(borderColor(`${ICONS.v_line}`) + padded + borderColor(`${ICONS.v_line}`));
    }

    console.log(borderColor(`${ICONS.corner_bl}${ICONS.h_line.repeat(width)}${ICONS.corner_br}`));
  }

  // ========== CUSTOM STATUS LINES ==========

  /**
   * Print a status line with custom icon and color.
   * @param {string} iconKey Key from ICONS object
   * @param {string} colorKey Key from COLORS object
   * @param {string} label Status label
   * @param {string} message Status message
   * @example
   * fmt.statusLine('geography', 'info', 'GEO', 'Processing countries');
   */
  statusLine(iconKey, colorKey, label, message) {
    const icon = this.useEmojis ? `${ICONS[iconKey]} ` : '';
    const color = COLORS[colorKey] || chalk.white;
    console.log(`${color(`[${icon}${label}]`)} ${message}`);
  }

  /**
   * Print a data pair (key: value, for inline display).
   * @param {string} key Data key
   * @param {string|number} value Data value
   * @param {string} [colorKey='muted'] Color for the value
   * @example
   * fmt.dataPair('Status', 'active', 'success');
   * // Outputs: Status: ✓ active
   */
  dataPair(key, value, colorKey = 'muted') {
    const color = COLORS[colorKey] || chalk.white;
    console.log(`${COLORS.bold(key)}: ${color(value)}`);
  }
}

module.exports = { CliFormatter, COLORS, ICONS };
