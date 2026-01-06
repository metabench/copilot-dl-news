#!/usr/bin/env node
/**
 * URL-Only Place Detection Benchmark
 * 
 * Measures performance of detecting places from URL paths only,
 * without loading or parsing HTML content.
 * 
 * Uses the deterministic 2000-URL fixture.
 * 
 * Usage:
 *   node labs/db-access-patterns/benchmarks/url-place-detection.bench.js
 *   node labs/db-access-patterns/benchmarks/url-place-detection.bench.js --json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../../../src/db/sqlite');
const { buildGazetteerMatchers, extractPlacesFromUrl } = require('../../../src/analysis/place-extraction');

const JSON_OUTPUT = process.argv.includes('--json');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// ============================================================================
// Helpers
// ============================================================================

function log(...args) {
  if (!JSON_OUTPUT) console.log(...args);
}

function loadFixture() {
  const fixturePath = path.join(__dirname, '../fixtures/urls-with-content-2000.json');
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found. Run: node labs/db-access-patterns/generate-url-fixture.js`);
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
}

function formatMs(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatOps(opsPerSec) {
  if (opsPerSec >= 1000) return `${(opsPerSec / 1000).toFixed(1)}K`;
  return opsPerSec.toFixed(0);
}

// ============================================================================
// Benchmark Class
// ============================================================================

class PlaceDetectionBenchmark {
  constructor(db, urls) {
    this.db = db;
    this.urls = urls;
    this.results = {};
    this.matchers = null;
  }

  /**
   * Time how long it takes to build the in-memory gazetteer index
   */
  benchmarkMatcherBuild() {
    const iterations = 5; // Building is expensive, fewer iterations
    let totalMs = 0;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      this.matchers = buildGazetteerMatchers(this.db);
      const elapsed = performance.now() - start;
      totalMs += elapsed;
    }

    // Keep the last built matchers for later benchmarks
    const avgMs = totalMs / iterations;
    const placeCount = this.matchers.placeIndex.size;
    const slugCount = this.matchers.slugMap.size;

    this.results.matcher_build = {
      iterations,
      totalMs: Math.round(totalMs),
      avgMs: avgMs.toFixed(2),
      placeCount,
      slugCount
    };

    log(`  matcher_build: ${formatMs(avgMs)} avg (${placeCount} places, ${slugCount} slugs)`);
    return this.results.matcher_build;
  }

  /**
   * Benchmark single URL extraction (sequential)
   * 
   * Uses bestChain for disambiguated/deduped places
   */
  benchmarkSingleUrlExtraction() {
    if (!this.matchers) this.matchers = buildGazetteerMatchers(this.db);

    const start = performance.now();
    let totalPlaces = 0;
    let urlsWithPlaces = 0;

    for (const urlData of this.urls) {
      const result = extractPlacesFromUrl(urlData.url, this.matchers, { includeTopics: true });
      // Use bestChain for disambiguated result, not raw matches
      const places = result.bestChain?.places || [];
      if (places.length > 0) {
        totalPlaces += places.length;
        urlsWithPlaces++;
      }
    }

    const elapsed = performance.now() - start;
    const avgMs = elapsed / this.urls.length;
    const opsPerSec = Math.round(1000 / avgMs);

    this.results.single_url_extraction = {
      urlCount: this.urls.length,
      totalMs: Math.round(elapsed),
      avgMs: avgMs.toFixed(4),
      opsPerSec,
      totalPlaces,
      urlsWithPlaces,
      placesPerUrl: (totalPlaces / this.urls.length).toFixed(2)
    };

    log(`  single_url_extraction: ${formatOps(opsPerSec)} ops/sec, ${formatMs(avgMs)} avg`);
    log(`    → ${urlsWithPlaces}/${this.urls.length} URLs had places, ${totalPlaces} total detections`);
    return this.results.single_url_extraction;
  }

  /**
   * Benchmark URL parsing overhead (without place detection)
   */
  benchmarkUrlParsingOnly() {
    const start = performance.now();

    for (const urlData of this.urls) {
      const parsed = new URL(urlData.url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      // Just iterate segments like the real code does
      for (const seg of segments) {
        const lower = seg.toLowerCase();
        const slug = lower.replace(/[^a-z0-9]+/g, '-');
        void slug; // Use it to prevent optimization away
      }
    }

    const elapsed = performance.now() - start;
    const avgMs = elapsed / this.urls.length;
    const opsPerSec = Math.round(1000 / avgMs);

    this.results.url_parsing_only = {
      urlCount: this.urls.length,
      totalMs: Math.round(elapsed),
      avgMs: avgMs.toFixed(4),
      opsPerSec
    };

    log(`  url_parsing_only: ${formatOps(opsPerSec)} ops/sec, ${formatMs(avgMs)} avg (no place lookup)`);
    return this.results.url_parsing_only;
  }

  /**
   * Benchmark slug lookup (the core operation)
   */
  benchmarkSlugLookup() {
    if (!this.matchers) this.matchers = buildGazetteerMatchers(this.db);

    // Extract all slugs from all URLs first
    const allSlugs = [];
    for (const urlData of this.urls) {
      try {
        const parsed = new URL(urlData.url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        for (const seg of segments) {
          const slug = seg.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          if (slug.length >= 2 && slug.length <= 50) {
            allSlugs.push(slug);
          }
        }
      } catch (_) {
        // Skip invalid URLs
      }
    }

    log(`    (${allSlugs.length} slugs extracted from ${this.urls.length} URLs)`);

    // Benchmark the slug lookup
    const start = performance.now();
    let hits = 0;

    for (const slug of allSlugs) {
      const candidates = this.matchers.slugMap.get(slug);
      if (candidates && candidates.length > 0) {
        hits++;
      }
    }

    const elapsed = performance.now() - start;
    const avgMs = elapsed / allSlugs.length;
    const opsPerSec = Math.round(1000 / avgMs);

    this.results.slug_lookup = {
      slugCount: allSlugs.length,
      totalMs: Math.round(elapsed),
      avgMs: avgMs.toFixed(6),
      opsPerSec,
      hits,
      hitRate: (hits / allSlugs.length * 100).toFixed(1) + '%'
    };

    log(`  slug_lookup: ${formatOps(opsPerSec)} ops/sec, ${formatMs(avgMs)} avg`);
    log(`    → ${hits}/${allSlugs.length} slugs matched (${this.results.slug_lookup.hitRate})`);
    return this.results.slug_lookup;
  }

  /**
   * Benchmark batch URL extraction (all at once)
   */
  benchmarkBatchUrlExtraction() {
    if (!this.matchers) this.matchers = buildGazetteerMatchers(this.db);

    const iterations = 3;
    let totalMs = 0;
    let lastResults = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      lastResults = [];

      for (const urlData of this.urls) {
        const result = extractPlacesFromUrl(urlData.url, this.matchers, { includeTopics: true });
        lastResults.push({
          urlId: urlData.urlId,
          places: result.matches || [],
          topics: result.topics || []
        });
      }

      totalMs += performance.now() - start;
    }

    const avgIterMs = totalMs / iterations;
    const avgPerUrlMs = avgIterMs / this.urls.length;
    const opsPerSec = Math.round(1000 / avgPerUrlMs);

    // Analyze results
    const urlsWithPlaces = lastResults.filter(r => r.places.length > 0).length;
    const totalPlaces = lastResults.reduce((sum, r) => sum + r.places.length, 0);
    const urlsWithTopics = lastResults.filter(r => r.topics.length > 0).length;

    this.results.batch_url_extraction = {
      iterations,
      urlCount: this.urls.length,
      totalMs: Math.round(totalMs),
      avgIterMs: avgIterMs.toFixed(2),
      avgPerUrlMs: avgPerUrlMs.toFixed(4),
      opsPerSec,
      urlsWithPlaces,
      urlsWithTopics,
      totalPlaces
    };

    log(`  batch_url_extraction: ${formatOps(opsPerSec)} URLs/sec over ${iterations} iterations`);
    log(`    → ${urlsWithPlaces} URLs with places, ${urlsWithTopics} with topics`);
    return this.results.batch_url_extraction;
  }

  /**
   * Run all benchmarks and return results
   */
  runAll() {
    log('\n═══════════════════════════════════════════════════════════════');
    log('  URL-Only Place Detection Benchmark');
    log('═══════════════════════════════════════════════════════════════\n');

    log(`📊 Running with ${this.urls.length} URLs\n`);

    log('1. Matcher Build (loading gazetteer into memory)');
    this.benchmarkMatcherBuild();

    log('\n2. URL Parsing Only (baseline - no place detection)');
    this.benchmarkUrlParsingOnly();

    log('\n3. Slug Lookup (in-memory Map lookup)');
    this.benchmarkSlugLookup();

    log('\n4. Single URL Extraction (full pipeline)');
    this.benchmarkSingleUrlExtraction();

    log('\n5. Batch URL Extraction (3 iterations for stability)');
    this.benchmarkBatchUrlExtraction();

    log('\n═══════════════════════════════════════════════════════════════');
    log('  Summary');
    log('═══════════════════════════════════════════════════════════════\n');

    const matcherBuildMs = parseFloat(this.results.matcher_build.avgMs);
    const urlsPerSec = this.results.batch_url_extraction.opsPerSec;
    const timeFor2000 = 2000 / urlsPerSec * 1000;

    log(`  Matcher build time: ${formatMs(matcherBuildMs)}`);
    log(`  Places loaded: ${this.results.matcher_build.placeCount}`);
    log(`  Slugs indexed: ${this.results.matcher_build.slugCount}`);
    log(`  URLs/second: ${formatOps(urlsPerSec)}`);
    log(`  Time for 2000 URLs: ${formatMs(timeFor2000)}`);
    log(`  Detection rate: ${this.results.batch_url_extraction.urlsWithPlaces}/${this.urls.length} (${(this.results.batch_url_extraction.urlsWithPlaces / this.urls.length * 100).toFixed(1)}%)`);

    log('\n💡 Key Insights:');
    const parsingOps = this.results.url_parsing_only.opsPerSec;
    const extractionOps = this.results.single_url_extraction.opsPerSec;
    const lookupOps = this.results.slug_lookup.opsPerSec;

    log(`   - Pure parsing: ${formatOps(parsingOps)} ops/sec`);
    log(`   - Slug lookup: ${formatOps(lookupOps)} ops/sec (in-memory Map)`);
    log(`   - Full extraction: ${formatOps(extractionOps)} ops/sec`);
    log(`   - Extraction overhead: ${(1 - extractionOps / parsingOps).toFixed(1)}x slower than parsing alone`);

    log('\n═══════════════════════════════════════════════════════════════\n');

    return {
      timestamp: new Date().toISOString(),
      urlCount: this.urls.length,
      benchmarks: this.results,
      summary: {
        matcherBuildMs,
        placesLoaded: this.results.matcher_build.placeCount,
        slugsIndexed: this.results.matcher_build.slugCount,
        urlsPerSec,
        timeFor2000UrlsMs: timeFor2000,
        detectionRate: (this.results.batch_url_extraction.urlsWithPlaces / this.urls.length * 100).toFixed(1) + '%'
      }
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const dbPath = path.join(__dirname, '../../../data/news.db');
  const db = ensureDatabase(dbPath, { readonly: true });

  try {
    const fixture = loadFixture();
    log(`Loaded ${fixture.urls.length} URLs from fixture`);

    const benchmark = new PlaceDetectionBenchmark(db, fixture.urls);
    const results = benchmark.runAll();

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(results, null, 2));
    }

    // Save results
    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const resultsPath = path.join(resultsDir, `url-place-detection-${date}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    log(`Results saved to: ${resultsPath}`);

  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
