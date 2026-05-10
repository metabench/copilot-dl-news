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

function ensureDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('urlDetails data helpers require a database handle with prepare()');
  }
  return db;
}

const {
  selectUrlRecord,
  selectFetchFileInfo
} = require('../../../data/db/sqlite/v1/queries/ui/urlDetails");

function getUrlRecord(db, url, { trace } = {}) {
  const handle = ensureDb(db);
  if (!url) return null;
  return withTrace(trace, 'url-details:url-record', () => selectUrlRecord(handle, url));
}

function getFetchFileInfo(db, id, { trace } = {}) {
  const handle = ensureDb(db);
  if (!Number.isFinite(id)) return null;
  return withTrace(trace, 'url-details:fetch-file-info', () => selectFetchFileInfo(handle, id));
}

module.exports = {
  getUrlRecord,
  getFetchFileInfo
};
