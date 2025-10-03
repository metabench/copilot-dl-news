"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.crawlTypes");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    list: handle.prepare("SELECT name, description, declaration FROM crawl_types ORDER BY id")
  }));
}

function listCrawlTypes(db) {
  const { list } = prepareStatements(db);
  return list.all();
}

module.exports = {
  listCrawlTypes
};
