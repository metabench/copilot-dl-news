'use strict';

/**
 * Performance budget reporter — small ring buffer that tracks per-round
 * sync metrics and produces p50/p95 summaries.
 *
 * Pure: caller owns the lifecycle (`record`, `summary`).
 */

const DEFAULT_CAPACITY = 60;

function createPerfReporter({ capacity = DEFAULT_CAPACITY } = {}) {
  const cap = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : DEFAULT_CAPACITY;
  const buffer = [];

  function record(round = {}) {
    const entry = {
      at: round.at || new Date().toISOString(),
      fetchMs: numberOrZero(round.fetchMs),
      ingestMs: numberOrZero(round.ingestMs),
      verifyMs: numberOrZero(round.verifyMs),
      pruneMs: numberOrZero(round.pruneMs),
      totalMs: numberOrZero(round.totalMs),
      rows: numberOrZero(round.rows),
      bytes: numberOrZero(round.bytes),
      remoteBacklog: Number.isFinite(round.remoteBacklog) ? Number(round.remoteBacklog) : null,
    };
    buffer.push(entry);
    while (buffer.length > cap) buffer.shift();
    return entry;
  }

  function summary() {
    if (buffer.length === 0) {
      return { samples: 0 };
    }
    const totalSeconds = sumTotalSeconds(buffer);
    const rows = buffer.reduce((acc, e) => acc + e.rows, 0);
    const bytes = buffer.reduce((acc, e) => acc + e.bytes, 0);
    const latest = buffer[buffer.length - 1];
    return {
      samples: buffer.length,
      capacity: cap,
      fetchMs: percentiles(buffer.map(e => e.fetchMs)),
      ingestMs: percentiles(buffer.map(e => e.ingestMs)),
      verifyMs: percentiles(buffer.map(e => e.verifyMs)),
      pruneMs: percentiles(buffer.map(e => e.pruneMs)),
      totalMs: percentiles(buffer.map(e => e.totalMs)),
      rowsPerSec: totalSeconds > 0 ? rows / totalSeconds : 0,
      bytesPerSec: totalSeconds > 0 ? bytes / totalSeconds : 0,
      remoteBacklog: latest.remoteBacklog,
      lastAt: latest.at,
    };
  }

  function reset() {
    buffer.length = 0;
  }

  function snapshot() {
    return buffer.slice();
  }

  return { record, summary, reset, snapshot };
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function sumTotalSeconds(entries) {
  return entries.reduce((acc, e) => acc + (e.totalMs / 1000), 0);
}

function percentiles(values) {
  const sorted = values.filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return { p50: 0, p95: 0, max: 0 };
  return {
    p50: pick(sorted, 0.5),
    p95: pick(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

function pick(sorted, q) {
  if (sorted.length === 1) return sorted[0];
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

module.exports = { createPerfReporter, DEFAULT_CAPACITY };
