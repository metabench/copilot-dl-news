#!/usr/bin/env node
/**
 * Guardian URL patterns exploration check
 * Analyzes URL patterns in the database to find potential place hub pages
 * 
 * @module checks/guardian-urls.check
 */
'use strict';
const { openNewsCrawlerDb } = require('../src/db/openNewsCrawlerDb');
const path = require('path');

const db = openNewsCrawlerDb(path.join(__dirname, '..', 'data', 'news.db'), { readonly: true });
const diagnostics = db.placeHubDiagnostics;
if (!diagnostics) {
  throw new Error('news-crawler-db does not expose placeHubDiagnostics');
}

console.log('=== Guardian URL Pattern Analysis ===\n');

// 1. Count total Guardian URLs
const totalCount = diagnostics.countUrlsForHost('www.theguardian.com');
console.log(`Total Guardian URLs: ${totalCount}`);

// 2. Find distinct URL path patterns (first 2 segments)
console.log('\n--- Top URL Path Patterns (first segment) ---');
const pathPatterns = diagnostics.listFirstPathSegmentCountsForHost('www.theguardian.com', { limit: 20 });

for (const row of pathPatterns) {
  console.log(`  ${row.first_segment}: ${row.count}`);
}

// 3. Find /world/xxx patterns (known place hub pattern)
console.log('\n--- /world/{country} patterns ---');
const worldPatterns = diagnostics.listSlugCountsForHostPrefix('www.theguardian.com', '/world/', { limit: 30 });

for (const row of worldPatterns) {
  console.log(`  /world/${row.slug}: ${row.count} pages`);
}

// 4. Find potential index/hub pages (short URLs, many links to them)
console.log('\n--- Potential Index/Hub Pages (short URLs) ---');
const shortUrls = diagnostics.listShortUrlsForHost('www.theguardian.com', { maxLength: 50, limit: 20 });

for (const row of shortUrls) {
  console.log(`  ${row.url}`);
}

// 5. Check for /au, /us, /uk patterns (regional hubs)
console.log('\n--- Regional Hub Patterns ---');
const regionalPatterns = diagnostics.listUrlsMatchingPrefixesForHost(
  'www.theguardian.com',
  ['/au', '/us', '/uk', '/australia', '/us-news', '/uk-news'],
  { limit: 20 }
);

for (const row of regionalPatterns) {
  console.log(`  ${row.url}`);
}

// 6. Check existing place_page_mappings
console.log('\n--- Existing Place Mappings for Guardian ---');
const mappings = diagnostics.listPlacePageMappingsWithPreferredNames('www.theguardian.com', {
  orderBy: 'placeName',
  limit: 30
});

console.log(`Found ${mappings.length} mappings (showing first 30):`);
for (const row of mappings) {
  console.log(`  [${row.status}] ${row.place_name}: ${row.url}`);
}

// 7. Find potential place-like URL slugs at root level
console.log('\n--- Root-level Country/Place Slugs ---');
const rootPlaces = diagnostics.listRootLevelCandidateUrlsForHost('www.theguardian.com', {
  excludedUrlLikePatterns: ['%/20%', '%article%', '%live%'],
  limit: 40
});

for (const row of rootPlaces) {
  console.log(`  ${row.url}`);
}

// 8. Find /world/ sub-sections that look like places
console.log('\n--- /world/ Place-like Subsections ---');
const worldPlaces = diagnostics.listSlugCountsForHostPrefix('www.theguardian.com', '/world/', {
  excludeNumeric: true,
  excludedUrlLikePatterns: ['%/article/%', '%/live/%', '%/video/%', '%/gallery/%'],
  excludedSlugs: ['series', 'ng-interactive', 'commentisfree'],
  minSlugLength: 2,
  limit: 30
});

for (const row of worldPlaces) {
  console.log(`  /world/${row.slug}: ${row.count} pages`);
}

db.close();
console.log('\n=== Check Complete ===');
