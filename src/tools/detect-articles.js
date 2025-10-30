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
} = require('../analysis/articleDetection');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDb } = require('../db/sqlite/ensureDb');
const { CliFormatter, ICONS } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');

const fmt = new CliFormatter();

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

function buildCandidateQuery(options) {
  const where = ["a.url LIKE 'http%'"]; // only consider http(s) URLs
  if (options.host) {
    where.push('LOWER(a.host) = LOWER(?)');
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const orderClause = options.sample ? 'ORDER BY RANDOM()' : 'ORDER BY COALESCE(a.fetched_at, a.crawled_at) DESC';

  let limitClause = '';
  if (options.sample) {
    limitClause = `LIMIT ${options.sample}`;
  } else if (options.limit) {
    limitClause = `LIMIT ${options.limit}`;
  }

  return `
    SELECT a.url,
           a.title,
           a.host,
           a.word_count AS article_word_count,
           a.analysis AS article_analysis,
           lf.classification AS latest_classification,
           lf.word_count AS latest_word_count
      FROM articles a
 LEFT JOIN latest_fetch lf ON lf.url = a.url
      ${whereClause}
      ${orderClause}
      ${limitClause}
  `;
}

function resolveDbPath(dbPath) {
  if (dbPath) {
    return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  }
  const root = findProjectRoot(__dirname);
  return path.join(root, 'data', 'news.db');
}

function loadCandidates(db, options) {
  const sql = buildCandidateQuery(options);
  const statement = db.prepare(sql);
  const params = [];
  if (options.host) {
    params.push(options.host);
  }
  return statement.all(...params);
}

function runDetectArticles(options) {
  const dbPath = resolveDbPath(options.db);
  const db = ensureDb(dbPath);
  const articleSignals = createArticleSignalsService();

  fmt.header('Article Detection Analysis');

  // Build query info
  const filters = [];
  if (options.host) filters.push(`host = ${options.host}`);
  if (options.limit) filters.push(`limit = ${options.limit}`);
  if (options.sample) filters.push(`sample = ${options.sample}`);
  if (filters.length > 0) {
    fmt.info(`Filters: ${filters.join(', ')}`);
  }
  fmt.blank();

  const fetchDetailsStmt = db.prepare(`
    SELECT nav_links_count,
           article_links_count,
           word_count,
           analysis
      FROM fetches
     WHERE url = ?
  ORDER BY COALESCE(fetched_at, request_started_at) DESC
     LIMIT 1
  `);

  const rows = loadCandidates(db, options);

  fmt.pending(`Loading ${rows.length} candidate(s)...`);
  fmt.blank();

  let processed = 0;
  let detected = 0;
  let rejected = 0;
  const results = [];

  for (const row of rows) {
    const fetchDetails = fetchDetailsStmt.get(row.url) || {};

    const result = evaluateArticleCandidate({
      url: row.url,
      title: row.title,
      articleWordCount: typeof row.article_word_count === 'number' ? row.article_word_count : (row.article_word_count != null ? Number(row.article_word_count) : null),
      fetchWordCount: typeof fetchDetails.word_count === 'number'
        ? fetchDetails.word_count
        : (typeof row.latest_word_count === 'number'
          ? row.latest_word_count
          : (row.latest_word_count != null ? Number(row.latest_word_count) : null)),
      articleAnalysis: row.article_analysis,
      fetchAnalysis: fetchDetails.analysis || null,
      latestClassification: row.latest_classification,
      navLinksCount: typeof fetchDetails.nav_links_count === 'number' ? fetchDetails.nav_links_count : null,
      articleLinksCount: typeof fetchDetails.article_links_count === 'number' ? fetchDetails.article_links_count : null
    }, { signalsService: articleSignals });

    processed += 1;
    if (result.isArticle) detected += 1; else rejected += 1;

    // Display detailed output for each URL if explain mode
    if (options.explain) {
      const icon = result.isArticle ? fmt.ICONS.success : fmt.ICONS.error;
      const color = result.isArticle ? 'success' : 'error';
      console.log(`${fmt.COLORS[color](`${icon} ${result.url}`)}`);

      if (result.title) {
        fmt.dataPair('Title', result.title, 'muted');
      }

      if (options.scores) {
        fmt.dataPair('Score', result.score.toFixed(2), 'cyan');
        fmt.dataPair('Confidence', result.confidence.toFixed(2), 'cyan');
      }

      if (result.reasons.length) {
        fmt.list('Reasons', result.reasons);
      }

      if (result.rejections.length) {
        fmt.list('Rejections', result.rejections);
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
          console.log(`  ${fmt.COLORS.dim(`Signals: ${parts.join(', }`)}`);
        }
      }
      fmt.blank();
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
      fmt.progress(`Processing`, processed, rows.length);
    }
  }

  // Show table if not in explain mode
  if (!options.explain && results.length > 0) {
    fmt.section('Results');
    fmt.table(results, {
      columns: options.scores ? ['status', 'url', 'title', 'score', 'confidence'] : ['status', 'url', 'title'],
      format: {
        status: (v) => v === fmt.ICONS.success ? fmt.COLORS.success(v) : fmt.COLORS.error(v),
        score: (v) => fmt.COLORS.cyan(v),
        confidence: (v) => fmt.COLORS.cyan(v)
      }
    });
  }

  fmt.blank();
  fmt.summary({
    'Total processed': processed,
    'Articles detected': detected,
    'Not articles': rejected,
    'Detection rate': `${((detected / processed) * 100).toFixed(1)}%`
  });

  fmt.footer();

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
    fmt.error('Fatal error: ' + (error && error.message ? error.message : error));
    process.exit(1);
  }
}

module.exports = {
  parseCliArgs,
  evaluateArticleCandidate,
  runDetectArticles
};
