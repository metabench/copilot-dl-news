'use strict';

/**
 * EntityRecognizer - Rule-based Named Entity Recognition
 * 
 * Recognizes three entity types:
 * - PERSON: People's names (using title prefixes and capitalization)
 * - ORG: Organizations (using company suffixes and known patterns)
 * - GPE: Geo-Political Entities / Locations (using gazetteer lookup)
 * 
 * This is a rule-based approach, not ML-based, so accuracy is limited
 * but sufficient for basic entity extraction without external dependencies.
 * 
 * @module EntityRecognizer
 */

// Common title prefixes indicating a person
const PERSON_TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor',
  'rev', 'reverend', 'fr', 'father', 'sr', 'sister',
  'sen', 'senator', 'rep', 'representative', 'gov', 'governor',
  'pres', 'president', 'vp', 'vice president',
  'gen', 'general', 'col', 'colonel', 'maj', 'major', 'capt', 'captain',
  'lt', 'lieutenant', 'sgt', 'sergeant', 'cpl', 'corporal',
  'adm', 'admiral', 'cmdr', 'commander',
  'judge', 'justice', 'hon', 'honorable',
  'ceo', 'cfo', 'coo', 'cto', 'chairman', 'chairwoman',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady', 'sir', 'dame',
  'sheikh', 'ayatollah', 'rabbi', 'imam', 'pope',
  'coach', 'manager', 'director'
]);

// Company suffixes indicating an organization
const ORG_SUFFIXES = [
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'llc', 'llp', 'lp', 'plc',
  'group', 'holdings', 'enterprises', 'industries',
  'associates', 'partners', 'consulting',
  'foundation', 'institute', 'association', 'society',
  'university', 'college', 'school', 'academy',
  'bank', 'credit union', 'financial',
  'hospital', 'medical center', 'clinic',
  'airlines', 'airways', 'motors', 'automotive'
];

// Common organization prefixes
const ORG_PREFIXES = [
  'the', 'national', 'international', 'american', 'british', 'european',
  'united', 'federal', 'state', 'royal', 'central', 'first', 'general'
];

// Organization keywords that might appear in names
const ORG_KEYWORDS = new Set([
  'commission', 'committee', 'council', 'board', 'agency', 'bureau',
  'department', 'ministry', 'office', 'administration',
  'team', 'club', 'league', 'federation', 'union', 'alliance',
  'network', 'media', 'news', 'times', 'post', 'journal', 'tribune',
  'party', 'movement', 'front', 'congress'
]);

// Common first names (to help identify person names)
const COMMON_FIRST_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
  'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
  'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan',
  'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra',
  'ashley', 'kimberly', 'emily', 'donna', 'michelle', 'dorothy', 'carol',
  'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura',
  'barack', 'hillary', 'donald', 'joe', 'kamala', 'vladimir', 'xi', 'angela',
  'emmanuel', 'boris', 'justin', 'narendra', 'jair', 'recep', 'mohammed'
]);

// Words that look capitalized but aren't entities
const FALSE_POSITIVES = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'their',
  'he', 'she', 'his', 'her', 'him', 'we', 'our', 'you', 'your',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'said', 'says', 'told', 'according', 'reported', 'added', 'noted',
  'new', 'first', 'last', 'next', 'former', 'current', 'late',
  'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western'
]);

/**
 * EntityRecognizer class for rule-based NER
 */
class EntityRecognizer {
  /**
   * Create an EntityRecognizer
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.gazetteer] - Gazetteer for location lookup
   * @param {Set<string>} [options.knownLocations] - Set of known location names
   * @param {Set<string>} [options.knownOrgs] - Set of known organization names
   */
  constructor(options = {}) {
    this.gazetteer = options.gazetteer || null;
    
    // Known entities from external sources
    this.knownLocations = options.knownLocations || new Set();
    this.knownOrgs = options.knownOrgs || new Set();
    
    // Compile regex patterns
    this._compilePatterns();
  }
  
  /**
   * Compile regex patterns for entity extraction
   * @private
   */
  _compilePatterns() {
    // Pattern for title + name (e.g., "Dr. John Smith")
    const titlePattern = Array.from(PERSON_TITLES).join('|');
    this.titleNamePattern = new RegExp(
      `\\b(${titlePattern})\\.?\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,3})\\b`,
      'gi'
    );
    
    // Pattern for company suffix (e.g., "Apple Inc.")
    const suffixPattern = ORG_SUFFIXES.map(s => s.replace(/\s+/g, '\\s+')).join('|');
    this.orgSuffixPattern = new RegExp(
      `\\b([A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+){0,4})\\s+(${suffixPattern})\\.?\\b`,
      'gi'
    );
    
    // Pattern for capitalized sequences (potential names)
    this.capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/g;
    
    // Pattern for possessive forms (e.g., "Biden's", "Apple's")
    this.possessivePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})'s\b/g;
    
    // Pattern for quoted entities
    this.quotedPattern = /"([A-Z][A-Za-z\s]+)"/g;
  }
  
  /**
   * Recognize entities in text
   * 
   * @param {string} text - Input text
   * @param {Object} [options] - Options
   * @param {boolean} [options.includeOffsets=false] - Include character offsets
   * @returns {Array<{text: string, type: string, confidence: number, start?: number, end?: number}>}
   */
  recognize(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return [];
    }
    
    const { includeOffsets = false } = options;
    const entities = [];
    const seen = new Set();
    
    // 1. Extract persons with titles (highest confidence)
    this._extractTitledPersons(text, entities, seen, includeOffsets);
    
    // 2. Extract organizations with suffixes
    this._extractSuffixedOrgs(text, entities, seen, includeOffsets);
    
    // 3. Extract known locations (from gazetteer or known set)
    this._extractLocations(text, entities, seen, includeOffsets);
    
    // 4. Extract capitalized sequences (lower confidence)
    this._extractCapitalizedEntities(text, entities, seen, includeOffsets);
    
    // 5. Deduplicate and merge overlapping entities
    return this._deduplicateEntities(entities);
  }
  
  /**
   * Extract persons with title prefixes
   * @private
   */
  _extractTitledPersons(text, entities, seen, includeOffsets) {
    let match;
    this.titleNamePattern.lastIndex = 0;
    
    while ((match = this.titleNamePattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const name = match[2];
      const normalized = name.trim();
      
      if (seen.has(normalized.toLowerCase())) continue;
      seen.add(normalized.toLowerCase());
      
      const entity = {
        text: normalized,
        type: 'PERSON',
        confidence: 0.9
      };
      
      if (includeOffsets) {
        entity.start = match.index + fullMatch.indexOf(name);
        entity.end = entity.start + name.length;
      }
      
      entities.push(entity);
    }
  }
  
  /**
   * Extract organizations with company suffixes
   * @private
   */
  _extractSuffixedOrgs(text, entities, seen, includeOffsets) {
    let match;
    this.orgSuffixPattern.lastIndex = 0;
    
    while ((match = this.orgSuffixPattern.exec(text)) !== null) {
      const fullName = match[0].replace(/\.$/, '');
      const normalized = fullName.trim();
      
      if (seen.has(normalized.toLowerCase())) continue;
      seen.add(normalized.toLowerCase());
      
      const entity = {
        text: normalized,
        type: 'ORG',
        confidence: 0.85
      };
      
      if (includeOffsets) {
        entity.start = match.index;
        entity.end = match.index + fullName.length;
      }
      
      entities.push(entity);
    }
  }
  
  /**
   * Extract locations from gazetteer or known set
   * @private
   */
  _extractLocations(text, entities, seen, includeOffsets) {
    const textLower = text.toLowerCase();
    
    // Check known locations
    for (const location of this.knownLocations) {
      const locLower = location.toLowerCase();
      let pos = textLower.indexOf(locLower);
      
      while (pos !== -1) {
        // Verify word boundaries
        const before = pos > 0 ? textLower[pos - 1] : ' ';
        const after = pos + locLower.length < textLower.length 
          ? textLower[pos + locLower.length] 
          : ' ';
        
        if (/\W/.test(before) && /\W/.test(after)) {
          // Extract original case from text
          const originalText = text.substring(pos, pos + location.length);
          
          if (!seen.has(locLower)) {
            seen.add(locLower);
            
            const entity = {
              text: originalText,
              type: 'GPE',
              confidence: 0.8
            };
            
            if (includeOffsets) {
              entity.start = pos;
              entity.end = pos + location.length;
            }
            
            entities.push(entity);
          }
        }
        
        pos = textLower.indexOf(locLower, pos + 1);
      }
    }
    
    // TODO: Query gazetteer API if available
  }
  
  /**
   * Extract capitalized sequences and classify them
   * @private
   */
  _extractCapitalizedEntities(text, entities, seen, includeOffsets) {
    let match;
    this.capitalizedPattern.lastIndex = 0;
    
    while ((match = this.capitalizedPattern.exec(text)) !== null) {
      const candidate = match[1];
      const words = candidate.split(/\s+/);
      const firstWord = words[0].toLowerCase();
      
      // Skip false positives
      if (words.every(w => FALSE_POSITIVES.has(w.toLowerCase()))) continue;
      if (words.length === 1 && FALSE_POSITIVES.has(firstWord)) continue;
      
      const normalized = candidate.trim();
      if (seen.has(normalized.toLowerCase())) continue;
      
      // Classify based on patterns
      const classification = this._classifyCapitalized(words);
      
      if (classification) {
        seen.add(normalized.toLowerCase());
        
        const entity = {
          text: normalized,
          type: classification.type,
          confidence: classification.confidence
        };
        
        if (includeOffsets) {
          entity.start = match.index;
          entity.end = match.index + candidate.length;
        }
        
        entities.push(entity);
      }
    }
  }
  
  /**
   * Classify a capitalized word sequence
   * @private
   */
  _classifyCapitalized(words) {
    const firstWord = words[0].toLowerCase();
    const lastWord = words[words.length - 1].toLowerCase();
    
    // Check for organization keywords
    const hasOrgKeyword = words.some(w => ORG_KEYWORDS.has(w.toLowerCase()));
    if (hasOrgKeyword) {
      return { type: 'ORG', confidence: 0.6 };
    }
    
    // Check for common first names (likely person)
    if (COMMON_FIRST_NAMES.has(firstWord) && words.length >= 2) {
      return { type: 'PERSON', confidence: 0.7 };
    }
    
    // Check known organizations
    const joined = words.join(' ').toLowerCase();
    if (this.knownOrgs.has(joined)) {
      return { type: 'ORG', confidence: 0.8 };
    }
    
    // Check known locations
    if (this.knownLocations.has(joined)) {
      return { type: 'GPE', confidence: 0.8 };
    }
    
    // Two capitalized words often a person name
    if (words.length === 2) {
      return { type: 'PERSON', confidence: 0.5 };
    }
    
    // Three+ words more likely organization or location
    if (words.length >= 3) {
      return { type: 'ORG', confidence: 0.4 };
    }
    
    // Single capitalized word - skip (too ambiguous)
    return null;
  }
  
  /**
   * Deduplicate and merge overlapping entities
   * @private
   */
  _deduplicateEntities(entities) {
    // Group by normalized text
    const byText = new Map();
    
    for (const entity of entities) {
      const key = entity.text.toLowerCase();
      
      if (!byText.has(key)) {
        byText.set(key, entity);
      } else {
        // Keep higher confidence version
        const existing = byText.get(key);
        if (entity.confidence > existing.confidence) {
          byText.set(key, entity);
        }
      }
    }
    
    // Sort by confidence descending
    return Array.from(byText.values())
      .sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Add known locations for recognition
   * 
   * @param {string[]} locations - Location names to add
   */
  addKnownLocations(locations) {
    for (const loc of locations) {
      this.knownLocations.add(loc.toLowerCase());
    }
  }
  
  /**
   * Add known organizations for recognition
   * 
   * @param {string[]} orgs - Organization names to add
   */
  addKnownOrganizations(orgs) {
    for (const org of orgs) {
      this.knownOrgs.add(org.toLowerCase());
    }
  }
  
  /**
   * Get recognizer statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      knownLocations: this.knownLocations.size,
      knownOrgs: this.knownOrgs.size,
      personTitles: PERSON_TITLES.size,
      orgSuffixes: ORG_SUFFIXES.length,
      commonFirstNames: COMMON_FIRST_NAMES.size
    };
  }
}

module.exports = {
  EntityRecognizer,
  PERSON_TITLES,
  ORG_SUFFIXES,
  ORG_KEYWORDS,
  COMMON_FIRST_NAMES,
  FALSE_POSITIVES
};
