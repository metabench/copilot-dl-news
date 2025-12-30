#!/usr/bin/env node
'use strict';

/**
 * Check: ContentConfidenceScorer
 * 
 * Verifies the confidence scoring algorithm works correctly.
 */

const { ContentConfidenceScorer } = require('../src/analysis/ContentConfidenceScorer');

function check(name, condition, expected, actual) {
  const pass = condition;
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    process.exitCode = 1;
  }
  return pass;
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('Check: ContentConfidenceScorer');
console.log('═══════════════════════════════════════════════════════════════\n');

const scorer = new ContentConfidenceScorer();

// Test 1: Empty extraction
const empty = scorer.score(null);
check('Empty extraction score = 0', empty.score === 0, 0, empty.score);
check('Empty extraction level = none', empty.level === 'none', 'none', empty.level);

// Test 2: Minimal extraction (just title)
const minimal = scorer.score({ title: 'Test Article' });
check('Minimal extraction has score > 0', minimal.score > 0, '> 0', minimal.score);
check('Minimal extraction level = low', minimal.level === 'low', 'low', minimal.level);

// Test 3: Good extraction
const good = scorer.score({
  title: 'How Climate Change is Affecting Coastal Cities',
  wordCount: 800,
  date: '2025-12-20',
  author: 'Jane Smith',
  section: 'Environment',
  readability: {
    content: '<p>Long article content here...</p>'.repeat(50),
    title: 'How Climate Change is Affecting Coastal Cities',
    byline: 'By Jane Smith',
    excerpt: 'A comprehensive look at the impact of rising sea levels...'
  }
});
check('Good extraction score >= 0.7', good.score >= 0.7, '>= 0.7', good.score);
check('Good extraction level = good or high', ['good', 'high'].includes(good.level), 'good or high', good.level);
check('Good extraction needsTeacherReview = false', good.needsTeacherReview === false, false, good.needsTeacherReview);

// Test 4: Poor extraction (garbage title)
const poor = scorer.score({
  title: 'Loading...',
  wordCount: 50
});
check('Poor extraction score < 0.5', poor.score < 0.5, '< 0.5', poor.score);
check('Poor extraction needsTeacherReview = true', poor.needsTeacherReview === true, true, poor.needsTeacherReview);

// Test 5: Title quality scoring
const titleTests = [
  { title: null, expectedMax: 0.5 },  // No title but has word count
  { title: 'Hi', expectedMax: 0.5 },
  { title: 'Loading...', expectedMax: 0.5 },
  { title: 'A Normal Article Title About Something', expectedMin: 0.6 }
];

for (const t of titleTests) {
  const result = scorer.score({ title: t.title, wordCount: 500 });
  if (t.expectedMax !== undefined) {
    check(`Title "${t.title}" score <= ${t.expectedMax}`, result.score <= t.expectedMax, `<= ${t.expectedMax}`, result.score);
  }
  if (t.expectedMin !== undefined) {
    check(`Title "${t.title}" score >= ${t.expectedMin}`, result.score >= t.expectedMin, `>= ${t.expectedMin}`, result.score);
  }
}

// Test 6: Date validation
const validDate = scorer.score({ title: 'Test', wordCount: 500, date: '2025-12-15' });
const invalidDate = scorer.score({ title: 'Test', wordCount: 500, date: 'not-a-date' });
const futureDate = scorer.score({ title: 'Test', wordCount: 500, date: '2030-01-01' });
const oldDate = scorer.score({ title: 'Test', wordCount: 500, date: '1980-01-01' });

check('Valid date gets higher score', validDate.score > invalidDate.score, '> invalid', `valid=${validDate.score} invalid=${invalidDate.score}`);
check('Far future date treated as invalid', futureDate.factors.metadata.hasDate === false, false, futureDate.factors.metadata.hasDate);
check('Too old date treated as invalid', oldDate.factors.metadata.hasDate === false, false, oldDate.factors.metadata.hasDate);

// Test 7: Factors structure
check('Result has factors object', typeof good.factors === 'object', 'object', typeof good.factors);
check('Factors include title', 'title' in good.factors, true, 'title' in good.factors);
check('Factors include length', 'length' in good.factors, true, 'length' in good.factors);
check('Factors include metadata', 'metadata' in good.factors, true, 'metadata' in good.factors);

// Test 8: Recommendation
check('High score recommendation = accept', good.recommendation === 'accept' || good.recommendation === 'accept-with-caution', 'accept*', good.recommendation);
check('Low score recommendation includes review', poor.recommendation.includes('review') || poor.recommendation.includes('teacher'), 'review/teacher', poor.recommendation);

console.log('\n───────────────────────────────────────────────────────────────');
console.log(process.exitCode ? '❌ Some checks failed' : '✅ All checks passed');
console.log('───────────────────────────────────────────────────────────────\n');
