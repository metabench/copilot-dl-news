#!/usr/bin/env node
/**
 * Experiment 4: Title-Based Place Detection Quality
 *
 * Compares URL-only vs title-only vs combined detection on the 2000-URL fixture.
 *
 * Usage:
 *   node labs/db-access-patterns/benchmarks/title-boost-quality.bench.js
 *   node labs/db-access-patterns/benchmarks/title-boost-quality.bench.js --json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { ensureDatabase } = require('../../../src/db/sqlite');
const {
  buildGazetteerMatchers,
  resolveUrlPlaces,
  extractGazetteerPlacesFromText,
  inferContext
} = require('../../../src/analysis/place-extraction');

const JSON_OUTPUT = process.argv.includes('--json');

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

function setFromUrlBestChain(bestChain) {
  const out = new Set();
  const places = bestChain?.places || [];
  for (const match of places) {
    const pid = match?.place?.place_id ?? match?.place?.id;
    if (pid != null) out.add(pid);
  }
  return out;
}

function setFromDetections(detections) {
  const out = new Set();
  for (const det of detections || []) {
    const pid = det?.place_id;
    if (pid != null) out.add(pid);
  }
  return out;
}

function intersectionSize(a, b) {
  let count = 0;
  for (const v of a) {
    if (b.has(v)) count += 1;
  }
  return count;
}

async function main() {
  const dbPath = path.join(__dirname, '../../../data/news.db');
  const db = ensureDatabase(dbPath, { readonly: true });

  try {
    const fixture = loadFixture();
    const urls = fixture.urls;

    const titleStmt = db.prepare(`
      SELECT title
        FROM content_analysis
       WHERE content_id = ?
       ORDER BY id DESC
       LIMIT 1
    `);

    const matchers = buildGazetteerMatchers(db);

    let urlOnlyDetected = 0;
    let titleOnlyDetected = 0;
    let combinedDetected = 0;

    let urlOnlyPlacesSum = 0;
    let titleOnlyPlacesSum = 0;
    let combinedPlacesSum = 0;

    let totalTitlePlaces = 0;
    let totalIntersectionPlaces = 0;

    let urlMs = 0;
    let titleMs = 0;

    for (const row of urls) {
      const url = row.url;
      const titleRow = titleStmt.get(row.contentId);
      const title = titleRow?.title || '';

      const t0 = performance.now();
      const urlResult = resolveUrlPlaces(url, matchers);
      const t1 = performance.now();
      urlMs += (t1 - t0);

      const urlSet = setFromUrlBestChain(urlResult.bestChain);

      const ctx = inferContext(db, url, title || null, null);
      const t2 = performance.now();
      const titleDetections = title ? extractGazetteerPlacesFromText(title, matchers, ctx, true) : [];
      const t3 = performance.now();
      titleMs += (t3 - t2);

      const titleSet = setFromDetections(titleDetections);

      const union = new Set([...urlSet, ...titleSet]);
      const inter = intersectionSize(urlSet, titleSet);

      if (urlSet.size) urlOnlyDetected += 1;
      if (titleSet.size) titleOnlyDetected += 1;
      if (union.size) combinedDetected += 1;

      urlOnlyPlacesSum += urlSet.size;
      titleOnlyPlacesSum += titleSet.size;
      combinedPlacesSum += union.size;

      totalTitlePlaces += titleSet.size;
      totalIntersectionPlaces += inter;
    }

    const sampleSize = urls.length;

    const urlOnlyRate = (urlOnlyDetected / sampleSize) * 100;
    const titleOnlyRate = (titleOnlyDetected / sampleSize) * 100;
    const combinedRate = (combinedDetected / sampleSize) * 100;

    const performanceCostMs = (titleMs / sampleSize);

    const results = {
      timestamp: new Date().toISOString(),
      sampleSize,
      urlOnly: {
        detectionRate: `${urlOnlyRate.toFixed(1)}%`,
        urlsWithPlaces: urlOnlyDetected,
        avgPlaces: urlOnlyPlacesSum / sampleSize,
        avgMsPerUrl: urlMs / sampleSize
      },
      titleOnly: {
        detectionRate: `${titleOnlyRate.toFixed(1)}%`,
        urlsWithPlaces: titleOnlyDetected,
        avgPlaces: titleOnlyPlacesSum / sampleSize,
        avgMsPerUrl: titleMs / sampleSize
      },
      combined: {
        detectionRate: `${combinedRate.toFixed(1)}%`,
        urlsWithPlaces: combinedDetected,
        avgPlaces: combinedPlacesSum / sampleSize,
        avgMsPerUrl: (urlMs + titleMs) / sampleSize
      },
      titleBoost: {
        detectionRateDeltaPoints: Number((combinedRate - urlOnlyRate).toFixed(1)),
        overlapOfTitlePlaces: totalTitlePlaces ? `${((totalIntersectionPlaces / totalTitlePlaces) * 100).toFixed(1)}%` : '0%'
      },
      performanceCost: {
        titleAddsAvgMsPerUrl: performanceCostMs,
        titleAddsPercentOfUrlCost: urlMs ? `${((performanceCostMs / (urlMs / sampleSize)) * 100).toFixed(1)}%` : null
      }
    };

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      log('═'.repeat(60));
      log('  Experiment 4: Title Boost Quality');
      log('═'.repeat(60));
      log(`URL-only:    ${results.urlOnly.detectionRate} | avgPlaces=${results.urlOnly.avgPlaces.toFixed(2)} | ${results.urlOnly.avgMsPerUrl.toFixed(3)}ms/url`);
      log(`Title-only:  ${results.titleOnly.detectionRate} | avgPlaces=${results.titleOnly.avgPlaces.toFixed(2)} | ${results.titleOnly.avgMsPerUrl.toFixed(3)}ms/url`);
      log(`Combined:    ${results.combined.detectionRate} | avgPlaces=${results.combined.avgPlaces.toFixed(2)} | ${results.combined.avgMsPerUrl.toFixed(3)}ms/url`);
      log('');
      log(`Title boost: +${results.titleBoost.detectionRateDeltaPoints} points detection rate`);
      log(`Overlap:     ${results.titleBoost.overlapOfTitlePlaces} of title places are also in URL`);
      log(`Cost:        +${results.performanceCost.titleAddsAvgMsPerUrl.toFixed(3)}ms/url`);
    }

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const outPath = path.join(resultsDir, `title-boost-quality-${date}.json`);
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
