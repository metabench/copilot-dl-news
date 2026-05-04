#!/usr/bin/env node
/**
 * Experiment 2: Content Decompression Benchmark
 *
 * Measures the pipeline cost of:
 *   A) Fetching compressed HTML blob from DB
 *   B) Decompressing
 *   C) Parsing HTML (JSDOM)
 *   D) Extracting article text (Readability)
 *
 * Usage:
 *   node labs/db-access-patterns/benchmarks/content-decompression.bench.js
 *   node labs/db-access-patterns/benchmarks/content-decompression.bench.js --limit 200 --json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { ensureDatabase } = require('../../../src/db/sqlite');
const { decompress } = require('../../../src/utils/compression');

const { Readability } = require('@mozilla/readability');
const { JSDOM, VirtualConsole } = require('jsdom');

const JSON_OUTPUT = process.argv.includes('--json');

function log(...args) {
  if (!JSON_OUTPUT) console.log(...args);
}

function getArgValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  return { meanMs: mean, p50Ms: p50, p95Ms: p95, count: sorted.length };
}

async function main() {
  const limitRequested = getArgValue('--limit', 200);
  const maxHtmlBytes = getArgValue('--max-html-bytes', 2_000_000);

  const dbPath = path.join(__dirname, '../../../data/news.db');
  const db = ensureDatabase(dbPath, { readonly: true });

  try {
    const rows = db.prepare(`
      SELECT cs.id,
             cs.uncompressed_size,
             cs.compressed_size,
             ct.algorithm
        FROM content_storage cs
        JOIN compression_types ct ON cs.compression_type_id = ct.id
       WHERE cs.content_blob IS NOT NULL
       LIMIT ?
    `).all(limitRequested);

    const getStmt = db.prepare(`
      SELECT cs.content_blob AS content_blob,
             cs.uncompressed_size AS uncompressed_size,
             cs.compressed_size AS compressed_size,
             ct.algorithm AS algorithm
        FROM content_storage cs
        JOIN compression_types ct ON cs.compression_type_id = ct.id
       WHERE cs.id = ?
    `);

    const virtualConsole = new VirtualConsole();
    virtualConsole.on('error', () => {});
    virtualConsole.on('warn', () => {});
    virtualConsole.on('info', () => {});
    virtualConsole.on('log', () => {});

    const timings = {
      db_fetch: [],
      decompress: [],
      html_parse: [],
      text_extract: [],
      total: []
    };

    let totalCompressedBytes = 0;
    let totalUncompressedBytes = 0;
    let extractedChars = 0;
    let successCount = 0;
    let processedCount = 0;
    let skippedTooLarge = 0;
    let skippedDecodeFailure = 0;

    // Warm-up
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const rec = getStmt.get(rows[i].id);
      const htmlBuf = decompress(rec.content_blob, rec.algorithm);
      if (maxHtmlBytes && htmlBuf.length > maxHtmlBytes) continue;
      const html = htmlBuf.toString('utf-8');
      const dom = new JSDOM(html, { url: 'https://example.com', virtualConsole });
      const reader = new Readability(dom.window.document, { debug: false, maxElemsToParse: 20_000, nbTopCandidates: 5, charThreshold: 500, classesToPreserve: [] });
      void reader.parse();
      dom.window.close();
    }

    for (const row of rows) {
      const t0 = performance.now();
      const f0 = performance.now();
      const rec = getStmt.get(row.id);
      const f1 = performance.now();

      const d0 = performance.now();
      let htmlBuf;
      try {
        htmlBuf = decompress(rec.content_blob, rec.algorithm);
      } catch (err) {
        skippedDecodeFailure += 1;
        continue;
      }
      const d1 = performance.now();

      if (maxHtmlBytes && htmlBuf.length > maxHtmlBytes) {
        skippedTooLarge += 1;
        continue;
      }

      const html = htmlBuf.toString('utf-8');

      const p0 = performance.now();
      const dom = new JSDOM(html, { url: 'https://example.com', virtualConsole });
      const p1 = performance.now();

      const x0 = performance.now();
      const reader = new Readability(dom.window.document, { debug: false, maxElemsToParse: 20_000, nbTopCandidates: 5, charThreshold: 500, classesToPreserve: [] });
      const article = reader.parse();
      const x1 = performance.now();

      try {
        dom.window.close();
      } catch (_) {
        // ignore
      }

      const t1 = performance.now();

      processedCount += 1;

      timings.db_fetch.push(f1 - f0);
      timings.decompress.push(d1 - d0);
      timings.html_parse.push(p1 - p0);
      timings.text_extract.push(x1 - x0);
      timings.total.push(t1 - t0);

      totalCompressedBytes += Number(rec.compressed_size || 0);
      totalUncompressedBytes += Number(rec.uncompressed_size || htmlBuf.length || 0);

      if (article && article.textContent) {
        successCount += 1;
        extractedChars += article.textContent.length;
      }
    }

    const sFetch = stats(timings.db_fetch);
    const sDecomp = stats(timings.decompress);
    const sParse = stats(timings.html_parse);
    const sExtract = stats(timings.text_extract);
    const sTotal = stats(timings.total);

    const sampleSize = processedCount;
    const totalSeconds = (timings.total.reduce((a, b) => a + b, 0) / 1000) || 1;

    const results = {
      timestamp: new Date().toISOString(),
      limitRequested,
      rowsFetched: rows.length,
      sampleSize,
      skippedTooLarge,
      skippedDecodeFailure,
      successes: successCount,
      bytes: {
        totalCompressedBytes,
        totalUncompressedBytes,
        extractedChars
      },
      phases: {
        db_fetch: {
          avgMs: sFetch.meanMs,
          p95Ms: sFetch.p95Ms,
          bytesPerSec: totalCompressedBytes / totalSeconds
        },
        decompress: {
          avgMs: sDecomp.meanMs,
          p95Ms: sDecomp.p95Ms,
          bytesPerSec: totalUncompressedBytes / totalSeconds
        },
        html_parse: {
          avgMs: sParse.meanMs,
          p95Ms: sParse.p95Ms
        },
        text_extract: {
          avgMs: sExtract.meanMs,
          p95Ms: sExtract.p95Ms,
          charsPerSec: extractedChars / totalSeconds
        }
      },
      totalPipeline: {
        avgMs: sTotal.meanMs,
        p95Ms: sTotal.p95Ms,
        articlesPerSec: sampleSize / totalSeconds
      }
    };

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      log('═'.repeat(60));
      log('  Experiment 2: Content Decompression Benchmark');
      log('═'.repeat(60));
      log(`Sample size: ${sampleSize} | Readability successes: ${successCount}`);
      log(`Total pipeline: avg ${results.totalPipeline.avgMs.toFixed(2)}ms (p95 ${results.totalPipeline.p95Ms.toFixed(2)}ms) | ${results.totalPipeline.articlesPerSec.toFixed(1)} articles/sec`);
      log('');
      for (const [name, phase] of Object.entries(results.phases)) {
        const extra = phase.bytesPerSec ? ` | ${(phase.bytesPerSec / 1024 / 1024).toFixed(2)} MB/s` : (phase.charsPerSec ? ` | ${(phase.charsPerSec / 1e6).toFixed(2)} M chars/s` : '');
        log(`${name.padEnd(12)} avg ${phase.avgMs.toFixed(3)}ms (p95 ${phase.p95Ms.toFixed(3)}ms)${extra}`);
      }
    }

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const outPath = path.join(resultsDir, `content-decompression-${date}.json`);
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
