'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
/**
 * CLI tool to run site pattern analysis on eligible hosts
 * 
 * Usage:
 *   node tools/dev/run-pattern-analysis.js              # Analyze all eligible hosts
 *   node tools/dev/run-pattern-analysis.js --host bbc.com  # Analyze specific host
 *   node tools/dev/run-pattern-analysis.js --force      # Re-analyze even if recent
 *   node tools/dev/run-pattern-analysis.js --list       # List existing patterns
 */
const path = require('path');

const {
  analyzeHostPatterns,
  savePatterns,
  getHostPatterns,
  analyzeAllEligibleHosts,
  PAGE_THRESHOLD
} = require('../../src/services/sitePatternAnalysis');
const {
  listSitePatternHostSummaries
} = require('news-crawler-db');

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    host: null,
    force: false,
    list: false,
    json: false,
    threshold: PAGE_THRESHOLD
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--host' && args[i + 1]) {
      options.host = args[++i];
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--threshold' && args[i + 1]) {
      options.threshold = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Site Pattern Analysis Tool

Usage:
  node tools/dev/run-pattern-analysis.js [options]

Options:
  --host <host>      Analyze a specific host
  --force            Re-analyze even if recently analyzed
  --list             List existing patterns
  --json             Output as JSON
  --threshold <n>    Page threshold (default: ${PAGE_THRESHOLD})
  --help             Show this help

Examples:
  node tools/dev/run-pattern-analysis.js
  node tools/dev/run-pattern-analysis.js --host theguardian.com
  node tools/dev/run-pattern-analysis.js --list --host bbc.com
`);
      process.exit(0);
    }
  }
  
  return options;
}

function main() {
  const options = parseArgs();
  const db = openNewsCrawlerDb(dbPath);
  
  try {
    if (options.list) {
      // List existing patterns
      const host = options.host;
      if (host) {
        const patterns = getHostPatterns(db, host);
        if (options.json) {
          console.log(JSON.stringify(patterns, null, 2));
        } else {
          console.log(`\n=== Patterns for ${host} (${patterns.length}) ===\n`);
          for (const p of patterns) {
            console.log(`  [${p.pattern_type}] ${p.path_template}`);
            console.log(`    Confidence: ${(p.confidence * 100).toFixed(0)}%, Articles: ${p.article_count}, Children: ${p.child_count}`);
          }
        }
      } else {
        // List all hosts with patterns
        const hosts = listSitePatternHostSummaries(db);
        
        if (options.json) {
          console.log(JSON.stringify(hosts, null, 2));
        } else {
          console.log(`\n=== Hosts with patterns (${hosts.length}) ===\n`);
          for (const h of hosts) {
            console.log(`  ${h.host}: ${h.pattern_count} patterns (analyzed: ${h.last_analyzed})`);
          }
        }
      }
      return;
    }
    
    if (options.host) {
      // Analyze specific host
      console.log(`\nAnalyzing ${options.host}...`);
      const analysis = analyzeHostPatterns(db, options.host);
      
      if (options.json) {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        if (!analysis.eligible) {
          console.log(`❌ Not eligible: ${analysis.reason}`);
          return;
        }
        
        console.log(`\n✅ Found ${analysis.patterns.length} patterns for ${options.host}`);
        console.log(`   Page count: ${analysis.pageCount}`);
        console.log(`\nSection patterns:`);
        for (const p of analysis.patterns.filter(p => p.type === 'section')) {
          console.log(`  ${p.template} (${(p.confidence * 100).toFixed(0)}% confidence, ${p.articleCount} articles)`);
        }
        console.log(`\nPlace hub patterns:`);
        for (const p of analysis.patterns.filter(p => p.type === 'place-hub').slice(0, 10)) {
          console.log(`  ${p.path} → ${p.childCount} children, ${p.articleCount} articles`);
        }
        
        // Save patterns
        const saveResult = savePatterns(db, options.host, analysis.patterns);
        console.log(`\n💾 Saved ${saveResult.patternCount} patterns to database`);
      }
    } else {
      // Analyze all eligible hosts
      console.log(`\nAnalyzing all hosts with ${options.threshold}+ pages...`);
      const result = analyzeAllEligibleHosts(db, {
        threshold: options.threshold,
        force: options.force
      });
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\n=== Analysis Complete ===`);
        console.log(`  Hosts analyzed: ${result.hostsAnalyzed}`);
        console.log(`  Hosts skipped (recent): ${result.hostsSkipped}`);
        console.log(`  Hosts with no patterns: ${result.hostsNoPatterns}`);
        console.log(`  Total patterns saved: ${result.totalPatterns}`);
        
        console.log(`\nResults:`);
        for (const r of result.results) {
          if (r.status === 'analyzed') {
            console.log(`  ✅ ${r.host}: ${r.patternCount} patterns`);
          } else if (r.status === 'skipped') {
            console.log(`  ⏭️  ${r.host}: ${r.reason}`);
          } else {
            console.log(`  ❌ ${r.host}: ${r.reason}`);
          }
        }
      }
    }
  } finally {
    db.close();
  }
}

main();
