#!/usr/bin/env node
/**
 * Experiment 3: Body Text Backfill Test (DRY RUN by default)
 *
 * Uses existing searchAdapter backfill hooks to:
 *   - find articles needing body_text
 *   - decompress stored HTML
 *   - extract main text (Readability)
 *   - optionally write back to content_analysis (ONLY with --fix)
 *
 * Usage:
 *   node labs/db-access-patterns/benchmarks/body-text-backfill.bench.js --limit 100
 *   node labs/db-access-patterns/benchmarks/body-text-backfill.bench.js --limit 100 --json
 *   node labs/db-access-patterns/benchmarks/body-text-backfill.bench.js --limit 100 --fix   # DO NOT RUN unless you intend to write
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { ensureDatabase } = require('../../../src/db/sqlite');
const { decompress } = require('../../../src/utils/compression');
const { createSearchAdapter } = require('../../../src/db/sqlite/v1/queries/searchAdapter');
const { Readability } = require('@mozilla/readability');
const { JSDOM, VirtualConsole } = require('jsdom');

const JSON_OUTPUT = process.argv.includes('--json');
const FIX = process.argv.includes('--fix');

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

function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sorted.length ? sum / sorted.length : 0;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  return { meanMs: mean, p95Ms: p95, count: sorted.length };
}

async function main() {
  const limit = getArgValue('--limit', 100);

  const dbPath = path.join(__dirname, '../../../data/news.db');
  const db = ensureDatabase(dbPath, { readonly: !FIX });

  try {
    const adapter = createSearchAdapter(db);
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('error', () => {});
    virtualConsole.on('warn', () => {});
    virtualConsole.on('info', () => {});
    virtualConsole.on('log', () => {});

    const extractBodyText = (html, url) => {
      const dom = new JSDOM(html, { url: url || 'https://example.com', virtualConsole });
      try {
        const reader = new Readability(dom.window.document, {
          debug: false,
          maxElemsToParse: 0,
          nbTopCandidates: 5,
          charThreshold: 500,
          classesToPreserve: []
        });
        const article = reader.parse();
        if (article && article.textContent) {
          return String(article.textContent).trim().replace(/\s+/g, ' ');
        }
        return '';
      } finally {
        try {
          dom.window.close();
        } catch (_) {
          // ignore
        }
      }
    };

    const getContentStmt = db.prepare(`
      SELECT cs.content_blob AS content_blob,
             cs.uncompressed_size AS uncompressed_size,
             cs.compressed_size AS compressed_size,
             ct.algorithm AS algorithm
        FROM content_storage cs
        JOIN compression_types ct ON cs.compression_type_id = ct.id
       WHERE cs.id = ?
    `);

    const getUrlStmt = db.prepare(`
      SELECT u.url AS url
        FROM content_storage cs
        JOIN http_responses hr ON cs.http_response_id = hr.id
        JOIN urls u ON hr.url_id = u.id
       WHERE cs.id = ?
       LIMIT 1
    `);

    const rows = adapter.getArticlesNeedingBackfill(limit);

    const timings = {
      extractionOnly: [],
      dbWrite: []
    };

    const failures = [];
    let processed = 0;
    let writeAttempts = 0;
    let writeSuccesses = 0;

    for (const row of rows) {
      const id = row.id;
      const contentId = row.content_id;

      const start = performance.now();

      try {
        const urlRow = getUrlStmt.get(contentId);
        const url = urlRow?.url || null;

        const content = getContentStmt.get(contentId);
        if (!content || !content.content_blob) {
          throw new Error('Missing content_blob');
        }

        const htmlBuf = decompress(content.content_blob, content.algorithm);
        const html = htmlBuf.toString('utf-8');

        const bodyText = extractBodyText(html, url);
        const byline = null;
        const authors = null;

        const end = performance.now();
        timings.extractionOnly.push(end - start);

        if (FIX) {
          const w0 = performance.now();
          writeAttempts += 1;

          const ok = adapter.updateArticleText(id, { body_text: bodyText, byline, authors });
          const w1 = performance.now();
          timings.dbWrite.push(w1 - w0);
          if (ok) writeSuccesses += 1;
        }

        processed += 1;

      } catch (err) {
        failures.push({ id, contentId, error: err?.message || String(err) });
      }
    }

    const extractionStats = stats(timings.extractionOnly);
    const writeStats = stats(timings.dbWrite);

    const extractionTotalMs = timings.extractionOnly.reduce((a, b) => a + b, 0);
    const writeTotalMs = timings.dbWrite.reduce((a, b) => a + b, 0);

    const extractionOnlyPerSec = extractionTotalMs ? (processed / (extractionTotalMs / 1000)) : 0;
    const withWritePerSec = (extractionTotalMs + writeTotalMs) ? (processed / ((extractionTotalMs + writeTotalMs) / 1000)) : 0;

    const results = {
      timestamp: new Date().toISOString(),
      dryRun: !FIX,
      sampleSizeRequested: limit,
      articlesProcessed: processed,
      failures: failures.slice(0, 25),
      extractionOnly: {
        avgMs: extractionStats.meanMs,
        p95Ms: extractionStats.p95Ms,
        articlesPerSec: extractionOnlyPerSec
      },
      withDbWrite: FIX
        ? {
            avgMs: writeStats.meanMs,
            p95Ms: writeStats.p95Ms,
            articlesPerSec: withWritePerSec,
            writeAttempts,
            writeSuccesses
          }
        : null
    };

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      log('═'.repeat(60));
      log('  Experiment 3: Body Text Backfill (dry-run by default)');
      log('═'.repeat(60));
      log(`dryRun=${results.dryRun} processed=${processed} failures=${failures.length}`);
      log(`Extraction: avg ${results.extractionOnly.avgMs.toFixed(2)}ms (p95 ${results.extractionOnly.p95Ms.toFixed(2)}ms) | ${results.extractionOnly.articlesPerSec.toFixed(1)} articles/sec`);
      if (FIX && results.withDbWrite) {
        log(`Writes: avg ${results.withDbWrite.avgMs.toFixed(2)}ms (p95 ${results.withDbWrite.p95Ms.toFixed(2)}ms) | ${results.withDbWrite.articlesPerSec.toFixed(1)} articles/sec`);
      }
      if (failures.length) {
        log('');
        log('Failures (first 5):');
        for (const f of failures.slice(0, 5)) {
          log(`  id=${f.id} contentId=${f.contentId} ${f.error}`);
        }
      }
    }

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const outPath = path.join(resultsDir, `body-text-backfill-${date}.json`);
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
