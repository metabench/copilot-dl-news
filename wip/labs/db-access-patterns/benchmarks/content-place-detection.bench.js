#!/usr/bin/env node
/**
 * Content-Based Place Detection Benchmark
 * 
 * Measures performance of detecting places from both URL paths AND page content.
 * Compares URL-only vs full content analysis.
 * 
 * NOTE: The database currently doesn't store extracted body_text. This benchmark
 * uses titles (which are available) and generates synthetic body text to measure
 * the text processing throughput. For real usage, you would need to:
 * 1. Decompress content from content_storage
 * 2. Parse HTML to extract article text
 * 3. Run place detection on the extracted text
 * 
 * Uses the deterministic 2000-URL fixture.
 * 
 * Usage:
 *   node labs/db-access-patterns/benchmarks/content-place-detection.bench.js
 *   node labs/db-access-patterns/benchmarks/content-place-detection.bench.js --json
 *   node labs/db-access-patterns/benchmarks/content-place-detection.bench.js --sample 100
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../../../src/db/sqlite');
const { 
  buildGazetteerMatchers, 
  extractPlacesFromUrl, 
  extractGazetteerPlacesFromText,
  inferContext,
  dedupeDetections
} = require('../../../src/analysis/place-extraction');

const JSON_OUTPUT = process.argv.includes('--json');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Sample size for content benchmarks (full content analysis is slow)
const sampleArg = process.argv.find(a => a.startsWith('--sample'));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1] || '200') : 200;

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

class ContentPlaceDetectionBenchmark {
  constructor(db, urls) {
    this.db = db;
    this.urls = urls;
    this.results = {};
    this.matchers = null;
    this.urlsWithContent = [];
  }

  /**
   * Load content from database for benchmark URLs.
   * 
   * NOTE: body_text is NULL for all records in content_analysis.
   * We load titles (which exist) and generate synthetic body text
   * for throughput testing.
   */
  loadContent() {
    log('Loading content from database...');
    
    const urlIds = this.urls.map(u => u.urlId);
    
    // Build query with placeholders - only require title, not body_text
    const placeholders = urlIds.map(() => '?').join(',');
    
    const query = `
      SELECT 
        u.id as url_id,
        u.url,
        ca.title,
        ca.word_count,
        ca.section
      FROM urls u
      JOIN http_responses hr ON hr.url_id = u.id
      JOIN content_storage cs ON cs.http_response_id = hr.id
      JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.id IN (${placeholders})
        AND ca.title IS NOT NULL
        AND LENGTH(ca.title) > 10
      ORDER BY u.id
    `;
    
    const rawContent = this.db.prepare(query).all(...urlIds);
    
    // Generate synthetic body text that includes realistic place mentions
    // This tests the text processing throughput with realistic data patterns
    this.urlsWithContent = rawContent.map(item => ({
      ...item,
      body_text: this.generateSyntheticBody(item.title, item.word_count || 500)
    }));
    
    log(`  Found ${this.urlsWithContent.length} URLs with titles`);
    
    if (this.urlsWithContent.length > 0) {
      const avgTextLen = Math.round(
        this.urlsWithContent.reduce((sum, u) => sum + (u.body_text?.length || 0), 0) / this.urlsWithContent.length
      );
      log(`  Average synthetic body length: ${avgTextLen.toLocaleString()} chars`);
      log(`  ⚠️  NOTE: Using synthetic body text (real body_text is NULL in DB)`);
    }
    
    return this.urlsWithContent.length;
  }

  /**
   * Generate synthetic body text for throughput testing.
   * 
   * Includes:
   * - The title repeated to simulate real headlines
   * - Common place name patterns to test detection
   * - Padding text to reach realistic article lengths
   */
  generateSyntheticBody(title, wordCount) {
    // Sample place names from the gazetteer to sprinkle in
    const samplePlaces = [
      'London', 'New York', 'Paris', 'Tokyo', 'Sydney',
      'Berlin', 'Moscow', 'Beijing', 'Mumbai', 'Cairo',
      'Los Angeles', 'Chicago', 'Toronto', 'Mexico City', 'Sao Paulo',
      'Washington', 'Manchester', 'Birmingham', 'Glasgow', 'Leeds'
    ];
    
    const sentences = [
      `${title}.`,
      'The situation continues to develop in the region.',
      'Officials say more updates will follow.',
      'Residents have been advised to stay informed.',
      'The impact has been felt across multiple areas.',
      'Experts predict significant changes ahead.',
      'Local authorities are monitoring the situation.',
      'The news has drawn international attention.',
      'Community leaders have responded to the developments.',
      'Further details are expected to emerge soon.'
    ];
    
    const parts = [];
    let currentWords = 0;
    const targetWords = Math.min(wordCount, 1500); // Cap at reasonable size
    
    // Add title
    parts.push(title);
    currentWords += title.split(/\s+/).length;
    
    // Add sentences with place mentions
    let sentenceIdx = 0;
    let placeIdx = 0;
    
    while (currentWords < targetWords) {
      // Occasionally insert a place mention
      if (currentWords % 50 < 10) {
        const place = samplePlaces[placeIdx % samplePlaces.length];
        parts.push(`The ${place} office reported similar findings.`);
        placeIdx++;
        currentWords += 7;
      } else {
        parts.push(sentences[sentenceIdx % sentences.length]);
        currentWords += sentences[sentenceIdx % sentences.length].split(/\s+/).length;
        sentenceIdx++;
      }
    }
    
    return parts.join(' ');
  }

  /**
   * Build matchers if needed
   */
  ensureMatchers() {
    if (!this.matchers) {
      const start = performance.now();
      this.matchers = buildGazetteerMatchers(this.db);
      const elapsed = performance.now() - start;
      log(`  Matchers built in ${formatMs(elapsed)}`);
    }
  }

  /**
   * Benchmark URL-only detection (baseline for comparison)
   * 
   * Uses bestChain for deduped/disambiguated results
   */
  benchmarkUrlOnly() {
    this.ensureMatchers();
    
    const sample = this.urlsWithContent.slice(0, SAMPLE_SIZE);
    const start = performance.now();
    let totalPlaces = 0;
    let urlsWithPlaces = 0;
    
    for (const item of sample) {
      const result = extractPlacesFromUrl(item.url, this.matchers, { includeTopics: false });
      
      // Use bestChain for the disambiguated result (not raw matches which has duplicates)
      const places = result.bestChain?.places || [];
      if (places.length > 0) {
        totalPlaces += places.length;
        urlsWithPlaces++;
      }
    }
    
    const elapsed = performance.now() - start;
    const avgMs = elapsed / sample.length;
    const opsPerSec = Math.round(1000 / avgMs);
    
    this.results.url_only = {
      sampleSize: sample.length,
      totalMs: Math.round(elapsed),
      avgMs: avgMs.toFixed(4),
      opsPerSec,
      urlsWithPlaces,
      totalPlaces,
      placesPerUrl: (totalPlaces / sample.length).toFixed(2)
    };
    
    log(`  url_only: ${formatOps(opsPerSec)} ops/sec, ${formatMs(avgMs)} avg`);
    log(`    → ${urlsWithPlaces}/${sample.length} URLs with places, ${totalPlaces} detections`);
    return this.results.url_only;
  }

  /**
   * Benchmark title-only detection
   */
  benchmarkTitleOnly() {
    this.ensureMatchers();
    
    const sample = this.urlsWithContent.slice(0, SAMPLE_SIZE);
    const start = performance.now();
    let totalPlaces = 0;
    let articlesWithPlaces = 0;
    
    for (const item of sample) {
      if (!item.title) continue;
      
      const context = inferContext(this.db, item.url, item.title, item.section);
      const places = extractGazetteerPlacesFromText(item.title, this.matchers, context, true);
      
      if (places.length > 0) {
        totalPlaces += places.length;
        articlesWithPlaces++;
      }
    }
    
    const elapsed = performance.now() - start;
    const avgMs = elapsed / sample.length;
    const opsPerSec = Math.round(1000 / avgMs);
    
    this.results.title_only = {
      sampleSize: sample.length,
      totalMs: Math.round(elapsed),
      avgMs: avgMs.toFixed(4),
      opsPerSec,
      articlesWithPlaces,
      totalPlaces,
      placesPerArticle: (totalPlaces / sample.length).toFixed(2)
    };
    
    log(`  title_only: ${formatOps(opsPerSec)} ops/sec, ${formatMs(avgMs)} avg`);
    log(`    → ${articlesWithPlaces}/${sample.length} titles with places, ${totalPlaces} detections`);
    return this.results.title_only;
  }

  /**
   * Benchmark body text detection (using synthetic body text)
   */
  benchmarkBodyText() {
    this.ensureMatchers();
    
    const sample = this.urlsWithContent.slice(0, SAMPLE_SIZE);
    const start = performance.now();
    let totalPlaces = 0;
    let articlesWithPlaces = 0;
    let totalChars = 0;
    
    for (const item of sample) {
      if (!item.body_text) continue;
      
      totalChars += item.body_text.length;
      const context = inferContext(this.db, item.url, item.title, item.section);
      const places = extractGazetteerPlacesFromText(item.body_text, this.matchers, context, false);
      
      if (places.length > 0) {
        totalPlaces += places.length;
        articlesWithPlaces++;
      }
    }
    
    const elapsed = performance.now() - start;
    const avgMs = elapsed / sample.length;
    const opsPerSec = Math.round(1000 / avgMs);
    const charsPerSec = elapsed > 0 ? Math.round(totalChars / (elapsed / 1000)) : 0;
    
    this.results.body_text = {
      sampleSize: sample.length,
      totalMs: Math.round(elapsed),
      avgMs: avgMs.toFixed(2),
      opsPerSec,
      articlesWithPlaces,
      totalPlaces,
      totalChars,
      avgCharsPerArticle: Math.round(totalChars / sample.length),
      charsPerSec,
      placesPerArticle: (totalPlaces / sample.length).toFixed(2),
      note: 'Using synthetic body text (real body_text is NULL in DB)'
    };
    
    log(`  body_text (synthetic): ${formatOps(opsPerSec)} ops/sec, ${formatMs(avgMs)} avg`);
    log(`    → ${articlesWithPlaces}/${sample.length} bodies with places, ${totalPlaces} detections`);
    log(`    → ${charsPerSec.toLocaleString()} chars/sec processed`);
    return this.results.body_text;
  }

  /**
   * Benchmark full pipeline: URL + title + body with deduplication
   */
  benchmarkFullPipeline() {
    this.ensureMatchers();
    
    const sample = this.urlsWithContent.slice(0, SAMPLE_SIZE);
    const start = performance.now();
    
    let totalRawPlaces = 0;
    let totalDedupedPlaces = 0;
    let articlesWithPlaces = 0;
    
    for (const item of sample) {
      const context = inferContext(this.db, item.url, item.title, item.section);
      const allPlaces = [];
      
      // 1. URL detection - use bestChain for disambiguated places
      const urlResult = extractPlacesFromUrl(item.url, this.matchers, { includeTopics: false });
      for (const match of (urlResult.bestChain?.places || [])) {
        allPlaces.push({
          source: 'url',
          place_id: match.placeId,
          name: match.place?.name,
          offset_start: 0,
          offset_end: item.url.length
        });
      }
      
      // 2. Title detection
      if (item.title) {
        for (const place of extractGazetteerPlacesFromText(item.title, this.matchers, context, true)) {
          allPlaces.push({
            source: 'title',
            ...place
          });
        }
      }
      
      // 3. Body detection
      if (item.body_text) {
        for (const place of extractGazetteerPlacesFromText(item.body_text, this.matchers, context, false)) {
          allPlaces.push({
            source: 'body',
            ...place
          });
        }
      }
      
      totalRawPlaces += allPlaces.length;
      
      // 4. Dedupe
      const deduped = dedupeDetections(allPlaces);
      totalDedupedPlaces += deduped.length;
      
      if (deduped.length > 0) {
        articlesWithPlaces++;
      }
    }
    
    const elapsed = performance.now() - start;
    const avgMs = elapsed / sample.length;
    const opsPerSec = Math.round(1000 / avgMs);
    
    this.results.full_pipeline = {
      sampleSize: sample.length,
      totalMs: Math.round(elapsed),
      avgMs: avgMs.toFixed(2),
      opsPerSec,
      articlesWithPlaces,
      totalRawPlaces,
      totalDedupedPlaces,
      dedupeRatio: totalRawPlaces > 0 ? (totalDedupedPlaces / totalRawPlaces * 100).toFixed(1) + '%' : 'N/A',
      placesPerArticle: (totalDedupedPlaces / sample.length).toFixed(2)
    };
    
    log(`  full_pipeline: ${formatOps(opsPerSec)} ops/sec, ${formatMs(avgMs)} avg`);
    log(`    → ${articlesWithPlaces}/${sample.length} articles with places`);
    log(`    → ${totalRawPlaces} raw → ${totalDedupedPlaces} deduped (${this.results.full_pipeline.dedupeRatio} kept)`);
    return this.results.full_pipeline;
  }

  /**
   * Benchmark content loading from DB (just title, not body_text)
   */
  benchmarkContentLoading() {
    const sample = this.urlsWithContent.slice(0, SAMPLE_SIZE);
    const urlIds = sample.map(u => u.url_id);
    const placeholders = urlIds.map(() => '?').join(',');
    
    const query = `
      SELECT 
        u.id as url_id,
        ca.title,
        ca.word_count,
        ca.section
      FROM urls u
      JOIN http_responses hr ON hr.url_id = u.id
      JOIN content_storage cs ON cs.http_response_id = hr.id
      JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.id IN (${placeholders})
    `;
    
    const stmt = this.db.prepare(query);
    
    const iterations = 5;
    let totalMs = 0;
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      stmt.all(...urlIds);
      totalMs += performance.now() - start;
    }
    
    const avgMs = totalMs / iterations;
    const opsPerSec = Math.round(1000 / avgMs * sample.length);
    
    this.results.content_loading = {
      sampleSize: sample.length,
      iterations,
      totalMs: Math.round(totalMs),
      avgBatchMs: avgMs.toFixed(2),
      avgPerRowMs: (avgMs / sample.length).toFixed(4),
      rowsPerSec: opsPerSec
    };
    
    log(`  content_loading: ${formatOps(opsPerSec)} rows/sec, ${formatMs(avgMs)} per batch of ${sample.length}`);
    return this.results.content_loading;
  }

  /**
   * Run all benchmarks and return results
   */
  runAll() {
    log('\n═══════════════════════════════════════════════════════════════');
    log('  Content-Based Place Detection Benchmark');
    log('═══════════════════════════════════════════════════════════════\n');

    const contentCount = this.loadContent();
    if (contentCount === 0) {
      log('❌ No content found for benchmark URLs!');
      return { error: 'No content found' };
    }

    log(`\n📊 Using sample of ${SAMPLE_SIZE} articles\n`);

    log('1. Content Loading (DB query performance)');
    this.benchmarkContentLoading();

    log('\n2. URL-Only Detection (baseline)');
    this.benchmarkUrlOnly();

    log('\n3. Title-Only Detection');
    this.benchmarkTitleOnly();

    log('\n4. Body Text Detection');
    this.benchmarkBodyText();

    log('\n5. Full Pipeline (URL + title + body + dedupe)');
    this.benchmarkFullPipeline();

    log('\n═══════════════════════════════════════════════════════════════');
    log('  Summary');
    log('═══════════════════════════════════════════════════════════════\n');

    const urlOps = this.results.url_only.opsPerSec;
    const titleOps = this.results.title_only.opsPerSec;
    const bodyOps = this.results.body_text.opsPerSec;
    const fullOps = this.results.full_pipeline.opsPerSec;

    log('  Detection Throughput:');
    log(`    URL-only:      ${formatOps(urlOps)} articles/sec`);
    log(`    Title-only:    ${formatOps(titleOps)} articles/sec`);
    log(`    Body-only:     ${formatOps(bodyOps)} articles/sec`);
    log(`    Full pipeline: ${formatOps(fullOps)} articles/sec`);

    log('\n  Detection Quality:');
    log(`    URL places/article:  ${this.results.url_only.placesPerUrl}`);
    log(`    Title places/article: ${this.results.title_only.placesPerArticle}`);
    log(`    Body places/article:  ${this.results.body_text.placesPerArticle}`);
    log(`    Full places/article:  ${this.results.full_pipeline.placesPerArticle}`);

    log('\n  Estimated Time for 2000 Articles:');
    log(`    URL-only:      ${formatMs(2000 / urlOps * 1000)}`);
    log(`    Full pipeline: ${formatMs(2000 / fullOps * 1000)}`);

    log('\n💡 Key Insights:');
    log(`   - Body text is ${(urlOps / bodyOps).toFixed(1)}x slower than URL-only`);
    log(`   - Full pipeline is ${(urlOps / fullOps).toFixed(1)}x slower than URL-only`);
    log(`   - Text processing: ${this.results.body_text.charsPerSec.toLocaleString()} chars/sec`);
    log(`   - Deduplication kept ${this.results.full_pipeline.dedupeRatio} of raw detections`);

    log('\n═══════════════════════════════════════════════════════════════\n');

    return {
      timestamp: new Date().toISOString(),
      sampleSize: SAMPLE_SIZE,
      urlsWithContent: this.urlsWithContent.length,
      benchmarks: this.results,
      summary: {
        urlOnlyOps: urlOps,
        fullPipelineOps: fullOps,
        bodyTextCharsPerSec: this.results.body_text.charsPerSec,
        avgBodyChars: this.results.body_text.avgCharsPerArticle,
        dedupeRatio: this.results.full_pipeline.dedupeRatio,
        timeFor2000UrlOnly: 2000 / urlOps * 1000,
        timeFor2000Full: 2000 / fullOps * 1000
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

    const benchmark = new ContentPlaceDetectionBenchmark(db, fixture.urls);
    const results = benchmark.runAll();

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(results, null, 2));
    }

    // Save results
    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const resultsPath = path.join(resultsDir, `content-place-detection-${date}.json`);
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
