#!/usr/bin/env node
'use strict';

/**
 * Classification quality vs timing benchmark.
 *
 * Compares:
 * - Stage 1 URL-only classifier
 * - Stage 2 signal-based classifier (using precomputed metrics from content_analysis)
 * - StageAggregator (Stage 1 + Stage 2)
 *
 * Reference labels come from content_analysis.classification (optionally filtered by confidence_score).
 *
 * Usage:
 *   node labs/classification-quality-timing/benchmarks/url-vs-analysis-signals.bench.js --help
 *   node labs/classification-quality-timing/benchmarks/url-vs-analysis-signals.bench.js --limit 2000
 *   node labs/classification-quality-timing/benchmarks/url-vs-analysis-signals.bench.js --limit 500 --min-confidence 0.8
 *   node labs/classification-quality-timing/benchmarks/url-vs-analysis-signals.bench.js --url-limit 100000
 *   node labs/classification-quality-timing/benchmarks/url-vs-analysis-signals.bench.js --json
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { ensureDatabase } = require('../../../src/db/sqlite');
const { Stage1UrlClassifier } = require('../../../src/classifiers/Stage1UrlClassifier');
const { Stage2ContentClassifier } = require('../../../src/classifiers/Stage2ContentClassifier');
const { StageAggregator } = require('../../../src/classifiers/StageAggregator');

const JSON_OUTPUT = process.argv.includes('--json');

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArgValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStringArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  return value !== undefined ? value : fallback;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sorted.length ? sum / sorted.length : 0;
  return {
    count: sorted.length,
    meanMs: mean,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95)
  };
}

function bumpMatrix(matrix, truth, pred) {
  if (!matrix[truth]) matrix[truth] = {};
  matrix[truth][pred] = (matrix[truth][pred] || 0) + 1;
}

function accuracyFromMatrix(matrix) {
  let correct = 0;
  let total = 0;
  for (const [truth, row] of Object.entries(matrix)) {
    for (const [pred, count] of Object.entries(row)) {
      total += count;
      if (truth === pred) correct += count;
    }
  }
  return { correct, total, accuracy: total ? correct / total : 0 };
}

function printHelp() {
  const msg = [
    'url-vs-analysis-signals.bench.js',
    '',
    'Options:',
    '  --limit <n>             Number of labeled (content_analysis) rows to sample (default: 2000)',
    '  --min-confidence <f>    Only include labels with confidence_score >= f (default: 0)',
    '  --require-confidence    Exclude rows where confidence_score is NULL',
    '  --db <path>             Path to SQLite DB (default: data/news.db)',
    '  --url-limit <n>         Additionally benchmark Stage1 URL-only throughput over urls table',
    '  --json                  Emit JSON only (no pretty logs)',
    ''
  ].join('\n');

  console.log(msg);
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp();
    return;
  }

  const dbPath = getStringArg('--db', path.join(__dirname, '../../../data/news.db'));

  const limit = getArgValue('--limit', 2000);
  const minConfidence = getArgValue('--min-confidence', 0);
  const requireConfidence = hasFlag('--require-confidence');
  const urlLimit = getArgValue('--url-limit', 0);

  const db = ensureDatabase(dbPath, { readonly: true });

  const stage1 = new Stage1UrlClassifier();
  const stage2 = new Stage2ContentClassifier();
  const aggregator = new StageAggregator();

  const timers = {
    stage1: [],
    stage2: [],
    aggregate: [],
    total: []
  };

  const matrices = {
    stage1: {},
    stage2: {},
    aggregate: {}
  };

  const counts = {
    sampled: 0,
    skippedMissingMetrics: 0,
    stage1Unknown: 0,
    stage2Unknown: 0,
    disagreeStage1Stage2: 0
  };

  try {
    const totalLabeled = db.prepare(`
      SELECT COUNT(*) AS cnt
        FROM content_analysis ca
       WHERE ca.classification IN ('article', 'hub', 'nav')
         AND (${requireConfidence ? 'ca.confidence_score IS NOT NULL AND ' : ''}1=1)
         AND COALESCE(ca.confidence_score, 1.0) >= ?
    `).get(minConfidence).cnt;

    const rows = db.prepare(`
      SELECT ca.id AS analysisId,
             ca.classification AS label,
             ca.confidence_score AS labelConfidence,
             ca.word_count AS wordCount,
             ca.nav_links_count AS navLinksCount,
             ca.article_links_count AS articleLinksCount,
             u.id AS urlId,
             u.url AS url
        FROM content_analysis ca
        JOIN content_storage cs ON ca.content_id = cs.id
        JOIN http_responses hr ON cs.http_response_id = hr.id
        JOIN urls u ON hr.url_id = u.id
       WHERE ca.classification IN ('article', 'hub', 'nav')
         AND (${requireConfidence ? 'ca.confidence_score IS NOT NULL AND ' : ''}1=1)
         AND COALESCE(ca.confidence_score, 1.0) >= ?
       ORDER BY ca.id
       LIMIT ?
    `).all(minConfidence, limit);

    // Warm-up to avoid measuring one-time costs.
    for (const row of rows.slice(0, Math.min(25, rows.length))) {
      stage1.classify(row.url);
      stage2.classifyFromSignals({
        wordCount: row.wordCount ?? null,
        navLinksCount: row.navLinksCount ?? null,
        linkCount: (typeof row.navLinksCount === 'number' || typeof row.articleLinksCount === 'number')
          ? (Number(row.navLinksCount || 0) + Number(row.articleLinksCount || 0))
          : null
      });
    }

    for (const row of rows) {
      const t0 = performance.now();

      const a0 = performance.now();
      const r1 = stage1.classify(row.url);
      const a1 = performance.now();

      const b0 = performance.now();
      const r2 = stage2.classifyFromSignals({
        wordCount: row.wordCount ?? null,
        navLinksCount: row.navLinksCount ?? null,
        linkCount: (typeof row.navLinksCount === 'number' || typeof row.articleLinksCount === 'number')
          ? (Number(row.navLinksCount || 0) + Number(row.articleLinksCount || 0))
          : null
      });
      const b1 = performance.now();

      const c0 = performance.now();
      const rAgg = aggregator.aggregate(r1, r2);
      const c1 = performance.now();

      const t1 = performance.now();

      counts.sampled += 1;

      timers.stage1.push(a1 - a0);
      timers.stage2.push(b1 - b0);
      timers.aggregate.push(c1 - c0);
      timers.total.push(t1 - t0);

      if (r1.classification === 'unknown') counts.stage1Unknown += 1;
      if (r2.classification === 'unknown') counts.stage2Unknown += 1;
      if (r1.classification !== r2.classification) counts.disagreeStage1Stage2 += 1;

      bumpMatrix(matrices.stage1, row.label, r1.classification);
      bumpMatrix(matrices.stage2, row.label, r2.classification);
      bumpMatrix(matrices.aggregate, row.label, rAgg.classification);
    }

    const s1 = accuracyFromMatrix(matrices.stage1);
    const s2 = accuracyFromMatrix(matrices.stage2);
    const sAgg = accuracyFromMatrix(matrices.aggregate);

    const results = {
      timestamp: new Date().toISOString(),
      dbPath,
      reference: {
        labelSource: 'content_analysis.classification',
        minConfidence,
        requireConfidence,
        totalLabeled
      },
      sample: {
        limitRequested: limit,
        rowsSampled: counts.sampled
      },
      timings: {
        stage1: stats(timers.stage1),
        stage2: stats(timers.stage2),
        aggregate: stats(timers.aggregate),
        total: stats(timers.total)
      },
      quality: {
        stage1: { ...s1, confusion: matrices.stage1 },
        stage2: { ...s2, confusion: matrices.stage2 },
        aggregate: { ...sAgg, confusion: matrices.aggregate },
        stage1UnknownRate: counts.sampled ? counts.stage1Unknown / counts.sampled : 0,
        stage2UnknownRate: counts.sampled ? counts.stage2Unknown / counts.sampled : 0,
        stageDisagreementRate: counts.sampled ? counts.disagreeStage1Stage2 / counts.sampled : 0
      }
    };

    // Optional: URL-only throughput benchmark.
    if (urlLimit > 0) {
      const urlCount = db.prepare('SELECT COUNT(*) AS cnt FROM urls').get().cnt;
      const urlRows = db.prepare('SELECT id, url FROM urls ORDER BY id LIMIT ?').all(urlLimit);

      const t0 = performance.now();
      let unknownCount = 0;
      for (const r of urlRows) {
        const out = stage1.classify(r.url);
        if (out.classification === 'unknown') unknownCount += 1;
      }
      const t1 = performance.now();

      const ms = Math.max(0.0001, t1 - t0);
      results.urlOnly = {
        urlCount,
        sampleSize: urlRows.length,
        totalMs: ms,
        urlsPerSec: urlRows.length / (ms / 1000),
        unknownRate: urlRows.length ? unknownCount / urlRows.length : 0
      };
    }

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log('═'.repeat(70));
      console.log('  Lab: Classification Quality vs Timing');
      console.log('═'.repeat(70));
      console.log(`Labels: content_analysis.classification | minConfidence=${minConfidence} | requireConfidence=${requireConfidence}`);
      console.log(`Sampled: ${results.sample.rowsSampled} / requested ${limit} | total labeled: ${totalLabeled}`);
      console.log('');
      console.log(`Timing total:  avg ${results.timings.total.meanMs.toFixed(4)}ms | p95 ${results.timings.total.p95Ms.toFixed(4)}ms`);
      console.log(`  stage1:     avg ${results.timings.stage1.meanMs.toFixed(4)}ms | p95 ${results.timings.stage1.p95Ms.toFixed(4)}ms`);
      console.log(`  stage2(sig):avg ${results.timings.stage2.meanMs.toFixed(4)}ms | p95 ${results.timings.stage2.p95Ms.toFixed(4)}ms`);
      console.log(`  aggregate:  avg ${results.timings.aggregate.meanMs.toFixed(4)}ms | p95 ${results.timings.aggregate.p95Ms.toFixed(4)}ms`);
      console.log('');
      console.log(`Accuracy vs labels:`);
      console.log(`  stage1:    ${(results.quality.stage1.accuracy * 100).toFixed(2)}% (${results.quality.stage1.correct}/${results.quality.stage1.total})`);
      console.log(`  stage2:    ${(results.quality.stage2.accuracy * 100).toFixed(2)}% (${results.quality.stage2.correct}/${results.quality.stage2.total})`);
      console.log(`  aggregate: ${(results.quality.aggregate.accuracy * 100).toFixed(2)}% (${results.quality.aggregate.correct}/${results.quality.aggregate.total})`);
      console.log('');
      console.log(`Unknown rate:`);
      console.log(`  stage1: ${(results.quality.stage1UnknownRate * 100).toFixed(2)}%`);
      console.log(`  stage2: ${(results.quality.stage2UnknownRate * 100).toFixed(2)}%`);
      console.log(`Disagreement rate stage1 vs stage2: ${(results.quality.stageDisagreementRate * 100).toFixed(2)}%`);
      if (results.urlOnly) {
        console.log('');
        console.log(`URL-only throughput over urls (n=${results.urlOnly.sampleSize}): ${results.urlOnly.urlsPerSec.toFixed(0)} urls/sec | unknown ${(results.urlOnly.unknownRate * 100).toFixed(2)}%`);
      }
    }

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const outPath = path.join(resultsDir, `url-vs-analysis-signals-${date}.json`);
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    if (!JSON_OUTPUT) console.log(`Results saved to: ${outPath}`);

  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
