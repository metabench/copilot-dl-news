#!/usr/bin/env node

'use strict';

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');
const { CountryHubMatcher } = require('../../src/services/CountryHubMatcher');
const { normalizeHost } = require('../../src/db/sqlite/v1/queries/placeHubs');

function parseArgs(argv) {
  const args = {
    domains: [],
    all: false,
    dryRun: true,
    minNavLinks: 8,
    minArticleLinks: 0,
    includeTopicHubs: false,
    requireHttpOk: true,
    showUnresolved: 10,
    verbose: false,
    summaryOnly: false,
    dbPath: null,
    hostPattern: null
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

    if (raw === '--all') {
      args.all = true;
      continue;
    }

    if (raw === '--verbose' || raw === '-v') {
      args.verbose = true;
      continue;
    }

    if (raw === '--summary-only') {
      args.summaryOnly = true;
      continue;
    }

    if (raw === '--include-topic-hubs') {
      args.includeTopicHubs = true;
      continue;
    }

    if (raw === '--no-http-check') {
      args.requireHttpOk = false;
      continue;
    }

    if (raw.startsWith('--')) {
      const [flag, value] = raw.includes('=') ? raw.split('=') : [raw, null];
      switch (flag) {
        case '--domain':
        case '--host':
          args.domains.push(value || argv[++i]);
          break;
        case '--db':
        case '--db-path':
          args.dbPath = value || argv[++i];
          break;
        case '--min-nav-links':
          args.minNavLinks = Number(value || argv[++i]);
          break;
        case '--min-article-links':
          args.minArticleLinks = Number(value || argv[++i]);
          break;
        case '--show-unresolved':
          args.showUnresolved = Number(value || argv[++i]);
          break;
        case '--pattern':
          args.hostPattern = value || argv[++i];
          break;
        default:
          // ignore unknown flag for forward compatibility
          break;
      }
      continue;
    }

    // positional domain
    args.domains.push(raw);
  }

  return args;
}

function showHelp() {
  console.log(`
reconcile-country-hubs — Sync crawled place hub pages to gazetteer mappings

Usage:
  node tools/gazetteer/reconcile-country-hubs.js [domain...] [options]

Options:
  --domain DOMAIN            Domain or host to reconcile (repeatable)
  --all                      Process every host present in place_hubs
  --pattern SUBSTRING        Filter --all hosts to those containing SUBSTRING
  --db PATH                  Path to news.db (defaults to data/news.db)
  --min-nav-links N          Minimum nav links required to trust a hub (default: 8)
  --min-article-links N      Minimum article links fallback (default: 0)
  --include-topic-hubs       Allow topic hubs to be considered
  --no-http-check            Include hubs without a recent HTTP 2xx fetch
  --show-unresolved N        Show up to N unresolved candidates per host (default: 10)
  --apply                    Write results to place_page_mappings (default: dry-run)
  --dry-run                  Preview changes without writing (default)
  --summary-only             Omit detailed per-host reporting
  --verbose                  Include extra diagnostic output
  --help                     Show this documentation

Examples:
  node tools/gazetteer/reconcile-country-hubs.js theguardian.com
  node tools/gazetteer/reconcile-country-hubs.js --domain bbc.co.uk --apply
  node tools/gazetteer/reconcile-country-hubs.js --all --pattern guardian --verbose
`);
}

function fetchHosts(db, { pattern } = {}) {
  const rows = db.prepare(`
    SELECT DISTINCT host
      FROM place_hubs
     WHERE host IS NOT NULL
       AND TRIM(host) != ''
     ORDER BY host ASC
  `).all();

  const normalized = new Set();
  for (const row of rows) {
    if (!row?.host) continue;
    const host = normalizeHost(row.host);
    if (!host) continue;
    if (pattern && !host.includes(pattern)) continue;
    normalized.add(host);
  }
  return Array.from(normalized.values());
}

function summarizeSkipped(skipped) {
  return skipped.reduce((acc, entry) => {
    const key = entry?.reason || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function printSkippedSamples(skipped, limit) {
  if (!limit || limit <= 0) return;
  const interesting = skipped.slice(0, limit);
  if (!interesting.length) return;

  console.log('\nUnresolved candidates (sample):');
  console.log('────────────────────────────────');
  for (const entry of interesting) {
    const { candidate, reason } = entry;
    if (!candidate) continue;
    const parts = [candidate.url];
    if (candidate.placeSlug) parts.push(`slug=${candidate.placeSlug}`);
    if (candidate.navLinksCount != null) parts.push(`nav=${candidate.navLinksCount}`);
    if (candidate.articleLinksCount != null) parts.push(`articles=${candidate.articleLinksCount}`);
    parts.push(`reason=${reason}`);
    console.log(` • ${parts.join(' ')}`);
  }
}

function printDomainReport(host, result, args) {
  const { dryRun } = args;
  const banner = `\n=== ${host} ===`;
  console.log(banner);
  console.log('='.repeat(banner.length - 1));

  const appliedActions = result.actions.filter((action) => action.applied);
  const pendingActions = result.actions.filter((action) => !action.applied);

  if (!args.summaryOnly) {
    if (dryRun) {
      if (pendingActions.length) {
        console.log('\nProposed links:');
        console.log('────────────────');
        for (const action of pendingActions) {
          const { candidate, target } = action;
          console.log(` ◦ ${target.name} (${target.code || '??'}) ← ${candidate.url}`);
        }
      } else {
        console.log('\nNo proposed links (dry-run).');
      }
    } else if (appliedActions.length) {
      console.log('\nApplied links:');
      console.log('───────────────');
      for (const action of appliedActions) {
        const { candidate, target } = action;
        console.log(` ✓ ${target.name} (${target.code || '??'}) ← ${candidate.url}`);
      }
    }

    const skippedSummary = summarizeSkipped(result.skipped);
    if (Object.keys(skippedSummary).length) {
      console.log('\nSkipped counts:');
      console.log('───────────────');
      for (const [reason, count] of Object.entries(skippedSummary).sort((a, b) => b[1] - a[1])) {
        console.log(` • ${reason}: ${count}`);
      }
    }

    if (args.verbose) {
      printSkippedSamples(result.skipped, args.showUnresolved);
    }
  }

  console.log('\nSummary');
  console.log('───────');
  console.log(` Mode:             ${dryRun ? 'dry-run (no changes applied)' : 'apply'}`);
  console.log(` Candidates:       ${result.candidateCount}`);
  console.log(` Linked now:       ${appliedActions.length}`);
  console.log(` Would link:       ${pendingActions.length}`);
  console.log(` Skipped:          ${result.skipped.length}`);
  console.log(` Missing before:   ${result.analysisBefore.missing}`);
  console.log(` Missing after:    ${result.analysisAfter.missing}`);
  console.log(` Coverage before:  ${result.analysisBefore.coveragePercent}%`);
  console.log(` Coverage after:   ${result.analysisAfter.coveragePercent}%`);
}

function aggregateTotals(previous, result) {
  return {
    candidateCount: previous.candidateCount + result.candidateCount,
    linked: previous.linked + result.actions.filter((action) => action.applied).length,
    pending: previous.pending + result.actions.filter((action) => !action.applied).length,
    skipped: previous.skipped + result.skipped.length
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    showHelp();
    return;
  }

  if (!args.all && args.domains.length === 0) {
    showHelp();
    process.exit(1);
    return;
  }

  const dbPath = args.dbPath
    ? path.resolve(args.dbPath)
    : path.join(__dirname, '..', '..', 'data', 'news.db');
  const db = ensureDatabase(dbPath);

  try {
    let hosts = [];
    if (args.all) {
      hosts = fetchHosts(db, { pattern: args.hostPattern || null });
    }

    if (args.domains.length) {
      for (const value of args.domains) {
        const normalized = normalizeHost(value);
        if (normalized) hosts.push(normalized);
      }
    }

    hosts = Array.from(new Set(hosts));
    if (!hosts.length) {
      console.error('No hosts to reconcile.');
      process.exit(1);
      return;
    }

    const matcher = new CountryHubMatcher({
      db,
      minNavLinks: Number.isFinite(args.minNavLinks) ? args.minNavLinks : undefined,
      minArticleLinks: Number.isFinite(args.minArticleLinks) ? args.minArticleLinks : undefined,
      logger: console
    });

    const totals = hosts.reduce((acc, host) => {
      const result = matcher.matchDomain(host, {
        dryRun: args.dryRun,
        minNavLinks: Number.isFinite(args.minNavLinks) ? args.minNavLinks : undefined,
        minArticleLinks: Number.isFinite(args.minArticleLinks) ? args.minArticleLinks : undefined,
        includeTopicHubs: args.includeTopicHubs,
        requireHttpOk: args.requireHttpOk
      });

      printDomainReport(host, result, args);
      return aggregateTotals(acc, result);
    }, {
      candidateCount: 0,
      linked: 0,
      pending: 0,
      skipped: 0
    });

    if (hosts.length > 1) {
      console.log('\nOverall totals');
      console.log('──────────────');
      console.log(` Hosts processed: ${hosts.length}`);
      console.log(` Candidates:      ${totals.candidateCount}`);
      console.log(` Linked now:      ${totals.linked}`);
      console.log(` Would link:      ${totals.pending}`);
      console.log(` Skipped:         ${totals.skipped}`);
    }

    if (args.dryRun) {
      console.log('\nRun again with --apply to write these mappings to place_page_mappings.');
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
