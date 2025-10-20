/**
 * Isomorphic telemetry rendering utilities
 * Can be used both server-side (SSR) and client-side
 * 
 * @module shared/telemetry/telemetryRenderer
 */

/**
 * Format a telemetry entry for display
 * @param {Object} entry - Telemetry entry
 * @param {string} entry.type - Event type (stage_transition, error, warning, info)
 * @param {string} entry.stage - Current stage
 * @param {string} entry.message - Human-readable message
 * @param {number} entry.timestamp - Unix timestamp
 * @param {Object} entry.context - Additional context
 * @returns {Object} Formatted telemetry data
 */
export function formatTelemetryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    const fallbackTimestamp = Date.now();
    return {
      type: 'info',
      stage: 'unknown',
      message: 'Invalid telemetry entry',
      timestamp: fallbackTimestamp,
      context: {},
      severity: 'low',
      icon: getIcon('info', 'low'),
      relativeTime: formatRelativeTime(fallbackTimestamp),
      formattedTimestamp: new Date(fallbackTimestamp).toISOString()
    };
  }

  const rawType = entry.type || entry.event || 'info';
  const normalizedTimestamp = normalizeTelemetryTimestamp(entry);
  const severity = getSeverity(rawType);
  const icon = getIcon(rawType, severity);
  const relativeTime = formatRelativeTime(normalizedTimestamp);

  return {
    type: rawType,
    stage: entry.stage || entry.context?.stage || entry.details?.stage || 'unknown',
    message: entry.message || entry.details || '',
    timestamp: normalizedTimestamp,
    context: entry.context || entry.details || {},
    severity,
    icon,
    relativeTime,
    formattedTimestamp: new Date(normalizedTimestamp).toISOString()
  };
}

/**
 * Get severity level from telemetry type
 * @param {string} type - Telemetry type
 * @returns {string} Severity level (critical, high, medium, low)
 */
function getSeverity(type) {
  const severityMap = {
    error: 'critical',
    failed: 'critical',
    warning: 'high',
    stage_transition: 'medium',
    started: 'medium',
    completed: 'low',
    skipped: 'low',
    info: 'low'
  };
  return severityMap[type] || 'low';
}

/**
 * Get icon for telemetry type
 * @param {string} type - Telemetry type
 * @param {string} severity - Severity level
 * @returns {string} Icon character
 */
function getIcon(type, severity) {
  const iconMap = {
    error: '❌',
    failed: '❌',
    warning: '⚠️',
    started: '🚀',
    completed: '✅',
    skipped: '⏭️',
    stage_transition: '➡️',
    info: 'ℹ️'
  };
  return iconMap[type] || '•';
}

/**
 * Normalize inbound telemetry timestamps to a numeric epoch value.
 * Accepts multiple field names and string/Date representations.
 *
 * @param {Object} entry - Raw telemetry entry
 * @returns {number} Timestamp in milliseconds
 */
function normalizeTelemetryTimestamp(entry) {
  const candidates = [
    entry.timestamp,
    entry.ts,
    entry.time,
    entry.date,
    entry.createdAt,
    entry.updatedAt
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (candidate instanceof Date) {
      const value = candidate.getTime();
      if (Number.isFinite(value)) return value;
      continue;
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return Date.now();
}

/**
 * Format timestamp as relative time (e.g., "2s ago", "just now")
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Relative time string
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'unknown time';
  
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Render telemetry entry to HTML string (isomorphic)
 * @param {Object} entry - Telemetry entry
 * @param {Object} options - Render options
 * @param {boolean} options.showTimestamp - Show timestamp (default: true)
 * @param {boolean} options.showIcon - Show icon (default: true)
 * @param {boolean} options.showStage - Show stage label (default: true)
 * @param {boolean} options.compact - Compact mode (default: false)
 * @returns {string} HTML string
 */
export function renderTelemetryEntry(entry, options = {}) {
  const {
    showTimestamp = true,
    showIcon = true,
    showStage = true,
    compact = false
  } = options;

  const formatted = formatTelemetryEntry(entry);
  const classes = [
    'telemetry-entry',
    `telemetry-entry--${formatted.type}`,
    `telemetry-entry--${formatted.severity}`,
    compact ? 'telemetry-entry--compact' : ''
  ].filter(Boolean).join(' ');

  const parts = [];

  if (showIcon) {
    parts.push(`<span class="telemetry-entry__icon" aria-hidden="true">${formatted.icon}</span>`);
  }

  if (showStage) {
    parts.push(`<span class="telemetry-entry__stage">${escapeHtml(formatted.stage)}</span>`);
  }

  parts.push(`<span class="telemetry-entry__message">${escapeHtml(formatted.message)}</span>`);

  if (showTimestamp) {
    parts.push(`<span class="telemetry-entry__time" title="${formatted.formattedTimestamp}">${formatted.relativeTime}</span>`);
  }

  return `<div class="${classes}">${parts.join('')}</div>`;
}

/**
 * Render multiple telemetry entries as HTML list
 * @param {Array<Object>} entries - Array of telemetry entries
 * @param {Object} options - Render options
 * @returns {string} HTML string
 */
export function renderTelemetryList(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '<div class="telemetry-list telemetry-list--empty">No telemetry events yet.</div>';
  }

  const items = entries.map(entry => renderTelemetryEntry(entry, options)).join('\n');
  return `<div class="telemetry-list">${items}</div>`;
}

/**
 * Get summary statistics from telemetry entries
 * @param {Array<Object>} entries - Array of telemetry entries
 * @returns {Object} Statistics
 */
export function getTelemetryStats(entries) {
  if (!Array.isArray(entries)) {
    return { total: 0, errors: 0, warnings: 0, stages: 0 };
  }

  return entries.reduce((stats, entry) => {
    stats.total++;
    if (entry.type === 'error' || entry.type === 'failed') stats.errors++;
    if (entry.type === 'warning') stats.warnings++;
    if (entry.type === 'stage_transition' || entry.type === 'started') stats.stages++;
    return stats;
  }, { total: 0, errors: 0, warnings: 0, stages: 0 });
}

/**
 * Filter telemetry entries by type
 * @param {Array<Object>} entries - Array of telemetry entries
 * @param {string|Array<string>} types - Type or array of types to filter
 * @returns {Array<Object>} Filtered entries
 */
export function filterTelemetryByType(entries, types) {
  if (!Array.isArray(entries)) return [];
  const typeArray = Array.isArray(types) ? types : [types];
  return entries.filter(entry => typeArray.includes(entry.type));
}

/**
 * Get most recent telemetry entry by type
 * @param {Array<Object>} entries - Array of telemetry entries
 * @param {string} type - Type to filter
 * @returns {Object|null} Most recent entry or null
 */
export function getLatestTelemetryByType(entries, type) {
  const filtered = filterTelemetryByType(entries, type);
  if (filtered.length === 0) return null;
  return filtered[filtered.length - 1];
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parse telemetry from crawler console output
 * @param {string} line - Console line
 * @returns {Object|null} Parsed telemetry or null
 */
export function parseTelemetryFromConsole(line) {
  if (typeof line !== 'string') return null;
  
  // Match: [TELEMETRY] {"type":"...","stage":"...","message":"...",...}
  const match = line.match(/^\[TELEMETRY\]\s*(.+)$/);
  if (!match) return null;
  
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    return null;
  }
}

/**
 * Format progress information from telemetry context
 * @param {Object} context - Telemetry context with progress info
 * @returns {Object|null} Progress info or null
 */
export function extractProgressFromTelemetry(context) {
  if (!context || typeof context !== 'object') return null;
  
  const progress = {
    current: context.current || context.processed || 0,
    total: context.total || context.totalItems || 0,
    percentage: 0,
    isIndeterminate: false
  };
  
  if (progress.total > 0) {
    progress.percentage = Math.min(100, Math.max(0, (progress.current / progress.total) * 100));
  } else {
    progress.isIndeterminate = true;
  }
  
  return progress;
}
