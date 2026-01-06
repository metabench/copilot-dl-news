#!/usr/bin/env node

/**
 * Discover News Websites - CLI Tool
 * 
 * Analyzes domains in the database and automatically registers qualifying domains
 * as news websites based on crawl data analysis.
 * 
 * Usage:
 *   node src/tools/discover-news-websites.js [options]
 * 
 * Options:
 *   --dry-run              Show what would be registered without actually registering
 *   --limit <number>       Maximum number of domains to analyze (default: 100)
 *   --min-articles <n>     Minimum articles required (default: 20)
 *   --min-sections <n>     Minimum sections required (default: 3)
 *   --min-score <n>        Minimum score required (default: 0.5)
 *   --exclude <host>       Exclude specific host (can be used multiple times)
 *   --db <path>            Database path (default: data/news.db)
 */

const path = require('path');
const { createSQLiteDatabase } = require('../db/sqlite');
const { NewsWebsiteDiscovery } = require('../services/NewsWebsiteDiscovery');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: 100,
    dbPath: path.join(process.cwd(), 'data', 'news.db'),
    thresholds: {
      minArticleFetches: 20,
      minDistinctSections: 3,
      minScore: 0.5,
      minUrlsAnalyzed: 30,
      minDatedUrlRatio: 0.1
    },
    excludeHosts: []
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--limit') {
      args.limit = parseInt(argv[++i], 10);
    } else if (arg === '--min-articles') {
      args.thresholds.minArticleFetches = parseInt(argv[++i], 10);
    } else if (arg === '--min-sections') {
      args.thresholds.minDistinctSections = parseInt(argv[++i], 10);
    } else if (arg === '--min-score') {
      args.thresholds.minScore = parseFloat(argv[++i]);
    } else if (arg === '--exclude') {
      args.excludeHosts.push(argv[++i]);
    } else if (arg === '--db') {
      args.dbPath = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Discover News Websites - Automated News Website Discovery

Usage: node src/tools/discover-news-websites.js [options]

Options:
  --dry-run              Show what would be registered without actually registering
  --limit <number>       Maximum number of domains to analyze (default: 100)
  --min-articles <n>     Minimum articles required (default: 20)
  --min-sections <n>     Minimum sections required (default: 3)
  --min-score <n>        Minimum score required (default: 0.5)
  --exclude <host>       Exclude specific host (can be used multiple times)
  --db <path>            Database path (default: data/news.db)
  --help, -h             Show this help message

Examples:
  # Dry run to see what would be discovered
  node src/tools/discover-news-websites.js --dry-run

  # Discover with custom thresholds
  node src/tools/discover-news-websites.js --min-articles 50 --min-score 0.6

  # Exclude specific domains
  node src/tools/discover-news-websites.js --exclude example.com --exclude test.org
      `);
      process.exit(0);
    }
  }

  return args;
}

function formatMetrics(metrics) {
  return [
    `Articles: ${metrics.articleFetches}`,
    `Sections: ${metrics.distinctSections}`,
    `Dated URL Ratio: ${(metrics.datedUrlRatio * 100).toFixed(1)}%`
  ].join(', ');
}

async function main() {
  const args = parseArgs(process.argv);

  console.log('='.repeat(70));
  console.log('News Website Discovery Tool');
  console.log('='.repeat(70));
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Database: ${args.dbPath}`);
  console.log(`Limit: ${args.limit} domains`);
  console.log(`\nThresholds:`);
  console.log(`  - Min Articles: ${args.thresholds.minArticleFetches}`);
  console.log(`  - Min Sections: ${args.thresholds.minDistinctSections}`);
  console.log(`  - Min Score: ${args.thresholds.minScore}`);
  console.log(`  - Min URLs: ${args.thresholds.minUrlsAnalyzed}`);
  console.log(`  - Min Dated Ratio: ${(args.thresholds.minDatedUrlRatio * 100).toFixed(0)}%`);
  
  if (args.excludeHosts.length > 0) {
    console.log(`\nExcluded: ${args.excludeHosts.join(', ')}`);
  }
  console.log('='.repeat(70));
  console.log();

  // Open database
  const db = createSQLiteDatabase(args.dbPath);
  
  // Create discovery service
  const discovery = new NewsWebsiteDiscovery(db, {
    dryRun: args.dryRun,
    thresholds: args.thresholds,
    logger: console
  });

  try {
    // Run discovery
    const results = await discovery.run({
      limit: args.limit,
      excludeHosts: args.excludeHosts
    });

    console.log();
    console.log('='.repeat(70));
    console.log('DISCOVERY RESULTS');
    console.log('='.repeat(70));
    console.log(`Total domains analyzed: ${results.discovery.summary.total_analyzed}`);
    console.log(`New websites discovered: ${results.discovery.summary.new_websites}`);
    console.log(`Already registered: ${results.discovery.summary.already_registered}`);
    console.log(`Skipped (below threshold): ${results.discovery.summary.skipped}`);

    if (results.discovery.discovered.length > 0) {
      console.log();
      console.log('Discovered News Websites:');
      console.log('-'.repeat(70));
      
      for (const site of results.discovery.discovered) {
        console.log(`\n${site.host}`);
        console.log(`  Type: ${site.websiteType}`);
        console.log(`  Parent: ${site.parentDomain}`);
        console.log(`  Score: ${site.score.toFixed(3)} (confidence: ${site.confidence})`);
        console.log(`  Metrics: ${formatMetrics(site.metrics)}`);
        console.log(`  URLs in DB: ${site.url_count}`);
      }
    }

    if (!args.dryRun && results.registration) {
      console.log();
      console.log('='.repeat(70));
      console.log('REGISTRATION RESULTS');
      console.log('='.repeat(70));
      console.log(`Successfully registered: ${results.registration.summary.successful}`);
      console.log(`Failed: ${results.registration.summary.failed}`);

      if (results.registration.failed.length > 0) {
        console.log();
        console.log('Failed Registrations:');
        for (const fail of results.registration.failed) {
          console.log(`  - ${fail.host}: ${fail.error}`);
        }
      }
    }

    console.log();
    console.log('='.repeat(70));
    
    if (args.dryRun) {
      console.log('DRY RUN COMPLETE - No changes made to database');
      console.log('Run without --dry-run to register discovered websites');
    } else {
      console.log('COMPLETE');
    }
    
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error during discovery:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { main };
