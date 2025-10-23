#!/usr/bin/env node

'use strict';

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');
const { CountryHubMatcher } = require('../../src/services/CountryHubMatcher');
const { normalizeHost } = require('../../src/db/sqlite/v1/queries/placeHubs');

function parseArgs(argv) {
  const args = {
    domain: null,
    dbPath: null,
    minNavLinks: 12,
    minArticleLinks: 0,
    dryRun: true,
    verbose: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw) continue;

    if (raw === '--help' || raw === '-h') {
      args.help = true;
      continue;
    }

    if (raw === '--apply' || raw === '--no-dry-run') {
      args.dryRun = false;
      continue;
    }

    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (raw === '--verbose' || raw === '-v') {
      args.verbose = true;
      continue;
    }

    if (raw.startsWith('--')) {
      const [flag, value] = raw.includes('=') ? raw.split('=') : [raw, null];
      switch (flag) {
        case '--db':
        case '--db-path':
          args.dbPath = value || argv[++i];
          break;
        case '--domain':
        case '--host':
          args.domain = value || argv[++i];
          break;
        case '--min-nav-links':
          args.minNavLinks = Number(value || argv[++i]);
          break;
        case '--min-article-links':
          args.minArticleLinks = Number(value || argv[++i]);
          break;
        default:
          // Unknown flag ignored for forward compatibility
          break;
      }
      continue;
    }

    // positional domain argument
    if (!args.domain) {
      args.domain = raw;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
match-country-hubs — Link verified country hub pages to gazetteer places

Usage:
  node tools/gazetteer/match-country-hubs.js [domain] [options]

Options:
  --domain DOMAIN            Domain or host to process (e.g., theguardian.com)
  --db PATH                  Path to news.db (defaults to data/news.db)
  --min-nav-links N          Minimum navigation links required (default: 12)
  --min-article-links N      Minimum article links fallback (default: 0)
  --apply                    Apply changes (default is dry-run)
  --dry-run                  Preview without writing changes
  --verbose                  Print detailed candidate evaluation
  --help                     Show this message

Examples:
  node tools/gazetteer/match-country-hubs.js theguardian.com
  node tools/gazetteer/match-country-hubs.js --domain bbc.co.uk --apply
`);
}

function printSummary({ host, dryRun, actions, skipped, analysisBefore, analysisAfter }) {
  const delta = analysisBefore.missing - analysisAfter.missing;
  console.log('\nSummary');
  console.log('───────');
  console.log(` Host:            ${host}`);
  console.log(` Mode:            ${dryRun ? 'dry-run (no changes applied)' : 'apply'}`);
  console.log(` Missing before:  ${analysisBefore.missing}`);
  console.log(` Missing after:   ${analysisAfter.missing}`);
  console.log(` Coverage before: ${analysisBefore.coveragePercent}%`);
  console.log(` Coverage after:  ${analysisAfter.coveragePercent}%`);
  console.log(` Linked:          ${actions.filter((action) => action.applied).length}`);
  console.log(` Skipped:         ${skipped.length}`);
  console.log(` Gap delta:       ${delta >= 0 ? `-${delta}` : `+${Math.abs(delta)}`} missing countries`);
}

function printActions(actions, { verbose }) {
  if (!actions.length) {
    console.log('\nNo new matches identified.');
    return;
  }

  console.log('\nLinked Country Hubs');
  console.log('────────────────────');
  for (const action of actions) {
    const { candidate, target } = action;
    console.log(` ✓ ${target.name} (${target.code || '??'}) → ${candidate.url}`);
    if (verbose) {
      console.log(`    placeId=${target.placeId} navLinks=${candidate.navLinksCount ?? 'n/a'} articleLinks=${candidate.articleLinksCount ?? 'n/a'}`);
    }
  }
}

function printSkipped(skipped, { verbose }) {
  if (!verbose || !skipped.length) return;
  console.log('\nSkipped Candidates');
  console.log('───────────────────');
  for (const entry of skipped) {
    const { candidate, reason } = entry;
    const parts = [`✗ ${candidate.url}`, `reason=${reason}`];
    if (candidate.navLinksCount != null) parts.push(`nav=${candidate.navLinksCount}`);
    if (candidate.articleLinksCount != null) parts.push(`articles=${candidate.articleLinksCount}`);
    if (candidate.placeSlug) parts.push(`slug=${candidate.placeSlug}`);
    console.log(` ${parts.join(' ')}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.domain) {
    showHelp();
    if (!args.domain) process.exit(1);
    return;
  }

  const domain = normalizeHost(args.domain);
  if (!domain) {
    console.error('Error: domain is required.');
    process.exit(1);
  }

  const dbPath = args.dbPath
    ? path.resolve(args.dbPath)
    : path.join(__dirname, '..', '..', 'data', 'news.db');

  const db = ensureDatabase(dbPath);
  try {
    const matcher = new CountryHubMatcher({
      db,
      minNavLinks: Number.isFinite(args.minNavLinks) ? Number(args.minNavLinks) : undefined,
      minArticleLinks: Number.isFinite(args.minArticleLinks) ? Number(args.minArticleLinks) : undefined,
      logger: console
    });

    const result = matcher.matchDomain(domain, {
      dryRun: args.dryRun,
      minNavLinks: Number.isFinite(args.minNavLinks) ? Number(args.minNavLinks) : undefined,
      minArticleLinks: Number.isFinite(args.minArticleLinks) ? Number(args.minArticleLinks) : undefined
    });

    printActions(result.actions.filter((action) => action.applied), args);
    printSkipped(result.skipped, args);
    printSummary(result);

    if (result.analysisAfter.missing === 0) {
      console.log('\nAll country hubs are now linked for this domain.');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}
