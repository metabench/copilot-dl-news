'use strict';
// Commit + push: 100-site list + DB-only data audit.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'docs/plans/2026-07-16-news-sites-100-and-db-only-audit.md',
  'tools/dev-bridge/checks/probe-site-geo-tables.js',
  'tools/dev-bridge/checks/commit-sites-audit.js'
]);
git(['commit', '-m',
  'Docs: 100 news sites + audit of site/geo data living outside news.db\n\n' +
  'Audit findings: news_websites rows are seeded from\n' +
  'data/bootstrap/news-sources.json (runtime-read, insert-if-missing);\n' +
  'config/news-sources.json holds per-site country/language/selectors but\n' +
  'is read by no runtime code; wikidata-adm1-snapshot.json is file-based\n' +
  'geo seed data; gazetteer.db / gazetteer-standalone.db / crawl-multi.db /\n' +
  'crawl-data.sqlite are stray sibling stores (crawl-multi has live\n' +
  'domain_intelligence rows); config/puppeteer-domains.json exists but the\n' +
  'manager resolves src/config/ so it silently falls back to the\n' +
  'hard-coded list. Doc includes the curated 100-site table\n' +
  '(domain/name/country/lang/tier) and a no-new-files ingestion plan.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
