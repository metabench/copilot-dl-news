/**
 * UrlPatternLearningService - Learns URL patterns from verified classifications
 * 
 * This service analyzes URLs with verified content classifications to:
 * 1. Extract structural patterns (date paths, section prefixes, slug patterns)
 * 2. Build domain-specific classification profiles
 * 3. Update pattern accuracy based on verification results
 * 
 * Learned patterns are used by UrlClassificationService for predictions.
 */
'use strict';

const { URL } = require('url');
const { getDb } = require('../data/db');

/**
 * @typedef {Object} LearnedPattern
 * @property {string} domain - Domain the pattern applies to
 * @property {string} pattern - Regex pattern string
 * @property {string} classification - Classification this pattern indicates
 * @property {number} sampleCount - Number of URLs matching this pattern
 * @property {number} accuracy - Accuracy of this pattern
 */

class UrlPatternLearningService {
    /**
     * @param {Object} options
     * @param {Database} options.db - Better-sqlite3 database instance
     * @param {Object} [options.logger] - Logger instance
     * @param {Object} [options.config] - Configuration options
     */
    constructor({ db, logger = console, config = {} } = {}) {
        this.db = db;
        if (!this.db) this.db = getDb();
        if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

        if (!this.db) {
            throw new Error('UrlPatternLearningService requires db instance');
        }
        this.logger = logger;
        this.config = {
            minSampleSize: config.minSampleSize || 3,      // Minimum URLs to create a pattern
            minAccuracy: config.minAccuracy || 0.6,        // Minimum accuracy to keep pattern
            maxPatternAge: config.maxPatternAge || 30 * 24 * 60 * 60 * 1000, // 30 days
            ...config
        };
        
        this._preparedStatements = null;
    }

    /**
     * Get or create prepared statements
     */
    _getStatements() {
        if (this._preparedStatements) {
            return this._preparedStatements;
        }

        this._preparedStatements = {
            // Get verified URLs for a domain
            getVerifiedUrls: this.db.prepare(`
                SELECT 
                    u.url,
                    u.host,
                    ca.classification,
                    ca.word_count,
                    ca.analyzed_at
                FROM urls u
                JOIN http_responses hr ON u.id = hr.url_id
                JOIN content_storage cs ON hr.id = cs.http_response_id
                JOIN content_analysis ca ON cs.id = ca.content_id
                WHERE u.host = ?
                  AND ca.classification IS NOT NULL
                ORDER BY ca.analyzed_at DESC
            `),

            // Get all domains with verified content
            getDomainsWithContent: this.db.prepare(`
                SELECT DISTINCT u.host, COUNT(*) as url_count
                FROM urls u
                JOIN http_responses hr ON u.id = hr.url_id
                JOIN content_storage cs ON hr.id = cs.http_response_id
                JOIN content_analysis ca ON cs.id = ca.content_id
                WHERE ca.classification IS NOT NULL
                GROUP BY u.host
                HAVING COUNT(*) >= ?
                ORDER BY COUNT(*) DESC
            `),

            // Upsert pattern
            upsertPattern: this.db.prepare(`
                INSERT INTO url_classification_patterns 
                    (domain, pattern_regex, pattern_description, classification, 
                     sample_count, verified_count, correct_count, accuracy, 
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(domain, pattern_regex) DO UPDATE SET
                    sample_count = excluded.sample_count,
                    verified_count = excluded.verified_count,
                    correct_count = excluded.correct_count,
                    accuracy = excluded.accuracy,
                    updated_at = datetime('now')
            `),

            // Delete stale/inaccurate patterns
            deleteStalePatterns: this.db.prepare(`
                DELETE FROM url_classification_patterns
                WHERE domain = ?
                  AND (
                    accuracy < ?
                    OR updated_at < datetime('now', ?)
                  )
            `),

            // Upsert domain profile
            upsertDomainProfile: this.db.prepare(`
                INSERT INTO domain_classification_profiles 
                    (domain, article_pattern, hub_pattern, nav_pattern,
                     common_sections, date_path_format, slug_characteristics,
                     verified_article_count, verified_hub_count, verified_nav_count,
                     profile_confidence, last_updated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(domain) DO UPDATE SET
                    article_pattern = excluded.article_pattern,
                    hub_pattern = excluded.hub_pattern,
                    nav_pattern = excluded.nav_pattern,
                    common_sections = excluded.common_sections,
                    date_path_format = excluded.date_path_format,
                    slug_characteristics = excluded.slug_characteristics,
                    verified_article_count = excluded.verified_article_count,
                    verified_hub_count = excluded.verified_hub_count,
                    verified_nav_count = excluded.verified_nav_count,
                    profile_confidence = excluded.profile_confidence,
                    last_updated_at = datetime('now')
            `),

            // Get classification counts for domain
            getClassificationCounts: this.db.prepare(`
                SELECT ca.classification, COUNT(*) as count
                FROM urls u
                JOIN http_responses hr ON u.id = hr.url_id
                JOIN content_storage cs ON hr.id = cs.http_response_id
                JOIN content_analysis ca ON cs.id = ca.content_id
                WHERE u.host = ?
                  AND ca.classification IS NOT NULL
                GROUP BY ca.classification
            `)
        };

        return this._preparedStatements;
    }

    /**
     * Learn patterns from all verified URLs for a domain
     * @param {string} domain - Domain to analyze
     * @returns {Object} Learning results
     */
    learnPatternsFromDomain(domain) {
        const stmts = this._getStatements();
        const verifiedUrls = stmts.getVerifiedUrls.all(domain);

        if (verifiedUrls.length < this.config.minSampleSize) {
            return {
                domain,
                urlCount: verifiedUrls.length,
                patternsLearned: 0,
                message: `Insufficient URLs (need ${this.config.minSampleSize})`
            };
        }

        // Group URLs by structural pattern and classification
        const patternGroups = this._groupByPattern(verifiedUrls);

        // Upsert patterns that meet minimum sample size
        let patternsLearned = 0;
        for (const [key, group] of patternGroups) {
            if (group.urls.length >= this.config.minSampleSize) {
                const accuracy = group.urls.length / verifiedUrls.length;
                
                stmts.upsertPattern.run(
                    domain,
                    group.pattern,
                    group.description || null,
                    group.classification,
                    group.urls.length,
                    group.urls.length, // Initially verified_count = sample_count
                    group.urls.length, // Initially correct_count = sample_count
                    1.0 // Initial accuracy is 100% since all are verified
                );
                patternsLearned++;
            }
        }

        // Clean up stale/inaccurate patterns
        const staleAge = `-${this.config.maxPatternAge / 1000} seconds`;
        stmts.deleteStalePatterns.run(domain, this.config.minAccuracy, staleAge);

        // Build domain profile
        this._buildDomainProfile(domain, verifiedUrls);

        return {
            domain,
            urlCount: verifiedUrls.length,
            patternsLearned,
            patternGroups: patternGroups.size
        };
    }

    /**
     * Learn patterns from all domains with sufficient data
     * @param {number} [minUrls=10] - Minimum URLs per domain
     * @returns {Object} Overall learning results
     */
    learnFromAllDomains(minUrls = 10) {
        const stmts = this._getStatements();
        const domains = stmts.getDomainsWithContent.all(minUrls);

        const results = {
            domainsProcessed: 0,
            totalPatternsLearned: 0,
            domainResults: []
        };

        for (const { host, url_count } of domains) {
            try {
                const domainResult = this.learnPatternsFromDomain(host);
                results.domainResults.push(domainResult);
                results.domainsProcessed++;
                results.totalPatternsLearned += domainResult.patternsLearned;
            } catch (err) {
                this.logger.warn?.(`Failed to learn patterns for ${host}: ${err.message}`);
            }
        }

        return results;
    }

    /**
     * Group URLs by their structural pattern and classification
     * @param {Array} urls - Array of verified URL records
     * @returns {Map} Map of pattern key -> { pattern, classification, urls, description }
     */
    _groupByPattern(urls) {
        const groups = new Map();

        for (const urlRecord of urls) {
            try {
                const parsed = new URL(urlRecord.url);
                const pattern = this._extractPattern(parsed.pathname);
                const key = `${pattern}:${urlRecord.classification}`;

                if (!groups.has(key)) {
                    groups.set(key, {
                        pattern,
                        classification: urlRecord.classification,
                        description: this._describePattern(pattern),
                        urls: []
                    });
                }
                groups.get(key).urls.push(urlRecord);
            } catch {
                // Skip invalid URLs
                continue;
            }
        }

        return groups;
    }

    /**
     * Extract a regex pattern from a URL pathname
     * Patterns are anchored at start and require minimum depth for article patterns
     * @param {string} pathname - URL pathname
     * @returns {string} Regex pattern
     */
    _extractPattern(pathname) {
        const segments = pathname.split('/').filter(Boolean);
        
        // For articles, we need sufficient depth - shallow patterns are likely hubs
        // If the path has < 3 segments, mark it as potentially a hub pattern
        if (segments.length < 3) {
            // Short paths - keep as literal with end anchor to prevent over-matching
            return '^/' + segments.map(s => this._escapeRegex(s)).join('/') + '$';
        }
        
        const patternParts = segments.map(seg => {
            // Date components
            if (/^\d{4}$/.test(seg)) return '\\d{4}';
            if (/^\d{1,2}$/.test(seg) && parseInt(seg) <= 31) return '\\d{1,2}';
            
            // Month names (jan, feb, mar, etc.)
            if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(seg)) return seg.toLowerCase();
            
            // Hash/ID components
            if (/^[a-f0-9]{8,}$/i.test(seg)) return '[a-f0-9]+';
            if (/^\d{5,}$/.test(seg)) return '\\d+';
            
            // Long slugs (likely article titles)
            if (seg.length > 40) return '[^/]+';
            if (seg.includes('-') && seg.length > 20) return '[a-z0-9-]+';
            
            // Keep short, non-variable segments as literals
            return this._escapeRegex(seg);
        });

        // Add end anchor to prevent partial matches
        return '^/' + patternParts.join('/') + '$';
    }

    /**
     * Generate a human-readable description of a pattern
     * @param {string} pattern - Regex pattern
     * @returns {string} Description
     */
    _describePattern(pattern) {
        const parts = [];
        
        if (pattern.includes('\\d{4}')) parts.push('date-based');
        if (pattern.includes('[^/]+') || pattern.includes('[a-z0-9-]+')) parts.push('slug');
        if (pattern.includes('[a-f0-9]+')) parts.push('hash');
        
        // Count literal segments
        const literalCount = (pattern.match(/\/[a-z][a-z0-9-]*(?=\/|$)/gi) || []).length;
        if (literalCount > 0) parts.push(`${literalCount} section(s)`);
        
        return parts.join(', ') || 'generic';
    }

    /**
     * Build a domain classification profile from verified URLs
     * @param {string} domain - Domain
     * @param {Array} urls - Verified URLs
     */
    _buildDomainProfile(domain, urls) {
        const stmts = this._getStatements();
        
        // Get classification counts
        const counts = stmts.getClassificationCounts.all(domain);
        const countMap = new Map(counts.map(c => [c.classification, c.count]));
        
        // Group URLs by classification
        const byClass = {
            article: urls.filter(u => u.classification === 'article'),
            hub: urls.filter(u => ['hub', 'nav', 'place-hub', 'topic-hub'].includes(u.classification)),
            nav: urls.filter(u => u.classification === 'nav')
        };

        // Find common patterns for each classification
        const articlePattern = this._findCommonPattern(byClass.article);
        const hubPattern = this._findCommonPattern(byClass.hub);
        const navPattern = this._findCommonPattern(byClass.nav);

        // Extract common sections
        const sections = new Set();
        for (const urlRecord of urls) {
            try {
                const parsed = new URL(urlRecord.url);
                const firstSeg = parsed.pathname.split('/').filter(Boolean)[0];
                if (firstSeg && firstSeg.length < 30) {
                    sections.add(firstSeg);
                }
            } catch { /* skip */ }
        }

        // Detect date path format
        const datePath = this._detectDatePathFormat(urls);

        // Calculate profile confidence
        const totalVerified = urls.length;
        const confidence = Math.min(1.0, totalVerified / 100); // Max out at 100 verified URLs

        stmts.upsertDomainProfile.run(
            domain,
            articlePattern,
            hubPattern,
            navPattern,
            JSON.stringify([...sections].slice(0, 20)),
            datePath,
            null, // slug_characteristics - future enhancement
            countMap.get('article') || 0,
            (countMap.get('hub') || 0) + (countMap.get('nav') || 0),
            countMap.get('nav') || 0,
            confidence
        );
    }

    /**
     * Find the most common pattern among a set of URLs
     * @param {Array} urls - URL records
     * @returns {string|null} Most common pattern regex
     */
    _findCommonPattern(urls) {
        if (urls.length < 3) return null;

        // Extract patterns and count occurrences
        const patternCounts = new Map();
        
        for (const urlRecord of urls) {
            try {
                const parsed = new URL(urlRecord.url);
                const pattern = this._extractPattern(parsed.pathname);
                patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
            } catch { /* skip */ }
        }

        // Find most common pattern that covers at least 30% of URLs
        let bestPattern = null;
        let bestCount = 0;
        const threshold = urls.length * 0.3;

        for (const [pattern, count] of patternCounts) {
            if (count > bestCount && count >= threshold) {
                bestPattern = pattern;
                bestCount = count;
            }
        }

        return bestPattern;
    }

    /**
     * Detect the date path format used by a domain
     * @param {Array} urls - URL records
     * @returns {string|null} Date format description
     */
    _detectDatePathFormat(urls) {
        const formats = {
            'yyyy/mm/dd': 0,
            'yyyy/mm': 0,
            'yyyy-mm-dd': 0,
            'yyyy': 0,
            'none': 0
        };

        for (const urlRecord of urls) {
            const path = urlRecord.url.toLowerCase();
            
            if (/\/\d{4}\/\d{2}\/\d{2}\//.test(path)) {
                formats['yyyy/mm/dd']++;
            } else if (/\/\d{4}\/\d{2}\//.test(path)) {
                formats['yyyy/mm']++;
            } else if (/\/\d{4}-\d{2}-\d{2}\//.test(path)) {
                formats['yyyy-mm-dd']++;
            } else if (/\/\d{4}\//.test(path)) {
                formats['yyyy']++;
            } else {
                formats['none']++;
            }
        }

        // Return most common non-none format
        let bestFormat = 'none';
        let bestCount = 0;
        
        for (const [format, count] of Object.entries(formats)) {
            if (format !== 'none' && count > bestCount) {
                bestFormat = format;
                bestCount = count;
            }
        }

        return bestCount > 0 ? bestFormat : null;
    }

    /**
     * Escape special regex characters
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    _escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get learning statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const stats = {
            totalPatterns: 0,
            totalProfiles: 0,
            domainsWithPatterns: 0,
            avgPatternsPerDomain: 0,
            avgAccuracy: 0
        };

        try {
            const patternStats = this.db.prepare(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(DISTINCT domain) as domains,
                    AVG(accuracy) as avg_accuracy
                FROM url_classification_patterns
            `).get();

            const profileStats = this.db.prepare(`
                SELECT COUNT(*) as total
                FROM domain_classification_profiles
            `).get();

            stats.totalPatterns = patternStats.total;
            stats.domainsWithPatterns = patternStats.domains;
            stats.avgPatternsPerDomain = patternStats.domains > 0 
                ? (patternStats.total / patternStats.domains).toFixed(2) 
                : 0;
            stats.avgAccuracy = (patternStats.avg_accuracy || 0).toFixed(3);
            stats.totalProfiles = profileStats.total;
        } catch (err) {
            this.logger.warn?.(`Failed to get statistics: ${err.message}`);
        }

        return stats;
    }
}

module.exports = { UrlPatternLearningService };

