/**
 * Migration: Add URL Classification Tables
 * 
 * Creates tables for:
 * 1. url_classifications - Stores predicted classifications for unfetched URLs
 * 2. url_classification_patterns - Stores learned URL patterns for classification
 * 
 * This enables the system to distinguish between:
 * - URL-only predictions (lower confidence, from patterns)
 * - Content-verified classifications (high confidence, from analysis)
 */
'use strict';

const MIGRATION_VERSION = 37; // Increment from current max version

/**
 * Apply the migration
 * @param {Database} db - Better-sqlite3 database instance
 */
function up(db) {
    // Table 1: URL Classifications (predictions for unfetched URLs)
    db.exec(`
        CREATE TABLE IF NOT EXISTS url_classifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url_id INTEGER NOT NULL REFERENCES urls(id),
            predicted_classification TEXT NOT NULL,
            confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0),
            prediction_source TEXT NOT NULL,
            pattern_matched TEXT,
            similar_url_id INTEGER REFERENCES urls(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            verified_at TEXT,
            verified_classification TEXT,
            verification_match INTEGER
        );
        
        CREATE INDEX IF NOT EXISTS idx_url_classifications_url 
            ON url_classifications(url_id);
        CREATE INDEX IF NOT EXISTS idx_url_classifications_predicted 
            ON url_classifications(predicted_classification);
        CREATE INDEX IF NOT EXISTS idx_url_classifications_confidence 
            ON url_classifications(confidence DESC);
        CREATE INDEX IF NOT EXISTS idx_url_classifications_verified 
            ON url_classifications(verified_at);
        CREATE INDEX IF NOT EXISTS idx_url_classifications_source 
            ON url_classifications(prediction_source);
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_url_classification_source
            ON url_classifications(url_id, prediction_source);
    `);

    // Table 2: URL Classification Patterns (learned from verified data)
    db.exec(`
        CREATE TABLE IF NOT EXISTS url_classification_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            pattern_regex TEXT NOT NULL,
            pattern_description TEXT,
            classification TEXT NOT NULL,
            sample_count INTEGER DEFAULT 0,
            verified_count INTEGER DEFAULT 0,
            correct_count INTEGER DEFAULT 0,
            accuracy REAL,
            last_verified_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_url_patterns_domain 
            ON url_classification_patterns(domain);
        CREATE INDEX IF NOT EXISTS idx_url_patterns_accuracy 
            ON url_classification_patterns(accuracy DESC);
        CREATE INDEX IF NOT EXISTS idx_url_patterns_classification
            ON url_classification_patterns(classification);
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_url_pattern
            ON url_classification_patterns(domain, pattern_regex);
    `);

    // Table 3: Domain classification profiles
    db.exec(`
        CREATE TABLE IF NOT EXISTS domain_classification_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL UNIQUE,
            article_pattern TEXT,
            hub_pattern TEXT,
            nav_pattern TEXT,
            common_sections TEXT,
            date_path_format TEXT,
            slug_characteristics TEXT,
            verified_article_count INTEGER DEFAULT 0,
            verified_hub_count INTEGER DEFAULT 0,
            verified_nav_count INTEGER DEFAULT 0,
            profile_confidence REAL DEFAULT 0.0,
            last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_domain_profiles_confidence
            ON domain_classification_profiles(profile_confidence DESC);
    `);

    // Record migration
    db.prepare(`
        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at, description)
        VALUES (?, ?, datetime('now'), ?)
    `).run(
        MIGRATION_VERSION,
        'add-url-classification-tables',
        'Adds tables for URL-based classification predictions and pattern learning'
    );

    console.log(`✅ Migration ${MIGRATION_VERSION}: Added URL classification tables`);
}

/**
 * Rollback the migration
 * @param {Database} db - Better-sqlite3 database instance
 */
function down(db) {
    db.exec(`
        DROP TABLE IF EXISTS url_classifications;
        DROP TABLE IF EXISTS url_classification_patterns;
        DROP TABLE IF EXISTS domain_classification_profiles;
        
        DELETE FROM schema_migrations WHERE version = ${MIGRATION_VERSION};
    `);

    console.log(`✅ Rollback ${MIGRATION_VERSION}: Removed URL classification tables`);
}

/**
 * Check if migration has been applied
 * @param {Database} db
 * @returns {boolean}
 */
function isApplied(db) {
    try {
        const row = db.prepare(
            'SELECT 1 FROM schema_migrations WHERE version = ?'
        ).get(MIGRATION_VERSION);
        return !!row;
    } catch {
        return false;
    }
}

module.exports = {
    version: MIGRATION_VERSION,
    name: 'add-url-classification-tables',
    up,
    down,
    isApplied
};

// Run directly if called as script
if (require.main === module) {
    const Database = require('better-sqlite3');
    const path = require('path');
    
    const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
    console.log('Opening database:', dbPath);
    
    const db = new Database(dbPath);
    
    if (isApplied(db)) {
        console.log('Migration already applied');
    } else {
        console.log('Applying migration...');
        up(db);
    }
    
    // Verify tables exist
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name IN ('url_classifications', 'url_classification_patterns', 'domain_classification_profiles')
    `).all();
    console.log('Tables present:', tables.map(t => t.name).join(', '));
    
    db.close();
}
