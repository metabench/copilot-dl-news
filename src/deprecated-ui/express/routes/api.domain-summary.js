const express = require('express');
const { fetchDomainSummary } = require('../../../data/domainSummary');
const { withNewsDb } = require('../../../data/db/dbAccess');
const { BadRequestError, InternalServerError } = require('../errors/HttpError');

function createDomainSummaryApiRouter({ urlsDbPath }) {
  if (!urlsDbPath) {
    throw new Error('createDomainSummaryApiRouter requires urlsDbPath');
  }

  const router = express.Router();

  router.get('/api/domain-summary', (req, res, next) => {
    const host = String(req.query.host || '').trim().toLowerCase();
    if (!host) {
      return next(new BadRequestError('Missing host'));
    }

    try {
      withNewsDb(urlsDbPath, (db) => {
        const summary = fetchDomainSummary(db.db, host);
        res.json(summary);
      });
    } catch (err) {
      return next(new InternalServerError(err && err.message ? err.message : String(err)));
    }
  });

  return router;
}

module.exports = {
  createDomainSummaryApiRouter
};