#!/usr/bin/env node
'use strict';

/**
 * crawl-sites.js — Crawl multiple sites with a concise API
 * 
 * Usage:
 *   node tools/dev/crawl-sites.js --sites bbc,guardian,reuters --pages 100
 *   node tools/dev/crawl-sites.js --sites all --pages 50
 *   node tools/dev/crawl-sites.js --list
 *   node tools/dev/crawl-sites.js --failed --pages 100  # Re-crawl sites that fell short
 * 
 * Sites can be specified by short name (bbc, guardian) or full URL.
 * Uses parallel execution with configurable concurrency.
 */

const { spawn } = require('child_process');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// Site Registry — Add new sites here
// ─────────────────────────────────────────────────────────────

const SITE_REGISTRY = {
  // Major International
  bbc:       { url: 'https://www.bbc.com/news',                 name: 'BBC News' },
  guardian:  { url: 'https://www.theguardian.com',              name: 'The Guardian' },
  reuters:   { url: 'https://www.reuters.com',                  name: 'Reuters' },
  aljazeera: { url: 'https://www.aljazeera.com',                name: 'Al Jazeera' },
  npr:       { url: 'https://www.npr.org',                      name: 'NPR' },
  
  // Regional
  abc:       { url: 'https://www.abc.net.au/news',              name: 'ABC Australia' },
  france24:  { url: 'https://www.france24.com/en',              name: 'France 24' },
  dw:        { url: 'https://www.dw.com/en',                    name: 'DW' },
  cbc:       { url: 'https://www.cbc.ca/news/canada/toronto',   name: 'CBC Ontario' },
  
  // US
  nyt:       { url: 'https://www.nytimes.com',                  name: 'New York Times' },
  wapo:      { url: 'https://www.washingtonpost.com',           name: 'Washington Post' },
  cnn:       { url: 'https://www.cnn.com',                      name: 'CNN' },
  fox:       { url: 'https://www.foxnews.com',                  name: 'Fox News' },
  
  // Tech
  ars:       { url: 'https://arstechnica.com',                  name: 'Ars Technica' },
  verge:     { url: 'https://www.theverge.com',                 name: 'The Verge' },
  wired:     { url: 'https://www.wired.com',                    name: 'Wired' },
  
  // International (non-English)
  spiegel:   { url: 'https://www.spiegel.de',                   name: 'Der Spiegel' },
  lemonde:   { url: 'https://www.lemonde.fr',                   name: 'Le Monde' },
  elpais:    { url: 'https://elpais.com',                       name: 'El País' },
};

// Site groups for convenience
const SITE_GROUPS = {
  all:          Object.keys(SITE_REGISTRY),
  international: ['bbc', 'guardian', 'reuters', 'aljazeera', 'npr', 'abc', 'france24', 'dw', 'cbc'],
  us:           ['nyt', 'wapo', 'cnn', 'fox', 'npr'],
  tech:         ['ars', 'verge', 'wired'],
  european:     ['guardian', 'bbc', 'france24', 'dw', 'spiegel', 'lemonde', 'elpais'],
};

// ─────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    sites: [],
    pages: 100,
    operation: 'siteExplorer',
    concurrency: 3,
    list: false,
    failed: false,
    threshold: 100, // Minimum pages expected
    since: null,    // Time filter for --failed
    help: false,
    verbose: false,
    dryRun: false,
    allCountries: true,   // Use all countries by default
    maxSeeds: null,       // Custom max seeds (null = all countries)
    db: null,             // Custom database path (null = default data/news.db)
    sitemap: false,       // Use sitemap-based discovery
    sitemapOnly: false,   // Strict sitemap-only mode
    diagnose: false,      // Run access diagnostics before crawling
    adaptive: false,      // Use adaptive strategy selection
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--list':
      case '-l':
        flags.list = true;
        break;
      case '--sites':
      case '-s':
        flags.sites = next.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;
      case '--pages':
      case '-n':
        flags.pages = parseInt(next, 10);
        i++;
        break;
      case '--operation':
      case '-o':
        flags.operation = next;
        i++;
        break;
      case '--concurrency':
      case '-c':
        flags.concurrency = parseInt(next, 10);
        i++;
        break;
      case '--failed':
      case '-f':
        flags.failed = true;
        break;
      case '--threshold':
      case '-t':
        flags.threshold = parseInt(next, 10);
        i++;
        break;
      case '--since':
        flags.since = next;
        i++;
        break;
      case '--verbose':
      case '-v':
        flags.verbose = true;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--all-countries':
      case '-a':
        flags.allCountries = true;
        break;
      case '--max-seeds':
        flags.maxSeeds = parseInt(next, 10);
        i++;
        break;
      case '--db':
        flags.db = next;
        i++;
        break;
      case '--sitemap':
      case '-m':
        flags.sitemap = true;
        break;
      case '--sitemap-only':
        flags.sitemapOnly = true;
        break;
      case '--diagnose':
      case '-d':
        flags.diagnose = true;
        break;
      case '--adaptive':
      case '-A':
        flags.adaptive = true;
        break;
      default:
        // Treat as site name if not a flag
        if (!arg.startsWith('-')) {
          flags.sites.push(arg.toLowerCase());
        }
    }
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────
// Resolve site names to URLs
// ─────────────────────────────────────────────────────────────

function resolveSites(siteNames) {
  const resolved = [];
  
  for (const name of siteNames) {
    // Check if it's a group name
    if (SITE_GROUPS[name]) {
      for (const siteName of SITE_GROUPS[name]) {
        const site = SITE_REGISTRY[siteName];
        if (site) {
          resolved.push({ key: siteName, ...site });
        }
      }
    }
    // Check if it's a site name
    else if (SITE_REGISTRY[name]) {
      resolved.push({ key: name, ...SITE_REGISTRY[name] });
    }
    // Check if it's a URL
    else if (name.startsWith('http')) {
      const host = new URL(name).hostname;
      resolved.push({ key: host, url: name, name: host });
    }
    else {
      console.error(`Unknown site: ${name}`);
    }
  }
  
  // Deduplicate
  const seen = new Set();
  return resolved.filter(s => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────
// Find sites that fell short of threshold
// ─────────────────────────────────────────────────────────────

async function findFailedSites(threshold, since) {
  const Database = require('better-sqlite3');
  const dbPath = path.join(process.cwd(), 'data', 'news.db');
  const db = new Database(dbPath, { readonly: true });
  
  const startTime = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  // Get download counts per host for known sites
  const failed = [];
  
  for (const [key, site] of Object.entries(SITE_REGISTRY)) {
    const host = new URL(site.url).hostname;
    
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM http_responses r
      JOIN urls u ON r.url_id = u.id
      WHERE u.host = ?
        AND r.fetched_at >= ?
        AND r.http_status = 200
    `);
    
    const result = stmt.get(host, startTime);
    const count = result?.count || 0;
    
    if (count < threshold) {
      failed.push({ 
        key, 
        ...site, 
        downloaded: count, 
        shortfall: threshold - count 
      });
    }
  }
  
  db.close();
  
  // Sort by shortfall (biggest gaps first)
  return failed.sort((a, b) => b.shortfall - a.shortfall);
}

// ─────────────────────────────────────────────────────────────
// Diagnose site accessibility
// ─────────────────────────────────────────────────────────────

async function diagnoseSite(site) {
  const https = require('https');
  const http = require('http');
  const url = new URL(site.url);
  const protocol = url.protocol === 'https:' ? https : http;
  
  const result = {
    site: site.name,
    url: site.url,
    status: null,
    statusText: null,
    headers: {},
    diagnosis: [],
    robotsTxt: null,
    sitemaps: []
  };
  
  // Check homepage
  try {
    const response = await new Promise((resolve, reject) => {
      const req = protocol.get(site.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      }, resolve);
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
    
    result.status = response.statusCode;
    result.statusText = response.statusMessage;
    result.headers = response.headers;
    
    // Collect body to check for Cloudflare
    let body = '';
    response.on('data', chunk => { body += chunk; if (body.length > 5000) response.destroy(); });
    await new Promise((resolve) => response.on('end', resolve).on('close', resolve));
    
    // Diagnose based on response
    if (result.status === 200) {
      result.diagnosis.push('✅ Homepage accessible');
      
      // Check for Cloudflare challenge page
      if (body.includes('Checking your browser') || body.includes('cf-browser-verification') || 
          body.includes('challenge-platform') || body.includes('Cloudflare')) {
        result.diagnosis.push('⚠️  Cloudflare browser check detected');
      }
      if (body.includes('captcha') || body.includes('CAPTCHA')) {
        result.diagnosis.push('⚠️  CAPTCHA detected');
      }
      if (body.includes('Access Denied') || body.includes('403 Forbidden')) {
        result.diagnosis.push('⚠️  Access denied message in body');
      }
    } else if (result.status === 401) {
      result.diagnosis.push('❌ 401 Unauthorized - requires authentication');
    } else if (result.status === 403) {
      result.diagnosis.push('❌ 403 Forbidden - access blocked');
      if (result.headers['server']?.toLowerCase().includes('cloudflare')) {
        result.diagnosis.push('   ↳ Cloudflare protection detected');
      }
    } else if (result.status >= 500) {
      result.diagnosis.push(`❌ Server error (${result.status})`);
    } else if (result.status >= 300 && result.status < 400) {
      result.diagnosis.push(`➡️  Redirect (${result.status}) → ${result.headers.location || 'unknown'}`);
    }
    
    // Check for rate limit headers
    if (result.headers['x-ratelimit-remaining']) {
      result.diagnosis.push(`📊 Rate limit remaining: ${result.headers['x-ratelimit-remaining']}`);
    }
    if (result.headers['retry-after']) {
      result.diagnosis.push(`⏱️  Retry-After: ${result.headers['retry-after']}s`);
    }
    
  } catch (err) {
    result.status = 'ERROR';
    result.diagnosis.push(`❌ Connection error: ${err.message}`);
  }
  
  // Check robots.txt
  try {
    const robotsUrl = `${url.origin}/robots.txt`;
    const robotsResponse = await new Promise((resolve, reject) => {
      const req = protocol.get(robotsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
        timeout: 5000
      }, resolve);
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
    
    if (robotsResponse.statusCode === 200) {
      let robotsBody = '';
      robotsResponse.on('data', chunk => { robotsBody += chunk; if (robotsBody.length > 10000) robotsResponse.destroy(); });
      await new Promise((resolve) => robotsResponse.on('end', resolve).on('close', resolve));
      
      result.robotsTxt = 'present';
      result.diagnosis.push('✅ robots.txt found');
      
      // Look for sitemaps
      const sitemapMatches = robotsBody.match(/Sitemap:\s*(.+)/gi) || [];
      result.sitemaps = sitemapMatches.map(m => m.replace(/Sitemap:\s*/i, '').trim());
      
      if (result.sitemaps.length > 0) {
        result.diagnosis.push(`📍 Found ${result.sitemaps.length} sitemap(s) in robots.txt`);
      }
      
      // Check for Disallow: /
      if (robotsBody.match(/Disallow:\s*\/\s*$/m)) {
        result.diagnosis.push('⚠️  robots.txt contains "Disallow: /"');
      }
    } else {
      result.robotsTxt = 'missing';
      result.diagnosis.push(`⚠️  robots.txt: ${robotsResponse.statusCode}`);
    }
  } catch (err) {
    result.robotsTxt = 'error';
    result.diagnosis.push(`⚠️  robots.txt error: ${err.message}`);
  }
  
  // Check standard sitemap.xml
  if (result.sitemaps.length === 0) {
    try {
      const sitemapUrl = `${url.origin}/sitemap.xml`;
      const sitemapResponse = await new Promise((resolve, reject) => {
        const req = protocol.get(sitemapUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
          timeout: 5000
        }, resolve);
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      });
      
      if (sitemapResponse.statusCode === 200) {
        result.sitemaps.push(sitemapUrl);
        result.diagnosis.push('📍 Found /sitemap.xml');
      }
    } catch (err) {
      // Silently ignore sitemap.xml check errors
    }
  }
  
  return result;
}

async function runDiagnostics(sites) {
  console.log(`\n🔬 Running access diagnostics for ${sites.length} site(s)...\n`);
  
  const results = [];
  for (const site of sites) {
    process.stdout.write(`Checking ${site.name}... `);
    const result = await diagnoseSite(site);
    results.push(result);
    console.log(`${result.status === 200 ? '✅' : '❌'} ${result.status}`);
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('📊 DIAGNOSTIC RESULTS\n');
  
  for (const r of results) {
    console.log(`${r.site} (${r.url})`);
    console.log(`  Status: ${r.status} ${r.statusText || ''}`);
    for (const d of r.diagnosis) {
      console.log(`  ${d}`);
    }
    if (r.sitemaps.length > 0) {
      console.log(`  Sitemaps:`);
      for (const sm of r.sitemaps.slice(0, 5)) {
        console.log(`    ${sm}`);
      }
      if (r.sitemaps.length > 5) {
        console.log(`    ... and ${r.sitemaps.length - 5} more`);
      }
    }
    console.log();
  }
  
  // Summary
  const accessible = results.filter(r => r.status === 200 && !r.diagnosis.some(d => d.includes('Cloudflare') || d.includes('CAPTCHA')));
  const blocked = results.filter(r => r.status === 403 || r.diagnosis.some(d => d.includes('Cloudflare') || d.includes('CAPTCHA')));
  const errors = results.filter(r => r.status === 'ERROR' || (r.status >= 400 && r.status !== 403));
  
  console.log('─'.repeat(60));
  console.log('Summary:');
  console.log(`  ✅ Accessible: ${accessible.length}`);
  console.log(`  🛡️  Blocked:    ${blocked.length}`);
  console.log(`  ❌ Errors:     ${errors.length}`);
  
  if (blocked.length > 0) {
    console.log('\n⚠️  Blocked sites may need Puppeteer fallback for crawling.');
  }
  
  return results;
}

// ─────────────────────────────────────────────────────────────
// Run a single crawl
// ─────────────────────────────────────────────────────────────

function runCrawl(site, options) {
  return new Promise((resolve) => {
    // Determine operation: adaptive mode overrides everything, then sitemap flags
    let operation = options.operation;
    let mode = 'explicit';
    
    if (options.adaptive) {
      // Adaptive mode - let mini-crawl choose the operation
      operation = 'basicArticleCrawl'; // Default, will be overridden by adaptive selector
      mode = 'adaptive';
    } else if (options.sitemapOnly) {
      operation = 'sitemapOnly';
      mode = 'sitemapOnly';
    } else if (options.sitemap) {
      operation = 'sitemapDiscovery';
      mode = 'sitemap';
    }
    
    const args = [
      path.join(__dirname, 'mini-crawl.js'),
      site.url,
      '-o', operation,
      '-n', String(options.pages),
      '--terse'
    ];
    
    if (options.adaptive) {
      args.push('--adaptive');
    }
    
    if (options.verbose) {
      args.push('-v');
    }
    
    // Pass max-seeds option for country hub limit
    if (options.allCountries) {
      args.push('--int-max-seeds', '0'); // 0 means all countries
    } else if (options.maxSeeds) {
      args.push('--int-max-seeds', String(options.maxSeeds));
    }
    
    // Pass custom database path
    if (options.db) {
      args.push('--db', options.db);
    }
    
    console.log(`🚀 Starting: ${site.name} [${mode}] → ${operation}`);
    const startTime = Date.now();
    
    const child = spawn('node', args, {
      stdio: options.verbose ? 'inherit' : ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    if (!options.verbose && child.stdout) {
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
    }
    if (!options.verbose && child.stderr) {
      child.stderr.on('data', (data) => {
        output += data.toString();
      });
    }
    
    child.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const status = code === 0 ? '✅' : '❌';
      console.log(`${status} Finished: ${site.name} (${duration}s, exit ${code})`);
      resolve({ site, code, duration, output });
    });
    
    child.on('error', (err) => {
      console.error(`❌ Error: ${site.name} - ${err.message}`);
      resolve({ site, code: 1, error: err.message });
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Run crawls with concurrency limit
// ─────────────────────────────────────────────────────────────

async function runCrawlsWithConcurrency(sites, options) {
  const results = [];
  const pending = [...sites];
  const active = new Set();
  
  console.log(`\n🕷️  Crawling ${sites.length} sites (concurrency: ${options.concurrency})\n`);
  
  async function startNext() {
    if (pending.length === 0) return;
    
    const site = pending.shift();
    active.add(site.key);
    
    const result = await runCrawl(site, options);
    results.push(result);
    active.delete(site.key);
    
    // Start next if pending
    if (pending.length > 0) {
      await startNext();
    }
  }
  
  // Start initial batch up to concurrency limit
  const initialBatch = Math.min(options.concurrency, sites.length);
  const promises = [];
  
  for (let i = 0; i < initialBatch; i++) {
    promises.push(startNext());
  }
  
  await Promise.all(promises);
  
  return results;
}

// ─────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
crawl-sites — Crawl multiple news sites with a concise API

USAGE:
  node tools/dev/crawl-sites.js --sites bbc,guardian,reuters --pages 100
  node tools/dev/crawl-sites.js --sites international --pages 50
  node tools/dev/crawl-sites.js --sitemap bbc reuters --pages 100
  node tools/dev/crawl-sites.js --failed --pages 100
  node tools/dev/crawl-sites.js --list

OPTIONS:
  --sites, -s <list>   Comma-separated site names or group
  --pages, -n <num>    Pages to crawl per site (default: 100)
  --operation, -o      Crawl operation (default: siteExplorer)
  --concurrency, -c    Parallel crawls (default: 3)
  --db <path>          Custom database path (default: data/news.db)
  --failed, -f         Re-crawl sites that fell short of threshold
  --threshold, -t      Minimum pages expected (default: 100)
  --since <time>       Time filter for --failed (default: last 24h)
  --list, -l           List available sites and groups
  --all-countries, -a  Use all countries from gazetteer (default: true)
  --max-seeds <n>      Limit to N countries (default: all)
  --sitemap, -m        Use sitemap-based discovery (avoids APS hub guessing)
  --sitemap-only       Strict sitemap-only mode (no link following)
  --adaptive, -A       Adaptive strategy: auto-select best discovery method
  --diagnose, -d       Run access diagnostics before crawling
  --dry-run            Show what would be crawled without starting
  --verbose, -v        Show full crawl output
  --help, -h           Show this help

CRAWL STRATEGIES:
  siteExplorer     Default: APS hub guessing + link following (can cause 404s)
  sitemapDiscovery Sitemap-first: robots.txt → sitemaps → links (recommended)
  sitemapOnly      Strict: only URLs from sitemap.xml, no link following
  basicArticleCrawl  Simple link following from homepage
  adaptive         Auto-select: checks sitemap, measures effectiveness, switches

SITES:
${Object.entries(SITE_REGISTRY).map(([k, v]) => `  ${k.padEnd(12)} ${v.name}`).join('\n')}

GROUPS:
${Object.entries(SITE_GROUPS).map(([k, v]) => `  ${k.padEnd(14)} ${v.join(', ')}`).join('\n')}

EXAMPLES:
  # Crawl BBC and Guardian (100 pages each)
  node tools/dev/crawl-sites.js bbc guardian

  # Adaptive mode - automatically picks best strategy per site
  node tools/dev/crawl-sites.js --adaptive bbc reuters aljazeera --pages 100

  # Crawl using sitemap discovery (recommended for unknown sites)
  node tools/dev/crawl-sites.js --sitemap bbc reuters aljazeera --pages 100

  # Crawl all international sites (50 pages each)
  node tools/dev/crawl-sites.js --sites international --pages 50

  # Re-crawl sites that got less than 100 pages in last session
  node tools/dev/crawl-sites.js --failed --since "2026-01-06T19:00:00"
  
  # Crawl with limited countries (default uses all)
  node tools/dev/crawl-sites.js bbc --pages 200 --max-seeds 50

  # Diagnose access issues before crawling
  node tools/dev/crawl-sites.js --diagnose bbc reuters aljazeera
`);
}

function showList() {
  console.log('\n📰 Available Sites:\n');
  for (const [key, site] of Object.entries(SITE_REGISTRY)) {
    console.log(`  ${key.padEnd(12)} ${site.name.padEnd(20)} ${site.url}`);
  }
  
  console.log('\n📦 Site Groups:\n');
  for (const [group, sites] of Object.entries(SITE_GROUPS)) {
    console.log(`  ${group.padEnd(14)} ${sites.join(', ')}`);
  }
  console.log();
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  
  if (flags.help) {
    showHelp();
    return;
  }
  
  if (flags.list) {
    showList();
    return;
  }
  
  let sites = [];
  
  // Handle --failed mode
  if (flags.failed) {
    console.log(`\n🔍 Finding sites that fell short of ${flags.threshold} pages...\n`);
    sites = await findFailedSites(flags.threshold, flags.since);
    
    if (sites.length === 0) {
      console.log('✅ All sites met the threshold!');
      return;
    }
    
    console.log('Sites to re-crawl:');
    for (const site of sites) {
      console.log(`  ${site.name.padEnd(20)} ${site.downloaded}/${flags.threshold} pages (shortfall: ${site.shortfall})`);
    }
    console.log();
  }
  // Handle explicit sites
  else if (flags.sites.length > 0) {
    sites = resolveSites(flags.sites);
  }
  else {
    showHelp();
    return;
  }
  
  if (sites.length === 0) {
    console.error('No valid sites specified.');
    process.exit(1);
  }
  
  if (flags.dryRun) {
    console.log('\n🔍 Dry run - would crawl:');
    const mode = flags.adaptive ? '🧠 adaptive' : 
                 flags.sitemapOnly ? 'sitemapOnly' :
                 flags.sitemap ? 'sitemapDiscovery' : flags.operation;
    for (const site of sites) {
      const seedsInfo = flags.maxSeeds ? `${flags.maxSeeds} countries` : 'all countries';
      console.log(`  ${site.name}: ${site.url} (${flags.pages} pages, ${mode}, ${seedsInfo})`);
    }
    return;
  }
  
  // Run diagnostics if requested
  if (flags.diagnose) {
    await runDiagnostics(sites);
    return;
  }
  
  // Run the crawls
  const startTime = Date.now();
  const results = await runCrawlsWithConcurrency(sites, {
    pages: flags.pages,
    operation: flags.operation,
    concurrency: flags.concurrency,
    verbose: flags.verbose,
    allCountries: flags.allCountries,
    maxSeeds: flags.maxSeeds,
    db: flags.db,
    sitemap: flags.sitemap,
    sitemapOnly: flags.sitemapOnly,
    adaptive: flags.adaptive
  });
  
  // Summary
  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const succeeded = results.filter(r => r.code === 0).length;
  const failed = results.filter(r => r.code !== 0).length;
  
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 Summary: ${succeeded} succeeded, ${failed} failed (${totalDuration} min total)`);
  if (flags.adaptive) {
    console.log(`🧠 Mode: Adaptive strategy selection`);
  }
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
