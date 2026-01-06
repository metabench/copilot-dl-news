'use strict';

/**
 * Multi-Language Place Name Queries
 * 
 * Provides queries for multi-language place name lookups, supporting:
 * - ISO 639-1/BCP-47 language codes (en, zh-Hans, zh-Hant, ar, ru, etc.)
 * - ISO 15924 script codes (Latn, Hans, Hant, Arab, Cyrl)
 * - Transliteration variants (pinyin, wade-giles, bgn-pcgn)
 * 
 * @module db/queries/multiLanguagePlaces
 */

/**
 * Default languages to include in lookups (prioritized order)
 */
const DEFAULT_LANGUAGES = ['en', 'und', null]; // en, undetermined, no language

/**
 * Language family mappings for fallback
 */
const LANGUAGE_FAMILIES = {
  'zh-Hans': ['zh', 'cmn', 'zh-CN'],
  'zh-Hant': ['zh', 'cmn', 'zh-TW', 'zh-HK'],
  'ar': ['ar-SA', 'ar-EG', 'ar-AE'],
  'ru': ['ru-RU'],
  'de': ['de-DE', 'de-AT', 'de-CH'],
  'fr': ['fr-FR', 'fr-CA', 'fr-BE'],
  'es': ['es-ES', 'es-MX', 'es-AR'],
  'pt': ['pt-BR', 'pt-PT'],
  'ja': ['ja-JP'],
  'ko': ['ko-KR']
};

/**
 * Create multi-language place name query functions
 * @param {Object} db - Database connection (better-sqlite3)
 * @returns {Object} Query functions
 */
function createMultiLanguagePlaceQueries(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createMultiLanguagePlaceQueries requires a valid SQLite database instance');
  }
  
  // Prepare statements
  const stmts = {
    // Find place by name in any language
    findByName: db.prepare(`
      SELECT 
        pn.id AS name_id,
        pn.place_id,
        pn.name,
        pn.normalized,
        pn.lang,
        pn.script,
        pn.name_kind,
        pn.is_preferred,
        pn.is_official,
        p.kind AS place_kind,
        p.country_code,
        p.population,
        p.lat AS latitude,
        p.lng AS longitude
      FROM place_names pn
      JOIN places p ON p.id = pn.place_id
      WHERE pn.normalized = ?
      ORDER BY 
        pn.is_preferred DESC,
        pn.is_official DESC,
        p.population DESC
      LIMIT 50
    `),
    
    // Find place by name with language filter
    findByNameAndLang: db.prepare(`
      SELECT 
        pn.id AS name_id,
        pn.place_id,
        pn.name,
        pn.normalized,
        pn.lang,
        pn.script,
        pn.name_kind,
        pn.is_preferred,
        pn.is_official,
        p.kind AS place_kind,
        p.country_code,
        p.population,
        p.lat AS latitude,
        p.lng AS longitude
      FROM place_names pn
      JOIN places p ON p.id = pn.place_id
      WHERE pn.normalized = ?
        AND (pn.lang = ? OR pn.lang IS NULL OR pn.lang = 'und')
      ORDER BY 
        (pn.lang = ?) DESC,
        pn.is_preferred DESC,
        pn.is_official DESC,
        p.population DESC
      LIMIT 50
    `),
    
    // Get all names for a place
    getPlaceNames: db.prepare(`
      SELECT 
        id,
        name,
        normalized,
        lang,
        script,
        name_kind,
        is_preferred,
        is_official,
        source
      FROM place_names
      WHERE place_id = ?
      ORDER BY 
        is_preferred DESC,
        is_official DESC,
        lang ASC
    `),
    
    // Get names for a place in specific language
    getPlaceNamesByLang: db.prepare(`
      SELECT 
        id,
        name,
        normalized,
        lang,
        script,
        name_kind,
        is_preferred,
        is_official,
        source
      FROM place_names
      WHERE place_id = ?
        AND (lang = ? OR lang IS NULL OR lang = 'und')
      ORDER BY 
        (lang = ?) DESC,
        is_preferred DESC,
        is_official DESC
    `),
    
    // Get canonical/preferred name for a place
    getPreferredName: db.prepare(`
      SELECT 
        name,
        lang,
        name_kind
      FROM place_names
      WHERE place_id = ?
        AND (lang = ? OR lang IS NULL OR lang = 'und' OR lang = 'en')
      ORDER BY 
        (lang = ?) DESC,
        (lang = 'en') DESC,
        is_preferred DESC,
        is_official DESC
      LIMIT 1
    `),
    
    // Find places by name pattern (LIKE search)
    searchByPattern: db.prepare(`
      SELECT DISTINCT
        pn.place_id,
        pn.name,
        pn.lang,
        p.kind AS place_kind,
        p.country_code,
        p.population
      FROM place_names pn
      JOIN places p ON p.id = pn.place_id
      WHERE pn.normalized LIKE ?
      ORDER BY p.population DESC
      LIMIT ?
    `),
    
    // Count names by language
    countByLanguage: db.prepare(`
      SELECT 
        lang,
        COUNT(*) as cnt
      FROM place_names
      GROUP BY lang
      ORDER BY cnt DESC
    `),
    
    // Get languages available for a place
    getAvailableLanguages: db.prepare(`
      SELECT DISTINCT lang
      FROM place_names
      WHERE place_id = ?
        AND lang IS NOT NULL
      ORDER BY lang
    `)
  };
  
  /**
   * Normalize a place name for matching
   * @param {string} name - Place name
   * @returns {string} Normalized name
   */
  function normalizeName(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Detect script of text (heuristic)
   * @param {string} text - Text to analyze
   * @returns {Object} Detected script info
   */
  function detectScript(text) {
    // Check for Korean first (unique script)
    if (/[\uAC00-\uD7AF]/.test(text)) {
      return { script: 'Kore', lang: 'ko' };
    }
    // Check for Japanese-specific kana (hiragana/katakana)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
      return { script: 'Jpan', lang: 'ja' };
    }
    // Check for Arabic
    if (/[\u0600-\u06FF]/.test(text)) {
      return { script: 'Arab', lang: 'ar' };
    }
    // Check for Thai
    if (/[\u0E00-\u0E7F]/.test(text)) {
      return { script: 'Thai', lang: 'th' };
    }
    // Check for Cyrillic
    if (/[\u0400-\u04FF]/.test(text)) {
      return { script: 'Cyrl', lang: 'ru' };
    }
    // Check for Han characters (Chinese/Japanese)
    if (/[\u4e00-\u9fff]/.test(text)) {
      // Without kana, it's likely Chinese
      // Default to simplified Chinese (Hans) as it's more common for mainland places
      // Traditional Chinese detection would require a more sophisticated analysis
      return { script: 'Hans', lang: 'zh-Hans' };
    }
    return { script: 'Latn', lang: null };
  }
  
  /**
   * Expand language to include fallbacks
   * @param {string} lang - Primary language code
   * @returns {Array<string>} Expanded language list
   */
  function expandLanguage(lang) {
    if (!lang) return DEFAULT_LANGUAGES;
    const expanded = [lang];
    
    // Add family variants
    for (const [key, variants] of Object.entries(LANGUAGE_FAMILIES)) {
      if (key === lang || variants.includes(lang)) {
        expanded.push(key, ...variants);
      }
    }
    
    // Add defaults
    expanded.push(...DEFAULT_LANGUAGES);
    
    return [...new Set(expanded)];
  }
  
  return {
    /**
     * Find candidates by name
     * @param {string} name - Place name to search
     * @param {Object} [options] - Search options
     * @param {string} [options.lang] - Preferred language
     * @param {boolean} [options.autoDetect=true] - Auto-detect script/language
     * @returns {Array} Matching places
     */
    findByName(name, options = {}) {
      const normalized = normalizeName(name);
      if (!normalized) return [];
      
      let lang = options.lang;
      
      // Auto-detect if no language specified
      if (!lang && options.autoDetect !== false) {
        const detected = detectScript(name);
        lang = detected.lang;
      }
      
      if (lang) {
        return stmts.findByNameAndLang.all(normalized, lang, lang);
      }
      
      return stmts.findByName.all(normalized);
    },
    
    /**
     * Get all names for a place
     * @param {number} placeId - Place ID
     * @param {Object} [options] - Options
     * @param {string} [options.lang] - Filter by language
     * @returns {Array} Place names
     */
    getPlaceNames(placeId, options = {}) {
      if (options.lang) {
        return stmts.getPlaceNamesByLang.all(placeId, options.lang, options.lang);
      }
      return stmts.getPlaceNames.all(placeId);
    },
    
    /**
     * Get the preferred/canonical name for a place
     * @param {number} placeId - Place ID
     * @param {string} [lang='en'] - Preferred language
     * @returns {string|null} Preferred name string
     */
    getPreferredName(placeId, lang = 'en') {
      const row = stmts.getPreferredName.get(placeId, lang, lang);
      return row ? row.name : null;
    },
    
    /**
     * Search places by pattern
     * @param {string} pattern - Search pattern (with % wildcards)
     * @param {number} [limit=20] - Maximum results
     * @returns {Array} Matching places
     */
    searchByPattern(pattern, limit = 20) {
      return stmts.searchByPattern.all(pattern, limit);
    },
    
    /**
     * Get language statistics
     * @returns {Array} Language counts
     */
    countByLanguage() {
      return stmts.countByLanguage.all();
    },
    
    /**
     * Get available languages for a place
     * @param {number} placeId - Place ID
     * @returns {Array<string>} Available language codes
     */
    getAvailableLanguages(placeId) {
      return stmts.getAvailableLanguages.all(placeId).map(r => r.lang);
    },
    
    // Export utilities
    normalizeName,
    detectScript,
    expandLanguage,
    
    // Export constants
    DEFAULT_LANGUAGES,
    LANGUAGE_FAMILIES
  };
}

module.exports = {
  createMultiLanguagePlaceQueries,
  DEFAULT_LANGUAGES,
  LANGUAGE_FAMILIES
};
