'use strict';

function toBoolInt(value) {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeStringify(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function safeParse(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return null;
  }
}

function computeDurationMs(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const diff = end - start;
  return Number.isFinite(diff) ? diff : null;
}

module.exports = {
  toBoolInt,
  toNullableInt,
  safeStringify,
  safeParse,
  computeDurationMs
};
