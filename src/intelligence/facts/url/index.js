'use strict';

/**
 * URL Facts Module
 * 
 * Facts that can be extracted from URL strings alone (no network, no HTML).
 * These are the cheapest facts to compute and should be run first.
 * 
 * All facts in this module require only: ['url']
 * All facts are NEUTRAL observations - no judgment about good/bad.
 */

const { UrlFact } = require('./UrlFact');
const { HasDateSegment } = require('./HasDateSegment');
const { HasSlugPattern } = require('./HasSlugPattern');
const { HasNewsKeyword } = require('./HasNewsKeyword');
const { HasPaginationPattern } = require('./HasPaginationPattern');
const { IsHomepage } = require('./IsHomepage');

/**
 * All URL fact classes
 * @type {Array<typeof UrlFact>}
 */
const URL_FACTS = [
  HasDateSegment,
  HasSlugPattern,
  HasNewsKeyword,
  HasPaginationPattern,
  IsHomepage
];

/**
 * Create instances of all URL facts
 * @returns {UrlFact[]}
 */
function createAllUrlFacts() {
  return URL_FACTS.map(FactClass => new FactClass());
}

module.exports = {
  // Base class
  UrlFact,
  
  // Concrete facts
  HasDateSegment,
  HasSlugPattern,
  HasNewsKeyword,
  HasPaginationPattern,
  IsHomepage,
  
  // Registry helpers
  URL_FACTS,
  createAllUrlFacts
};
