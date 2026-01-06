'use strict';

/**
 * PlaceHubUrlPatternsStore - Database adapter for place hub URL pattern learning
 * 
 * This adapter stores and retrieves learned URL patterns that indicate place hubs.
 * Patterns are learned from verified place hubs and used to predict new place hubs
 * during crawling.
 * 
 * Pattern types:
 * - path: URL path pattern (e.g., "/news/local/{place}")
 * - segment: URL segment pattern (e.g., "/places/", "/location/")
 * - depth: Typical hub URL depth for a domain
 */

const DEFAULT_LIMIT = 50;
const MIN_CONFIDENCE = 0.5;

function normalizeDomain(input) {
  if (!input) return null;
  let domain = String(input).trim().toLowerCase();
  // Strip www. prefix for consistent matching
  if (domain.startsWith('www.')) {
    domain = domain.slice(4);
  }
  return domain;
}

function nowIso() {
  return new Date().toISOString();
}

function serializeJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

/**
 * Create a place hub URL patterns store
 * @param {Database} db - better-sqlite3 database instance
 * @returns {Object} Store operations
 */
function createPlaceHubUrlPatternsStore(db) {
  if (!db) {
    throw new Error('createPlaceHubUrlPatternsStore requires a database connection');
  }

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS place_hub_url_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      pattern_regex TEXT NOT NULL,
      pattern_description TEXT,
      place_kind TEXT,
      sample_count INTEGER DEFAULT 1,
      verified_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      accuracy REAL DEFAULT 1.0,
      example_urls TEXT,
      last_matched_at TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(domain, pattern_type, pattern_regex)
    )
  `);

  // Indexes for efficient lookups
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_phup_domain ON place_hub_url_patterns(domain);
      CREATE INDEX IF NOT EXISTS idx_phup_accuracy ON place_hub_url_patterns(accuracy DESC);
      CREATE INDEX IF NOT EXISTS idx_phup_place_kind ON place_hub_url_patterns(place_kind);
    `);
  } catch (_) {
    // Indexes may already exist
  }

  // Prepared statements
  const upsertPatternStmt = db.prepare(`
    INSERT INTO place_hub_url_patterns (
      domain, pattern_type, pattern_regex, pattern_description, place_kind,
      sample_count, verified_count, correct_count, accuracy, example_urls,
      last_matched_at, last_verified_at, created_at, updated_at
    ) VALUES (
      @domain, @pattern_type, @pattern_regex, @pattern_description, @place_kind,
      @sample_count, @verified_count, @correct_count, @accuracy, @example_urls,
      @last_matched_at, @last_verified_at, @created_at, @updated_at
    )
    ON CONFLICT(domain, pattern_type, pattern_regex) DO UPDATE SET
      pattern_description = COALESCE(excluded.pattern_description, place_hub_url_patterns.pattern_description),
      place_kind = COALESCE(excluded.place_kind, place_hub_url_patterns.place_kind),
      sample_count = place_hub_url_patterns.sample_count + 1,
      verified_count = COALESCE(excluded.verified_count, place_hub_url_patterns.verified_count),
      correct_count = COALESCE(excluded.correct_count, place_hub_url_patterns.correct_count),
      accuracy = COALESCE(excluded.accuracy, place_hub_url_patterns.accuracy),
      example_urls = excluded.example_urls,
      last_matched_at = COALESCE(excluded.last_matched_at, place_hub_url_patterns.last_matched_at),
      last_verified_at = COALESCE(excluded.last_verified_at, place_hub_url_patterns.last_verified_at),
      updated_at = excluded.updated_at
  `);

  const getPatternsForDomainStmt = db.prepare(`
    SELECT * FROM place_hub_url_patterns
    WHERE domain = ?
      AND accuracy >= ?
    ORDER BY accuracy DESC, sample_count DESC
    LIMIT ?
  `);

  const getPatternsByPlaceKindStmt = db.prepare(`
    SELECT * FROM place_hub_url_patterns
    WHERE domain = ?
      AND place_kind = ?
      AND accuracy >= ?
    ORDER BY accuracy DESC, sample_count DESC
    LIMIT ?
  `);

  const getAllPatternsStmt = db.prepare(`
    SELECT * FROM place_hub_url_patterns
    WHERE accuracy >= ?
    ORDER BY domain, accuracy DESC
    LIMIT ?
  `);

  const getPatternStmt = db.prepare(`
    SELECT * FROM place_hub_url_patterns
    WHERE domain = ?
      AND pattern_type = ?
      AND pattern_regex = ?
    LIMIT 1
  `);

  const updatePatternAccuracyStmt = db.prepare(`
    UPDATE place_hub_url_patterns
    SET verified_count = verified_count + 1,
        correct_count = correct_count + CASE WHEN @is_correct THEN 1 ELSE 0 END,
        accuracy = CAST((correct_count + CASE WHEN @is_correct THEN 1 ELSE 0 END) AS REAL) / (verified_count + 1),
        last_verified_at = @verified_at,
        updated_at = @updated_at
    WHERE domain = @domain
      AND pattern_type = @pattern_type
      AND pattern_regex = @pattern_regex
  `);

  const recordPatternMatchStmt = db.prepare(`
    UPDATE place_hub_url_patterns
    SET last_matched_at = @matched_at,
        updated_at = @updated_at
    WHERE domain = @domain
      AND pattern_type = @pattern_type
      AND pattern_regex = @pattern_regex
  `);

  const deleteStalePatternStmt = db.prepare(`
    DELETE FROM place_hub_url_patterns
    WHERE domain = ?
      AND (accuracy < ? OR last_matched_at < ?)
  `);

  const getDomainStatsStmt = db.prepare(`
    SELECT 
      domain,
      COUNT(*) as pattern_count,
      AVG(accuracy) as avg_accuracy,
      SUM(sample_count) as total_samples,
      MAX(updated_at) as last_updated
    FROM place_hub_url_patterns
    WHERE domain = ?
    GROUP BY domain
  `);

  const getTopDomainsStmt = db.prepare(`
    SELECT 
      domain,
      COUNT(*) as pattern_count,
      AVG(accuracy) as avg_accuracy,
      SUM(sample_count) as total_samples
    FROM place_hub_url_patterns
    GROUP BY domain
    ORDER BY pattern_count DESC, avg_accuracy DESC
    LIMIT ?
  `);

  return {
    /**
     * Save or update a pattern
     * @param {Object} pattern - Pattern data
     * @returns {Object|null} Saved pattern
     */
    savePattern(pattern) {
      const domain = normalizeDomain(pattern?.domain);
      const patternType = pattern?.patternType || pattern?.pattern_type;
      const patternRegex = pattern?.patternRegex || pattern?.pattern_regex;
      
      if (!domain || !patternType || !patternRegex) {
        return null;
      }

      const now = nowIso();
      const exampleUrls = pattern?.exampleUrls || pattern?.example_urls;

      upsertPatternStmt.run({
        domain,
        pattern_type: patternType,
        pattern_regex: patternRegex,
        pattern_description: pattern?.patternDescription || pattern?.pattern_description || null,
        place_kind: pattern?.placeKind || pattern?.place_kind || null,
        sample_count: Number.isFinite(pattern?.sampleCount) ? pattern.sampleCount : 1,
        verified_count: Number.isFinite(pattern?.verifiedCount) ? pattern.verifiedCount : 0,
        correct_count: Number.isFinite(pattern?.correctCount) ? pattern.correctCount : 0,
        accuracy: Number.isFinite(pattern?.accuracy) ? pattern.accuracy : 1.0,
        example_urls: Array.isArray(exampleUrls) ? serializeJson(exampleUrls) : (exampleUrls || null),
        last_matched_at: pattern?.lastMatchedAt || pattern?.last_matched_at || now,
        last_verified_at: pattern?.lastVerifiedAt || pattern?.last_verified_at || null,
        created_at: now,
        updated_at: now
      });

      return getPatternStmt.get(domain, patternType, patternRegex) || null;
    },

    /**
     * Get patterns for a domain
     * @param {string} domain - Domain to query
     * @param {Object} options - Query options
     * @returns {Array} Patterns
     */
    getPatternsForDomain(domain, { limit = DEFAULT_LIMIT, minAccuracy = MIN_CONFIDENCE } = {}) {
      const normalized = normalizeDomain(domain);
      if (!normalized) return [];
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || DEFAULT_LIMIT));
      const safeMinAccuracy = Number.isFinite(minAccuracy) ? minAccuracy : MIN_CONFIDENCE;
      return getPatternsForDomainStmt.all(normalized, safeMinAccuracy, safeLimit);
    },

    /**
     * Get patterns for a specific place kind
     * @param {string} domain - Domain to query
     * @param {string} placeKind - Place kind (e.g., 'country-hub', 'region-hub', 'city-hub')
     * @param {Object} options - Query options
     * @returns {Array} Patterns
     */
    getPatternsByPlaceKind(domain, placeKind, { limit = DEFAULT_LIMIT, minAccuracy = MIN_CONFIDENCE } = {}) {
      const normalized = normalizeDomain(domain);
      if (!normalized || !placeKind) return [];
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || DEFAULT_LIMIT));
      const safeMinAccuracy = Number.isFinite(minAccuracy) ? minAccuracy : MIN_CONFIDENCE;
      return getPatternsByPlaceKindStmt.all(normalized, placeKind, safeMinAccuracy, safeLimit);
    },

    /**
     * Get all patterns across all domains
     * @param {Object} options - Query options
     * @returns {Array} Patterns
     */
    getAllPatterns({ limit = DEFAULT_LIMIT, minAccuracy = MIN_CONFIDENCE } = {}) {
      const safeLimit = Math.max(1, Math.min(1000, Number(limit) || DEFAULT_LIMIT));
      const safeMinAccuracy = Number.isFinite(minAccuracy) ? minAccuracy : MIN_CONFIDENCE;
      return getAllPatternsStmt.all(safeMinAccuracy, safeLimit);
    },

    /**
     * Get a specific pattern
     * @param {string} domain - Domain
     * @param {string} patternType - Pattern type
     * @param {string} patternRegex - Pattern regex
     * @returns {Object|null} Pattern
     */
    getPattern(domain, patternType, patternRegex) {
      const normalized = normalizeDomain(domain);
      if (!normalized || !patternType || !patternRegex) return null;
      return getPatternStmt.get(normalized, patternType, patternRegex) || null;
    },

    /**
     * Update pattern accuracy after verification
     * @param {Object} params - Verification params
     * @returns {number} Changed rows
     */
    updatePatternAccuracy({ domain, patternType, patternRegex, isCorrect }) {
      const normalized = normalizeDomain(domain);
      if (!normalized || !patternType || !patternRegex) return 0;
      const now = nowIso();
      const info = updatePatternAccuracyStmt.run({
        domain: normalized,
        pattern_type: patternType,
        pattern_regex: patternRegex,
        is_correct: isCorrect ? 1 : 0,
        verified_at: now,
        updated_at: now
      });
      return info?.changes || 0;
    },

    /**
     * Record that a pattern was matched (for freshness tracking)
     * @param {Object} params - Match params
     * @returns {number} Changed rows
     */
    recordPatternMatch({ domain, patternType, patternRegex }) {
      const normalized = normalizeDomain(domain);
      if (!normalized || !patternType || !patternRegex) return 0;
      const now = nowIso();
      const info = recordPatternMatchStmt.run({
        domain: normalized,
        pattern_type: patternType,
        pattern_regex: patternRegex,
        matched_at: now,
        updated_at: now
      });
      return info?.changes || 0;
    },

    /**
     * Delete stale or low-accuracy patterns
     * @param {string} domain - Domain to clean
     * @param {Object} options - Cleanup options
     * @returns {number} Deleted rows
     */
    deleteStalePatterns(domain, { minAccuracy = 0.3, maxAgeMs = 30 * 24 * 60 * 60 * 1000 } = {}) {
      const normalized = normalizeDomain(domain);
      if (!normalized) return 0;
      const cutoffDate = new Date(Date.now() - maxAgeMs).toISOString();
      const info = deleteStalePatternStmt.run(normalized, minAccuracy, cutoffDate);
      return info?.changes || 0;
    },

    /**
     * Get statistics for a domain
     * @param {string} domain - Domain to query
     * @returns {Object|null} Domain stats
     */
    getDomainStats(domain) {
      const normalized = normalizeDomain(domain);
      if (!normalized) return null;
      return getDomainStatsStmt.get(normalized) || null;
    },

    /**
     * Get top domains by pattern count
     * @param {number} limit - Max domains to return
     * @returns {Array} Domain stats
     */
    getTopDomains(limit = 20) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
      return getTopDomainsStmt.all(safeLimit);
    },

    /**
     * Check if a URL matches any learned patterns for a domain
     * @param {string} url - URL to check
     * @param {string} domain - Domain to check patterns for
     * @returns {Object|null} Match result with pattern info
     */
    matchUrl(url, domain) {
      const normalized = normalizeDomain(domain);
      if (!url || !normalized) return null;

      const patterns = this.getPatternsForDomain(normalized, { minAccuracy: MIN_CONFIDENCE });
      if (patterns.length === 0) return null;

      for (const pattern of patterns) {
        try {
          const regex = new RegExp(pattern.pattern_regex);
          if (regex.test(url)) {
            // Record the match
            this.recordPatternMatch({
              domain: normalized,
              patternType: pattern.pattern_type,
              patternRegex: pattern.pattern_regex
            });

            return {
              matched: true,
              pattern: pattern,
              placeKind: pattern.place_kind,
              confidence: pattern.accuracy,
              patternType: pattern.pattern_type
            };
          }
        } catch (_) {
          // Invalid regex, skip
        }
      }

      return { matched: false, pattern: null, placeKind: null, confidence: 0 };
    }
  };
}

module.exports = {
  createPlaceHubUrlPatternsStore
};
