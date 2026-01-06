#!/usr/bin/env node
/**
 * Experiment 1: Candidate Generation vs Filtering Benchmark
 *
 * Measures time spent across URL place extraction phases:
 *   A) URL parsing
 *   B) Segment analysis (candidate generation via slugMap lookups)
 *   C) buildChains()
 *   D) chooseBestChain()
 *
 * Usage:
 *   node labs/db-access-patterns/benchmarks/candidate-vs-filter.bench.js
 *   node labs/db-access-patterns/benchmarks/candidate-vs-filter.bench.js --json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { ensureDatabase } = require('../../../src/db/sqlite');

// Enable env-gated exports for benchmark-only internals.
process.env.PLACE_EXTRACTION_BENCH = process.env.PLACE_EXTRACTION_BENCH || '1';

const placeExtraction = require('../../../src/analysis/place-extraction');
const { buildGazetteerMatchers } = placeExtraction;
const bench = placeExtraction.__bench;

const JSON_OUTPUT = process.argv.includes('--json');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function log(...args) {
  if (!JSON_OUTPUT) console.log(...args);
}

function loadFixture() {
  const fixturePath = path.join(__dirname, '../fixtures/urls-with-content-2000.json');
  if (!fs.existsSync(fixturePath)) {
    throw new Error('Fixture not found. Run: node labs/db-access-patterns/generate-url-fixture.js');
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
}

function pct(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

function summarizeSamples(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sorted.length ? sum / sorted.length : 0;
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  return { meanMs: mean, p50Ms: p50, p95Ms: p95, count: sorted.length };
}

async function main() {
  if (!bench) {
    throw new Error('Benchmark internals not available. Ensure PLACE_EXTRACTION_BENCH=1.');
  }

  const dbPath = path.join(__dirname, '../../../data/news.db');
  const db = ensureDatabase(dbPath, { readonly: true });

  try {
    const fixture = loadFixture();
    const urls = fixture.urls;

    log(`Loaded ${urls.length} URLs from fixture`);

    const matcherStart = performance.now();
    const matchers = buildGazetteerMatchers(db);
    const matcherMs = performance.now() - matcherStart;

    const totals = {
      url_parsing: 0,
      segment_analysis: 0,
      build_chains: 0,
      choose_best: 0
    };

    const perUrlTotalMs = [];
    let totalSegments = 0;
    let totalCandidates = 0;
    let totalChains = 0;
    let urlsWithBestChain = 0;

    // Warm-up to stabilize JIT
    for (let i = 0; i < Math.min(50, urls.length); i++) {
      const url = urls[i].url;
      try {
        const parsed = new URL(url);
        const segmentsRaw = parsed.pathname.split('/').filter(Boolean);
        const analyses = segmentsRaw.map((segment, idx) => bench.analyzeSegment(segment, idx, matchers));
        const chains = bench.buildChains(analyses, matchers);
        const best = bench.chooseBestChain(chains);
        bench.cleanupMatchArtifacts(analyses);
        void best;
      } catch (_) {
        // ignore
      }
    }

    for (const row of urls) {
      const url = row.url;
      let segmentsRaw;

      const t0 = performance.now();
      try {
        const parsed = new URL(url);
        segmentsRaw = parsed.pathname.split('/').filter(Boolean);
      } catch (_) {
        segmentsRaw = [];
      }
      const t1 = performance.now();
      totals.url_parsing += (t1 - t0);

      const a0 = performance.now();
      const segmentAnalyses = segmentsRaw.map((segment, idx) => bench.analyzeSegment(segment, idx, matchers));
      const a1 = performance.now();
      totals.segment_analysis += (a1 - a0);

      let candidatesForUrl = 0;
      for (const analysis of segmentAnalyses) {
        candidatesForUrl += (analysis.placeMatches?.length || 0);
      }

      const b0 = performance.now();
      const chains = bench.buildChains(segmentAnalyses, matchers);
      const b1 = performance.now();
      totals.build_chains += (b1 - b0);

      const c0 = performance.now();
      const bestChain = bench.chooseBestChain(chains);
      const c1 = performance.now();
      totals.choose_best += (c1 - c0);

      bench.cleanupMatchArtifacts(segmentAnalyses);

      totalSegments += segmentsRaw.length;
      totalCandidates += candidatesForUrl;
      totalChains += chains.length;
      if (bestChain && bestChain.places && bestChain.places.length) urlsWithBestChain += 1;

      const totalMs = (t1 - t0) + (a1 - a0) + (b1 - b0) + (c1 - c0);
      perUrlTotalMs.push(totalMs);

      if (VERBOSE && perUrlTotalMs.length <= 5) {
        log(`Sample url: ${url}`);
        log(`  segments=${segmentsRaw.length} candidates=${candidatesForUrl} chains=${chains.length} bestLen=${bestChain?.places?.length || 0}`);
      }
    }

    const totalMeasured = Object.values(totals).reduce((acc, v) => acc + v, 0);

    const phases = {
      url_parsing: {
        avgMs: totals.url_parsing / urls.length,
        percentOfTotal: pct(totals.url_parsing, totalMeasured)
      },
      segment_analysis: {
        avgMs: totals.segment_analysis / urls.length,
        percentOfTotal: pct(totals.segment_analysis, totalMeasured)
      },
      build_chains: {
        avgMs: totals.build_chains / urls.length,
        percentOfTotal: pct(totals.build_chains, totalMeasured)
      },
      choose_best: {
        avgMs: totals.choose_best / urls.length,
        percentOfTotal: pct(totals.choose_best, totalMeasured)
      }
    };

    const bottleneck = Object.entries(phases)
      .sort((a, b) => b[1].avgMs - a[1].avgMs)[0]?.[0] || null;

    const totalStats = summarizeSamples(perUrlTotalMs);

    const results = {
      timestamp: new Date().toISOString(),
      sampleSize: urls.length,
      matcherBuildMs: matcherMs,
      phases,
      bottleneck,
      totals: {
        totalMeasuredMs: totalMeasured,
        avgTotalMsPerUrl: totalMeasured / urls.length,
        p50TotalMsPerUrl: totalStats.p50Ms,
        p95TotalMsPerUrl: totalStats.p95Ms,
        avgSegmentsPerUrl: totalSegments / urls.length,
        avgCandidatesPerUrl: totalCandidates / urls.length,
        avgChainsPerUrl: totalChains / urls.length,
        urlsWithBestChain
      }
    };

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      log('═'.repeat(60));
      log('  Experiment 1: Candidate Generation vs Filtering');
      log('═'.repeat(60));
      log(`Matcher build: ${matcherMs.toFixed(1)}ms`);
      log(`Avg total: ${results.totals.avgTotalMsPerUrl.toFixed(3)}ms/url (p50=${results.totals.p50TotalMsPerUrl.toFixed(3)}ms p95=${results.totals.p95TotalMsPerUrl.toFixed(3)}ms)`);
      log(`Avg candidates/url: ${results.totals.avgCandidatesPerUrl.toFixed(1)} | Avg chains/url: ${results.totals.avgChainsPerUrl.toFixed(1)} | BestChain present: ${urlsWithBestChain}/${urls.length}`);
      log('');
      for (const [name, metrics] of Object.entries(phases)) {
        log(`${name.padEnd(16)} ${metrics.avgMs.toFixed(4)}ms  (${metrics.percentOfTotal.toFixed(1)}%)`);
      }
      log('');
      log(`Bottleneck: ${bottleneck}`);
    }

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const outPath = path.join(resultsDir, `candidate-vs-filter-${date}.json`);
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    log(`Results saved to: ${outPath}`);

  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
