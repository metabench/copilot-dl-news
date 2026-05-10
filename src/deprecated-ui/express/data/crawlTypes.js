const { listCrawlTypes: fetchCrawlTypes } = require('../../../data/db/sqlite/v1/queries/ui/crawlTypes");

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('listCrawlTypes requires a database handle with prepare()');
  }
}

function listCrawlTypes(db, { parseDeclaration = true } = {}) {
  assertDb(db);
  const rows = fetchCrawlTypes(db);
  if (!parseDeclaration) {
    return rows;
  }
  return rows.map((row) => {
    try {
      return {
        ...row,
        declaration: row.declaration ? JSON.parse(row.declaration) : {},
        declarationError: null
      };
    } catch (err) {
      return {
        ...row,
        declaration: {},
        declarationError: err && err.message ? err.message : 'invalid declaration JSON'
      };
    }
  });
}

module.exports = {
  listCrawlTypes
};
