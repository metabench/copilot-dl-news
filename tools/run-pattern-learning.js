/**
 * Run initial URL pattern learning from verified classifications
 * 
 * This script populates url_classification_patterns and domain_classification_profiles
 * from the ~40k existing verified article classifications.
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const { UrlPatternLearningService } = require('../src/services/UrlPatternLearningService.js');

const dbPath = path.join(__dirname, '..', 'data', 'news.db');
console.log('Opening database:', dbPath);

const db = new Database(dbPath);

// Create the learning service
const learner = new UrlPatternLearningService({ 
    db, 
    config: {
        minSampleSize: 3,  // Require at least 3 URLs to create a pattern
        minAccuracy: 0.5   // Keep patterns with 50%+ accuracy
    }
});

console.log('\n📚 Starting URL pattern learning...\n');

// Learn from all domains with at least 10 verified URLs
const results = learner.learnFromAllDomains(10);

console.log('\n📊 Learning Results:');
console.log(`   Domains processed: ${results.domainsProcessed}`);
console.log(`   Total patterns learned: ${results.totalPatternsLearned}`);

// Show top domains by patterns learned
const topDomains = results.domainResults
    .filter(r => r.patternsLearned > 0)
    .sort((a, b) => b.patternsLearned - a.patternsLearned)
    .slice(0, 10);

if (topDomains.length > 0) {
    console.log('\n🏆 Top domains by patterns learned:');
    topDomains.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.domain}: ${r.patternsLearned} patterns (${r.urlCount} URLs)`);
    });
}

// Get overall statistics
const stats = learner.getStatistics();
console.log('\n📈 Final Statistics:');
console.log(`   Total patterns: ${stats.totalPatterns}`);
console.log(`   Domains with patterns: ${stats.domainsWithPatterns}`);
console.log(`   Average patterns/domain: ${stats.avgPatternsPerDomain}`);
console.log(`   Average accuracy: ${stats.avgAccuracy}`);
console.log(`   Domain profiles: ${stats.totalProfiles}`);

// Show sample patterns
console.log('\n🔍 Sample learned patterns:');
const samplePatterns = db.prepare(`
    SELECT domain, pattern_regex, classification, sample_count
    FROM url_classification_patterns
    ORDER BY sample_count DESC
    LIMIT 10
`).all();

samplePatterns.forEach(p => {
    console.log(`   ${p.domain}: ${p.pattern_regex}`);
    console.log(`      → ${p.classification} (${p.sample_count} samples)\n`);
});

// Show sample domain profiles
console.log('🏠 Sample domain profiles:');
const sampleProfiles = db.prepare(`
    SELECT domain, verified_article_count, profile_confidence, article_pattern, date_path_format
    FROM domain_classification_profiles
    ORDER BY verified_article_count DESC
    LIMIT 5
`).all();

sampleProfiles.forEach(p => {
    console.log(`   ${p.domain}:`);
    console.log(`      Articles: ${p.verified_article_count}, Confidence: ${p.profile_confidence.toFixed(2)}`);
    console.log(`      Date format: ${p.date_path_format || 'none'}`);
    if (p.article_pattern) {
        console.log(`      Pattern: ${p.article_pattern}`);
    }
    console.log();
});

db.close();
console.log('\n✅ Pattern learning complete!');
