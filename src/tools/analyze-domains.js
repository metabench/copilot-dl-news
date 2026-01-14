#!/usr/bin/env node

/**
 * Analyze domains to infer categories like "news" with beautiful formatted output.
 * 
 * Heuristics:
 * - Number of article-classified fetches
 * - Number of distinct sections
 * - Proportion of URLs with date patterns (/yyyy/mm/dd/)
 * - Presence of meta og:type=news.article
 * 
 * Usage:
 *   node analyze-domains.js                      (analyze all domains)
 *   node analyze-domains.js --limit=50           (limit to first 50)
 *   node analyze-domains.js --db=custom.db       (custom database)
 */

const path = require('path');
const { evaluateDomainFromDb } = require('../is_this_a_news_website');
const { CliFormatter } = require('../shared/utils/CliFormatter');
const { CliArgumentParser } = require('../shared/utils/CliArgumentParser');

const fmt = new CliFormatter();

function compute429Stats(db, host, minutes) {
  if (!db || typeof db.getHttp429Stats !== 'function') {
    throw new Error('NewsDatabase#getHttp429Stats is required for domain analysis');
  }
  return db.getHttp429Stats(host, minutes);
}

/**
 * Parse command-line arguments
 */
function parseArgs(argv) {
  const parser = new CliArgumentParser(
    'analyze-domains',
    'Analyze domains to infer news site categories'
  );

  parser
    .add('--db <path>', 'Path to news database', path.join(process.cwd(), 'data', 'news.db'))
    .add('--limit <number>', 'Limit number of domains to analyze', 0, 'number');

  return parser.parse(argv);
}

function main() {
  const args = parseArgs(process.argv);

  let NewsDatabase;
  try {
    NewsDatabase = require('../data/db');
  } catch (e) {
    fmt.error('Database unavailable: ' + e.message);
    process.exit(1);
  }

  const db = new NewsDatabase(args.db);

  if (typeof db.listDomainHosts !== 'function') {
    fmt.error('NewsDatabase#listDomainHosts is required for domain analysis');
    process.exit(1);
  }

  const hosts = db.listDomainHosts({ limit: args.limit });

  fmt.header('Domain Analysis Results');
  fmt.settings(`Analyzing ${hosts.length} domain(s)...`);
  fmt.blank();

  const results = [];

  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    if (!host) continue;

    const { analysis } = evaluateDomainFromDb(db, host);
    const w15 = compute429Stats(db, host, 15);
    const w60 = compute429Stats(db, host, 60);

    const extended = {
      ...analysis,
      http429: {
        last_at: w60.last429At || w15.last429At || null,
        windows: {
          m15: { rpm: w15.rpm, ratio: w15.ratio, count: w15.count429, attempts: w15.attempts },
          m60: { rpm: w60.rpm, ratio: w60.ratio, count: w60.count429, attempts: w60.attempts }
        }
      }
    };

    db.upsertDomain(host, JSON.stringify(extended));
    if (extended.kind === 'news') {
      db.tagDomainWithCategory(host, 'news');
    }

    // Show progress for long runs
    if ((i + 1) % 50 === 0) {
      fmt.progress(`Processing domains`, i + 1, hosts.length);
    }

    // Build table row
    results.push({
      domain: host,
      type: extended.kind,
      score: extended.score.toFixed(3),
      articles: extended.articleCount || 0,
      sections: extended.sectionCount || 0,
      '429/15m': extended.http429.windows.m15.rpm.toFixed(2),
      '429/60m': extended.http429.windows.m60.rpm.toFixed(2),
    });
  }

  fmt.blank();

  // Display formatted table
  fmt.table(results, {
    columns: ['domain', 'type', 'score', 'articles', 'sections', '429/15m', '429/60m'],
    format: {
      type: (v) => v === 'news' ? fmt.COLORS.success(v) : v,
      score: (v) => fmt.COLORS.cyan(v),
      '429/15m': (v) => v > 0 ? fmt.COLORS.warning(v) : v,
      '429/60m': (v) => v > 0 ? fmt.COLORS.warning(v) : v,
    }
  });

  // Summary statistics
  const newsCount = results.filter(r => r.type === 'news').length;
  fmt.summary({
    'Total domains': results.length,
    'News domains': newsCount,
    'Other domains': results.length - newsCount,
    'Analyzed in': new Date().toISOString()
  });

  fmt.footer();
  db.close();
}

if (require.main === module) main();
