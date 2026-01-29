"use strict";

/**
 * Knowledge Module
 * 
 * Provides in-memory lookup structures for reference data used by
 * information-aware facts (Layer 1 of the fact system).
 * 
 * Knowledge sources:
 * - PlaceLookup: Geographic place names from gazetteer.db
 * - TopicVocabulary: News section/topic keywords (built-in)
 * 
 * All lookups are loaded into memory at startup for fast access.
 * Memory footprint is minimal (~2-5 MB total).
 */

const { PlaceLookup, getPlaceLookup, resetPlaceLookup } = require("./PlaceLookup");

module.exports = {
  // Place lookup
  PlaceLookup,
  getPlaceLookup,
  resetPlaceLookup
};
