#!/usr/bin/env node
'use strict';

/**
 * Golden Fixture Creator
 * 
 * Creates a new golden test fixture by fetching a real URL with Puppeteer.
 * This captures the HTML content as rendered by the browser, making it
 * suitable for testing extraction from JS-heavy sites.
 * 
 * Usage:
 *   node tests/golden/create-fixture.js --url <url> --name <fixture-name> [--category <category>]
 *   node tests/golden/create-fixture.js --live --fixture <category/name>
 * 
 * Examples:
 *   node tests/golden/create-fixture.js --url "https://reuters.com/article/..." --name "reuters-breaking" --category "wire"
 *   node tests/golden/create-fixture.js --url "https://example.com/article" --name "example-article"
 *   node tests/golden/create-fixture.js --live --fixture "wire/reuters-breaking"
 * 
 * Output:
 *   Creates tests/golden/fixtures/<category>/<name>/ with:
 *   - page.html       - The rendered HTML content
 *   - metadata.json   - Source URL, capture date, expected results (to fill in)
 *   - screenshot.png  - Visual reference (optional)
 */

const fs = require('fs');
const path = require('path');

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

function showHelp() {
  console.log(`
Golden Fixture Creator

Usage:
  node tests/golden/create-fixture.js --url <url> --name <name> [options]
  node tests/golden/create-fixture.js --live --fixture <category/name> [options]

Mode 1 - Create new fixture from URL:
  --url <url>           URL to capture
  --name <name>         Fixture name (kebab-case, no spaces)

Mode 2 - Populate existing fixture with live HTML:
  --live                Enable live fetch mode
  --fixture <path>      Fixture path (e.g., "wire/reuters-breaking")

Options:
  --category <cat>      Category folder (default: "general")
  --wait <ms>           Wait time after load (default: 2000)
  --dismiss-cookies     Attempt to dismiss cookie consent banners
  --no-screenshot       Skip screenshot capture
  --force               Overwrite existing HTML (with --live)
  --help                Show this help

Examples:
  node tests/golden/create-fixture.js --url "https://reuters.com/article/..." --name "reuters-breaking" --category "wire"
  node tests/golden/create-fixture.js --url "https://medium.com/..." --name "medium-tech" --category "spa"
  node tests/golden/create-fixture.js --live --fixture "wire/reuters-breaking" --dismiss-cookies
`);
}

const url = getArg('--url');
const name = getArg('--name');
const category = getArg('--category') || 'general';
const waitMs = parseInt(getArg('--wait') || '2000', 10);
const noScreenshot = args.includes('--no-screenshot');
const liveMode = args.includes('--live');
const fixturePath = getArg('--fixture');
const dismissCookies = args.includes('--dismiss-cookies');
const forceOverwrite = args.includes('--force');

if (args.includes('--help')) {
  showHelp();
  process.exit(0);
}

// Determine mode
if (liveMode) {
  if (!fixturePath) {
    console.error('❌ --live mode requires --fixture <category/name>');
    showHelp();
    process.exit(1);
  }
} else if (!url || !name) {
  showHelp();
  process.exit(1);
}

// Validate name format (only in create mode)
if (!liveMode && !/^[a-z0-9-]+$/.test(name)) {
  console.error('❌ Name must be kebab-case (lowercase letters, numbers, hyphens only)');
  process.exit(1);
}

/**
 * Common cookie consent banner selectors
 */
const COOKIE_BANNER_SELECTORS = [
  // Generic cookie consent buttons
  'button[id*="accept"]',
  'button[id*="consent"]',
  'button[class*="accept"]',
  'button[class*="consent"]',
  'button[class*="cookie"]',
  'a[id*="accept"]',
  // Common GDPR/Cookie frameworks
  '#onetrust-accept-btn-handler',
  '.onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '.cmp-accept-all',
  '#didomi-notice-agree-button',
  '[data-testid="cookie-policy-banner-accept"]',
  '[data-testid="accept-cookie-consent"]',
  // Quantcast/other frameworks
  '.qc-cmp-button[aria-label*="ccept"]',
  '.qc-cmp2-summary-buttons button:first-child',
  // Text-based matching (fallback)
  'button:has-text("Accept")',
  'button:has-text("Accept all")',
  'button:has-text("I agree")',
  'button:has-text("Got it")',
];

/**
 * Attempt to dismiss cookie consent banners
 * @param {Page} page - Puppeteer page instance
 * @returns {Promise<boolean>} - Whether a banner was dismissed
 */
async function attemptDismissCookies(page) {
  for (const selector of COOKIE_BANNER_SELECTORS) {
    try {
      // Skip text-based selectors (Puppeteer doesn't support :has-text)
      if (selector.includes(':has-text')) continue;
      
      const button = await page.$(selector);
      if (button) {
        const isVisible = await button.isIntersectingViewport();
        if (isVisible) {
          await button.click();
          console.log(`   Dismissed cookie banner with: ${selector}`);
          await new Promise(r => setTimeout(r, 500)); // Wait for banner to close
          return true;
        }
      }
    } catch {
      // Selector not found or click failed, continue
    }
  }
  return false;
}

async function main() {
  const fixturesDir = path.join(__dirname, 'fixtures');
  
  // Handle live mode (populate existing fixture)
  if (liveMode) {
    return populateExistingFixture(fixturesDir);
  }
  
  // Normal mode: create new fixture
  return createNewFixture(fixturesDir);
}

/**
 * Populate an existing fixture with live HTML
 */
async function populateExistingFixture(fixturesDir) {
  const fixtureDir = path.join(fixturesDir, fixturePath);
  const metadataPath = path.join(fixtureDir, 'metadata.json');
  const htmlPath = path.join(fixtureDir, 'page.html');
  
  // Validate fixture exists
  if (!fs.existsSync(metadataPath)) {
    console.error(`❌ Fixture not found: ${fixtureDir}`);
    console.error('   Expected metadata.json to exist.');
    process.exit(1);
  }
  
  // Load metadata
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (err) {
    console.error(`❌ Invalid metadata.json: ${err.message}`);
    process.exit(1);
  }
  
  if (!metadata.url) {
    console.error('❌ metadata.json missing "url" field');
    process.exit(1);
  }
  
  // Check if HTML already exists
  if (fs.existsSync(htmlPath) && !forceOverwrite) {
    const stats = fs.statSync(htmlPath);
    const isPlaceholder = stats.size < 2000; // Placeholder files are typically small
    if (!isPlaceholder) {
      console.error(`❌ HTML already exists (${(stats.size / 1024).toFixed(1)} KB)`);
      console.error('   Use --force to overwrite.');
      process.exit(1);
    }
    console.log(`⚠️  Overwriting placeholder HTML (${stats.size} bytes)`);
  }
  
  console.log('📥 Populating fixture:', fixturePath);
  console.log('   URL:', metadata.url);
  console.log('   Wait:', waitMs + 'ms');
  console.log();
  
  // Launch Puppeteer
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Set a realistic viewport and user agent
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    console.log('📡 Fetching URL...');
    await page.goto(metadata.url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Dismiss cookie consent banners if requested
    if (dismissCookies) {
      console.log('🍪 Checking for cookie banners...');
      await attemptDismissCookies(page);
    }
    
    // Extra wait for JS rendering
    if (waitMs > 0) {
      console.log(`⏳ Waiting ${waitMs}ms for JS rendering...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
    
    // Get page title
    const title = await page.title();
    console.log('   Title:', title);
    
    // Save HTML
    console.log('💾 Saving HTML...');
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf8');
    
    // Save screenshot
    if (!noScreenshot) {
      console.log('📸 Taking screenshot...');
      await page.screenshot({ 
        path: path.join(fixtureDir, 'screenshot.png'), 
        fullPage: false 
      });
    }
    
    // Update metadata with capture info
    metadata.lastCaptured = new Date().toISOString();
    metadata.capturedTitle = title;
    metadata.metadata = metadata.metadata || {};
    metadata.metadata.htmlSize = html.length;
    metadata.metadata.lastModified = new Date().toISOString();
    metadata.source = 'live-captured';
    
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    
    console.log();
    console.log('✅ Fixture populated:', fixturePath);
    console.log('   HTML size:', (html.length / 1024).toFixed(1) + ' KB');
    
  } catch (error) {
    console.error('❌ Error capturing page:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

/**
 * Create a new fixture from URL
 */
async function createNewFixture(fixturesDir) {
  const categoryDir = path.join(fixturesDir, category);
  const fixtureDir = path.join(categoryDir, name);
  
  // Check if fixture already exists
  if (fs.existsSync(fixtureDir)) {
    console.error(`❌ Fixture already exists: ${fixtureDir}`);
    console.error('   Delete it first or choose a different name.');
    process.exit(1);
  }
  
  console.log('📥 Creating fixture:', name);
  console.log('   URL:', url);
  console.log('   Category:', category);
  console.log('   Wait:', waitMs + 'ms');
  console.log();
  
  // Create directory structure
  fs.mkdirSync(fixtureDir, { recursive: true });
  
  // Launch Puppeteer
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Set a realistic viewport and user agent
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    console.log('📡 Fetching URL...');
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Dismiss cookie consent banners if requested
    if (dismissCookies) {
      console.log('🍪 Checking for cookie banners...');
      await attemptDismissCookies(page);
    }
    
    // Extra wait for JS rendering
    if (waitMs > 0) {
      console.log(`⏳ Waiting ${waitMs}ms for JS rendering...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
    
    // Get page title
    const title = await page.title();
    console.log('   Title:', title);
    
    // Save HTML
    console.log('💾 Saving HTML...');
    const html = await page.content();
    fs.writeFileSync(path.join(fixtureDir, 'page.html'), html, 'utf8');
    
    // Save screenshot (optional)
    if (!noScreenshot) {
      console.log('📸 Taking screenshot...');
      await page.screenshot({ 
        path: path.join(fixtureDir, 'screenshot.png'), 
        fullPage: false 
      });
    }
    
    // Create metadata
    const metadata = {
      name,
      description: `Fixture captured from ${new URL(url).hostname}`,
      source: 'captured',
      domain: new URL(url).hostname,
      category,
      url,
      capturedAt: new Date().toISOString(),
      capturedTitle: title,
      
      // Extraction config (customize per site)
      extractionConfig: {
        version: 1,
        titleSelector: 'h1',
        titleFallback: ['h1', '.headline', 'article h1', '[class*="title"]'],
        bodySelector: 'article',
        bodyFallback: ['.article-body', '.article-content', 'main article', 'main'],
        dateSelector: 'time[datetime]',
        dateFallback: ['time', '.date', '.publish-date', 'meta[property="article:published_time"]'],
        dateAttribute: 'datetime',
        authorSelector: '[rel="author"]',
        authorFallback: ['.author', '.byline', 'meta[name="author"]'],
        excludeSelectors: ['.ad', '.advertisement', '.related', '.sidebar', 'nav', 'footer']
      },
      
      // Expected results (fill in manually after review)
      expected: {
        title: {
          contains: null, // TODO: Fill in expected title substring
          exact: null // TODO: Fill in exact title
        },
        body: {
          minWordCount: null, // TODO: Expected minimum word count
          containsSnippets: [], // TODO: Key phrases that should appear
          excludes: [] // TODO: Phrases that should NOT appear (ads, boilerplate)
        },
        date: {
          iso: null // TODO: Expected date in ISO format
        },
        author: {
          contains: null // TODO: Author name substring
        },
        extraction: {
          success: true,
          minConfidence: 0.6
        }
      },
      
      // Edge case classification
      edgeCases: {
        hasPaywall: false,
        requiresJS: false,
        hasInfiniteScroll: false,
        isRTL: false,
        hasVideo: false,
        isLiveBlog: false
      },
      
      metadata: {
        createdAt: new Date().toISOString().split('T')[0],
        createdBy: 'create-fixture.js',
        htmlSize: html.length
      }
    };
    
    fs.writeFileSync(
      path.join(fixtureDir, 'metadata.json'), 
      JSON.stringify(metadata, null, 2), 
      'utf8'
    );
    
    console.log();
    console.log('✅ Fixture created at:', fixtureDir);
    console.log('   Files:');
    console.log('   - page.html (' + (html.length / 1024).toFixed(1) + ' KB)');
    console.log('   - metadata.json');
    if (!noScreenshot) {
      console.log('   - screenshot.png');
    }
    console.log();
    console.log('⚠️  TODO: Edit metadata.json to fill in expected extraction results');
    console.log('    Open the HTML in a browser to verify content.');
    
  } catch (error) {
    console.error('❌ Error capturing page:', error.message);
    // Clean up on failure
    try {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    } catch {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
