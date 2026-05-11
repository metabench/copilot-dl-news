'use strict';

const {
  createClassicGazetteerIngestionStatements,
  upsertClassicGazetteerPlace,
  insertClassicGazetteerPlaceName,
  insertClassicGazetteerExternalId,
  setClassicGazetteerCanonicalName,
  normalizeClassicGazetteerName,
  findExistingClassicGazetteerPlace,
  generateClassicGazetteerCapitalExternalId,
  registerPlaceSource,
  listWikidataCountryIngestionRows,
  getAdm1CodeForWikidataRegion,
  getRegionPlaceIdByAdm1Code,
  insertAdminParentHierarchy
} = require('news-crawler-db');

module.exports = {
  createIngestionStatements: createClassicGazetteerIngestionStatements,
  upsertPlace: upsertClassicGazetteerPlace,
  insertPlaceName: insertClassicGazetteerPlaceName,
  insertExternalId: insertClassicGazetteerExternalId,
  setCanonicalName: setClassicGazetteerCanonicalName,
  registerPlaceSource,
  listWikidataCountryIngestionRows,
  getAdm1CodeForWikidataRegion,
  getRegionPlaceIdByAdm1Code,
  insertAdminParentHierarchy,
  normalizeName: normalizeClassicGazetteerName,
  findExistingPlace: findExistingClassicGazetteerPlace,
  generateCapitalExternalId: generateClassicGazetteerCapitalExternalId
};
