'use strict';

/**
 * PlaceContextFilter - Filters false-positive place mentions
 * 
 * Detects when a place name appears in context that indicates it's NOT a geographic
 * reference, such as:
 * - Organization names: "Texas Instruments", "New York Times", "Boston Consulting"
 * - Personal names: "Paris Hilton", "Georgia O'Keeffe"
 * - Product names: "Dodge Dakota", "Amazon Echo"
 * 
 * Uses efficient in-memory data structures (Maps, Sets, Tries) for O(1) or O(k) lookups
 * where k is the pattern length.
 * 
 * @module PlaceContextFilter
 */

/**
 * Built-in exclusion patterns for common false positives
 * Each entry maps a trigger word to the full phrase that should exclude it
 */
const BUILTIN_ORG_PATTERNS = new Map([
  // Technology companies with place names
  ['texas', ['texas instruments', 'texas roadhouse']],
  ['boston', ['boston consulting', 'boston dynamics', 'boston scientific', 'boston market']],
  ['silicon', ['silicon valley bank', 'silicon graphics']],
  ['new york', ['new york times', 'new york post', 'new york life']],
  ['los angeles', ['los angeles times', 'los angeles lakers', 'los angeles dodgers']],
  ['washington', ['washington post', 'washington times', 'washington nationals', 'washington wizards']],
  ['chicago', ['chicago tribune', 'chicago bulls', 'chicago bears', 'chicago cubs', 'chicago white sox']],
  ['san francisco', ['san francisco chronicle', 'san francisco 49ers', 'san francisco giants']],
  ['denver', ['denver broncos', 'denver nuggets', 'denver post']],
  ['miami', ['miami herald', 'miami dolphins', 'miami heat']],
  ['atlanta', ['atlanta journal', 'atlanta constitution', 'atlanta falcons', 'atlanta braves', 'atlanta hawks']],
  ['philadelphia', ['philadelphia inquirer', 'philadelphia eagles', 'philadelphia phillies', 'philadelphia 76ers']],
  ['phoenix', ['phoenix suns', 'phoenix mercury', 'joaquin phoenix']],
  ['detroit', ['detroit free press', 'detroit lions', 'detroit pistons', 'detroit tigers', 'detroit red wings']],
  ['cleveland', ['cleveland plain dealer', 'cleveland browns', 'cleveland cavaliers', 'cleveland guardians']],
  ['seattle', ['seattle times', 'seattle seahawks', 'seattle mariners', 'seattle kraken']],
  ['houston', ['houston chronicle', 'houston rockets', 'houston texans', 'houston astros']],
  ['dallas', ['dallas morning news', 'dallas cowboys', 'dallas mavericks']],
  ['minnesota', ['minnesota twins', 'minnesota vikings', 'minnesota timberwolves', 'minnesota wild']],
  ['kansas city', ['kansas city star', 'kansas city chiefs', 'kansas city royals']],
  ['carolina', ['carolina panthers', 'carolina hurricanes']],
  ['arizona', ['arizona republic', 'arizona cardinals', 'arizona diamondbacks']],
  ['colorado', ['colorado rockies', 'colorado avalanche']],
  ['pittsburgh', ['pittsburgh post', 'pittsburgh steelers', 'pittsburgh pirates', 'pittsburgh penguins']],
  ['baltimore', ['baltimore sun', 'baltimore ravens', 'baltimore orioles']],
  ['indianapolis', ['indianapolis star', 'indianapolis colts']],
  ['milwaukee', ['milwaukee journal', 'milwaukee bucks', 'milwaukee brewers']],
  ['san diego', ['san diego union', 'san diego padres', 'san diego chargers']],
  ['tampa', ['tampa bay times', 'tampa bay buccaneers', 'tampa bay rays', 'tampa bay lightning']],
  ['portland', ['portland trail blazers']],
  ['sacramento', ['sacramento bee', 'sacramento kings']],
  ['orlando', ['orlando sentinel', 'orlando magic']],
  ['jacksonville', ['jacksonville jaguars']],
  ['nashville', ['nashville tennessean']],
  ['memphis', ['memphis grizzlies']],
  ['las vegas', ['las vegas raiders', 'las vegas review']],
  ['new orleans', ['new orleans times', 'new orleans saints', 'new orleans pelicans']],
  
  // International (merged with personal names that overlap)
  ['manchester', ['manchester united', 'manchester city', 'manchester evening']],
  ['london', ['london times', 'london evening', 'london stock exchange', 'jack london']],
  ['paris', ['paris saint-germain', 'paris saint germain', 'psg', 'paris hilton']],
  ['barcelona', ['fc barcelona', 'barcelona fc']],
  ['munich', ['bayern munich']],
  ['milan', ['ac milan', 'inter milan']],
  ['madrid', ['real madrid', 'atletico madrid']],
  
  // Personal names with place names (unique entries only - duplicates merged above)
  ['georgia', ["georgia o'keeffe", 'georgia meloni']],
  ['brooklyn', ['brooklyn beckham', 'brooklyn nine-nine']],
  ['india', ['india arie']],
  ['chelsea', ['chelsea clinton', 'chelsea handler']],
  ['jordan', ['michael jordan', 'jordan peterson']],
  ['dakota', ['dakota johnson', 'dakota fanning']],
  ['austin', ['austin powers', 'austin butler']],
  
  // Airlines and transport
  ['american', ['american airlines', 'american express', 'american eagle']],
  ['united', ['united airlines', 'united parcel', 'united healthcare']],
  ['delta', ['delta airlines', 'delta air lines']],
  ['southwest', ['southwest airlines']],
  ['china', ['china airlines', 'china eastern', 'china southern', 'air china']],
  ['japan', ['japan airlines', 'all nippon']],
  ['singapore', ['singapore airlines']],
  ['british', ['british airways', 'british petroleum', 'british telecom']],
  
  // Financial and other
  ['goldman', ['goldman sachs']],
  ['morgan', ['morgan stanley', 'jp morgan', 'j.p. morgan']],
  ['hong kong', ['hong kong stock', 'hong kong exchange']],
  ['bank of america', ['bank of america']],
  ['wells', ['wells fargo']],
  
  // Tech
  ['amazon', ['amazon web', 'amazon prime', 'amazon echo', 'amazon alexa']],
  ['apple', ['apple inc', 'apple computer', 'apple music', 'apple tv']],
  
  // Automotive
  ['dodge', ['dodge dakota', 'dodge durango', 'dodge challenger']],
  ['ford', ['ford motor', 'ford mustang', 'ford focus', 'henry ford']],
  ['lincoln', ['lincoln navigator', 'lincoln continental', 'abraham lincoln']],
  ['cadillac', ['cadillac escalade', 'cadillac cts']],
]);

/**
 * Words that commonly follow place names in organization names
 */
const ORG_SUFFIX_WORDS = new Set([
  'times', 'post', 'tribune', 'herald', 'news', 'journal', 'chronicle',
  'gazette', 'star', 'sun', 'daily', 'press', 'observer', 'courier',
  'dispatch', 'sentinel', 'register', 'examiner', 'inquirer', 'review',
  'airlines', 'airways', 'air', 'express', 'motors', 'automotive',
  'bank', 'financial', 'insurance', 'capital', 'holdings', 'group',
  'university', 'college', 'institute', 'school', 'academy',
  'hospital', 'medical', 'health', 'healthcare',
  'bulls', 'bears', 'cubs', 'sox', 'giants', 'dodgers', 'yankees', 'mets',
  'lakers', 'knicks', 'heat', 'celtics', 'warriors', 'rockets', 'spurs',
  'cowboys', 'eagles', 'steelers', 'packers', 'chiefs', 'raiders',
  'panthers', 'falcons', 'saints', 'broncos', 'chargers', 'seahawks',
  'united', 'city', 'fc', 'rovers', 'wanderers', 'rangers', 'athletic',
  'instruments', 'dynamics', 'consulting', 'scientific', 'systems',
  'exchange', 'stock', 'market', 'trading', 'partners', 'associates',
  'properties', 'real estate', 'development', 'construction',
  'foundation', 'society', 'association', 'organization', 'council',
  'committee', 'commission', 'authority', 'agency', 'board', 'bureau',
  'power', 'electric', 'energy', 'gas', 'utility', 'water',
  'philharmonic', 'symphony', 'opera', 'ballet', 'theater', 'theatre',
  'museum', 'gallery', 'library', 'zoo', 'aquarium',
]);

/**
 * Words that commonly precede place names in personal names
 */
const PERSONAL_NAME_PREFIXES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor',
  'president', 'senator', 'governor', 'mayor', 'judge',
  'general', 'colonel', 'captain', 'lieutenant',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady',
  'sir', 'dame', 'sheikh', 'rabbi', 'imam', 'pope',
  'michael', 'john', 'james', 'david', 'robert', 'william',
  'mary', 'jennifer', 'patricia', 'linda', 'elizabeth',
  'jack', 'henry', 'abraham', 'george', 'benjamin', 'franklin',
]);

/**
 * PlaceContextFilter class
 */
class PlaceContextFilter {
  /**
   * Create a PlaceContextFilter
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.db] - Database handle for loading custom exclusions
   * @param {boolean} [options.loadFromDb=true] - Whether to load exclusions from database
   * @param {Map} [options.customPatterns] - Additional exclusion patterns
   */
  constructor(options = {}) {
    this.db = options.db;
    
    // Primary lookup: normalized phrase -> true
    // O(1) lookup for exact matches
    this.exclusionPhrases = new Set();
    
    // Trigger word -> array of exclusion phrases starting with that word
    // Enables quick filtering: only check phrases if trigger word found
    this.triggerIndex = new Map();
    
    // Suffix words that indicate org context
    this.orgSuffixes = new Set(ORG_SUFFIX_WORDS);
    
    // Personal name prefixes
    this.personalPrefixes = new Set(PERSONAL_NAME_PREFIXES);
    
    // Load built-in patterns
    this._loadBuiltinPatterns();
    
    // Load custom patterns if provided
    if (options.customPatterns instanceof Map) {
      this._loadPatterns(options.customPatterns);
    }
    
    // Load from database if requested
    if (options.db && options.loadFromDb !== false) {
      this._loadFromDatabase();
    }
    
    // Stats for debugging
    this.stats = {
      checksPerformed: 0,
      exclusionsApplied: 0,
      contextMatches: 0,
    };
  }
  
  /**
   * Load built-in exclusion patterns
   * @private
   */
  _loadBuiltinPatterns() {
    this._loadPatterns(BUILTIN_ORG_PATTERNS);
  }
  
  /**
   * Load patterns from a Map
   * @private
   * @param {Map} patterns - Trigger word -> phrases map
   */
  _loadPatterns(patterns) {
    for (const [trigger, phrases] of patterns) {
      const normalizedTrigger = this._normalize(trigger);
      
      if (!this.triggerIndex.has(normalizedTrigger)) {
        this.triggerIndex.set(normalizedTrigger, []);
      }
      
      const triggerPhrases = this.triggerIndex.get(normalizedTrigger);
      
      for (const phrase of phrases) {
        const normalizedPhrase = this._normalize(phrase);
        this.exclusionPhrases.add(normalizedPhrase);
        triggerPhrases.push(normalizedPhrase);
      }
    }
  }
  
  /**
   * Load exclusions from database
   * @private
   */
  _loadFromDatabase() {
    if (!this.db || typeof this.db.prepare !== 'function') return;
    
    try {
      // Check if table exists
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='place_exclusions'
      `).get();
      
      if (!tableCheck) return;
      
      // Load exclusions
      const rows = this.db.prepare(`
        SELECT trigger_word, exclusion_phrase, exclusion_type
        FROM place_exclusions
        WHERE active = 1
      `).all();
      
      for (const row of rows) {
        const normalizedTrigger = this._normalize(row.trigger_word);
        const normalizedPhrase = this._normalize(row.exclusion_phrase);
        
        this.exclusionPhrases.add(normalizedPhrase);
        
        if (!this.triggerIndex.has(normalizedTrigger)) {
          this.triggerIndex.set(normalizedTrigger, []);
        }
        this.triggerIndex.get(normalizedTrigger).push(normalizedPhrase);
      }
    } catch (err) {
      // Silently ignore if table doesn't exist
    }
  }
  
  /**
   * Normalize text for matching
   * @private
   * @param {string} text - Input text
   * @returns {string} Normalized text
   */
  _normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Check if a suffix word is a STRONG org indicator
   * Strong indicators clearly denote an organization type and should trigger exclusion
   * Weak indicators (Times, Post, weather) need the full phrase to be known
   * @private
   * @param {string} suffix - The normalized suffix word
   * @returns {boolean} True if this is a strong org indicator
   */
  _isStrongOrgSuffix(suffix) {
    // Strong org indicators - these clearly denote organization types
    const STRONG_ORG_SUFFIXES = new Set([
      // Corporate types
      'instruments', 'corporation', 'corp', 'incorporated', 'inc', 'company', 'co',
      'enterprises', 'holdings', 'group', 'limited', 'ltd', 'llc', 'plc',
      // Industry-specific
      'bank', 'banking', 'airlines', 'airways', 'motors', 'automotive', 'auto',
      'technologies', 'tech', 'systems', 'software', 'solutions', 'dynamics',
      'aerospace', 'aviation', 'semiconductor', 'microelectronics', 'electronics',
      'pharmaceuticals', 'pharma', 'biotech', 'biosciences', 'therapeutics',
      'energy', 'power', 'utilities', 'petroleum', 'oil', 'gas',
      'telecom', 'telecommunications', 'communications', 'wireless', 'networks',
      'financial', 'finance', 'capital', 'investment', 'investments', 'securities',
      'insurance', 'assurance', 'mutual', 'trust',
      'manufacturing', 'industrial', 'industries', 'materials',
      'consulting', 'consultants', 'services', 'partners', 'associates',
      // Sports teams
      'bulls', 'bears', 'lions', 'tigers', 'eagles', 'hawks', 'celtics', 'lakers',
      'heat', 'jazz', 'thunder', 'rockets', 'spurs', 'mavericks', 'suns', 'kings',
      'warriors', 'clippers', 'nets', 'knicks', 'pacers', 'pistons', 'cavaliers',
      'magic', 'hornets', 'pelicans', 'grizzlies', 'timberwolves', 'nuggets',
      'blazers', 'supersonics', 'bucks', 'raptors', 'wizards', 'sixers',
      'giants', 'jets', 'patriots', 'cowboys', 'packers', 'steelers', 'raiders',
      'broncos', 'chiefs', 'chargers', 'seahawks', 'cardinals', 'rams', 'niners',
      'falcons', 'panthers', 'saints', 'buccaneers', 'vikings', 'colts', 'texans',
      'jaguars', 'titans', 'ravens', 'bengals', 'browns', 'dolphins', 'bills',
      'yankees', 'mets', 'dodgers', 'cubs', 'sox', 'braves', 'astros', 'rangers',
      'marlins', 'brewers', 'twins', 'royals', 'athletics', 'mariners', 'padres',
      'angels', 'reds', 'phillies', 'pirates', 'orioles', 'guardians', 'rockies',
      'nationals', 'rays', 'bluejays', 'diamondbacks'
    ]);
    
    return STRONG_ORG_SUFFIXES.has(suffix);
  }
  
  /**
   * Check if a place mention should be excluded based on surrounding context
   * 
   * Algorithm:
   * 1. Check if the place name is a known trigger word
   * 2. If yes, examine the surrounding context (before + after)
   * 3. Check if the full context matches any exclusion phrase
   * 4. Also check for org suffix patterns dynamically
   * 
   * Complexity: O(k) where k is context window size
   * 
   * @param {string} placeName - The place name found
   * @param {string} fullText - The complete text
   * @param {number} startPos - Start position of the place mention
   * @param {number} endPos - End position of the place mention
   * @param {Object} [options] - Additional options
   * @param {number} [options.contextWindow=50] - Characters of context to examine
   * @returns {Object} { excluded: boolean, reason?: string, pattern?: string }
   */
  shouldExclude(placeName, fullText, startPos, endPos, options = {}) {
    this.stats.checksPerformed++;
    
    const normalizedPlace = this._normalize(placeName);
    const contextWindow = options.contextWindow || 50;
    
    // Get surrounding context
    const beforeStart = Math.max(0, startPos - contextWindow);
    const afterEnd = Math.min(fullText.length, endPos + contextWindow);
    
    const beforeText = fullText.slice(beforeStart, startPos);
    const afterText = fullText.slice(endPos, afterEnd);
    
    // For pattern matching, use a TIGHT context around the place name
    // This prevents matching "texas instruments" when we're at a different "texas"
    const tightBefore = fullText.slice(Math.max(0, startPos - 25), startPos);
    const tightAfter = fullText.slice(endPos, Math.min(fullText.length, endPos + 25));
    const tightContext = this._normalize(tightBefore + ' ' + placeName + ' ' + tightAfter);
    
    // 1. Check against trigger index for known patterns
    // Use TIGHT context to avoid matching patterns from other occurrences
    if (this.triggerIndex.has(normalizedPlace)) {
      const patterns = this.triggerIndex.get(normalizedPlace);
      for (const pattern of patterns) {
        if (tightContext.includes(pattern)) {
          this.stats.exclusionsApplied++;
          return {
            excluded: true,
            reason: 'known_pattern',
            pattern: pattern
          };
        }
      }
    }
    
    // 2. Check for dynamic org suffix pattern
    // E.g., "Texas" followed by "Instruments", "Bank", etc.
    // Only consider the FIRST word after the place name, and it must be an org suffix
    const wordsAfter = this._normalize(afterText).split(/\s+/).filter(Boolean);
    if (wordsAfter.length > 0) {
      const firstWordAfter = wordsAfter[0];
      // Only exclude if the suffix is a strong org indicator
      // Avoid false positives like "Texas weather", "Paris fashion"
      if (this.orgSuffixes.has(firstWordAfter)) {
        // Additional check: the combined phrase should make sense as an organization
        // E.g., "Texas Instruments" yes, "Texas weather" no
        const combo = `${normalizedPlace} ${firstWordAfter}`;
        // Check if this combo is in our exclusion phrases OR if suffix is a STRONG org indicator
        if (this.exclusionPhrases.has(combo) || this._isStrongOrgSuffix(firstWordAfter)) {
          this.stats.contextMatches++;
          return {
            excluded: true,
            reason: 'org_suffix',
            pattern: combo
          };
        }
      }
    }
    
    // 3. Check for personal name prefix pattern
    // E.g., "Paris" preceded by "Paris" (the person)
    const wordsBefore = this._normalize(beforeText).split(/\s+/).filter(Boolean);
    if (wordsBefore.length > 0) {
      const lastWordBefore = wordsBefore[wordsBefore.length - 1];
      if (this.personalPrefixes.has(lastWordBefore)) {
        // Likely a personal name like "Michael Jordan" or "Dr. Jordan"
        this.stats.contextMatches++;
        return {
          excluded: true,
          reason: 'personal_name',
          pattern: `${lastWordBefore} ${normalizedPlace}`
        };
      }
    }
    
    return { excluded: false };
  }
  
  /**
   * Filter an array of place extractions
   * 
   * @param {Array} places - Array of {name, start, end, ...} place extractions
   * @param {string} fullText - The complete text
   * @param {Object} [options] - Options passed to shouldExclude
   * @returns {Array} Filtered places with exclusion metadata
   */
  filterPlaces(places, fullText, options = {}) {
    return places.map(place => {
      const result = this.shouldExclude(
        place.name,
        fullText,
        place.start,
        place.end,
        options
      );
      
      return {
        ...place,
        _excluded: result.excluded,
        _exclusionReason: result.reason,
        _exclusionPattern: result.pattern
      };
    }).filter(p => !p._excluded || options.includeExcluded);
  }
  
  /**
   * Add a custom exclusion pattern at runtime
   * 
   * @param {string} triggerWord - The place name that triggers the check
   * @param {string} phrase - The full phrase to exclude
   */
  addExclusion(triggerWord, phrase) {
    const normalizedTrigger = this._normalize(triggerWord);
    const normalizedPhrase = this._normalize(phrase);
    
    this.exclusionPhrases.add(normalizedPhrase);
    
    if (!this.triggerIndex.has(normalizedTrigger)) {
      this.triggerIndex.set(normalizedTrigger, []);
    }
    this.triggerIndex.get(normalizedTrigger).push(normalizedPhrase);
  }
  
  /**
   * Add a custom org suffix word
   * 
   * @param {string} suffix - The suffix word (e.g., "dynamics")
   */
  addOrgSuffix(suffix) {
    this.orgSuffixes.add(this._normalize(suffix));
  }
  
  /**
   * Get statistics
   * 
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      ...this.stats,
      exclusionPhraseCount: this.exclusionPhrases.size,
      triggerWordCount: this.triggerIndex.size,
      orgSuffixCount: this.orgSuffixes.size
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      checksPerformed: 0,
      exclusionsApplied: 0,
      contextMatches: 0
    };
  }
}

/**
 * Create a PlaceContextFilter instance
 * 
 * @param {Object} [options] - Configuration options
 * @returns {PlaceContextFilter} Filter instance
 */
function createPlaceContextFilter(options = {}) {
  return new PlaceContextFilter(options);
}

module.exports = {
  PlaceContextFilter,
  createPlaceContextFilter,
  BUILTIN_ORG_PATTERNS,
  ORG_SUFFIX_WORDS,
  PERSONAL_NAME_PREFIXES
};
