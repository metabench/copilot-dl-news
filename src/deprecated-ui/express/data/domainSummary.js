function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('fetchDomainSummary requires a database handle with prepare()');
  }
}

function withTrace(trace, name, fn) {
  if (!trace || typeof trace.pre !== 'function') {
    return fn();
  }
  const done = trace.pre(name);
  try {
    return fn();
  } finally {
    if (typeof done === 'function') {
      try {
        done();
      } catch (_) {
        // ignore trace end errors
      }
    }
  }
}

const {
  getArticleCount,
  getFetchCountDirect,
  getFetchCountViaJoin
} = require('../../../data/db/sqlite/v1/queries/ui/domainSummary");

function fetchDomainSummary(db, host, options = {}) {
  assertDb(db);
  const normalizedHost = String(host || '').trim().toLowerCase();
  if (!normalizedHost) {
    throw new TypeError('fetchDomainSummary requires a host');
  }
  const trace = options.trace || null;
  const allowFallback = options.allowFallback !== false;

  const articles = withTrace(trace, 'articles', () => getArticleCount(db, normalizedHost));
  const fetchesDirect = withTrace(trace, 'fetches-direct', () => getFetchCountDirect(db, normalizedHost));
  const fetches = fetchesDirect || !allowFallback
    ? fetchesDirect
    : withTrace(trace, 'fetches-fallback', () => getFetchCountViaJoin(db, normalizedHost));

  return {
    host: normalizedHost,
    articles,
    fetches
  };
}

module.exports = {
  fetchDomainSummary
};
