'use strict';

const {
  createIngestionStatements,
  upsertPlace,
  insertPlaceName,
  insertExternalId,
  setCanonicalName,
  registerPlaceSource,
  listWikidataCountryIngestionRows,
  getAdm1CodeForWikidataRegion,
  getRegionPlaceIdByAdm1Code,
  insertAdminParentHierarchy,
  normalizeName,
  KIND_TO_PLACE_TYPE,
  findExistingPlace,
  generateCapitalExternalId
} = require('news-crawler-db');

module.exports = {
  createIngestionStatements,
  upsertPlace,
  insertPlaceName,
  insertExternalId,
  setCanonicalName,
  registerPlaceSource,
  listWikidataCountryIngestionRows,
  getAdm1CodeForWikidataRegion,
  getRegionPlaceIdByAdm1Code,
  insertAdminParentHierarchy,
  normalizeName,
  KIND_TO_PLACE_TYPE,
  findExistingPlace,
  generateCapitalExternalId
};
