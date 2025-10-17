#!/usr/bin/env node

'use strict';

const path = require('path');
const {
  evaluateArticleCandidate,
  createArticleSignalsService
} = require('../analysis/articleDetection');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDb } = require('../db/sqlite/ensureDb');

function toInt(value) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function parseCliArgs(argv) {
  const options = {
    dbPath: null,
    limit: null,
    host: null,
    sample: null,
    explain: false,
    includeScores: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw) continue;

    if (raw === '--help' || raw === '-h') {
      options.help = true;
      continue;
    }
    if (raw === '--explain') {
      options.explain = true;
      continue;
    }
    if (raw === '--no-explain') {
      options.explain = false;
      continue;
    }
    if (raw === '--scores') {
      options.includeScores = true;
      continue;
    }

    if (!raw.startsWith('--')) {
      options.host = raw;
      continue;
    }

    const sep = raw.indexOf('=');
    const key = sep === -1 ? raw : raw.slice(0, sep);
    let value = sep === -1 ? null : raw.slice(sep + 1);

    if (value === null && argv[i + 1] && !argv[i + 1].startsWith('-')) {
      value = argv[i + 1];
      i += 1;
    }

    switch (key) {
      case '--db':
      case '--db-path':
        options.dbPath = value || null;
        break;
      case '--limit':
        options.limit = toInt(value);
        break;
      case '--sample':
      case '--random-sample':
        options.sample = toInt(value);
        break;
      case '--host':
        options.host = value || null;
        break;
      default:
        break;
    }
  }

  if (options.limit === 0) options.limit = null;
  if (options.sample === 0) options.sample = null;

  return options;
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

function printUsage() {
  const usage = `detect_articles - detect likely article pages\n\n` +
    `Usage: node src/tools/detect-articles.js [options] [host]\n\n` +
    `Options:\n` +
    `  --db <path>            Path to SQLite database (defaults to data/news.db)\n` +
    `  --limit <n>            Maximum records to inspect (unlimited by default)\n` +
    `  --sample <n>           Random sample size from articles table\n` +
    `  --host <host>          Restrict to a specific host\n` +
    `  --explain              Print reasoning for each decision\n` +
    `  --scores               Include score/confidence in summary output\n` +
    `  --help                 Show this help message\n`;
  console.log(usage);
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
  const dbPath = resolveDbPath(options.dbPath);
  const db = ensureDb(dbPath);
  const articleSignals = createArticleSignalsService();

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
  let processed = 0;
  let detected = 0;
  let rejected = 0;

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

    const label = result.isArticle ? 'ARTICLE ' : 'NOT    ';
    const summary = options.includeScores
      ? `${label} ${result.url} (score ${result.score}, confidence ${result.confidence.toFixed(2)})`
      : `${label} ${result.url}`;
    console.log(summary);

    if (options.explain) {
      if (result.title) {
        console.log(`  title: ${result.title}`);
      }
      if (result.reasons.length) {
        console.log('  reasons:');
        for (const reason of result.reasons) {
          console.log(`    - ${reason}`);
        }
      }
      if (result.rejections.length) {
        console.log('  rejections:');
        for (const rejection of result.rejections) {
          console.log(`    - ${rejection}`);
        }
      }
      const sig = result.signals;
      if (sig) {
        const parts = [];
        if (typeof sig.wordCount === 'number') parts.push(`wordCount=${sig.wordCount}`);
        if (typeof sig.navLinksCount === 'number') parts.push(`navLinks=${sig.navLinksCount}`);
        if (typeof sig.articleLinksCount === 'number') parts.push(`articleLinks=${sig.articleLinksCount}`);
        if (sig.combinedHint) parts.push(`combined=${sig.combinedHint}`);
        if (typeof sig.combinedConfidence === 'number') parts.push(`combinedConfidence=${sig.combinedConfidence.toFixed(2)}`);
        if (sig.latestClassification) parts.push(`latest=${sig.latestClassification}`);
        if (sig.contentSource) parts.push(`contentSource=${sig.contentSource}`);
        if (typeof sig.schemaScore === 'number') parts.push(`schemaScore=${sig.schemaScore.toFixed(1)}`);
        if (sig.schemaStrength) parts.push(`schemaStrength=${sig.schemaStrength}`);
        if (Array.isArray(sig.schemaTypes) && sig.schemaTypes.length) {
          parts.push(`schemaTypes=${sig.schemaTypes.join('|')}`);
        }
        if (Array.isArray(sig.schemaSources) && sig.schemaSources.length) {
          parts.push(`schemaSources=${sig.schemaSources.join('|')}`);
        }
        if (parts.length) console.log(`  signals: ${parts.join(', ')}`);
      }
    }
  }

  console.log(`\nProcessed ${processed} URLs. Detected ${detected} articles, rejected ${rejected}.`);

  try { db.close(); } catch (_) { /* ignore */ }
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  runDetectArticles(options);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[detect_articles] fatal error:', error && error.message ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  parseCliArgs,
  evaluateArticleCandidate,
  runDetectArticles
};
