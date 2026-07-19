#!/usr/bin/env node

/**
 * Detect article candidates with beautiful formatted output.
 * 
 * Usage:
 *   node detect-articles.js                           (detect articles from all URLs)
 *   node detect-articles.js --limit=100               (limit to first 100)
 *   node detect-articles.js --host=bbc.com            (only URLs from specific host)
 *   node detect-articles.js --sample=50 --explain     (random sample with reasoning)
 *   node detect-articles.js --scores                  (include confidence scores)
 */

'use strict';

const path = require('path');
const {
  evaluateArticleCandidate,
  createArticleSignalsService
} = require('../intelligence/analysis/articleDetection');
const { findProjectRoot } = require('../shared/utils/project-root');
const { ensureDb } = require('../data/db/sqlite/ensureDb');
// The canonical per-content-MAX article-read SQL lives in ncdb
// (legacy-articleDetection, byte-identical — differential-e2e verified).
const {
  buildArticleCandidateQuery,
  listArticleCandidates,
  selectArticleFetchDetails
} = require('news-crawler-db');
const { COLORS, ICONS } = require('../shared/utils/CliFormatter');
const { CliArgumentParser } = require('../shared/utils/CliArgumentParser');

function toInt(value) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

/**
 * Parse CLI arguments using CliArgumentParser
 */
function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'detect-articles',
    'Detect likely article pages from crawled URLs'
  );

  parser
    .add('--db <path>', 'Path to SQLite database', null)
    .add('--limit <number>', 'Maximum records to inspect', null, 'number')
    .add('--sample <number>', 'Random sample size', null, 'number')
    .add('--host <host>', 'Restrict to specific host', null, 'string')
    .add('--explain', 'Print reasoning for each decision', false, 'boolean')
    .add('--scores', 'Include score/confidence in output', false, 'boolean');

  return parser.parse(argv);
}

// Query construction delegated to ncdb's buildArticleCandidateQuery
// (string-equal for every option shape; kept exported-name compatibility).
const buildCandidateQuery = buildArticleCandidateQuery;

function resolveDbPath(dbPath) {
  if (dbPath) {
    return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  }
  const root = findProjectRoot(__dirname);
  return path.join(root, 'data', 'news.db');
}

function loadCandidates(db, options) {
  return listArticleCandidates(db, options);
}

function runDetectArticles(options) {
  const dbPath = resolveDbPath(options.db);
  const db = ensureDb(dbPath);
  const articleSignals = createArticleSignalsService();

  console.log(`\n${COLORS.bold(COLORS.cyan('╔ Article Detection Analysis ═══════════════════════════════════════'))}`);

  // Build query info
  const filters = [];
  if (options.host) filters.push(`host = ${options.host}`);
  if (options.limit) filters.push(`limit = ${options.limit}`);
  if (options.sample) filters.push(`sample = ${options.sample}`);
  if (filters.length > 0) {
    console.log(`${COLORS.info('[INFO]')} Filters: ${filters.join(', ')}`);
  }
  console.log();

  const fetchDetailsStmt = { get: (url) => selectArticleFetchDetails(db, url) };

  const rows = loadCandidates(db, options);

  console.log(`${COLORS.cyan('[WAIT]')} Loading ${rows.length} candidate(s)...`);
  console.log();

  let processed = 0;
  let detected = 0;
  let rejected = 0;
  const results = [];

  for (const row of rows) {
    const fetchDetails = fetchDetailsStmt.get(row.url) || {};

    const result = evaluateArticleCandidate({
      url: row.url,
      title: row.title,
      articleWordCount: typeof row.content_word_count === 'number' ? row.content_word_count : null,
      fetchWordCount: typeof fetchDetails.word_count === 'number' ? fetchDetails.word_count : null,
      articleAnalysis: row.content_analysis,
      fetchAnalysis: fetchDetails.analysis_json || null,
      latestClassification: null, // Not available in normalized schema
      navLinksCount: typeof fetchDetails.nav_links_count === 'number' ? fetchDetails.nav_links_count : null,
      articleLinksCount: typeof fetchDetails.article_links_count === 'number' ? fetchDetails.article_links_count : null
    }, { signalsService: articleSignals });

    processed += 1;
    if (result.isArticle) detected += 1; else rejected += 1;

    // Display detailed output for each URL if explain mode
    if (options.explain) {
      const icon = result.isArticle ? ICONS.success : ICONS.error;
      const color = result.isArticle ? 'success' : 'error';
      console.log(`${COLORS[color](`${icon} ${result.url}`)}`);

      if (result.title) {
        console.log(`${COLORS.bold('Title')}: ${COLORS.muted(result.title)}`);
      }

      if (options.scores) {
        console.log(`${COLORS.bold('Score')}: ${COLORS.cyan(result.score.toFixed(2))}`);
        console.log(`${COLORS.bold('Confidence')}: ${COLORS.cyan(result.confidence.toFixed(2))}`);
      }

      if (result.reasons.length) {
        console.log(`\nReasons:`);
        for (const reason of result.reasons) {
          console.log(`  ${COLORS.muted('•')} ${reason}`);
        }
      }

      if (result.rejections.length) {
        console.log(`\nRejections:`);
        for (const rejection of result.rejections) {
          console.log(`  ${COLORS.muted('•')} ${rejection}`);
        }
      }

      // Signal details
      const sig = result.signals;
      if (sig) {
        const parts = [];
        if (typeof sig.wordCount === 'number') parts.push(`wordCount=${sig.wordCount}`);
        if (typeof sig.navLinksCount === 'number') parts.push(`navLinks=${sig.navLinksCount}`);
        if (typeof sig.articleLinksCount === 'number') parts.push(`articleLinks=${sig.articleLinksCount}`);
        if (sig.combinedHint) parts.push(`combined=${sig.combinedHint}`);
        if (typeof sig.combinedConfidence === 'number') parts.push(`confidence=${sig.combinedConfidence.toFixed(2)}`);
        if (sig.latestClassification) parts.push(`latest=${sig.latestClassification}`);
        if (sig.contentSource) parts.push(`source=${sig.contentSource}`);
        if (typeof sig.schemaScore === 'number') parts.push(`schemaScore=${sig.schemaScore.toFixed(1)}`);
        if (sig.schemaStrength) parts.push(`schemaStrength=${sig.schemaStrength}`);
        if (Array.isArray(sig.schemaTypes) && sig.schemaTypes.length) {
          parts.push(`types=${sig.schemaTypes.join('|')}`);
        }
        if (parts.length) {
          console.log(`  ${COLORS.dim(`Signals: ${parts.join(', ')} (normalized schema - some legacy fields unavailable)`)}`);
        }
      }
      console.log();
    } else {
      // Simple mode - collect results for table display
      results.push({
        status: result.isArticle ? `${ICONS.success}` : `${ICONS.error}`,
        url: result.url,
        title: result.title ? result.title.substring(0, 40) : '(untitled)',
        score: options.scores ? result.score.toFixed(2) : '-',
        confidence: options.scores ? result.confidence.toFixed(2) : '-'
      });
    }

    // Progress indicator for long runs
    if ((processed % 50 === 0) && !options.explain) {
      const pct = Math.round((processed / rows.length) * 100);
      const filled = Math.floor((pct / 100) * 20);
      const empty = 20 - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      const pctStr = `${pct.toString().padStart(3)}%`;
      console.log(`  Processing ${COLORS.cyan(`[${bar}]`)} ${pctStr}`);
    }
  }

  // Show table if not in explain mode
  if (!options.explain && results.length > 0) {
    console.log(`\n${COLORS.bold(COLORS.accent('Results'))}`);
    console.log(COLORS.dim('───────'));
    
    // Simple table output
    for (const result of results) {
      const statusIcon = result.status === ICONS.success ? COLORS.success(result.status) : COLORS.error(result.status);
      const score = options.scores ? COLORS.cyan(result.score) : result.score;
      const confidence = options.scores ? COLORS.cyan(result.confidence) : result.confidence;
      if (options.scores) {
        console.log(`  ${statusIcon} ${result.url} - ${result.title} (Score: ${score}, Conf: ${confidence})`);
      } else {
        console.log(`  ${statusIcon} ${result.url} - ${result.title}`);
      }
    }
    console.log();
  }

  console.log();
  console.log(`  ${'Total processed'.padEnd(30)} ${processed}`);
  console.log(`  ${'Articles detected'.padEnd(30)} ${detected}`);
  console.log(`  ${'Not articles'.padEnd(30)} ${rejected}`);
  console.log(`  ${'Detection rate'.padEnd(30)} ${((detected / processed) * 100).toFixed(1)}%`);

  const line = '═'.repeat(80);
  console.log(`${COLORS.cyan(line)}\n`);

  try { db.close(); } catch (_) { /* ignore */ }
}

function main() {
  const options = parseCliArgs(process.argv);
  runDetectArticles(options);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.log(`${COLORS.error('[ERROR]')} Fatal error: ${error?.message || error}`);
    process.exit(1);
  }
}

module.exports = {
  parseCliArgs,
  evaluateArticleCandidate,
  runDetectArticles
};
