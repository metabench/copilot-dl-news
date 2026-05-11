'use strict';

const {
  CURRENT_SCHEMA_FINGERPRINT,
  ensureSchemaMetadataTable,
  getSchemaFingerprint,
  recordSchemaFingerprint,
  shouldUseFastPath,
  verifyCriticalTables,
  removeMetadataValue
} = require('news-crawler-db');

module.exports = {
  CURRENT_SCHEMA_FINGERPRINT,
  ensureSchemaMetadataTable,
  getSchemaFingerprint,
  recordSchemaFingerprint,
  shouldUseFastPath,
  verifyCriticalTables,
  removeMetadataValue
};
