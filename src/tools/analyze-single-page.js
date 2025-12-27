#!/usr/bin/env node

/**
 * Single-page analysis with comprehensive benchmarking.
 * 
 * Analyzes one page specified by URL or ID and breaks down timing for all stages:
 * - Database connection setup
 * - Loading URL metadata
 * - Fetching HTTP response metadata
 * - Loading compressed content
 * - Decompressing content
 * - HTML parsing/preparation
 * - Place extraction and analysis
 * - Database updates
 * 
 * Usage:
 *   node src/tools/analyze-single-page.js --url "https://example.com"
 *   node src/tools/analyze-single-page.js --url-id 123
 *   node src/tools/analyze-single-page.js --content-id 456
 *   node src/tools/analyze-single-page.js --url "https://example.com" --verbose
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDatabase } = require('../db/sqlite');
const { analyzePage } = require('../analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../analysis/place-extraction');
const { loadNonGeoTopicSlugs } = require('./nonGeoTopicSlugs');
const { ArticleXPathService } = require('../services/ArticleXPathService');
const { ContentConfidenceScorer } = require('../analysis/ContentConfidenceScorer');
const { DecompressionWorkerPool } = require('../background/workers/DecompressionWorkerPool');

const projectRoot = findProjectRoot(__dirname);

function parseArgs(argv = process.argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const raw = argv[i];
    if (typeof raw !== 'string' || !raw.startsWith('--')) continue;
    
    const eq = raw.indexOf('=');
    if (eq > -1) {
      // --key=value format
      const keyPart = raw.slice(2, eq);
      const key = keyPart.replace(/-([a-z])/gi, (_, ch) => ch.toUpperCase());
      const value = raw.slice(eq + 1).trim();
      args[key] = coerceValue(value);
    } else {
      // --key value format (check next arg)
      const keyPart = raw.slice(2);
      const key = keyPart.replace(/-([a-z])/gi, (_, ch) => ch.toUpperCase());
      
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        // Next arg is a value
        args[key] = coerceValue(argv[i + 1]);
        i++; // Skip the value arg
      } else {
        // No value, it's a flag
        args[key] = true;
      }
    }
  }
  return args;
}

function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const num = Number(value);
  if (!Number.isNaN(num)) return num;
  return value;
}

function log(msg, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${msg}`);
}

function logTiming(stage, durationMs, metadata = null) {
  const bars = Math.ceil(durationMs / 50);
  const bar = '█'.repeat(Math.min(bars, 40));
  let msg = `  ${stage.padEnd(30)} ${durationMs.toFixed(2).padStart(8)}ms ${bar}`;
  if (metadata) {
    msg += ` (${metadata})`;
  }
  console.log(msg);
}

async function analyzeByUrl(url, options) {
  const dbPath = path.join(projectRoot, 'data', 'news.db');
  const db = ensureDatabase(dbPath);
  const decompressPool = new DecompressionWorkerPool({ poolSize: options.decompressionPoolSize });
  
  try {
    await Promise.race([
      decompressPool.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('decompressPool.initialize timeout')), 5000)
      )
    ]);
  } catch (e) {
    console.warn('[warn] Failed to initialize decompression pool:', e.message);
  }

  const timings = {};
  let totalStart = performance.now();

  try {
    log(`Analyzing single page: ${url}`);
    console.log();

    // Stage 1: Query URL metadata
    const urlQueryStart = performance.now();
    const urlRow = db.prepare(`
      SELECT id, url, canonical_url, host
      FROM urls
      WHERE url = ? OR canonical_url = ?
      LIMIT 1
    `).get(url, url);

    if (!urlRow) {
      log(`ERROR: URL not found: ${url}`, 'error');
      process.exit(1);
    }

    timings.queryUrl = performance.now() - urlQueryStart;
    logTiming('Query URL metadata', timings.queryUrl, `url_id=${urlRow.id}`);

    // Stage 2: Query HTTP response  
    const httpQueryStart = performance.now();
    const httpRow = db.prepare(`
      SELECT hr.id, hr.http_status, hr.content_type, hr.fetched_at
      FROM http_responses hr
      WHERE hr.url_id = ?
      AND hr.id IN (SELECT http_response_id FROM content_storage WHERE content_blob IS NOT NULL)
      ORDER BY hr.fetched_at DESC
      LIMIT 1
    `).get(urlRow.id);

    if (!httpRow) {
      log(`ERROR: No HTTP response with content found for URL`, 'error');
      process.exit(1);
    }

    timings.queryHttp = performance.now() - httpQueryStart;
    logTiming('Query HTTP response', timings.queryHttp, `status=${httpRow.http_status}`);

    console.log(`[DEBUG] httpRow.id = ${httpRow.id}`);

    // Stage 3: Query content storage with BLOB
    const contentQueryStart = performance.now();
    const contentStmt = db.prepare(`
      SELECT 
        cs.id,
        cs.content_blob,
        cs.compression_type_id,
        cs.uncompressed_size,
        cs.compressed_size
      FROM content_storage cs
      WHERE cs.http_response_id = ?
      ORDER BY cs.id DESC
      LIMIT 1
    `);
    const contentRow = contentStmt.get(httpRow.id);

    console.log(`[DEBUG2] contentRow = ${JSON.stringify({keys: contentRow ? Object.keys(contentRow) : null, id: contentRow?.id, blob_present: contentRow?.content_blob ? 'YES' : 'NO'})}`);

    if (!contentRow) {
      log(`ERROR: No content storage found for HTTP response`, 'error');
      process.exit(1);
    }

    timings.queryContent = performance.now() - contentQueryStart;
    logTiming(
      'Query content storage',
      timings.queryContent,
      `size=${contentRow.compressed_size || contentRow.uncompressed_size} bytes`
    );

    console.log(`[DEBUG] contentRow.content_blob present: ${contentRow.content_blob ? 'YES (' + contentRow.content_blob.length + ' bytes)' : 'NO'}`);
    console.log(`[DEBUG] contentRow.compression_type_id: ${contentRow.compression_type_id}`);

    // Stage 4: Fetch compression metadata
    const compressionQueryStart = performance.now();
    let compressionInfo = null;
    if (contentRow.compression_type_id) {
      compressionInfo = db.prepare(`
        SELECT algorithm, level, name
        FROM compression_types
        WHERE id = ?
      `).get(contentRow.compression_type_id);
    }
    timings.queryCompression = performance.now() - compressionQueryStart;
    logTiming(
      'Query compression metadata',
      timings.queryCompression,
      compressionInfo ? `${compressionInfo.algorithm}_${compressionInfo.level}` : 'uncompressed'
    );

    // Stage 5: Load and decompress content
    const decompressStart = performance.now();
    let html = null;

    if (contentRow.content_blob) {
      const contentBuffer = Buffer.isBuffer(contentRow.content_blob) 
        ? contentRow.content_blob 
        : Buffer.from(contentRow.content_blob);

      console.log(`[DEBUG] contentBuffer.length: ${contentBuffer.length}`);
      console.log(`[DEBUG] decompressPool ready: ${decompressPool ? 'YES' : 'NO'}`);

      if (compressionInfo && compressionInfo.algorithm && compressionInfo.algorithm !== 'none') {
        console.log(`[DEBUG] Decompressing with ${compressionInfo.algorithm}...`);
        const decompressResult = await decompressPool.decompress(
          contentBuffer,
          compressionInfo.algorithm,
          { contentId: contentRow.id }
        );
        html = decompressResult.buffer ? decompressResult.buffer.toString('utf8') : null;
        console.log(`[DEBUG] Decompressed result: ${html ? html.length + ' chars' : 'NULL'}`);
      } else {
        html = contentBuffer.toString('utf8');
        console.log(`[DEBUG] Using uncompressed: ${html.length} chars`);
      }
    } else {
      console.log(`[DEBUG] contentRow.content_blob is NULL or missing`);
    }

    timings.decompress = performance.now() - decompressStart;
    logTiming('Decompress content', timings.decompress, `${(html?.length || 0)} chars`);

    if (!html) {
      log(`ERROR: No HTML content available`, 'error');
      process.exit(1);
    }

    // Stage 6: Load analysis resources
    const resourcesStart = performance.now();
    
    const xpathService = new ArticleXPathService({ db, logger: console });
    const nonGeoTopicSlugs = loadNonGeoTopicSlugs(db).slugs;
    let gazetteer = null;
    try {
      gazetteer = buildGazetteerMatchers(db);
    } catch (e) {
      console.warn('[warn] Failed to build gazetteer matchers:', e.message);
    }

    timings.loadResources = performance.now() - resourcesStart;
    logTiming('Load analysis resources', timings.loadResources, 'xpath + gazetteer');

    // Stage 7: Run page analysis
    const analysisStart = performance.now();
    
    console.log(`[DEBUG] About to call analyzePage with url=${urlRow.url}`);
    
    let analysis = null;
    try {
      analysis = await Promise.race([
        analyzePage({
          url: urlRow.url,
          html,
          xpathService,
          nonGeoTopicSlugs,
          gazetteer
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('analyzePage timeout after 30s')), 30000)
        )
      ]);
    } catch (e) {
      log(`Warning: analyzePage failed: ${e.message}`, 'warn');
      analysis = { places: [], hubs: [], placeMentions: [], topics: [] };
    }
    
    timings.analysis = performance.now() - analysisStart;
    logTiming('Run page analysis', timings.analysis, `${analysis.places?.length || 0} places`);

    // Stage 8: Check existing analysis
    const existingAnalysisStart = performance.now();
    const existingAnalysis = db.prepare(`
      SELECT id, analysis_version FROM content_analysis
      WHERE content_id = ?
      ORDER BY analysis_version DESC
      LIMIT 1
    `).get(contentRow.id);
    timings.queryExisting = performance.now() - existingAnalysisStart;
    logTiming(
      'Query existing analysis',
      timings.queryExisting,
      existingAnalysis ? `v${existingAnalysis.analysis_version}` : 'none'
    );

    // Stage 9: Update database (optional - dry run by default)
    let updateMs = 0;
    if (!options.dryRun) {
      const updateStart = performance.now();
      
      const analysisJson = JSON.stringify(analysis);
      const analysisVersion = 1; // Use version 1 for single page

      // Compute confidence score
      let confidenceScore = null;
      try {
        const scorer = new ContentConfidenceScorer();
        const extraction = {
          title: analysis.title,
          wordCount: analysis.wordCount,
          date: analysis.date,
          section: analysis.section,
          readability: analysis.readability
        };
        const confidence = scorer.score(extraction);
        confidenceScore = confidence.score;
      } catch (_) {
        // Non-fatal
      }

      if (existingAnalysis) {
        db.prepare(`
          UPDATE content_analysis
          SET analysis_json = ?, analysis_version = ?, confidence_score = ?, analyzed_at = datetime('now')
          WHERE id = ?
        `).run(analysisJson, analysisVersion, confidenceScore, existingAnalysis.id);
      } else {
        db.prepare(`
          INSERT INTO content_analysis (content_id, analysis_json, analysis_version, confidence_score, analyzed_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(contentRow.id, analysisJson, analysisVersion, confidenceScore);
      }

      updateMs = performance.now() - updateStart;
      timings.dbUpdate = updateMs;
      logTiming('Update database', timings.dbUpdate, existingAnalysis ? 'UPDATE' : 'INSERT');
    } else {
      logTiming('Update database', 0, 'SKIPPED (dry-run)');
    }

    const totalMs = performance.now() - totalStart;

    // Summary
    console.log();
    console.log('═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    
    const sortedTimings = Object.entries(timings).sort((a, b) => b[1] - a[1]);
    let sumAccounted = 0;
    for (const [stage, ms] of sortedTimings) {
      if (stage !== 'decompress' && stage !== 'dbUpdate') { // don't double-count decompress time
        sumAccounted += ms;
      }
    }

    console.log(`Total runtime:              ${totalMs.toFixed(2)} ms`);
    console.log(`Accounted for:              ${sumAccounted.toFixed(2)} ms (${(sumAccounted / totalMs * 100).toFixed(1)}%)`);
    console.log(`Unaccounted overhead:       ${(totalMs - sumAccounted).toFixed(2)} ms (${((totalMs - sumAccounted) / totalMs * 100).toFixed(1)}%)`);
    console.log();

    console.log('Stage breakdown (sorted by duration):');
    for (const [stage, ms] of sortedTimings) {
      console.log(`  ${stage.padEnd(25)} ${(ms / totalMs * 100).toFixed(1).padStart(5)}% ${ms.toFixed(2).padStart(8)}ms`);
    }

    console.log();
    console.log('Analysis Results:');
    console.log(`  Places found:            ${analysis.places?.length || 0}`);
    console.log(`  Hubs identified:         ${analysis.hubs?.length || 0}`);
    console.log(`  Place mentions:          ${analysis.placeMentions?.length || 0}`);
    console.log(`  Topics:                  ${(analysis.topics || []).length}`);
    console.log();

    if (options.verbose) {
      console.log('Place extraction details:');
      if (analysis.places && analysis.places.length > 0) {
        analysis.places.slice(0, 10).forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name} (${p.kind}) - confidence: ${(p.confidence * 100).toFixed(0)}%`);
        });
        if (analysis.places.length > 10) {
          console.log(`  ... and ${analysis.places.length - 10} more`);
        }
      }
    }

    console.log();
    log('Analysis complete ✓');
    process.exit(0);

  } catch (error) {
    log(`ERROR: ${error.message}`, 'error');
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  } finally {
    try {
      await Promise.race([
        decompressPool.terminate(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('terminate timeout')), 5000)
        )
      ]);
    } catch (_) {
      // best-effort cleanup
    }
    try {
      db.close();
    } catch (_) {
      // best-effort cleanup
    }
  }
}

async function main() {
  const args = parseArgs();

  if (!args.url && !args.urlId && !args.contentId) {
    console.log(`
Single-page analysis with comprehensive benchmarking

Usage:
  node src/tools/analyze-single-page.js --url "https://example.com"
  node src/tools/analyze-single-page.js --url-id 123
  node src/tools/analyze-single-page.js --content-id 456

Options:
  --url URL                URL to analyze
  --url-id ID              URL ID in database
  --content-id ID          Content storage ID
  --verbose                Show detailed analysis results
  --dry-run                Don't update database
  --decompress-pool-size N Worker pool size for decompression (default: auto)

Examples:
  node src/tools/analyze-single-page.js --url "https://www.theguardian.com/world"
  node src/tools/analyze-single-page.js --url "https://www.theguardian.com/world" --verbose
  node src/tools/analyze-single-page.js --content-id 42 --dry-run
    `);
    process.exit(0);
  }

  // Set a hard timeout to prevent hanging
  const timeoutHandle = setTimeout(() => {
    console.error('\n[ERROR] Process timeout - forcefully exiting after 120 seconds');
    process.exit(1);
  }, 120000);

  if (args.url) {
    await analyzeByUrl(args.url, {
      verbose: args.verbose === true,
      dryRun: args.dryRun === true,
      decompressionPoolSize: args.decompressPoolSize
    });
  } else if (args.urlId) {
    console.error('--url-id not yet implemented');
    process.exit(1);
  } else if (args.contentId) {
    console.error('--content-id not yet implemented');
    process.exit(1);
  }

  clearTimeout(timeoutHandle);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
