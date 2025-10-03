"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.urlDetails");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    urlRecord: handle.prepare('SELECT * FROM urls WHERE url = ?'),
    fetchFileInfo: handle.prepare('SELECT id, file_path, content_type, content_encoding FROM fetches WHERE id = ?')
  }));
}

function selectUrlRecord(db, url) {
  const { urlRecord } = prepareStatements(db);
  return urlRecord.get(url) || null;
}

function selectFetchFileInfo(db, id) {
  const { fetchFileInfo } = prepareStatements(db);
  return fetchFileInfo.get(id) || null;
}

module.exports = {
  selectUrlRecord,
  selectFetchFileInfo
};
