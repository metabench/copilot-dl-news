#!/usr/bin/env node
'use strict';

/**
 * Golden Fixture Population Script
 * 
 * Attempts to fetch real HTML for all placeholder fixtures using Puppeteer.
 * This script automates the process of populating fixtures with live data.
 * 
 * Usage:
 *   node tests/golden/populate-fixtures.js [options]
 * 
 * Options:
 *   --dry-run           Show what would be fetched without actually fetching
 *   --category <cat>    Only process fixtures in specific category
 *   --force             Overwrite existing HTML (even if not placeholder)
 *   --delay <ms>        Delay between fetches (default: 3000)
 *   --dismiss-cookies   Attempt to dismiss cookie consent banners
 *   --json              Output results as JSON
 *   --help              Show this help
 * 
 * Examples:
 *   node tests/golden/populate-fixtures.js --dry-run
 *   node tests/golden/populate-fixtures.js --category wire
 *   node tests/golden/populate-fixtures.js --delay 5000 --dismiss-cookies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check for Puppeteer availability
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch {
  console.error('❌ Puppeteer not installed. Install with: npm install puppeteer');
  process.exit(1);
}

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const dryRun = args.includes('--dry-run');
const forceOverwrite = args.includes('--force');
const categoryFilter = getArg('--category');
const delayMs = parseInt(getArg('--delay') || '3000', 10);
const dismissCookies = args.includes('--dismiss-cookies');
const jsonOutput = args.includes('--json');

if (args.includes('--help')) {
  console.log(`
Golden Fixture Population Script

Usage:
  node tests/golden/populate-fixtures.js [options]

Options:
  --dry-run           Show what would be fetched without actually fetching
  --category <cat>    Only process fixtures in specific category
  --force             Overwrite existing HTML (even if not placeholder)
  --delay <ms>        Delay between fetches (default: 3000)
  --dismiss-cookies   Attempt to dismiss cookie consent banners
  --json              Output results as JSON
  --help              Show this help

Examples:
  node tests/golden/populate-fixtures.js --dry-run
  node tests/golden/populate-fixtures.js --category wire
  node tests/golden/populate-fixtures.js --delay 5000 --dismiss-cookies
`);
  process.exit(0);
}

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const PLACEHOLDER_SIZE_THRESHOLD = 2000; // Files under 2KB are considered placeholders

/**
 * Common cookie consent banner selectors (copied from create-fixture.js)
 */
const COOKIE_BANNER_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '.onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '.cmp-accept-all',
  '#didomi-notice-agree-button',
  '[data-testid="cookie-policy-banner-accept"]',
  '[data-testid="accept-cookie-consent"]',
  'button[id*="accept"]',
  'button[id*="consent"]',
  'button[class*="accept"]',
  'button[class*="consent"]',
  '.qc-cmp-button[aria-label*="ccept"]',
];

/**
 * Attempt to dismiss cookie consent banners
 */
async function attemptDismissCookies(page) {
  for (const selector of COOKIE_BANNER_SELECTORS) {
    try {
      const button = await page.$(selector);
      if (button) {
        const isVisible = await button.isIntersectingViewport();
        if (isVisible) {
          await button.click();
          await new Promise(r => setTimeout(r, 500));
          return true;
        }
      }
    } catch {
      // Continue
    }
  }
  return false;
}

/**
 * Discover all fixtures with their status
 */
function discoverFixtures() {
  const fixtures = [];
  
  function walkCategory(categoryPath, categoryName) {
    if (!fs.existsSync(categoryPath)) return;
    
    const items = fs.readdirSync(categoryPath, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue;
      
      const fixtureDir = path.join(categoryPath, item.name);
      const metadataPath = path.join(fixtureDir, 'metadata.json');
      const htmlPath = path.join(fixtureDir, 'page.html');
      
      if (!fs.existsSync(metadataPath)) continue;
      
      let metadata;
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } catch {
        continue;
      }
      
      const htmlExists = fs.existsSync(htmlPath);
      let htmlSize = 0;
      let isPlaceholder = true;
      
      if (htmlExists) {
        htmlSize = fs.statSync(htmlPath).size;
        isPlaceholder = htmlSize < PLACEHOLDER_SIZE_THRESHOLD;
      }
      
      fixtures.push({
        path: `${categoryName}/${item.name}`,
        category: categoryName,
        name: item.name,
        url: metadata.url,
        hasUrl: !!metadata.url,
        htmlExists,
        htmlSize,
        isPlaceholder,
        needsPopulation: metadata.url && (!htmlExists || isPlaceholder),
        source: metadata.source
      });
    }
  }
  
  // Walk top-level categories
  const entries = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (categoryFilter && entry.name !== categoryFilter) continue;
      walkCategory(path.join(FIXTURES_DIR, entry.name), entry.name);
    }
  }
  
  return fixtures;
}

/**
 * Fetch and save a fixture's HTML
 */
async function fetchFixture(browser, fixture) {
  const fixtureDir = path.join(FIXTURES_DIR, fixture.path);
  const htmlPath = path.join(fixtureDir, 'page.html');
  const metadataPath = path.join(fixtureDir, 'metadata.json');
  const screenshotPath = path.join(fixtureDir, 'screenshot.png');
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  const result = {
    fixture: fixture.path,
    url: fixture.url,
    success: false,
    error: null,
    htmlSize: 0,
    title: null
  };
  
  try {
    await page.goto(fixture.url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    if (dismissCookies) {
      await attemptDismissCookies(page);
    }
    
    // Wait for JS rendering
    await new Promise(r => setTimeout(r, 2000));
    
    // Get content
    const title = await page.title();
    const html = await page.content();
    
    // Save HTML
    fs.writeFileSync(htmlPath, html, 'utf8');
    
    // Save screenshot
    await page.screenshot({ path: screenshotPath, fullPage: false });
    
    // Update metadata
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    metadata.lastCaptured = new Date().toISOString();
    metadata.capturedTitle = title;
    metadata.source = 'live-captured';
    metadata.metadata = metadata.metadata || {};
    metadata.metadata.htmlSize = html.length;
    metadata.metadata.lastModified = new Date().toISOString();
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    
    result.success = true;
    result.htmlSize = html.length;
    result.title = title;
    
  } catch (error) {
    result.error = error.message;
  } finally {
    await page.close();
  }
  
  return result;
}

async function main() {
  const fixtures = discoverFixtures();
  
  // Categorize fixtures
  const needsPopulation = fixtures.filter(f => f.needsPopulation || forceOverwrite && f.hasUrl);
  const alreadyPopulated = fixtures.filter(f => f.htmlExists && !f.isPlaceholder);
  const missingUrl = fixtures.filter(f => !f.hasUrl);
  
  if (!jsonOutput) {
    console.log('📊 Fixture Status Summary');
    console.log(`   Total fixtures: ${fixtures.length}`);
    console.log(`   Already populated: ${alreadyPopulated.length}`);
    console.log(`   Needs population: ${needsPopulation.length}`);
    console.log(`   Missing URL: ${missingUrl.length}`);
    console.log();
  }
  
  if (needsPopulation.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ 
        summary: { total: fixtures.length, populated: alreadyPopulated.length },
        results: [] 
      }, null, 2));
    } else {
      console.log('✅ All fixtures are already populated.');
    }
    return;
  }
  
  if (dryRun) {
    if (jsonOutput) {
      console.log(JSON.stringify({ 
        dryRun: true,
        wouldFetch: needsPopulation.map(f => ({ path: f.path, url: f.url }))
      }, null, 2));
    } else {
      console.log('📋 Would fetch (dry-run):');
      for (const f of needsPopulation) {
        console.log(`   ${f.path}`);
        console.log(`      URL: ${f.url}`);
      }
    }
    return;
  }
  
  // Launch browser
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const results = [];
  let successCount = 0;
  let failCount = 0;
  
  try {
    for (let i = 0; i < needsPopulation.length; i++) {
      const fixture = needsPopulation[i];
      
      if (!jsonOutput) {
        console.log(`\n📥 [${i + 1}/${needsPopulation.length}] ${fixture.path}`);
        console.log(`   URL: ${fixture.url}`);
      }
      
      const result = await fetchFixture(browser, fixture);
      results.push(result);
      
      if (result.success) {
        successCount++;
        if (!jsonOutput) {
          console.log(`   ✅ Success (${(result.htmlSize / 1024).toFixed(1)} KB)`);
          console.log(`   Title: ${result.title}`);
        }
      } else {
        failCount++;
        if (!jsonOutput) {
          console.log(`   ❌ Failed: ${result.error}`);
        }
      }
      
      // Delay between requests to be polite
      if (i < needsPopulation.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  } finally {
    await browser.close();
  }
  
  // Summary
  if (jsonOutput) {
    console.log(JSON.stringify({
      summary: {
        total: fixtures.length,
        attempted: needsPopulation.length,
        success: successCount,
        failed: failCount
      },
      results
    }, null, 2));
  } else {
    console.log('\n' + '═'.repeat(50));
    console.log('📊 Population Summary');
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    
    if (failCount > 0) {
      console.log('\n❌ Failed fixtures:');
      for (const r of results.filter(r => !r.success)) {
        console.log(`   ${r.fixture}: ${r.error}`);
      }
    }
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
