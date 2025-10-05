/**
 * Formatting helpers shared across the crawler dashboard.
 * Keeping these in one place makes the main dashboard controller easier to scan.
 */

import { tof } from 'lang-tools';

/**
 * Turn a numeric-looking value into a locale-aware string.
 * Falls back to the original value when it cannot be parsed.
 *
 * @param {unknown} val
 * @returns {string}
 */
export function formatNumber(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) {
    return String(val ?? '0');
  }
  try {
    return num.toLocaleString();
  } catch (err) {
    return String(num);
  }
}

/**
 * Format a timestamp into a user-friendly time string.
 * Accepts Date instances, numbers (ms), or ISO-like strings.
 *
 * @param {unknown} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  if (!ts) {
    return new Date().toLocaleTimeString();
  }
  const parsed = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toLocaleTimeString();
  }
  return parsed.toLocaleTimeString();
}

/**
 * Express a timestamp as a relative moment ("3m ago").
 * Works with numbers (ms) or parseable strings; falls back gracefully otherwise.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatRelativeTime(value) {
  if (!value) {
    return 'just now';
  }
  const ts = tof(value) === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ts)) {
    return '—';
  }
  const now = Date.now();
  const diff = now - ts;
  if (diff < -5000) {
    return new Date(ts).toLocaleString();
  }
  if (Math.abs(diff) < 5000) {
    return 'just now';
  }
  const minutes = Math.floor(Math.abs(diff) / 60000);
  if (minutes < 1) {
    return `${Math.max(1, Math.round(Math.abs(diff) / 1000))}s ago`;
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(ts).toLocaleString();
}
