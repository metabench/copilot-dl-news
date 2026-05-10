"use strict";

const { resolveNewsCrawlerDbModule } = require("../../../../../../db/openNewsCrawlerDb");

function getUrlListingAccess(db) {
  if (db && db.urlListing) return db.urlListing;
  if (db && db.db && db.db.urlListing) return db.db.urlListing;

  const { createSqliteUrlListingAccess } = resolveNewsCrawlerDbModule();
  if (typeof createSqliteUrlListingAccess !== "function") {
    throw new Error("news-crawler-db does not export createSqliteUrlListingAccess. Build ../news-crawler-db.");
  }
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("URL listing queries require a news-crawler-db adapter or SQLite handle");
  }
  return createSqliteUrlListingAccess(db);
}

function selectInitialUrls(db, options = {}) {
  return getUrlListingAccess(db).selectInitialUrls(options);
}

function selectUrlPage(db, options = {}) {
  return getUrlListingAccess(db).selectUrlPage(options);
}

function selectUrlPageByHost(db, options = {}) {
  return getUrlListingAccess(db).selectUrlPageByHost(options);
}

function countUrls(db) {
  return getUrlListingAccess(db).countUrls();
}

function countUrlsByHost(db, host) {
  return getUrlListingAccess(db).countUrlsByHost(host);
}

function selectFetchedUrlPage(db, options = {}) {
  return getUrlListingAccess(db).selectFetchedUrlPage(options);
}

function selectFetchedUrlPageByHost(db, options = {}) {
  return getUrlListingAccess(db).selectFetchedUrlPageByHost(options);
}

function countFetchedUrls(db) {
  return getUrlListingAccess(db).countFetchedUrls();
}

function countFetchedUrlsByHost(db, host) {
  return getUrlListingAccess(db).countFetchedUrlsByHost(host);
}

function selectUrlPageFiltered(db, options = {}) {
  return getUrlListingAccess(db).selectUrlPageFiltered(options);
}

function countUrlsFiltered(db, options = {}) {
  return getUrlListingAccess(db).countUrlsFiltered(options);
}

function selectFetchedUrlPageFiltered(db, options = {}) {
  return getUrlListingAccess(db).selectFetchedUrlPageFiltered(options);
}

function countFetchedUrlsFiltered(db, options = {}) {
  return getUrlListingAccess(db).countFetchedUrlsFiltered(options);
}

function normalizeHostMode(value) {
  const { createSqliteUrlListingAccess } = resolveNewsCrawlerDbModule();
  const access = createSqliteUrlListingAccess({ prepare() { throw new Error("not available"); } });
  return access.normalizeHostMode(value);
}

function parseHosts(value) {
  const { createSqliteUrlListingAccess } = resolveNewsCrawlerDbModule();
  const access = createSqliteUrlListingAccess({ prepare() { throw new Error("not available"); } });
  return access.parseHosts(value);
}

module.exports = {
  selectInitialUrls,
  selectUrlPage,
  selectUrlPageByHost,
  countUrls,
  countUrlsByHost,
  selectFetchedUrlPage,
  selectFetchedUrlPageByHost,
  countFetchedUrls,
  countFetchedUrlsByHost,
  selectUrlPageFiltered,
  countUrlsFiltered,
  selectFetchedUrlPageFiltered,
  countFetchedUrlsFiltered,
  normalizeHostMode,
  parseHosts
};
