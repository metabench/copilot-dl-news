"use strict";

const { UrlFact } = require("../url/UrlFact");
const { getPlaceLookup } = require("../../knowledge");

/**
 * ContainsPlaceName - Detects place names in URL paths
 * 
 * Fact: url.containsPlaceName
 * 
 * This is a Layer 1 (information-aware) fact that uses the gazetteer
 * to detect geographic place names in URL segments.
 * 
 * URL segments are normalized (hyphens → spaces, lowercased) before lookup.
 * 
 * Evidence includes the matched place details.
 * 
 * @example
 * const fact = new ContainsPlaceName();
 * fact.extract('https://www.theguardian.com/uk-news/london/2025/jul/01/story');
 * // => { name: 'url.containsPlaceName', value: true, evidence: { 
 * //      segment: 'london', place: { kind: 'city', countryCode: 'GB', ... } 
 * //    }}
 */
class ContainsPlaceName extends UrlFact {
  /**
   * @param {Object} [options]
   * @param {string} [options.gazetteerPath='data/gazetteer.db'] - Path to gazetteer
   */
  constructor(options = {}) {
    super({
      name: "url.containsPlaceName",
      description: "URL path contains a recognized geographic place name"
    });
    
    this._gazetteerPath = options.gazetteerPath || "data/gazetteer.db";
    this._lookup = null;
  }
  
  /**
   * Get or initialize the place lookup
   * @private
   */
  _getLookup() {
    if (!this._lookup) {
      this._lookup = getPlaceLookup(this._gazetteerPath);
    }
    return this._lookup;
  }
  
  /**
   * Extract URL segments and normalize them for matching
   * 
   * @private
   * @param {URL} url - Parsed URL
   * @returns {Array<{original: string, normalized: string}>}
   */
  _getSegments(url) {
    return url.pathname
      .split("/")
      .filter(seg => seg.length > 0)
      .map(seg => ({
        original: seg,
        // Normalize: hyphens to spaces, lowercase
        normalized: seg.replace(/-/g, " ").toLowerCase()
      }));
  }
  
  /**
   * Extract the place name fact
   * 
   * @param {string|URL|Object} input - URL to analyze
   * @returns {FactResult}
   */
  extract(input) {
    const url = this.parseUrl(input);
    const lookup = this._getLookup();
    const segments = this._getSegments(url);
    
    // Check each segment for place matches
    const matches = [];
    
    for (const { original, normalized } of segments) {
      const places = lookup.find(normalized);
      if (places.length > 0) {
        // Pick best match (highest population)
        const best = places.length === 1 ? places[0] : lookup.findBest(normalized);
        matches.push({
          segment: original,
          normalized,
          place: {
            placeId: best.placeId,
            kind: best.kind,
            countryCode: best.countryCode,
            population: best.population,
            canonicalName: best.canonicalName
          },
          alternateCount: places.length - 1
        });
      }
    }
    
    if (matches.length === 0) {
      return this.createFact(false, { 
        reason: "No place names found in URL path",
        segmentsChecked: segments.length
      });
    }
    
    // Return true with all matches in evidence
    return this.createFact(true, {
      matchCount: matches.length,
      matches,
      // Primary match is the most specific (smallest population = most specific)
      // or first match if same
      primaryMatch: matches.length === 1 
        ? matches[0] 
        : matches.slice().sort((a, b) => {
            // Prefer cities over countries (more specific)
            const kindOrder = { city: 0, region: 1, country: 2 };
            return (kindOrder[a.place.kind] ?? 3) - (kindOrder[b.place.kind] ?? 3);
          })[0]
    });
  }
}

module.exports = { ContainsPlaceName };
