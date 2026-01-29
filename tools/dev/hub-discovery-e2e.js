#!/usr/bin/env node
/**
 * Hub Discovery End-to-End Test
 * 
 * Tests the complete hub discovery pipeline:
 * 1. Create test database from news.db gazetteer (read-only from news.db)
 * 2. Crawl 500+ pages per publisher using parallel HTTP requests
 * 3. Analyze URL patterns to find hub structures
 * 4. Guess country hub URLs based on patterns
 * 5. Verify which country hubs exist
 * 6. Report findings
 * 
 * Usage:
 *   node tools/dev/hub-discovery-e2e.js [options]
 * 
 * Options:
 *   --pages <n>        Pages per publisher (default: 500)
 *   --publishers <list> Comma-separated publisher names to test
 *   --db <path>        Path to test database (default: tmp/hub-discovery-test.db)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const Database = require('better-sqlite3');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SOURCE_DB = path.join(__dirname, '../../data/news.db');
const DEFAULT_TEST_DB = path.join(__dirname, '../../tmp/hub-discovery-test.db');
const DISTRIBUTED_WORKER = 'http://144.21.42.149:8081/batch';

// Publishers covering UK, Canada, Colombia, Venezuela + general international
// Mix of English and Spanish language content
const PUBLISHERS = [
  // UK-focused
  { name: 'The Guardian', host: 'www.theguardian.com', url: 'https://www.theguardian.com', lang: 'en' },
  { name: 'BBC', host: 'www.bbc.com', url: 'https://www.bbc.com/news', lang: 'en' },
  { name: 'The Independent', host: 'www.independent.co.uk', url: 'https://www.independent.co.uk', lang: 'en' },
  { name: 'Sky News', host: 'news.sky.com', url: 'https://news.sky.com', lang: 'en' },
  
  // Canada-focused
  { name: 'CBC', host: 'www.cbc.ca', url: 'https://www.cbc.ca/news', lang: 'en' },
  { name: 'Toronto Star', host: 'www.thestar.com', url: 'https://www.thestar.com', lang: 'en' },
  { name: 'Global News', host: 'globalnews.ca', url: 'https://globalnews.ca', lang: 'en' },
  { name: 'National Post', host: 'nationalpost.com', url: 'https://nationalpost.com', lang: 'en' },
  
  // Colombia-focused (Spanish)
  { name: 'El Tiempo', host: 'www.eltiempo.com', url: 'https://www.eltiempo.com', lang: 'es' },
  { name: 'El Espectador', host: 'www.elespectador.com', url: 'https://www.elespectador.com', lang: 'es' },
  { name: 'Semana', host: 'www.semana.com', url: 'https://www.semana.com', lang: 'es' },
  
  // Venezuela-focused (Spanish)
  { name: 'Efecto Cocuyo', host: 'efectococuyo.com', url: 'https://efectococuyo.com', lang: 'es' },
  { name: 'El Nacional', host: 'www.elnacional.com', url: 'https://www.elnacional.com', lang: 'es' },
  
  // International (English)
  { name: 'Reuters', host: 'www.reuters.com', url: 'https://www.reuters.com', lang: 'en' },
  { name: 'Al Jazeera', host: 'www.aljazeera.com', url: 'https://www.aljazeera.com', lang: 'en' },
  { name: 'France24 EN', host: 'www.france24.com', url: 'https://www.france24.com/en/', lang: 'en' },
  { name: 'DW', host: 'www.dw.com', url: 'https://www.dw.com/en/', lang: 'en' },
  
  // Australia
  { name: 'ABC Australia', host: 'www.abc.net.au', url: 'https://www.abc.net.au/news', lang: 'en' },
  
  // Spanish international
  { name: 'El País', host: 'elpais.com', url: 'https://elpais.com', lang: 'es' },
  { name: 'France24 ES', host: 'www.france24.com', url: 'https://www.france24.com/es/', lang: 'es' },
];

// Test countries - mix of common and varied
const TEST_COUNTRIES = [
  { code: 'US', slug: 'united-states', name: 'United States' },
  { code: 'GB', slug: 'uk', name: 'United Kingdom' },
  { code: 'CA', slug: 'canada', name: 'Canada' },
  { code: 'AU', slug: 'australia', name: 'Australia' },
  { code: 'FR', slug: 'france', name: 'France' },
  { code: 'DE', slug: 'germany', name: 'Germany' },
  { code: 'CO', slug: 'colombia', name: 'Colombia' },
  { code: 'VE', slug: 'venezuela', name: 'Venezuela' },
  { code: 'MX', slug: 'mexico', name: 'Mexico' },
  { code: 'BR', slug: 'brazil', name: 'Brazil' },
  { code: 'AR', slug: 'argentina', name: 'Argentina' },
  { code: 'RU', slug: 'russia', name: 'Russia' },
  { code: 'CN', slug: 'china', name: 'China' },
  { code: 'JP', slug: 'japan', name: 'Japan' },
  { code: 'IN', slug: 'india', name: 'India' },
];

// ═══════════════════════════════════════════════════════════════════════════
// HTTP UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch a single URL with body content (for crawling)
 */
function fetchUrl(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HubDiscoveryBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        resolve(fetchUrl(redirectUrl, timeoutMs));
        return;
      }
      
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ 
        status: res.statusCode, 
        body, 
        headers: res.headers,
        url 
      }));
      res.on('error', () => resolve({ status: 0, body: '', url, error: 'Response error' }));
    });
    
    req.on('error', () => resolve({ status: 0, body: '', url, error: 'Request error' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: '', url, error: 'Timeout' });
    });
  });
}

/**
 * Fetch multiple URLs in parallel batches (for crawling with body)
 */
async function fetchBatchWithBody(urls, concurrency = 10) {
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(url => fetchUrl(url)));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Verify URLs exist using distributed worker (HEAD checks only)
 */
async function verifyUrlsWithWorker(urls, concurrency = 50) {
  const requests = urls.map(url => ({ url, method: 'HEAD' }));
  const payload = JSON.stringify({ requests, concurrency });
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(DISTRIBUTED_WORKER);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.results || []);
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Worker timeout'));
    });
    
    req.write(payload);
    req.end();
  });
}

/**
 * Extract same-host links from HTML
 */
function extractLinks(html, baseUrl) {
  const links = new Set();
  try {
    const baseHost = new URL(baseUrl).host;
    const hrefRegex = /href=["']([^"'#]+)["']/gi;
    let match;
    
    while ((match = hrefRegex.exec(html)) !== null) {
      try {
        const href = match[1];
        if (href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
        
        const resolved = new URL(href, baseUrl);
        if (resolved.host === baseHost) {
          resolved.hash = '';
          // Skip common non-article paths
          const path = resolved.pathname;
          if (!path.includes('/search') && 
              !path.includes('/login') && 
              !path.includes('/signup') &&
              !path.includes('/account')) {
            links.add(resolved.href);
          }
        }
      } catch (e) { /* invalid URL */ }
    }
  } catch (e) { /* invalid base URL */ }
  
  return [...links];
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: CREATE TEST DATABASE
// ═══════════════════════════════════════════════════════════════════════════

function createTestDatabase(testDbPath) {
  console.log('\n📁 STEP 1: Creating test database...');
  console.log('   Source: ' + SOURCE_DB);
  console.log('   Target: ' + testDbPath);
  
  // Remove existing test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('   Removed existing test database');
  }
  
  // Create new database
  const testDb = new Database(testDbPath);
  const sourceDb = new Database(SOURCE_DB, { readonly: true });
  
  // Attach source database
  testDb.exec(`ATTACH DATABASE '${SOURCE_DB.replace(/\\/g, '/')}' AS source`);
  
  // Copy schema (without data)
  console.log('   Copying schema...');
  const schema = sourceDb.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE sql IS NOT NULL 
    AND type IN ('table', 'index')
    AND name NOT LIKE 'sqlite_%'
    ORDER BY type DESC, name
  `).all();
  
  let created = 0;
  for (const { sql } of schema) {
    try {
      testDb.exec(sql);
      created++;
    } catch (e) {
      // Ignore errors for reserved names
    }
  }
  console.log(`   Created ${created} tables/indexes`);
  
  // Copy gazetteer data
  console.log('   Copying gazetteer data...');
  
  const placeCount = testDb.exec(`
    INSERT INTO places SELECT * FROM source.places
  `);
  const places = testDb.prepare('SELECT COUNT(*) as cnt FROM places').get();
  console.log(`   Copied ${places.cnt.toLocaleString()} places`);
  
  testDb.exec(`INSERT INTO place_names SELECT * FROM source.place_names`);
  const names = testDb.prepare('SELECT COUNT(*) as cnt FROM place_names').get();
  console.log(`   Copied ${names.cnt.toLocaleString()} place names`);
  
  // Detach and close
  testDb.exec('DETACH DATABASE source');
  sourceDb.close();
  testDb.close();
  
  const stats = fs.statSync(testDbPath);
  console.log(`   ✅ Test database created (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  
  return testDbPath;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: CRAWL PUBLISHERS
// ═══════════════════════════════════════════════════════════════════════════

async function crawlPublishers(publishers, dbPath, targetPages) {
  console.log(`\n🕷️ STEP 2: Crawling ${publishers.length} publishers...`);
  console.log(`   Target: ${targetPages} pages per publisher`);
  console.log('   ' + '-'.repeat(60));
  
  const db = new Database(dbPath);
  
  // Prepare statements
  const insertUrl = db.prepare(`
    INSERT OR IGNORE INTO urls (url, host, created_at) 
    VALUES (?, ?, datetime('now'))
  `);
  const insertResponse = db.prepare(`
    INSERT INTO http_responses (url_id, request_started_at, fetched_at, http_status, content_type, bytes_downloaded)
    VALUES (?, datetime('now'), datetime('now'), ?, ?, ?)
  `);
  const getUrlId = db.prepare('SELECT id FROM urls WHERE url = ?');
  
  // Crawl each publisher
  const results = [];
  
  for (const pub of publishers) {
    console.log(`\n   📰 ${pub.name} (${pub.host})`);
    
    const state = {
      queue: [pub.url],
      fetched: new Set(),
      pageCount: 0,
    };
    
    const startTime = Date.now();
    const BATCH_SIZE = 15;  // Parallel requests per batch
    const MAX_ROUNDS = 100; // Safety limit
    
    let round = 0;
    while (state.pageCount < targetPages && round < MAX_ROUNDS) {
      round++;
      
      // Get next batch of URLs to fetch
      const batch = [];
      while (batch.length < BATCH_SIZE && state.queue.length > 0 && state.pageCount + batch.length < targetPages) {
        const url = state.queue.shift();
        if (!state.fetched.has(url)) {
          batch.push(url);
          state.fetched.add(url);
        }
      }
      
      if (batch.length === 0) break;
      
      // Fetch batch
      const responses = await fetchBatchWithBody(batch, BATCH_SIZE);
      
      // Process responses
      let newLinks = 0;
      db.transaction(() => {
        for (const resp of responses) {
          if (resp.status >= 200 && resp.status < 400 && resp.body) {
            // Insert URL
            insertUrl.run(resp.url, pub.host);
            const urlRow = getUrlId.get(resp.url);
            if (urlRow) {
              // Insert response
              insertResponse.run(
                urlRow.id,
                resp.status,
                resp.headers?.['content-type'] || '',
                resp.body.length
              );
              state.pageCount++;
              
              // Extract links for queue
              if (state.pageCount < targetPages) {
                const links = extractLinks(resp.body, resp.url);
                for (const link of links) {
                  if (!state.fetched.has(link)) {
                    state.queue.push(link);
                    newLinks++;
                  }
                }
              }
            }
          }
        }
      })();
      
      // Progress indicator
      const pct = Math.round((state.pageCount / targetPages) * 100);
      const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
      process.stdout.write(`\r      [${bar}] ${state.pageCount}/${targetPages} pages (queue: ${state.queue.length})`);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const status = state.pageCount >= targetPages ? '✅' : '⚠️';
    console.log(`\n      ${status} ${state.pageCount} pages in ${duration}s`);
    
    results.push({
      publisher: pub,
      pageCount: state.pageCount,
      success: state.pageCount >= targetPages,
    });
  }
  
  db.close();
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: VERIFY PAGE COUNTS
// ═══════════════════════════════════════════════════════════════════════════

function verifyPageCounts(dbPath, publishers, targetPages) {
  console.log('\n📊 STEP 3: Verifying page counts...');
  console.log('   ' + '-'.repeat(60));
  
  const db = new Database(dbPath, { readonly: true });
  
  const counts = db.prepare(`
    SELECT u.host, COUNT(DISTINCT u.id) as pages
    FROM urls u
    JOIN http_responses hr ON hr.url_id = u.id
    WHERE hr.http_status >= 200 AND hr.http_status < 400
    GROUP BY u.host
  `).all();
  
  const hostCounts = new Map(counts.map(c => [c.host, c.pages]));
  
  console.log('\n   Publisher                        Pages    Status');
  console.log('   ' + '-'.repeat(55));
  
  let allMet = true;
  for (const pub of publishers) {
    const count = hostCounts.get(pub.host) || 0;
    const status = count >= targetPages ? '✅' : '⚠️';
    if (count < targetPages) allMet = false;
    console.log(`   ${pub.name.padEnd(30)} ${count.toString().padStart(6)}    ${status}`);
  }
  
  db.close();
  
  if (allMet) {
    console.log(`\n   ✅ All publishers have ${targetPages}+ pages`);
  } else {
    console.log(`\n   ⚠️ Some publishers have fewer than ${targetPages} pages`);
  }
  
  return { hostCounts, allMet };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: ANALYZE URL PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

function analyzeUrlPatterns(dbPath, publishers) {
  console.log('\n🔍 STEP 4: Analyzing URL patterns...');
  console.log('   ' + '-'.repeat(60));
  
  const db = new Database(dbPath, { readonly: true });
  const patterns = new Map();
  
  for (const pub of publishers) {
    const urls = db.prepare(`
      SELECT u.url FROM urls u
      JOIN http_responses hr ON hr.url_id = u.id
      WHERE u.host = ? AND hr.http_status >= 200 AND hr.http_status < 400
    `).all(pub.host);
    
    // Analyze path segments
    const pathCounts = new Map();
    for (const { url } of urls) {
      try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        
        // Track first and second level paths
        if (segments.length >= 1) {
          const p1 = '/' + segments[0];
          pathCounts.set(p1, (pathCounts.get(p1) || 0) + 1);
          
          if (segments.length >= 2) {
            const p2 = '/' + segments[0] + '/' + segments[1];
            pathCounts.set(p2, (pathCounts.get(p2) || 0) + 1);
          }
        }
      } catch (e) { /* skip invalid URLs */ }
    }
    
    // Find hub-like patterns (paths with many children)
    const hubPatterns = [...pathCounts.entries()]
      .filter(([path, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    patterns.set(pub.host, hubPatterns);
    
    console.log(`\n   📰 ${pub.name}:`);
    if (hubPatterns.length === 0) {
      console.log('      No hub patterns found');
    } else {
      for (const [path, count] of hubPatterns.slice(0, 5)) {
        console.log(`      ${path.padEnd(30)} ${count} pages`);
      }
    }
  }
  
  db.close();
  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: GUESS COUNTRY HUB URLS
// ═══════════════════════════════════════════════════════════════════════════

function guessCountryHubUrls(publishers, patterns) {
  console.log('\n🌍 STEP 5: Generating country hub URL candidates...');
  console.log('   ' + '-'.repeat(60));
  
  const candidates = new Map();
  
  // Common hub URL patterns
  const HUB_PATTERNS = [
    '/world/{slug}',
    '/{slug}',
    '/news/{slug}',
    '/international/{slug}',
    // Spanish patterns
    '/mundo/{slug}',
    '/internacional/{slug}',
  ];
  
  for (const pub of publishers) {
    const pubPatterns = patterns.get(pub.host) || [];
    const pubCandidates = [];
    
    // Check if publisher has /world or similar hub structure
    const hasWorldHub = pubPatterns.some(([path]) => 
      path.startsWith('/world') || 
      path.startsWith('/news/world') ||
      path.startsWith('/mundo') ||
      path.startsWith('/internacional')
    );
    
    // Generate candidate URLs for each country
    for (const country of TEST_COUNTRIES) {
      // Use patterns that match publisher's observed structure
      const applicablePatterns = hasWorldHub 
        ? HUB_PATTERNS 
        : HUB_PATTERNS.slice(0, 2); // Just /{slug} if no world hub
      
      for (const pattern of applicablePatterns) {
        const url = `https://${pub.host}${pattern.replace('{slug}', country.slug)}`;
        pubCandidates.push({
          url,
          country: country.name,
          countryCode: country.code,
          pattern,
        });
      }
    }
    
    candidates.set(pub.host, pubCandidates);
    console.log(`   ${pub.name}: ${pubCandidates.length} candidate URLs`);
  }
  
  const total = [...candidates.values()].reduce((sum, c) => sum + c.length, 0);
  console.log(`\n   Total: ${total} candidate URLs to verify`);
  
  return candidates;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: VERIFY COUNTRY HUBS
// ═══════════════════════════════════════════════════════════════════════════

async function verifyCountryHubs(candidates, dbPath) {
  console.log('\n🔎 STEP 6: Verifying country hub URLs...');
  console.log('   Using distributed worker for parallel verification');
  console.log('   ' + '-'.repeat(60));
  
  const db = new Database(dbPath);
  
  // Create table to store hub verification results
  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_verification (
      id INTEGER PRIMARY KEY,
      host TEXT,
      url TEXT,
      country_code TEXT,
      country_name TEXT,
      pattern TEXT,
      http_status INTEGER,
      verified_at TEXT,
      hub_exists INTEGER
    )
  `);
  
  const insertHub = db.prepare(`
    INSERT INTO hub_verification (host, url, country_code, country_name, pattern, http_status, verified_at, hub_exists)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const results = new Map();
  
  for (const [host, pubCandidates] of candidates) {
    const pub = PUBLISHERS.find(p => p.host === host);
    console.log(`\n   📰 ${pub?.name || host}:`);
    
    const urls = pubCandidates.map(c => c.url);
    
    try {
      // Verify using distributed worker
      const workerResults = await verifyUrlsWithWorker(urls, 30);
      
      let found = 0;
      let verified = 0;
      
      db.transaction(() => {
        for (let i = 0; i < workerResults.length; i++) {
          const result = workerResults[i];
          const candidate = pubCandidates[i];
          const status = result.status || result.statusCode || 0;
          const exists = status >= 200 && status < 400 ? 1 : 0;
          
          insertHub.run(
            host,
            candidate.url,
            candidate.countryCode,
            candidate.country,
            candidate.pattern,
            status,
            new Date().toISOString(),
            exists
          );
          
          verified++;
          if (exists) found++;
        }
      })();
      
      console.log(`      Verified: ${verified}, Found: ${found}`);
      results.set(host, { verified, found, candidates: pubCandidates.length });
      
    } catch (e) {
      console.log(`      ⚠️ Worker error: ${e.message}`);
      console.log('      Falling back to local verification...');
      
      // Fallback to local HEAD checks
      let found = 0;
      let verified = 0;
      
      for (const candidate of pubCandidates) {
        const resp = await fetchUrl(candidate.url, 5000);
        const exists = resp.status >= 200 && resp.status < 400 ? 1 : 0;
        
        insertHub.run(
          host,
          candidate.url,
          candidate.countryCode,
          candidate.country,
          candidate.pattern,
          resp.status,
          new Date().toISOString(),
          exists
        );
        
        verified++;
        if (exists) found++;
        
        // Progress
        if (verified % 10 === 0) {
          process.stdout.write(`\r      Verified: ${verified}/${pubCandidates.length}`);
        }
      }
      
      console.log(`\n      Verified: ${verified}, Found: ${found}`);
      results.set(host, { verified, found, candidates: pubCandidates.length });
    }
  }
  
  db.close();
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 7: REPORT FINDINGS
// ═══════════════════════════════════════════════════════════════════════════

function reportFindings(dbPath, publishers) {
  console.log('\n📈 STEP 7: Country Hub Discovery Report');
  console.log('═'.repeat(65));
  
  const db = new Database(dbPath, { readonly: true });
  
  // Summary by publisher
  console.log('\n   HUBS FOUND BY PUBLISHER:');
  console.log('   ' + '-'.repeat(55));
  console.log('   Publisher                        Found / Tested');
  console.log('   ' + '-'.repeat(55));
  
  let totalFound = 0;
  let totalTested = 0;
  
  for (const pub of publishers) {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as tested,
        SUM(hub_exists) as found
      FROM hub_verification
      WHERE host = ?
    `).get(pub.host);
    
    const found = stats?.found || 0;
    const tested = stats?.tested || 0;
    totalFound += found;
    totalTested += tested;
    
    const pct = tested > 0 ? Math.round((found / tested) * 100) : 0;
    const status = found > 0 ? '✅' : '❌';
    
    console.log(`   ${status} ${pub.name.padEnd(30)} ${found.toString().padStart(3)} / ${tested.toString().padStart(3)} (${pct}%)`);
  }
  
  console.log('   ' + '-'.repeat(55));
  console.log(`   TOTAL                            ${totalFound.toString().padStart(3)} / ${totalTested.toString().padStart(3)}`);
  
  // Countries with most hubs
  console.log('\n   COUNTRIES WITH MOST HUBS:');
  console.log('   ' + '-'.repeat(40));
  
  const countryStats = db.prepare(`
    SELECT country_name, country_code, SUM(hub_exists) as found
    FROM hub_verification
    GROUP BY country_code
    ORDER BY found DESC
    LIMIT 10
  `).all();
  
  for (const row of countryStats) {
    const bar = '█'.repeat(row.found);
    console.log(`   ${row.country_name.padEnd(20)} ${bar} ${row.found}`);
  }
  
  // Sample of found hubs
  console.log('\n   SAMPLE FOUND HUBS:');
  console.log('   ' + '-'.repeat(60));
  
  const sampleHubs = db.prepare(`
    SELECT host, url, country_name
    FROM hub_verification
    WHERE exists = 1
    ORDER BY RANDOM()
    LIMIT 10
  `).all();
  
  for (const hub of sampleHubs) {
    console.log(`   ${hub.country_name.padEnd(15)} ${hub.url}`);
  }
  
  db.close();
  
  console.log('\n' + '═'.repeat(65));
  console.log(`   Test database: ${dbPath}`);
  console.log('═'.repeat(65) + '\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═'.repeat(65));
  console.log('🧪 HUB DISCOVERY END-TO-END TEST');
  console.log('═'.repeat(65));
  
  // Parse arguments
  const args = process.argv.slice(2);
  const flags = {
    pages: 500,
    db: DEFAULT_TEST_DB,
    publishers: null,
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pages' && args[i + 1]) {
      flags.pages = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--db' && args[i + 1]) {
      flags.db = args[i + 1];
      i++;
    } else if (args[i] === '--publishers' && args[i + 1]) {
      flags.publishers = args[i + 1].split(',');
      i++;
    }
  }
  
  // Filter publishers if specified
  let publishers = PUBLISHERS;
  if (flags.publishers) {
    publishers = PUBLISHERS.filter(p => 
      flags.publishers.some(name => 
        p.name.toLowerCase().includes(name.toLowerCase()) ||
        p.host.toLowerCase().includes(name.toLowerCase())
      )
    );
    console.log(`\n   Filtered to ${publishers.length} publishers`);
  }
  
  console.log(`\n   Publishers: ${publishers.length}`);
  console.log(`   Target pages: ${flags.pages} per publisher`);
  console.log(`   Test database: ${flags.db}`);
  
  try {
    // Step 1: Create test database
    createTestDatabase(flags.db);
    
    // Step 2: Crawl publishers
    await crawlPublishers(publishers, flags.db, flags.pages);
    
    // Step 3: Verify page counts
    verifyPageCounts(flags.db, publishers, flags.pages);
    
    // Step 4: Analyze URL patterns
    const patterns = analyzeUrlPatterns(flags.db, publishers);
    
    // Step 5: Guess country hub URLs
    const candidates = guessCountryHubUrls(publishers, patterns);
    
    // Step 6: Verify country hubs
    await verifyCountryHubs(candidates, flags.db);
    
    // Step 7: Report findings
    reportFindings(flags.db, publishers);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);

