#!/usr/bin/env node
/**
 * verified-crawl.js — Run a crawl with post-completion verification
 * 
 * This is a wrapper around mini-crawl that adds:
 * 1. Pre-crawl baseline capture
 * 2. Post-crawl database verification  
 * 3. Evidence bundle generation
 * 
 * Usage:
 *   node tools/dev/verified-crawl.js https://example.com --target 50
 *   node tools/dev/verified-crawl.js https://theguardian.com --target 50 --timeout 600000
 * 
 * Output: Verified download count with DB evidence
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const evidence = require('../../src/data/db/queries/downloadEvidence');

const DB_PATH = path.join(process.cwd(), 'data', 'news.db');

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    help: false,
    url: null,
    target: 50,
    timeout: 600000,  // 10 minutes default
    json: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--target':
      case '-t':
        flags.target = parseInt(next, 10);
        i++;
        break;
      case '--timeout':
        flags.timeout = parseInt(next, 10);
        i++;
        break;
      case '--json':
        flags.json = true;
        break;
      case '-v':
      case '--verbose':
        flags.verbose = true;
        break;
      default:
        if (!arg.startsWith('-') && !flags.url) {
          flags.url = arg;
        }
    }
  }

  return flags;
}

function showHelp() {
  console.log(`
verified-crawl — Run a crawl with post-completion database verification

Usage:
  node tools/dev/verified-crawl.js <url> [options]

Options:
  --target <n>     Target download count (default: 50)
  --timeout <ms>   Timeout in ms (default: 600000 = 10 min)
  --json           Output results as JSON
  -v, --verbose    Verbose logging
  -h, --help       Show this help

Examples:
  # 50-page Guardian crawl with verification
  node tools/dev/verified-crawl.js https://www.theguardian.com --target 50

  # Quick test
  node tools/dev/verified-crawl.js https://example.com --target 5 --timeout 30000

Output:
  - Pre-crawl baseline count
  - Post-crawl verified count
  - Net new downloads (with DB evidence)
  - Evidence bundle (first 10 downloads with http_response_id)
`);
}

async function runMiniCrawl(url, maxPages, timeout, verbose) {
  return new Promise((resolve, reject) => {
    const args = [
      'tools/dev/mini-crawl.js',
      url,
      '--max-pages', String(maxPages),
      '--timeout', String(timeout),
      '--slow',  // Rate limit for The Guardian
      '--json'
    ];

    if (verbose) {
      console.log(`\n🕷️  Running: node ${args.join(' ')}\n`);
    }

    const proc = spawn('node', args, {
      cwd: process.cwd(),
      stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    if (!verbose) {
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = verbose ? null : JSON.parse(stdout);
          resolve({ success: true, result, stdout, stderr });
        } catch (e) {
          resolve({ success: true, result: null, stdout, stderr });
        }
      } else {
        resolve({ success: false, code, stdout, stderr });
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  const flags = parseArgs(process.argv);

  if (flags.help) {
    showHelp();
    return;
  }

  if (!flags.url) {
    console.error('Error: URL required. Use --help for usage.');
    process.exit(1);
  }

  const startTime = new Date();
  
  // Step 1: Capture baseline
  console.log('📊 Phase 1: Capturing baseline...');
  const db = new Database(DB_PATH, { readonly: true });
  const baseline = evidence.getGlobalStats(db);
  db.close();

  if (flags.verbose) {
    console.log(`   Baseline verified downloads: ${baseline.verified_downloads.toLocaleString()}`);
  }

  // Step 2: Run crawl
  console.log(`\n🕷️  Phase 2: Running crawl (target=${flags.target}, timeout=${flags.timeout}ms)...`);
  const crawlStart = new Date();
  
  const crawlResult = await runMiniCrawl(
    flags.url, 
    flags.target, 
    flags.timeout, 
    flags.verbose
  );

  const crawlEnd = new Date();
  const crawlElapsed = crawlEnd - crawlStart;

  if (!crawlResult.success) {
    console.error(`\n❌ Crawl failed with code ${crawlResult.code}`);
    if (crawlResult.stderr) {
      console.error(crawlResult.stderr);
    }
    process.exit(1);
  }

  // Step 3: Verify downloads
  console.log('\n✅ Phase 3: Verifying downloads in database...');
  const db2 = new Database(DB_PATH, { readonly: true });
  
  const postStats = evidence.getGlobalStats(db2);
  const newDownloads = postStats.verified_downloads - baseline.verified_downloads;

  // Get evidence for the new downloads
  const newEvidence = evidence.getDownloadEvidence(
    db2,
    crawlStart.toISOString(),
    crawlEnd.toISOString(),
    flags.target
  );

  // Filter to only verified downloads
  const verifiedEvidence = newEvidence.filter(e => 
    e.http_status === 200 && e.bytes_downloaded > 0
  );

  db2.close();

  // Step 4: Generate report
  const totalElapsed = new Date() - startTime;

  const report = {
    verification: {
      target: flags.target,
      verified_new_downloads: newDownloads,
      success: newDownloads >= flags.target,
      success_rate: ((newDownloads / flags.target) * 100).toFixed(1) + '%'
    },
    timing: {
      crawl_elapsed_ms: crawlElapsed,
      total_elapsed_ms: totalElapsed
    },
    baseline: {
      verified_downloads_before: baseline.verified_downloads,
      verified_downloads_after: postStats.verified_downloads
    },
    evidence_sample: verifiedEvidence.slice(0, 10).map(e => ({
      url: e.url,
      http_response_id: e.http_response_id,
      http_status: e.http_status,
      bytes: e.bytes_downloaded,
      fetched_at: e.fetched_at
    })),
    crawl_result: crawlResult.result
  };

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n' + '═'.repeat(60));
    console.log('📋 VERIFICATION REPORT');
    console.log('═'.repeat(60));
    
    const icon = report.verification.success ? '✅' : '⚠️';
    console.log(`\n${icon} Target: ${flags.target}, Verified: ${newDownloads}`);
    console.log(`   Success Rate: ${report.verification.success_rate}`);
    console.log(`   Crawl Duration: ${(crawlElapsed / 1000).toFixed(1)}s`);
    
    console.log('\n📊 Database Evidence:');
    console.log(`   Before: ${baseline.verified_downloads.toLocaleString()} verified downloads`);
    console.log(`   After:  ${postStats.verified_downloads.toLocaleString()} verified downloads`);
    console.log(`   Net New: ${newDownloads}`);
    
    if (verifiedEvidence.length > 0) {
      console.log('\n📄 Evidence Sample (first 5):');
      verifiedEvidence.slice(0, 5).forEach((e, i) => {
        console.log(`   [${i + 1}] id=${e.http_response_id} ${e.bytes_downloaded}B ${e.url.substring(0, 50)}...`);
      });
    }
    
    console.log('\n' + '═'.repeat(60));
  }

  // Exit with appropriate code
  process.exit(report.verification.success ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});

