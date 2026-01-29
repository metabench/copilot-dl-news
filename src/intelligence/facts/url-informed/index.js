"use strict";

/**
 * URL-Informed Facts Module
 * 
 * Layer 1 facts: URL string analysis + reference knowledge
 * 
 * These facts operate on URL strings but consult reference data
 * (gazetteer, topic vocabulary) to make determinations.
 * 
 * Cost: Cheap (in-memory lookups, no network)
 * Input: URL + loaded knowledge structures
 */

const { ContainsPlaceName } = require("./ContainsPlaceName");

/**
 * All URL-informed fact classes
 * @type {Array<typeof import('../FactBase').FactBase>}
 */
const URL_INFORMED_FACTS = [
  ContainsPlaceName
];

/**
 * Create instances of all URL-informed facts
 * @returns {Array<import('../FactBase').FactBase>}
 */
function createAllUrlInformedFacts() {
  return URL_INFORMED_FACTS.map(FactClass => new FactClass());
}

module.exports = {
  ContainsPlaceName,
  URL_INFORMED_FACTS,
  createAllUrlInformedFacts
};
