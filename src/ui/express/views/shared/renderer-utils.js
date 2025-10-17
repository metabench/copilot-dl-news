const { escapeHtml } = require('../../utils/html');
const { is_defined, each } = require('lang-tools');

const DEFAULT_STATUS_PRIORITY = ['running', 'paused', 'active', 'done'];

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) {
      return String(ts);
    }
    return date.toISOString().replace('T', ' ').slice(0, 19);
  } catch (err) {
    return String(ts);
  }
}

function formatDuration(startedAt, endedAt, now = Date.now()) {
  if (!startedAt) return '';
  const startDate = new Date(startedAt);
  if (Number.isNaN(startDate.getTime())) return '';
  const endDate = endedAt ? new Date(endedAt) : new Date(now);
  if (Number.isNaN(endDate.getTime())) return '';
  const diff = Math.max(0, endDate.getTime() - startDate.getTime());
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function normalizeStatus(rawStatus, { paused = false, fallback = 'unknown' } = {}) {
  const base = is_defined(rawStatus) ? String(rawStatus).trim() : '';
  if (!base && paused) return 'paused';
  const normalized = base.toLowerCase();
  if (normalized) return normalized;
  return paused ? 'paused' : fallback;
}

function collectStatusCounts(rows, {
  statusSelector = (row) => row.status,
  pausedSelector = (row) => row.paused,
  priority = DEFAULT_STATUS_PRIORITY
} = {}) {
  const counts = new Map();
  each(rows, (row) => {
    const normalized = normalizeStatus(statusSelector(row), { paused: pausedSelector(row) });
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });

  const priorityIndex = new Map();
  priority.forEach((value, idx) => {
    priorityIndex.set(value, idx);
  });

  return Array.from(counts.entries()).sort((a, b) => {
    if (a[0] === b[0]) return 0;
    const aPriority = priorityIndex.has(a[0]) ? priorityIndex.get(a[0]) : Number.POSITIVE_INFINITY;
    const bPriority = priorityIndex.has(b[0]) ? priorityIndex.get(b[0]) : Number.POSITIVE_INFINITY;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

module.exports = {
  escapeHtml,
  each,
  is_defined,
  toNumber,
  formatTimestamp,
  formatDuration,
  normalizeStatus,
  collectStatusCounts,
  DEFAULT_STATUS_PRIORITY
};
