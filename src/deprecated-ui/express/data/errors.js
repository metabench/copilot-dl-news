const { listRecentErrors: fetchRecentErrors } = require('../../../data/db/sqlite/v1/queries/ui/errors");

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('listRecentErrors requires a database handle with prepare()');
  }
}

function listRecentErrors(db, options = {}) {
  assertDb(db);
  return fetchRecentErrors(db, options);
}

module.exports = {
  listRecentErrors
};
