#!/usr/bin/env node
'use strict';

/**
 * Hub Discovery End-to-End Test
 * 
 * This script orchestrates a full hub discovery test:
 * 1. Creates a fresh run folder with timestamped name
 * 2. Clones the gazetteer-only database
 * 3. Crawls 500 pages from each target website
 * 4. Runs content analysis on crawled pages
 * 5. Runs hub discovery (guessPlaceHubs) on each domain
 * 6. Produces diagnostic output for AI analysis
 * 
 * Usage:
 *   node tools/dev/hub-discovery-test.js [options]
 * 
 * Options:
 *   --pages <n>       Pages per site (default: 500)
 *   --sites <list>    Comma-separated sites (default: guardian,bbc,wapo)
 *   --skip-crawl      Skip crawl phase (use existing data)
 *   --skip-analysis   Skip analysis phase
 *   --run-dir <path>  Use existing run directory
 *   --verbose         Verbose output
 */

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const Database = require('better-sqlite3');

// ============================================================================
// Configuration
// ============================================================================

const SITES = {
  guardian: {
    name: 'The Guardian',
    url: 'https://www.theguardian.com',
    host: 'www.theguardian.com'
  },
  bbc: {
    name: 'BBC',
    url: 'https://www.bbc.com',
    host: 'www.bbc.com'
  },
  wapo: {
    name: 'Washington Post',
    url: 'https://www.washingtonpost.com',
    host: 'www.washingtonpost.com'
  },
  reuters: {
    name: 'Reuters',
    url: 'https://www.reuters.com',
    host: 'www.reuters.com'
  },
  nytimes: {
    name: 'NY Times',
    url: 'https://www.nytimes.com',
    host: 'www.nytimes.com'
  }
};

const DEFAULT_PAGES_PER_SITE = 500;
const DEFAULT_SITES = ['guardian', 'bbc', 'wapo'];

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    pages: DEFAULT_PAGES_PER_SITE,
    sites: DEFAULT_SITES,
    skipCrawl: false,
    skipAnalysis: false,
    runDir: null,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pages' && args[i + 1]) {
      flags.pages = parseInt(args[++i], 10);
    } else if (arg === '--sites' && args[i + 1]) {
      flags.sites = args[++i].split(',').map(s => s.trim().toLowerCase());
    } else if (arg === '--skip-crawl') {
      flags.skipCrawl = true;
    } else if (arg === '--skip-analysis') {
      flags.skipAnalysis = true;
    } else if (arg === '--run-dir' && args[i + 1]) {
      flags.runDir = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      flags.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Hub Discovery End-to-End Test

Usage:
  node tools/dev/hub-discovery-test.js [options]

Options:
  --pages <n>       Pages per site (default: ${DEFAULT_PAGES_PER_SITE})
  --sites <list>    Comma-separated sites: ${Object.keys(SITES).join(',')}
                    (default: ${DEFAULT_SITES.join(',')})
  --skip-crawl      Skip crawl phase (use existing data)
  --skip-analysis   Skip analysis phase
  --run-dir <path>  Use existing run directory
  --verbose, -v     Verbose output
  --help, -h        Show this help

Example:
  node tools/dev/hub-discovery-test.js --pages 100 --sites guardian,bbc
`);
      process.exit(0);
    }
  }

  // Validate sites
  flags.sites = flags.sites.filter(s => SITES[s]);
  if (flags.sites.length === 0) {
    console.error('Error: No valid sites specified');
    process.exit(1);
  }

  return flags;
}

// ============================================================================
// Utilities
// ============================================================================

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function log(msg, level = 'info') {
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warn: '⚠️',
    step: '🔄',
    data: '📊'
  }[level] || 'ℹ️';
  console.log(`${prefix} ${msg}`);
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Use process.execPath for 'node' to ensure it works on Windows
    const actualCmd = cmd === 'node' ? process.execPath : cmd;
    
    if (options.verbose) {
      console.log(`[DEBUG] Spawning: ${actualCmd} ${args.join(' ')}`);
    }
    
    const proc = spawn(actualCmd, args, {
      stdio: options.silent ? 'pipe' : 'inherit',
      shell: false,
      env: { ...process.env, ...options.env },
      cwd: options.cwd || process.cwd(),
      windowsHide: true
    });

    if (options.verbose) {
      console.log(`[DEBUG] Spawned with PID: ${proc.pid}`);
    }

    let stdout = '';
    let stderr = '';

    if (options.silent) {
      proc.stdout?.on('data', d => stdout += d);
      proc.stderr?.on('data', d => stderr += d);
    }

    proc.on('close', code => {
      if (options.verbose) {
        console.log(`[DEBUG] Process closed with code: ${code}`);
      }
      if (code === 0 || options.ignoreExitCode) {
        resolve({ code, stdout, stderr });
      } else {
        const errMsg = `Command failed with code ${code}: ${cmd} ${args.join(' ')}`;
        if (stderr) console.error(stderr);
        reject(new Error(errMsg));
      }
    });

    proc.on('error', (err) => {
      console.error(`[DEBUG] Spawn error for ${cmd}:`, err.message);
      reject(err);
    });
  });
}

// Synchronous command runner for critical blocking operations
function runCommandSync(cmd, args, options = {}) {
  const actualCmd = cmd === 'node' ? process.execPath : cmd;
  
  if (options.verbose) {
    console.log(`[SYNC] Running: ${actualCmd} ${args.join(' ')}`);
  }
  
  try {
    const result = spawnSync(actualCmd, args, {
      stdio: 'pipe',  // Always pipe to prevent inheritance issues
      env: { ...process.env, ...options.env },
      cwd: options.cwd || process.cwd(),
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024  // 50MB buffer
    });
    
    // Print output manually
    if (result.stdout && result.stdout.length > 0) {
      console.log(result.stdout.toString());
    }
    if (result.stderr && result.stderr.length > 0) {
      console.error(result.stderr.toString());
    }
    
    console.log(`[SYNC] Result status: ${result.status}, signal: ${result.signal}, error: ${result.error}`);
    
    if (result.error) {
      throw result.error;
    }
    
    if (result.status !== 0 && !options.ignoreExitCode) {
      const errMsg = `Command failed with code ${result.status}: ${cmd} ${args.join(' ')}`;
      throw new Error(errMsg);
    }
    
    return {
      code: result.status,
      stdout: result.stdout?.toString() || '',
      stderr: result.stderr?.toString() || ''
    };
  } catch (err) {
    console.error('[SYNC] Error:', err.message);
    throw err;
  }
}

// ============================================================================
// Phase 1: Setup
// ============================================================================

async function setupRunFolder(flags) {
  if (flags.runDir && fs.existsSync(flags.runDir)) {
    log(`Using existing run directory: ${flags.runDir}`);
    return flags.runDir;
  }

  const runId = `hub-test-${timestamp()}`;
  const runDir = path.join(process.cwd(), 'tmp', runId);
  
  fs.mkdirSync(runDir, { recursive: true });
  log(`Created run directory: ${runDir}`, 'success');

  // Create subdirectories
  fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'diagnostics'), { recursive: true });

  return runDir;
}

async function cloneGazetteerDb(runDir, verbose) {
  const dbPath = path.join(runDir, 'test.db');
  
  if (fs.existsSync(dbPath)) {
    log(`Database already exists: ${dbPath}`);
    return dbPath;
  }

  log('Cloning gazetteer-only database...', 'step');
  
  // Use sync version to ensure blocking wait
  runCommandSync('node', [
    'tools/dev/db-clone-gazetteer.js',
    '--dest', dbPath,
    '--overwrite'
  ], { verbose });

  log(`Database cloned: ${dbPath}`, 'success');
  return dbPath;
}

// ============================================================================
// Phase 2: Crawl
// ============================================================================

async function crawlSite(site, dbPath, pagesPerSite, runDir, verbose) {
  const siteConfig = SITES[site];
  const logFile = path.join(runDir, 'logs', `crawl-${site}.log`);
  
  log(`Crawling ${siteConfig.name} (${pagesPerSite} pages)...`, 'step');

  const startTime = Date.now();
  
  try {
    // Use sitemapDiscovery for better article coverage
    const result = await runCommand('node', [
      'tools/dev/mini-crawl.js',
      siteConfig.url,
      '-o', 'sitemapDiscovery',
      '-n', String(pagesPerSite),
      '--db', dbPath,
      verbose ? '-v' : ''
    ].filter(Boolean), {
      env: {
        GUESS_PLACE_HUBS_DISTRIBUTED: 'false'
      },
      silent: !verbose
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`${siteConfig.name} crawl complete in ${elapsed}s`, 'success');

    // Write log
    fs.writeFileSync(logFile, result.stdout + '\n' + result.stderr);

    return { site, success: true, elapsed };
  } catch (error) {
    log(`${siteConfig.name} crawl failed: ${error.message}`, 'error');
    fs.writeFileSync(logFile, error.message);
    return { site, success: false, error: error.message };
  }
}

async function runCrawlPhase(sites, dbPath, pagesPerSite, runDir, verbose) {
  log(`\n${'='.repeat(60)}`, 'info');
  log('PHASE 2: CRAWLING', 'info');
  log(`${'='.repeat(60)}\n`, 'info');

  const results = [];
  
  // Run crawls sequentially to avoid overwhelming the network
  for (const site of sites) {
    const result = await crawlSite(site, dbPath, pagesPerSite, runDir, verbose);
    results.push(result);
    
    // Check progress after each site
    const db = new Database(dbPath);
    const urlCount = db.prepare('SELECT COUNT(*) as cnt FROM urls').get().cnt;
    const fetchCount = db.prepare('SELECT COUNT(*) as cnt FROM http_responses').get().cnt;
    db.close();
    
    log(`Progress: ${urlCount} URLs discovered, ${fetchCount} pages fetched`, 'data');
  }

  return results;
}

// ============================================================================
// Phase 3: Analysis
// ============================================================================

async function runAnalysisPhase(dbPath, runDir, verbose) {
  log(`\n${'='.repeat(60)}`, 'info');
  log('PHASE 3: CONTENT ANALYSIS', 'info');
  log(`${'='.repeat(60)}\n`, 'info');

  // Check what we have to analyze
  const db = new Database(dbPath);
  const toAnalyze = db.prepare(`
    SELECT COUNT(*) as cnt 
    FROM http_responses 
    WHERE http_status = 200 
      AND id NOT IN (SELECT http_response_id FROM content_analysis WHERE http_response_id IS NOT NULL)
  `).get();
  db.close();

  log(`${toAnalyze.cnt} pages need analysis`, 'data');

  if (toAnalyze.cnt === 0) {
    log('No pages to analyze', 'warn');
    return { analyzed: 0 };
  }

  const startTime = Date.now();
  const logFile = path.join(runDir, 'logs', 'analysis.log');

  try {
    // Run the analysis lab with the test database
    await runCommand('node', [
      'labs/analysis-observable/run-lab.js',
      '--limit', String(toAnalyze.cnt),
      '--headless',
      '--db', dbPath
    ], {
      silent: !verbose,
      ignoreExitCode: true  // Analysis might have partial failures
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Check results
    const db2 = new Database(dbPath);
    const analyzed = db2.prepare('SELECT COUNT(*) as cnt FROM content_analysis').get().cnt;
    db2.close();

    log(`Analysis complete: ${analyzed} pages analyzed in ${elapsed}s`, 'success');
    return { analyzed, elapsed };
  } catch (error) {
    log(`Analysis failed: ${error.message}`, 'error');
    fs.writeFileSync(logFile, error.message);
    return { analyzed: 0, error: error.message };
  }
}

// ============================================================================
// Phase 4: Hub Discovery
// ============================================================================

async function runHubDiscoveryForSite(site, dbPath, runDir, verbose) {
  const siteConfig = SITES[site];
  const logFile = path.join(runDir, 'logs', `hub-discovery-${site}.log`);

  log(`Running hub discovery for ${siteConfig.name}...`, 'step');

  const startTime = Date.now();

  try {
    const result = await runCommand('node', [
      'tools/dev/mini-crawl.js',
      siteConfig.url,
      '-o', 'guessPlaceHubs',
      '-n', '500',  // Max pages to check
      '--db', dbPath,
      verbose ? '-v' : ''
    ].filter(Boolean), {
      env: {
        GUESS_PLACE_HUBS_DISTRIBUTED: 'false'
      },
      silent: !verbose
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`${siteConfig.name} hub discovery complete in ${elapsed}s`, 'success');
    
    fs.writeFileSync(logFile, result.stdout + '\n' + result.stderr);
    return { site, success: true, elapsed };
  } catch (error) {
    log(`${siteConfig.name} hub discovery failed: ${error.message}`, 'error');
    fs.writeFileSync(logFile, error.message);
    return { site, success: false, error: error.message };
  }
}

async function runHubDiscoveryPhase(sites, dbPath, runDir, verbose) {
  log(`\n${'='.repeat(60)}`, 'info');
  log('PHASE 4: HUB DISCOVERY', 'info');
  log(`${'='.repeat(60)}\n`, 'info');

  const results = [];
  
  for (const site of sites) {
    const result = await runHubDiscoveryForSite(site, dbPath, runDir, verbose);
    results.push(result);
  }

  return results;
}

// ============================================================================
// Phase 5: Diagnostics
// ============================================================================

function generateDiagnostics(dbPath, runDir, sites) {
  log(`\n${'='.repeat(60)}`, 'info');
  log('PHASE 5: DIAGNOSTICS', 'info');
  log(`${'='.repeat(60)}\n`, 'info');

  const db = new Database(dbPath);
  const diagnostics = {
    timestamp: new Date().toISOString(),
    runDir,
    dbPath,
    sites: sites.map(s => SITES[s].host)
  };

  // URL stats
  diagnostics.urls = {
    total: db.prepare('SELECT COUNT(*) as cnt FROM urls').get().cnt,
    byHost: db.prepare(`
      SELECT host, COUNT(*) as cnt 
      FROM urls 
      WHERE host IN (${sites.map(s => `'${SITES[s].host}'`).join(',')})
      GROUP BY host 
      ORDER BY cnt DESC
    `).all()
  };

  // HTTP response stats
  diagnostics.httpResponses = {
    total: db.prepare('SELECT COUNT(*) as cnt FROM http_responses').get().cnt,
    byStatus: db.prepare(`
      SELECT http_status, COUNT(*) as cnt 
      FROM http_responses 
      GROUP BY http_status 
      ORDER BY cnt DESC
    `).all(),
    byHost: db.prepare(`
      SELECT u.host, COUNT(*) as cnt, 
        SUM(CASE WHEN hr.http_status = 200 THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN hr.http_status = 404 THEN 1 ELSE 0 END) as not_found
      FROM http_responses hr
      JOIN urls u ON hr.url_id = u.id
      WHERE u.host IN (${sites.map(s => `'${SITES[s].host}'`).join(',')})
      GROUP BY u.host
    `).all()
  };

  // Analysis stats
  diagnostics.analysis = {
    total: db.prepare('SELECT COUNT(*) as cnt FROM content_analysis').get().cnt,
    withPlaces: db.prepare(`
      SELECT COUNT(*) as cnt FROM content_analysis 
      WHERE places_detected IS NOT NULL AND places_detected != '[]'
    `).get().cnt
  };

  // Place hub candidates
  diagnostics.hubCandidates = {
    total: db.prepare('SELECT COUNT(*) as cnt FROM place_hub_candidates').get().cnt,
    byStatus: db.prepare(`
      SELECT status, COUNT(*) as cnt 
      FROM place_hub_candidates 
      GROUP BY status 
      ORDER BY cnt DESC
    `).all(),
    byDomain: db.prepare(`
      SELECT domain, COUNT(*) as cnt,
        SUM(CASE WHEN status LIKE '%ok%' THEN 1 ELSE 0 END) as verified_ok,
        SUM(CASE WHEN status LIKE '%404%' THEN 1 ELSE 0 END) as not_found
      FROM place_hub_candidates 
      GROUP BY domain
    `).all(),
    sampleVerified: db.prepare(`
      SELECT domain, candidate_url, place_name, status
      FROM place_hub_candidates 
      WHERE status LIKE '%ok%'
      LIMIT 20
    `).all(),
    sample404: db.prepare(`
      SELECT domain, candidate_url, place_name, status
      FROM place_hub_candidates 
      WHERE status LIKE '%404%'
      LIMIT 10
    `).all()
  };

  // Place page mappings
  diagnostics.pageMappings = {
    total: db.prepare('SELECT COUNT(*) as cnt FROM place_page_mappings').get().cnt,
    byStatus: db.prepare(`
      SELECT status, COUNT(*) as cnt 
      FROM place_page_mappings 
      GROUP BY status
    `).all()
  };

  db.close();

  // Write diagnostics
  const diagFile = path.join(runDir, 'diagnostics', 'summary.json');
  fs.writeFileSync(diagFile, JSON.stringify(diagnostics, null, 2));

  // Generate human-readable report
  const report = generateReport(diagnostics);
  const reportFile = path.join(runDir, 'diagnostics', 'REPORT.md');
  fs.writeFileSync(reportFile, report);

  log(`Diagnostics written to: ${runDir}/diagnostics/`, 'success');

  return diagnostics;
}

function generateReport(d) {
  const lines = [
    '# Hub Discovery Test Report',
    '',
    `**Run Time**: ${d.timestamp}`,
    `**Run Directory**: ${d.runDir}`,
    `**Database**: ${d.dbPath}`,
    `**Sites Tested**: ${d.sites.join(', ')}`,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| Total URLs Discovered | ${d.urls.total} |`,
    `| Total Pages Fetched | ${d.httpResponses.total} |`,
    `| Pages Analyzed | ${d.analysis.total} |`,
    `| Hub Candidates Generated | ${d.hubCandidates.total} |`,
    `| **Place Page Mappings** | **${d.pageMappings.total}** |`,
    '',
    '## URLs by Host',
    '',
    '| Host | URLs |',
    '|------|------|',
    ...d.urls.byHost.map(h => `| ${h.host} | ${h.cnt} |`),
    '',
    '## HTTP Responses by Host',
    '',
    '| Host | Total | 200 OK | 404 |',
    '|------|-------|--------|-----|',
    ...d.httpResponses.byHost.map(h => `| ${h.host} | ${h.cnt} | ${h.ok} | ${h.not_found} |`),
    '',
    '## Hub Candidates by Status',
    '',
    '| Status | Count |',
    '|--------|-------|',
    ...d.hubCandidates.byStatus.map(s => `| ${s.status || 'null'} | ${s.cnt} |`),
    '',
    '## Hub Candidates by Domain',
    '',
    '| Domain | Total | Verified OK | 404 |',
    '|--------|-------|-------------|-----|',
    ...d.hubCandidates.byDomain.map(h => `| ${h.domain} | ${h.cnt} | ${h.verified_ok} | ${h.not_found} |`),
    '',
    '## Verified Working Hubs (Sample)',
    '',
    '| Domain | Country | URL |',
    '|--------|---------|-----|',
    ...d.hubCandidates.sampleVerified.map(h => `| ${h.domain} | ${h.place_name} | ${h.candidate_url} |`),
    '',
    '## 404 Hubs (Sample)',
    '',
    '| Domain | Country | URL |',
    '|--------|---------|-----|',
    ...d.hubCandidates.sample404.map(h => `| ${h.domain} | ${h.place_name} | ${h.candidate_url} |`),
    '',
    '## Failure Analysis',
    '',
    d.pageMappings.total === 0 ? 
      '⚠️ **ISSUE**: place_page_mappings is empty!\n\nThis means hub candidates were discovered but NOT promoted to verified mappings.\n\n**Possible causes**:\n1. The guessPlaceHubs operation only writes to `place_hub_candidates`, not `place_page_mappings`\n2. A separate promotion step is required to move verified candidates to mappings\n3. The `--persist` or similar flag may be needed\n\n**Next steps**:\n1. Check if there\'s a promotion script (e.g., `promote-hub-candidates.js`)\n2. Look for `--persist` or `--apply` flags in the hub discovery operation\n3. Check the hub discovery code for how mappings should be created' :
      '✅ Place page mappings were created successfully.',
    '',
    '## Raw Data Location',
    '',
    '- Database: `' + d.dbPath + '`',
    '- Logs: `' + d.runDir + '/logs/`',
    '- This report: `' + d.runDir + '/diagnostics/REPORT.md`',
    ''
  ];

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const startTime = Date.now();
  const flags = parseArgs();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           HUB DISCOVERY END-TO-END TEST                      ║
╠══════════════════════════════════════════════════════════════╣
║  Sites:    ${flags.sites.join(', ').padEnd(47)}║
║  Pages:    ${String(flags.pages).padEnd(47)}║
╚══════════════════════════════════════════════════════════════╝
`);

  try {
    // Phase 1: Setup
    log(`\n${'='.repeat(60)}`, 'info');
    log('PHASE 1: SETUP', 'info');
    log(`${'='.repeat(60)}\n`, 'info');

    const runDir = await setupRunFolder(flags);
    console.log('[DEBUG] setupRunFolder complete');
    const dbPath = await cloneGazetteerDb(runDir, flags.verbose);
    console.log('[DEBUG] cloneGazetteerDb complete, dbPath:', dbPath);

    // Phase 2: Crawl
    console.log('[DEBUG] Starting Phase 2');
    let crawlResults = [];
    if (!flags.skipCrawl) {
      crawlResults = await runCrawlPhase(flags.sites, dbPath, flags.pages, runDir, flags.verbose);
    } else {
      log('Skipping crawl phase (--skip-crawl)', 'warn');
    }

    // Phase 3: Analysis
    let analysisResults = {};
    if (!flags.skipAnalysis) {
      analysisResults = await runAnalysisPhase(dbPath, runDir, flags.verbose);
    } else {
      log('Skipping analysis phase (--skip-analysis)', 'warn');
    }

    // Phase 4: Hub Discovery
    const hubResults = await runHubDiscoveryPhase(flags.sites, dbPath, runDir, flags.verbose);

    // Phase 5: Diagnostics
    const diagnostics = generateDiagnostics(dbPath, runDir, flags.sites);

    // Final summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    TEST COMPLETE                             ║
╠══════════════════════════════════════════════════════════════╣
║  Total Time:        ${(elapsed + 's').padEnd(40)}║
║  URLs Discovered:   ${String(diagnostics.urls.total).padEnd(40)}║
║  Pages Fetched:     ${String(diagnostics.httpResponses.total).padEnd(40)}║
║  Pages Analyzed:    ${String(diagnostics.analysis.total).padEnd(40)}║
║  Hub Candidates:    ${String(diagnostics.hubCandidates.total).padEnd(40)}║
║  Page Mappings:     ${String(diagnostics.pageMappings.total).padEnd(40)}║
╠══════════════════════════════════════════════════════════════╣
║  Run Directory:     ${runDir.slice(-42).padEnd(40)}║
║  Report:            diagnostics/REPORT.md                    ║
╚══════════════════════════════════════════════════════════════╝
`);

    // Exit with error if no mappings created
    if (diagnostics.pageMappings.total === 0 && diagnostics.hubCandidates.total > 0) {
      log('WARNING: Hub candidates found but no page mappings created!', 'warn');
      log('See REPORT.md for failure analysis', 'warn');
      process.exit(1);
    }

  } catch (error) {
    log(`Test failed: ${error.message}`, 'error');
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main().catch(err => {
  console.error('Main failed:', err);
  process.exit(1);
});
