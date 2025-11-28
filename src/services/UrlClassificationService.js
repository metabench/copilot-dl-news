/**
 * UrlClassificationService - Predicts URL classifications before fetching content
 * 
 * This service provides URL-based classification predictions using multiple strategies:
 * 1. Learned patterns from verified classifications
 * 2. Similar URL matching (same structure, different slug)
 * 3. URL signal heuristics (date paths, section keywords, etc.)
 * 
 * Predictions are stored with confidence scores and verified when content is fetched.
 */
'use strict';

const { URL } = require('url');

/**
 * @typedef {Object} ClassificationPrediction
 * @property {string} classification - Predicted classification
 * @property {number} confidence - Confidence score (0.0 - 1.0)
 * @property {string} source - Prediction source (learned_pattern, similar_url, url_signals, domain_profile)
 * @property {string} [pattern] - Pattern that matched (if from pattern)
 * @property {number} [similarUrlId] - ID of similar URL (if from similar)
 * @property {Object} [signals] - URL signals used (if from signals)
 */

/**
 * @typedef {Object} UrlSignals
 * @property {string} host - Hostname
 * @property {string} tld - Top-level domain
 * @property {string|null} section - First path segment
 * @property {number} pathDepth - Number of path segments
 * @property {number} slugLen - Length of final segment
 * @property {boolean} hasDatePath - Contains date pattern /YYYY/MM/DD/
 * @property {boolean} hasArticleWords - Contains article-related keywords
 * @property {number} queryCount - Number of query parameters
 */

class UrlClassificationService {
    /**
     * @param {Object} options
     * @param {Database} options.db - Better-sqlite3 database instance
     * @param {Object} [options.signalsService] - ArticleSignalsService instance
     * @param {Object} [options.logger] - Logger instance
     */
    constructor({ db, signalsService = null, logger = console } = {}) {
        if (!db) {
            throw new Error('UrlClassificationService requires db instance');
        }
        this.db = db;
        this.signalsService = signalsService;
        this.logger = logger;
        
        this._preparedStatements = null;
    }

    /**
     * Get or create prepared statements
     * @returns {Object} Prepared statements
     */
    _getStatements() {
        if (this._preparedStatements) {
            return this._preparedStatements;
        }

        this._preparedStatements = {
            // Pattern matching
            findPattern: this.db.prepare(`
                SELECT id, pattern_regex, classification, accuracy, sample_count, verified_count
                FROM url_classification_patterns
                WHERE domain = ?
                ORDER BY accuracy DESC, verified_count DESC
            `),

            // Similar URL lookup - finds URLs with same structure but different slugs
            findSimilarUrl: this.db.prepare(`
                SELECT 
                    u.id as url_id, 
                    u.url, 
                    ca.classification,
                    ca.word_count,
                    ca.analyzed_at
                FROM urls u
                JOIN http_responses hr ON u.id = hr.url_id
                JOIN content_storage cs ON hr.id = cs.http_response_id
                JOIN content_analysis ca ON cs.id = ca.content_id
                WHERE u.host = ?
                  AND ca.classification IS NOT NULL
                ORDER BY hr.fetched_at DESC
                LIMIT 100
            `),

            // Get domain profile
            getDomainProfile: this.db.prepare(`
                SELECT *
                FROM domain_classification_profiles
                WHERE domain = ?
            `),

            // Store prediction
            insertPrediction: this.db.prepare(`
                INSERT INTO url_classifications 
                    (url_id, predicted_classification, confidence, prediction_source, 
                     pattern_matched, similar_url_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(url_id, prediction_source) DO UPDATE SET
                    predicted_classification = excluded.predicted_classification,
                    confidence = excluded.confidence,
                    pattern_matched = excluded.pattern_matched,
                    similar_url_id = excluded.similar_url_id,
                    updated_at = datetime('now')
            `),

            // Get existing prediction
            getPrediction: this.db.prepare(`
                SELECT * FROM url_classifications
                WHERE url_id = ?
                ORDER BY confidence DESC
                LIMIT 1
            `),

            // Update verification
            updateVerification: this.db.prepare(`
                UPDATE url_classifications
                SET verified_at = datetime('now'),
                    verified_classification = ?,
                    verification_match = ?,
                    updated_at = datetime('now')
                WHERE url_id = ? AND prediction_source = ?
            `),

            // Update pattern accuracy
            updatePatternAccuracy: this.db.prepare(`
                UPDATE url_classification_patterns
                SET verified_count = verified_count + 1,
                    correct_count = correct_count + ?,
                    accuracy = CAST((correct_count + ?) AS REAL) / (verified_count + 1),
                    last_verified_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE domain = ? AND pattern_regex = ?
            `),

            // Get URL by ID
            getUrlById: this.db.prepare(`
                SELECT id, url, host FROM urls WHERE id = ?
            `),

            // Get or create URL
            ensureUrl: this.db.prepare(`
                INSERT INTO urls (url, host, created_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(url) DO UPDATE SET last_seen_at = datetime('now')
                RETURNING id, url, host
            `)
        };

        return this._preparedStatements;
    }

    /**
     * Predict classification for an unfetched URL
     * Uses multiple strategies in order of confidence
     * 
     * @param {string} url - URL to classify
     * @returns {ClassificationPrediction|null} Best prediction or null
     */
    predictClassification(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }

        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            this.logger.warn?.(`Invalid URL for classification: ${url}`);
            return null;
        }

        const host = parsed.hostname;
        const predictions = [];

        // Strategy 1: Learned patterns (highest confidence potential)
        try {
            const patternMatch = this._matchLearnedPattern(url, host);
            if (patternMatch) {
                predictions.push(patternMatch);
            }
        } catch (err) {
            this.logger.warn?.(`Pattern matching failed: ${err.message}`);
        }

        // Strategy 2: Similar URL lookup
        try {
            const similarMatch = this._findSimilarVerifiedUrl(url, host, parsed.pathname);
            if (similarMatch) {
                predictions.push(similarMatch);
            }
        } catch (err) {
            this.logger.warn?.(`Similar URL lookup failed: ${err.message}`);
        }

        // Strategy 3: Domain profile
        try {
            const profileMatch = this._matchDomainProfile(url, host, parsed.pathname);
            if (profileMatch) {
                predictions.push(profileMatch);
            }
        } catch (err) {
            this.logger.warn?.(`Domain profile matching failed: ${err.message}`);
        }

        // Strategy 4: URL signals heuristics (lowest confidence)
        try {
            const signalsPrediction = this._predictFromSignals(url);
            if (signalsPrediction) {
                predictions.push(signalsPrediction);
            }
        } catch (err) {
            this.logger.warn?.(`URL signals prediction failed: ${err.message}`);
        }

        // Return best prediction (highest confidence)
        return this._selectBestPrediction(predictions);
    }

    /**
     * Match URL against learned patterns for the domain
     * @param {string} url - URL to match
     * @param {string} host - Hostname
     * @returns {ClassificationPrediction|null}
     */
    _matchLearnedPattern(url, host) {
        const stmts = this._getStatements();
        const patterns = stmts.findPattern.all(host);

        for (const pattern of patterns) {
            try {
                const regex = new RegExp(pattern.pattern_regex);
                const parsed = new URL(url);
                
                if (regex.test(parsed.pathname)) {
                    // Base confidence from pattern accuracy
                    let confidence = pattern.accuracy || 0.5;
                    
                    // Boost confidence based on sample size
                    if (pattern.verified_count >= 10) {
                        confidence = Math.min(0.95, confidence * 1.1);
                    } else if (pattern.verified_count >= 5) {
                        confidence = Math.min(0.9, confidence * 1.05);
                    }

                    return {
                        classification: pattern.classification,
                        confidence,
                        source: 'learned_pattern',
                        pattern: pattern.pattern_regex,
                        sampleCount: pattern.sample_count,
                        verifiedCount: pattern.verified_count
                    };
                }
            } catch {
                // Invalid regex, skip this pattern
                continue;
            }
        }

        return null;
    }

    /**
     * Find similar URLs with verified classifications
     * @param {string} url - URL to find similar for
     * @param {string} host - Hostname
     * @param {string} pathname - URL pathname
     * @returns {ClassificationPrediction|null}
     */
    _findSimilarVerifiedUrl(url, host, pathname) {
        const stmts = this._getStatements();
        const verifiedUrls = stmts.findSimilarUrl.all(host);

        if (verifiedUrls.length === 0) {
            return null;
        }

        // Build structural pattern from target URL
        const targetPattern = this._buildStructuralPattern(pathname);
        
        // Find best matching URL
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const verified of verifiedUrls) {
            try {
                const verifiedPath = new URL(verified.url).pathname;
                const verifiedPattern = this._buildStructuralPattern(verifiedPath);
                
                const similarity = this._calculatePatternSimilarity(targetPattern, verifiedPattern);
                
                if (similarity > bestSimilarity && similarity >= 0.7) {
                    bestSimilarity = similarity;
                    bestMatch = verified;
                }
            } catch {
                continue;
            }
        }

        if (bestMatch) {
            return {
                classification: bestMatch.classification,
                confidence: 0.6 * bestSimilarity, // Scale by similarity
                source: 'similar_url',
                similarUrl: bestMatch.url,
                similarUrlId: bestMatch.url_id,
                similarity: bestSimilarity
            };
        }

        return null;
    }

    /**
     * Match against domain classification profile
     * @param {string} url - URL to match
     * @param {string} host - Hostname
     * @param {string} pathname - URL pathname
     * @returns {ClassificationPrediction|null}
     */
    _matchDomainProfile(url, host, pathname) {
        const stmts = this._getStatements();
        const profile = stmts.getDomainProfile.get(host);

        if (!profile || profile.profile_confidence < 0.5) {
            return null;
        }

        // Check article pattern
        if (profile.article_pattern) {
            try {
                const articleRegex = new RegExp(profile.article_pattern);
                if (articleRegex.test(pathname)) {
                    return {
                        classification: 'article',
                        confidence: 0.5 * profile.profile_confidence,
                        source: 'domain_profile',
                        pattern: profile.article_pattern
                    };
                }
            } catch { /* invalid regex */ }
        }

        // Check hub pattern
        if (profile.hub_pattern) {
            try {
                const hubRegex = new RegExp(profile.hub_pattern);
                if (hubRegex.test(pathname)) {
                    return {
                        classification: 'hub',
                        confidence: 0.5 * profile.profile_confidence,
                        source: 'domain_profile',
                        pattern: profile.hub_pattern
                    };
                }
            } catch { /* invalid regex */ }
        }

        // Check nav pattern
        if (profile.nav_pattern) {
            try {
                const navRegex = new RegExp(profile.nav_pattern);
                if (navRegex.test(pathname)) {
                    return {
                        classification: 'nav',
                        confidence: 0.5 * profile.profile_confidence,
                        source: 'domain_profile',
                        pattern: profile.nav_pattern
                    };
                }
            } catch { /* invalid regex */ }
        }

        return null;
    }

    /**
     * Predict classification from URL signals alone
     * @param {string} url - URL to analyze
     * @returns {ClassificationPrediction|null}
     */
    _predictFromSignals(url) {
        // Use signals service if available
        if (this.signalsService) {
            const urlSignals = this.signalsService.computeUrlSignals(url);
            const looksLikeArticle = this.signalsService.looksLikeArticle(url);

            if (looksLikeArticle) {
                let confidence = 0.4; // Base confidence for URL-only prediction

                // Boost for strong signals
                if (urlSignals?.hasDatePath) confidence += 0.1;
                if (urlSignals?.hasArticleWords) confidence += 0.1;
                if (urlSignals?.pathDepth >= 4) confidence += 0.05;
                if (urlSignals?.slugLen > 20) confidence += 0.05;

                return {
                    classification: 'article',
                    confidence: Math.min(0.65, confidence),
                    source: 'url_signals',
                    signals: urlSignals
                };
            }

            // Check for hub/nav signals
            if (urlSignals?.pathDepth <= 2) {
                return {
                    classification: 'hub',
                    confidence: 0.3,
                    source: 'url_signals',
                    signals: urlSignals
                };
            }

            return null;
        }

        // Fallback: simple pattern checks
        const lower = url.toLowerCase();
        
        // Skip patterns - these are definitely not articles
        const skipPatterns = [
            '/search', '/login', '/register', '/subscribe',
            '/contact', '/about', '/privacy', '/terms',
            '.pdf', '.jpg', '.png', '.xml', '/api/'
        ];
        if (skipPatterns.some(p => lower.includes(p))) {
            return {
                classification: 'other',
                confidence: 0.6,
                source: 'url_signals',
                signals: { skipPattern: true }
            };
        }

        // Article-like patterns
        const articlePatterns = [
            /\/\d{4}\/\d{2}\/\d{2}\//,  // Date path
            /\/article\//,
            /\/story\//,
            /\/news\//,
            /\/post\//
        ];
        if (articlePatterns.some(p => p.test(lower))) {
            return {
                classification: 'article',
                confidence: 0.45,
                source: 'url_signals',
                signals: { hasArticlePattern: true }
            };
        }

        return null;
    }

    /**
     * Build a structural pattern from pathname
     * Replaces variable parts (dates, slugs) with placeholders
     * @param {string} pathname - URL pathname
     * @returns {string[]} Array of pattern segments
     */
    _buildStructuralPattern(pathname) {
        const segments = pathname.split('/').filter(Boolean);
        
        return segments.map(seg => {
            if (/^\d{4}$/.test(seg)) return 'YEAR';
            if (/^\d{1,2}$/.test(seg)) return 'NUM';
            if (seg.length > 30) return 'SLUG';
            if (/^[a-f0-9]{8,}$/i.test(seg)) return 'HASH';
            return seg.toLowerCase();
        });
    }

    /**
     * Calculate similarity between two structural patterns
     * @param {string[]} pattern1 - First pattern
     * @param {string[]} pattern2 - Second pattern
     * @returns {number} Similarity score (0.0 - 1.0)
     */
    _calculatePatternSimilarity(pattern1, pattern2) {
        if (pattern1.length !== pattern2.length) {
            return 0;
        }

        let matches = 0;
        for (let i = 0; i < pattern1.length; i++) {
            if (pattern1[i] === pattern2[i]) {
                matches++;
            } else if (
                (pattern1[i] === 'SLUG' && pattern2[i] === 'SLUG') ||
                (pattern1[i] === 'YEAR' && pattern2[i] === 'YEAR') ||
                (pattern1[i] === 'NUM' && pattern2[i] === 'NUM')
            ) {
                matches += 0.5; // Partial match for same placeholder type
            }
        }

        return matches / pattern1.length;
    }

    /**
     * Select the best prediction from multiple candidates
     * @param {ClassificationPrediction[]} predictions - Array of predictions
     * @returns {ClassificationPrediction|null}
     */
    _selectBestPrediction(predictions) {
        if (!predictions || predictions.length === 0) {
            return null;
        }

        // Sort by confidence descending
        return predictions.sort((a, b) => b.confidence - a.confidence)[0];
    }

    /**
     * Store a prediction in the database
     * @param {number} urlId - URL ID
     * @param {ClassificationPrediction} prediction - Prediction to store
     */
    storePrediction(urlId, prediction) {
        if (!urlId || !prediction) return;

        const stmts = this._getStatements();
        stmts.insertPrediction.run(
            urlId,
            prediction.classification,
            prediction.confidence,
            prediction.source,
            prediction.pattern || null,
            prediction.similarUrlId || null
        );
    }

    /**
     * Get stored prediction for a URL
     * @param {number} urlId - URL ID
     * @returns {Object|null}
     */
    getPrediction(urlId) {
        if (!urlId) return null;
        
        const stmts = this._getStatements();
        return stmts.getPrediction.get(urlId);
    }

    /**
     * Verify a prediction after content has been classified
     * @param {number} urlId - URL ID
     * @param {string} actualClassification - Classification from content analysis
     */
    verifyPrediction(urlId, actualClassification) {
        if (!urlId || !actualClassification) return;

        const stmts = this._getStatements();
        const prediction = stmts.getPrediction.get(urlId);

        if (!prediction) return;

        const isCorrect = prediction.predicted_classification === actualClassification ? 1 : 0;

        // Update prediction with verification
        stmts.updateVerification.run(
            actualClassification,
            isCorrect,
            urlId,
            prediction.prediction_source
        );

        // Update pattern accuracy if prediction was from a pattern
        if (prediction.prediction_source === 'learned_pattern' && prediction.pattern_matched) {
            const url = stmts.getUrlById.get(urlId);
            if (url) {
                stmts.updatePatternAccuracy.run(
                    isCorrect,
                    isCorrect,
                    url.host,
                    prediction.pattern_matched
                );
            }
        }
    }

    /**
     * Predict and store classification for a URL
     * @param {string} url - URL to classify
     * @param {number} [urlId] - Optional URL ID if already known
     * @returns {ClassificationPrediction|null}
     */
    predictAndStore(url, urlId = null) {
        const prediction = this.predictClassification(url);

        if (prediction && urlId) {
            this.storePrediction(urlId, prediction);
        }

        return prediction;
    }
}

module.exports = { UrlClassificationService };
