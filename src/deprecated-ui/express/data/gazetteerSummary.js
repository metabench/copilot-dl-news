function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('fetchGazetteerSummary requires a database handle with prepare()');
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

const SUMMARY_QUERIES = {
  countries: "SELECT COUNT(*) AS c FROM places WHERE kind='country'",
  regions: "SELECT COUNT(*) AS c FROM places WHERE kind='region'",
  cities: "SELECT COUNT(*) AS c FROM places WHERE kind='city'",
  names: 'SELECT COUNT(*) AS c FROM place_names',
  sources: 'SELECT COUNT(*) AS c FROM place_sources'
};

function getCount(db, sql) {
  try {
    const row = db.prepare(sql).get();
    return (row && typeof row.c === 'number') ? row.c : 0;
  } catch (_) {
    return 0;
  }
}

function fetchGazetteerSummary(db, options = {}) {
  assertDb(db);
  const trace = options.trace || null;
  const result = {
    countries: 0,
    regions: 0,
    cities: 0,
    names: 0,
    sources: 0
  };

  for (const [key, sql] of Object.entries(SUMMARY_QUERIES)) {
    result[key] = withTrace(trace, key, () => getCount(db, sql));
  }

  return result;
}

module.exports = {
  fetchGazetteerSummary
};
