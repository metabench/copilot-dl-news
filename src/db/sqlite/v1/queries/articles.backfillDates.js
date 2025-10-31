'use strict';

function assertDatabase(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createBackfillDatesQueries requires a better-sqlite3 database handle');
  }
}

function buildArticleScope(onlyArticles, onlyUrl) {
  const where = [];
  const params = [];

  if (onlyArticles !== false) {
    where.push("EXISTS (SELECT 1 FROM fetches f WHERE f.url = a.url AND f.classification = 'article')");
  }

  const normalizedUrl = typeof onlyUrl === 'string' ? onlyUrl.trim() : '';
  if (normalizedUrl) {
    where.push('a.url = ?');
    params.push(normalizedUrl);
  }

  return { where, params };
}

function createBackfillDatesQueries(db) {
  assertDatabase(db);

  const updateArticleDateStmt = db.prepare('UPDATE articles SET date = ? WHERE url = ?');

  function iterateExistingDates(options = {}) {
    const {
      onlyArticles = true,
      onlyUrl = ''
    } = options;

    const scope = buildArticleScope(onlyArticles, onlyUrl);
    const where = ['a.date IS NOT NULL', ...scope.where];
    const sql = `SELECT a.url, a.date FROM articles a${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
    return db.prepare(sql).iterate(...scope.params);
  }

  function fetchBatch(options = {}) {
    const {
      lastId = 0,
      limit = 50,
      includeExistingDates = false,
      onlyArticles = true,
      onlyUrl = ''
    } = options;

    const scope = buildArticleScope(onlyArticles, onlyUrl);
    const where = ['a.id > ?'];
    const params = [lastId];

    if (!includeExistingDates) {
      where.push('a.date IS NULL');
    }

    if (scope.where.length) {
      where.push(...scope.where);
      params.push(...scope.params);
    }

    params.push(limit);

    const sql = `
      SELECT a.id, a.url, a.html, a.date
      FROM articles a
      WHERE ${where.join(' AND ')}
      ORDER BY a.id
      LIMIT ?
    `;

    return db.prepare(sql).all(...params);
  }

  function updateArticleDate(url, isoDate) {
    updateArticleDateStmt.run(isoDate ?? null, url);
  }

  return {
    iterateExistingDates,
    fetchBatch,
    updateArticleDate
  };
}

module.exports = { createBackfillDatesQueries };
