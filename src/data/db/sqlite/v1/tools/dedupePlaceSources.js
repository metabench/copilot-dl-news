'use strict';

/**
 * Compatibility wrapper for place_sources maintenance.
 *
 * SQL ownership lives in news-crawler-db; this file preserves the historical
 * CommonJS export used by copilot-dl-news callers.
 */

const { dedupePlaceSources } = require('news-crawler-db');

module.exports = { dedupePlaceSources };
