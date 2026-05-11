'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../../../db/openNewsCrawlerDb');

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

function countPlaces(db) {
  return getDbApi('countMaintainDbPlaces')(db);
}

function countPlaceNames(db) {
  return getDbApi('countMaintainDbPlaceNames')(db);
}

function normalizePlaceNames(db) {
  return getDbApi('normalizeMissingPlaceNames')(db);
}

function trimPlaceNames(db) {
  try {
    getDbApi('trimStoredPlaceNames')(db);
    return true;
  } catch (_) {
    return false;
  }
}

function deleteEmptyPlaceNames(db) {
  return getDbApi('deleteEmptyPlaceNames')(db);
}

function deleteNamelessPlaces(db) {
  return getDbApi('deleteNamelessPlaces')(db);
}

module.exports = {
  countPlaces,
  countPlaceNames,
  normalizePlaceNames,
  trimPlaceNames,
  deleteEmptyPlaceNames,
  deleteNamelessPlaces
};
