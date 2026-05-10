'use strict';

const { recordPlaceHubSeedRow } = require('news-crawler-db');

function withTrace(trace, name, fn) {
  if (!trace || typeof trace.pre !== 'function') {
    return fn();
  }

  const end = trace.pre(name);
  try {
    const result = fn();
    if (typeof end === 'function') end();
    return result;
  } catch (error) {
    if (typeof end === 'function') end(error);
    throw error;
  }
}

function resolveHandle(source) {
  if (!source) return null;
  if (typeof source.prepare === 'function') return source;
  if (typeof source.getHandle === 'function') {
    try {
      const handle = source.getHandle();
      if (handle && typeof handle.prepare === 'function') {
        return handle;
      }
    } catch (_) {
      return null;
    }
  }
  if (source.db && typeof source.db.prepare === 'function') {
    return source.db;
  }
  return null;
}

function ensureDb(source) {
  const handle = resolveHandle(source);
  if (!handle) {
    throw new Error('recordPlaceHubSeed requires a database handle with prepare()');
  }
  return handle;
}

function normalizeEvidence(input) {
  if (input == null) return null;
  if (typeof input === 'string') {
    return input;
  }
  try {
    return JSON.stringify(input);
  } catch (_) {
    return null;
  }
}

function recordPlaceHubSeed(dbSource, { host, url, evidence = null } = {}, { trace } = {}) {
  if (!host || !url) return false;

  // Delegate to adapter if method exists (Postgres or updated SQLite)
  if (dbSource && typeof dbSource.recordPlaceHubSeed === 'function') {
    return withTrace(trace, 'place-hubs:record-seed', () => {
      return dbSource.recordPlaceHubSeed({ host, url, evidence });
    });
  }

  return withTrace(trace, 'place-hubs:record-seed', () => {
    return recordPlaceHubSeedRow(ensureDb(dbSource), { host, url, evidence });
  });
}

module.exports = {
  recordPlaceHubSeed,
  resolveHandle
};
