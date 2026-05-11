#!/usr/bin/env node
'use strict';

/**
 * Deprecated compatibility entry point.
 *
 * The legacy `articles` table migration has already completed. Content now
 * lives in the normalized `urls`, `http_responses`, `content_storage`, and
 * `content_analysis` schema owned by news-crawler-db.
 */

function migrateLegacyContent() {
  console.log('Articles table has been removed. Content migration is complete.');
  console.log('All content is now stored in the normalized news-crawler-db schema.');
  console.log('Compression is handled during content ingestion and maintenance tooling.');
  return {
    deprecated: true,
    migrated: 0,
    errors: 0
  };
}

if (require.main === module) {
  migrateLegacyContent();
}

module.exports = { migrateLegacyContent };
