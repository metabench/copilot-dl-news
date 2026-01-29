"use strict";

/**
 * PlaceLookup - In-memory place name lookup from gazetteer
 * 
 * Loads all place names into a Map<normalized_name, Place[]> for fast lookups.
 * Since place names can be ambiguous (e.g., "London" could be UK or Ontario),
 * each name maps to an array of matching places.
 * 
 * URL slugs are computed at load time (not stored in DB) for matching against
 * URL path segments like /news/london/ or /topics/new-york/.
 * 
 * Memory footprint is minimal (~1-2 MB for current gazetteer).
 * 
 * Usage:
 *   const lookup = await PlaceLookup.load('data/gazetteer.db');
 *   const places = lookup.find('london');
 *   // => [{ placeId: 21, kind: 'city', countryCode: 'GB', population: 8799728, ... }]
 */

const Database = require("better-sqlite3");

/**
 * Convert a name to URL-slug format for matching.
 * Computed at load time, NOT stored in the database.
 * @param {string} name 
 * @returns {string|null}
 */
function toUrlSlug(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')         // Trim leading/trailing hyphens
    .replace(/-+/g, '-');            // Collapse multiple hyphens
}

/**
 * @typedef {Object} PlaceMatch
 * @property {number} placeId - The place ID in the gazetteer
 * @property {string} kind - Place type (legacy): 'country', 'city', 'region', etc.
 * @property {string} placeType - Standardized type: 'country', 'city', 'admin1', 'admin2', 'locality', 'other'
 * @property {string|null} countryCode - ISO 3166-1 alpha-2 country code
 * @property {number|null} population - Population if known
 * @property {string|null} wikidataQid - Wikidata Q-ID if available
 * @property {string} canonicalName - The preferred/canonical name
 */

class PlaceLookup {
  /**
   * @param {Map<string, PlaceMatch[]>} nameToPlaces - Lookup map
   * @param {Map<number, PlaceMatch>} idToPlace - Reverse lookup by ID
   * @param {Map<string, PlaceMatch[]>} slugToPlaces - URL slug lookup map
   * @param {Object} stats - Loading statistics
   */
  constructor(nameToPlaces, idToPlace, slugToPlaces, stats) {
    /** @type {Map<string, PlaceMatch[]>} */
    this._nameToPlaces = nameToPlaces;
    
    /** @type {Map<number, PlaceMatch>} */
    this._idToPlace = idToPlace;
    
    /** @type {Map<string, PlaceMatch[]>} */
    this._slugToPlaces = slugToPlaces;
    
    /** @type {Object} */
    this.stats = stats;
  }

  /**
   * Load gazetteer into memory
   * 
   * @param {string} dbPath - Path to gazetteer.db
   * @returns {PlaceLookup}
   */
  static load(dbPath) {
    const startTime = Date.now();
    const db = new Database(dbPath, { readonly: true });
    
    try {
      // Load all places first
      const places = db.prepare(`
        SELECT 
          p.id,
          p.kind,
          p.place_type,
          p.country_code,
          p.population,
          p.wikidata_qid,
          pn_canonical.name as canonical_name
        FROM places p
        LEFT JOIN place_names pn_canonical 
          ON pn_canonical.id = p.canonical_name_id
      `).all();
      
      // Build ID -> Place map
      const idToPlace = new Map();
      for (const p of places) {
        idToPlace.set(p.id, {
          placeId: p.id,
          kind: p.kind,
          placeType: p.place_type || p.kind, // Fallback to kind if place_type not set
          countryCode: p.country_code,
          population: p.population,
          wikidataQid: p.wikidata_qid,
          canonicalName: p.canonical_name || `Place #${p.id}`
        });
      }
      
      // Load all place names (url_slug is computed at load time, not stored)
      const names = db.prepare(`
        SELECT place_id, name, normalized
        FROM place_names
        WHERE normalized IS NOT NULL AND normalized != ''
      `).all();
      
      // Build normalized name -> Places[] map
      const nameToPlaces = new Map();
      // Build url_slug -> Places[] map (slugs computed on the fly)
      const slugToPlaces = new Map();
      
      for (const { place_id, name, normalized } of names) {
        const place = idToPlace.get(place_id);
        if (!place) continue;
        
        // Add to normalized lookup
        const key = normalized.toLowerCase();
        if (!nameToPlaces.has(key)) {
          nameToPlaces.set(key, []);
        }
        const existing = nameToPlaces.get(key);
        if (!existing.some(p => p.placeId === place_id)) {
          existing.push(place);
        }
        
        // Compute slug on the fly and add to slug lookup
        const slug = toUrlSlug(name);
        if (slug) {
          const slugKey = slug.toLowerCase();
          if (!slugToPlaces.has(slugKey)) {
            slugToPlaces.set(slugKey, []);
          }
          const slugExisting = slugToPlaces.get(slugKey);
          if (!slugExisting.some(p => p.placeId === place_id)) {
            slugExisting.push(place);
          }
        }
      }
      
      const loadTime = Date.now() - startTime;
      
      const stats = {
        placeCount: idToPlace.size,
        nameCount: nameToPlaces.size,
        slugCount: slugToPlaces.size,
        totalMappings: names.length,
        loadTimeMs: loadTime,
        ambiguousNames: Array.from(nameToPlaces.values()).filter(arr => arr.length > 1).length
      };
      
      return new PlaceLookup(nameToPlaces, idToPlace, slugToPlaces, stats);
      
    } finally {
      db.close();
    }
  }

  /**
   * Find places matching a name
   * 
   * @param {string} name - Place name to look up (case-insensitive)
   * @returns {PlaceMatch[]} Array of matching places (empty if none)
   */
  find(name) {
    if (!name || typeof name !== "string") return [];
    const key = name.toLowerCase().trim();
    return this._nameToPlaces.get(key) || [];
  }

  /**
   * Find places by URL slug
   * 
   * @param {string} slug - URL slug to look up (case-insensitive)
   * @returns {PlaceMatch[]} Array of matching places (empty if none)
   */
  findBySlug(slug) {
    if (!slug || typeof slug !== "string") return [];
    const key = slug.toLowerCase().trim();
    return this._slugToPlaces.get(key) || [];
  }

  /**
   * Check if a name exists in the gazetteer
   * 
   * @param {string} name - Place name to check
   * @returns {boolean}
   */
  has(name) {
    if (!name || typeof name !== "string") return false;
    return this._nameToPlaces.has(name.toLowerCase().trim());
  }

  /**
   * Check if a URL slug exists in the gazetteer
   * 
   * @param {string} slug - URL slug to check
   * @returns {boolean}
   */
  hasSlug(slug) {
    if (!slug || typeof slug !== "string") return false;
    return this._slugToPlaces.has(slug.toLowerCase().trim());
  }

  /**
   * Get place by ID
   * 
   * @param {number} placeId - Place ID
   * @returns {PlaceMatch|undefined}
   */
  getById(placeId) {
    return this._idToPlace.get(placeId);
  }

  /**
   * Find best match for a name (highest population wins for ambiguous names)
   * 
   * @param {string} name - Place name
   * @returns {PlaceMatch|null}
   */
  findBest(name) {
    const matches = this.find(name);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    
    // Sort by population (descending), nulls last
    return matches.slice().sort((a, b) => {
      const popA = a.population ?? -1;
      const popB = b.population ?? -1;
      return popB - popA;
    })[0];
  }

  /**
   * Get all unique place names
   * 
   * @returns {string[]}
   */
  getAllNames() {
    return Array.from(this._nameToPlaces.keys());
  }

  /**
   * Get count of entries
   * 
   * @returns {number}
   */
  get size() {
    return this._nameToPlaces.size;
  }
}

// Singleton instance
let _instance = null;
let _loadPromise = null;

/**
 * Get or create the singleton PlaceLookup instance
 * 
 * @param {string} [dbPath='data/gazetteer.db'] - Path to gazetteer database
 * @returns {PlaceLookup}
 */
function getPlaceLookup(dbPath = "data/gazetteer.db") {
  if (!_instance) {
    _instance = PlaceLookup.load(dbPath);
  }
  return _instance;
}

/**
 * Reset the singleton (for testing)
 */
function resetPlaceLookup() {
  _instance = null;
  _loadPromise = null;
}

module.exports = {
  PlaceLookup,
  getPlaceLookup,
  resetPlaceLookup
};
