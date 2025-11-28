'use strict';

/**
 * Facts Module
 * 
 * A Fact is an objective boolean observation about a URL or its content.
 * Facts are the foundation of the classification system.
 * 
 * Key Principles:
 * - Facts are OBJECTIVE: "URL contains /2024/01/15/" is a fact
 * - Facts are NEUTRAL: They observe structure without judging good/bad
 * - Classifications are SUBJECTIVE: "This is a news article" is a classification
 * - Facts have no weights - pure boolean TRUE/FALSE
 * - Facts are computed once, stored in DB, reused across classification iterations
 * 
 * Module Structure:
 * - FactBase.js        - Abstract base class for all facts
 * - FactRegistry.js    - Central registry and lookup
 * - FactStore.js       - DB persistence (TODO)
 * - url/               - Facts from URL strings only (cheap)
 * - document/          - Facts from HTML/DOM (expensive) (TODO)
 * - schema/            - Facts from structured data (TODO)
 * - meta/              - Facts from metadata (TODO)
 * - response/          - Facts from HTTP response (TODO)
 * - page/              - Facts about page structure (TODO)
 * 
 * Usage:
 *   const { FactRegistry } = require('./facts');
 *   const registry = FactRegistry.getInstance();
 *   
 *   // Extract all URL facts for a URL
 *   const urlFacts = registry.getByCategory('url');
 *   const results = urlFacts.map(fact => fact.extract(url));
 * 
 * See docs/designs/FACT_BASED_CLASSIFICATION_SYSTEM.md for full architecture.
 */

const { FactBase } = require('./FactBase');
const { FactRegistry } = require('./FactRegistry');

// URL facts (Layer 0)
const url = require('./url');

// URL-informed facts (Layer 1)
const urlInformed = require('./url-informed');

module.exports = {
  // Core classes
  FactBase,
  FactRegistry,
  
  // Category namespaces
  url,
  urlInformed,
  
  // Convenience re-exports - Layer 0
  UrlFact: url.UrlFact,
  HasDateSegment: url.HasDateSegment,
  HasSlugPattern: url.HasSlugPattern,
  HasNewsKeyword: url.HasNewsKeyword,
  HasPaginationPattern: url.HasPaginationPattern,
  IsHomepage: url.IsHomepage,
  
  // Convenience re-exports - Layer 1
  ContainsPlaceName: urlInformed.ContainsPlaceName
};
