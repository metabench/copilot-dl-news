'use strict';

/**
 * Test optimizations for Place Hub Guessing Matrix queries.
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '../../../data/news.db');
const db = Database(dbPath, { readonly: true });

function benchmark(name, fn, iterations = 10) {
  fn(); // warmup
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
    p50: times[Math.floor(times.length * 0.5)].toFixed(2),
    min: times[0].toFixed(2)
  };
}

console.log('=== Testing Query Optimizations ===\n');

// ============= OPTIMIZATION 1: selectPlaces =============
console.log('--- OPTIMIZATION 1: selectPlaces ---\n');

// Current query with correlated subquery
const currentPlacesQuery = `
  SELECT
    p.id AS place_id,
    p.kind AS place_kind,
    p.country_code,
    p.population,
    COALESCE(
      pn.name,
      (
        SELECT pn2.name
        FROM place_names pn2
        WHERE pn2.place_id = p.id
        ORDER BY COALESCE(pn2.is_preferred, 0) DESC, COALESCE(pn2.is_official, 0) DESC, pn2.id ASC
        LIMIT 1
      ),
      p.country_code,
      CAST(p.id AS TEXT)
    ) AS place_name
  FROM places p
  LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
  WHERE p.kind = 'city'
    AND COALESCE(p.status, 'current') = 'current'
  ORDER BY p.population DESC NULLS LAST, place_name ASC
  LIMIT 200
`;

// Optimized: Rely more on canonical_name_id (which most places should have)
const optimizedPlacesQuery = `
  SELECT
    p.id AS place_id,
    p.kind AS place_kind,
    p.country_code,
    p.population,
    COALESCE(pn.name, p.country_code, CAST(p.id AS TEXT)) AS place_name
  FROM places p
  LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
  WHERE p.kind = 'city'
    AND COALESCE(p.status, 'current') = 'current'
  ORDER BY p.population DESC NULLS LAST
  LIMIT 200
`;

// Optimized with covering index hint
const optimizedPlacesQueryV2 = `
  SELECT
    p.id AS place_id,
    p.kind AS place_kind,
    p.country_code,
    p.population,
    pn.name AS place_name
  FROM places p
  INNER JOIN place_names pn ON pn.id = p.canonical_name_id
  WHERE p.kind = 'city'
    AND p.status = 'current'
  ORDER BY p.population DESC
  LIMIT 200
`;

const results = [];

results.push(benchmark('Current selectPlaces (city)', () => {
  db.prepare(currentPlacesQuery).all();
}));

results.push(benchmark('Optimized selectPlaces (no subquery)', () => {
  db.prepare(optimizedPlacesQuery).all();
}));

results.push(benchmark('Optimized selectPlaces v2 (INNER JOIN)', () => {
  db.prepare(optimizedPlacesQueryV2).all();
}));

// Check row counts to ensure optimizations don't break functionality
console.log('Row counts:');
console.log('  Current:', db.prepare(currentPlacesQuery).all().length);
console.log('  Optimized:', db.prepare(optimizedPlacesQuery).all().length);
console.log('  Optimized v2:', db.prepare(optimizedPlacesQueryV2).all().length);

console.log('\n');

// ============= OPTIMIZATION 2: getHostPageCountMap =============
console.log('--- OPTIMIZATION 2: getHostPageCountMap ---\n');

// Simulate the hosts we'd query
const hosts = ['theguardian.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'reuters.com', 
               'nytimes.com', 'washingtonpost.com', 'aljazeera.com', 'dw.com', 'france24.com'];
const expandedHosts = [];
for (const h of hosts) {
  expandedHosts.push(h);
  expandedHosts.push('www.' + h);
}
const hostPlaceholders = expandedHosts.map(() => '?').join(',');

// Current: COUNT from http_responses + urls JOIN
const currentHostCount = `
  SELECT 
    u.host,
    COUNT(*) AS page_count,
    SUM(CASE WHEN hr.http_status = 200 THEN 1 ELSE 0 END) AS successful_pages
  FROM http_responses hr
  JOIN urls u ON u.id = hr.url_id
  WHERE u.host IN (${hostPlaceholders})
  GROUP BY u.host
`;

// Alternative 1: Use domains table if it has page counts
const domainsQuery = `
  SELECT host, 
         COALESCE(url_count, 0) AS page_count
  FROM domains
  WHERE host IN (${hostPlaceholders})
`;

// Alternative 2: Use a CTE to avoid repeated JOINs
const cteQuery = `
  WITH host_urls AS (
    SELECT id, host FROM urls WHERE host IN (${hostPlaceholders})
  )
  SELECT 
    hu.host,
    COUNT(*) AS page_count,
    SUM(CASE WHEN hr.http_status = 200 THEN 1 ELSE 0 END) AS successful_pages
  FROM host_urls hu
  JOIN http_responses hr ON hr.url_id = hu.id
  GROUP BY hu.host
`;

results.push(benchmark('Current getHostPageCountMap', () => {
  db.prepare(currentHostCount).all(...expandedHosts);
}));

// Check if domains table exists and has url_count
try {
  const domainsHaveUrlCount = db.prepare(domainsQuery).all(...expandedHosts);
  console.log('Domains table has url_count:', domainsHaveUrlCount.length > 0);
  results.push(benchmark('Alternative: Use domains.url_count', () => {
    db.prepare(domainsQuery).all(...expandedHosts);
  }));
} catch (e) {
  console.log('Domains table check failed:', e.message);
}

results.push(benchmark('Alternative: CTE approach', () => {
  db.prepare(cteQuery).all(...expandedHosts);
}));

// ============= OPTIMIZATION 3: Caching =============
console.log('\n--- OPTIMIZATION 3: Caching Strategy ---\n');

// Test: If we cache host page counts (they don't change rapidly), 
// how much time do we save?
const cachedHostCounts = new Map();
const firstRun = db.prepare(currentHostCount).all(...expandedHosts);
for (const row of firstRun) {
  cachedHostCounts.set(row.host, row);
}

results.push(benchmark('Simulated cached lookup (Map.get)', () => {
  const result = [];
  for (const h of expandedHosts) {
    const cached = cachedHostCounts.get(h);
    if (cached) result.push(cached);
  }
}));

// Print all results
console.log('\n=== BENCHMARK RESULTS ===\n');
console.log('| Query | Avg (ms) | P50 (ms) | Min (ms) |');
console.log('|-------|----------|----------|----------|');
for (const r of results) {
  console.log(`| ${r.name} | ${r.avg} | ${r.p50} | ${r.min} |`);
}

// ============= RECOMMENDATIONS =============
console.log('\n=== RECOMMENDATIONS ===\n');

console.log('1. **selectPlaces optimization**: Remove correlated subquery');
console.log('   - Rely on canonical_name_id (most places have it)');
console.log('   - Fallback to country_code or place_id for rare cases');
console.log('   - Expected improvement: 35-40ms → 2-5ms\n');

console.log('2. **getHostPageCountMap optimization**: Cache host page counts');
console.log('   - Host page counts change slowly (only when crawls complete)');
console.log('   - Cache in memory with 5-minute TTL');
console.log('   - Expected improvement: 42ms → <1ms\n');

console.log('3. **Index recommendations**:');
// Check for missing index
const placesIdxPlan = db.prepare(`EXPLAIN QUERY PLAN ${optimizedPlacesQueryV2}`).all();
console.log('   Optimized selectPlaces query plan:');
for (const row of placesIdxPlan) {
  console.log(`     ${row.detail}`);
}

db.close();
