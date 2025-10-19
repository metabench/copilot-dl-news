#!/usr/bin/env node

/**
 * intelligent_crawl - Simple CLI tool for running intelligent crawls
 *
 * Usage:
 *   node tools/intelligent-crawl.js [url] [--limit N] [--concurrency N] [--max-downloads N] [--verbose]
 *
 * Options:
 *   --limit N          Limit output to first N lines (useful for startup analysis)
 *   --concurrency N    Number of parallel downloads (default: 1 for reliability)
 *   --max-downloads N  Maximum number of pages to download (default: unlimited)
 *   --verbose          Show all output including structured events
 *
 * If no URL is provided, loads from config.json
 */

// Check for help flag first, before any imports that might fail
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Intelligent Crawl Tool

Runs intelligent web crawls with place and topic hub discovery.

USAGE:
  node tools/intelligent-crawl.js [url] [options]

OPTIONS:
  --help, -h              Show this help message
  --limit N               Limit output to first N lines (useful for startup analysis)
  --concurrency N         Number of parallel downloads (default: 1 for reliability)
  --max-downloads N       Maximum number of pages to download (default: unlimited)
  --verbose               Show all output including structured events

EXAMPLES:
  node tools/intelligent-crawl.js                                    # Crawl URL from config.json
  node tools/intelligent-crawl.js https://example.com               # Crawl specific URL
  node tools/intelligent-crawl.js --limit 50                        # Show first 50 lines only
  node tools/intelligent-crawl.js --concurrency 3 --max-downloads 100  # Parallel crawl with limit
  node tools/intelligent-crawl.js --verbose                         # Show all detailed output

HUB DISCOVERY:
  The tool automatically discovers and reports:
  🌍 Country hubs (verified against gazetteer)
  🗺️  Place hubs (cities, regions, etc.)
  🗂️  Topic hubs (news categories, sections)

If no URL is provided, the tool loads the URL from config.json.
`);
  process.exit(0);
}

const NewsCrawler = require('../src/crawl.js');
const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../src/db/sqlite');
const { getAllPlaceNames } = require('../src/db/sqlite/queries/gazetteerPlaceNames');
const { getAllCountries } = require('../src/db/sqlite/queries/gazetteer.places');
const { getTopicTermsForLanguage } = require('../src/db/sqlite/queries/topicKeywords');

// Initialize database for place verification
const dbPath = path.join(__dirname, '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

// Load all place names from gazetteer for verification
const placeNames = getAllPlaceNames(db);

// Load countries for statistics
const allCountries = getAllCountries(db);
const countryCount = allCountries.length;

// Count unique place names (approximate total places)
const totalPlaces = placeNames.size;

console.log(`Loaded ${placeNames.size} place names for verification`);
console.log(`🌍 ${countryCount} country hubs available | 🗺️  ${totalPlaces} total place names in gazetteer`);

// Load topic keywords from database (supports multi-lingual, currently using English)
const newsTopics = getTopicTermsForLanguage(db, 'en');
console.log(`Loaded ${newsTopics.size} topic keywords for verification`);

// Track discovered hubs
const discoveredHubs = {
  place: [],
  country: [],  // Subset of place (countries only)
  topic: []
};

// Function to verify if a title corresponds to a real place
function isActualPlaceHub(title, url) {
  // Extract place name from title like "France | The Guardian" or "Latest Australia news"
  
  // Pattern 1: "PlaceName | The Guardian"
  const pattern1 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
  if (pattern1) {
    const placeName = pattern1[1].toLowerCase();
    if (placeNames.has(placeName)) {
      return { isHub: true, name: pattern1[1] };
    }
  }
  
  // Pattern 2: "Latest PlaceName news"
  const pattern2 = title.match(/Latest\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/);
  if (pattern2) {
    const placeName = pattern2[1].toLowerCase();
    if (placeNames.has(placeName)) {
      return { isHub: true, name: pattern2[1] };
    }
  }
  
  // Pattern 3: "PlaceName news from"
  const pattern3 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/);
  if (pattern3) {
    const placeName = pattern3[1].toLowerCase();
    if (placeNames.has(placeName)) {
      return { isHub: true, name: pattern3[1] };
    }
  }
  
  return { isHub: false, name: null };
}

// Function to verify if a title/URL corresponds to a topic hub
function isActualTopicHub(title, url) {
  // Extract topic candidate from title like "Politics | The Guardian"
  const pattern1 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
  if (pattern1) {
    const topicName = pattern1[1].toLowerCase();
    if (newsTopics.has(topicName)) {
      return { isHub: true, name: pattern1[1] };
    }
  }
  
  // Check URL path for topic indicators like /politics/, /sport/, etc.
  if (url) {
    const urlPath = url.toLowerCase();
    for (const topic of newsTopics) {
      if (urlPath.includes(`/${topic}/`) || urlPath.includes(`/${topic}`)) {
        // Verify it's a hub page, not an article (hubs typically don't have dates)
        if (!urlPath.match(/\/\d{4}\/[a-z]{3}\/\d{2}\//)) {
          return { isHub: true, name: topic };
        }
      }
    }
  }
  
  return { isHub: false, name: null };
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Load configuration
const configPath = path.join(__dirname, 'config.json');
let config = { url: 'https://www.theguardian.com' }; // Default fallback

try {
  const configData = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configData);
} catch (error) {
  console.warn(`Warning: Could not load config.json, using default URL`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

// Parse --limit parameter
let outputLimit = null;
const limitIndex = args.indexOf('--limit');
if (limitIndex !== -1 && args[limitIndex + 1]) {
  outputLimit = parseInt(args[limitIndex + 1], 10);
  if (isNaN(outputLimit) || outputLimit < 1) {
    console.error('Error: --limit must be a positive integer');
    process.exit(1);
  }
}

// Parse --concurrency parameter (default: 1 for reliability)
let concurrency = 1;
const concurrencyIndex = args.indexOf('--concurrency');
if (concurrencyIndex !== -1 && args[concurrencyIndex + 1]) {
  concurrency = parseInt(args[concurrencyIndex + 1], 10);
  if (isNaN(concurrency) || concurrency < 1) {
    console.error('Error: --concurrency must be a positive integer');
    process.exit(1);
  }
}

// Parse --max-downloads parameter (default: unlimited)
let maxDownloads = undefined;
const maxDownloadsIndex = args.indexOf('--max-downloads');
if (maxDownloadsIndex !== -1 && args[maxDownloadsIndex + 1]) {
  maxDownloads = parseInt(args[maxDownloadsIndex + 1], 10);
  if (isNaN(maxDownloads) || maxDownloads < 1) {
    console.error('Error: --max-downloads must be a positive integer');
    process.exit(1);
  }
}

// Get URL from command line args
const urlArg = args.find(arg => !arg.startsWith('--') && arg.startsWith('http'));
const startUrl = urlArg || config.url;

if (verbose) {
  console.log(`Starting intelligent crawl of: ${startUrl}`);
  console.log('Configuration: single-threaded, depth 2, intelligent mode');
  console.log('---');
} else {
  console.log(`Crawling ${startUrl} (intelligent, single-threaded)`);
}

// Suppress structured output unless in verbose mode
if (!verbose) {
  // Track output line count for --limit functionality
  let lineCount = 0;
  let limitReached = false;
  
  // Override console methods to filter output and add color coding
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.log = function(...args) {
    // Check if output limit reached
    if (outputLimit && lineCount >= outputLimit) {
      if (!limitReached) {
        limitReached = true;
        originalLog(colorize(`\n[Output limit of ${outputLimit} lines reached - exiting]`, 'gray'));
        originalLog(colorize('[Use --verbose to see all output, or increase --limit]', 'gray'));
        // Exit immediately instead of continuing in background
        process.exit(0);
      }
      return;
    }
    
    const str = args[0];
    // Filter structured keywords and verbose JSON output
    if (typeof str === 'string' && (str.startsWith('QUEUE ') || 
                                     str.startsWith('MILESTONE ') || 
                                     str.startsWith('TELEMETRY ') ||
                                     str.startsWith('PROGRESS ') ||
                                     str.startsWith('PROBLEM ') ||
                                     str.startsWith('PLANNER_STAGE ') ||  // Filter verbose JSON planner stages
                                     str.startsWith('Skipping query URL') ||
                                     str.includes('duplicate') ||
                                     str.includes('robots-disallow'))) {
      return;
    }
    
    // Add color coding
    if (typeof str === 'string') {
      // Green: successful downloads and saves
      if (str.includes('Saved article:') || str.match(/^✓/)) {
        // Extract title from "Saved article: Title"
        const titleMatch = str.match(/Saved article: (.+)$/);
        const title = titleMatch ? titleMatch[1] : '';
        
        // Check for place hub (verified against gazetteer)
        const placeHub = title && isActualPlaceHub(title);
        if (placeHub.isHub) {
          const hubStr = str.replace('Saved article:', '🌐 Place hub:');
          originalLog(colorize(hubStr, 'green'));
          if (outputLimit) lineCount++;
          discoveredHubs.place.push(placeHub.name);
          
          // Check if it's a country hub (subset of place hubs)
          const isCountry = allCountries.some(c => 
            c.name.toLowerCase() === placeHub.name.toLowerCase()
          );
          if (isCountry) {
            discoveredHubs.country.push(placeHub.name);
          }
          return;
        }
        
        // Check for topic hub (verified against known topics)
        const topicHub = title && isActualTopicHub(title);
        if (topicHub.isHub) {
          const hubStr = str.replace('Saved article:', '🗂️  Topic hub:');
          originalLog(colorize(hubStr, 'cyan'));
          if (outputLimit) lineCount++;
          discoveredHubs.topic.push(topicHub.name);
          return;
        }
        
        // Regular article (suppressed unless verbose)
        return;
      }
      
      // Cyan: Hub discovery - show link counts and URLs for hubs
      if (str.includes('Found') && str.includes('navigation links')) {
        // Extract URL from message like "Found X navigation links and Y article links on URL"
        const urlMatch = str.match(/on (https?:\/\/.+)$/);
        const url = urlMatch ? urlMatch[1] : '';
        
        // Check if this URL might be a hub
        const isPlaceUrl = url && placeNames.has(url.split('/').pop()?.toLowerCase() || '');
        const isTopicUrl = url && Array.from(newsTopics).some(t => url.includes(`/${t}/`) || url.includes(`/${t}`));
        
        if (isPlaceUrl || isTopicUrl) {
          originalLog(colorize(str, 'cyan'));
          if (outputLimit) lineCount++;
        }
        return;
      }
      // Red: failures and errors (but filter ERROR JSON)
      if ((str.includes('Failed to fetch') || (str.includes('Error') && !str.startsWith('ERROR '))) || str.match(/^✗/)) {
        originalLog(colorize(str, 'red'));
        if (outputLimit) lineCount++;
        return;
      }
      // Blue: intelligent discoveries - human-readable summaries only
      if (str.includes('Intelligent crawl planning') ||
          str.includes('Intelligent plan:') ||  // "Intelligent plan: seeded X hub(s)"
          str.includes('Hub seeded:') ||
          str.includes('Pattern discovered:') ||
          str.match(/^Sitemap enqueue complete: \d+/)) {  // Only show count line
        originalLog(colorize(str, 'blue'));
        if (outputLimit) lineCount++;
        return;
      }
      // Yellow: skipped/cached (not errors, but noteworthy)
      if (str.includes('Skipping known 404') || str.includes('CACHE')) {
        originalLog(colorize(str, 'yellow'));
        if (outputLimit) lineCount++;
        return;
      }
    }
    
    // Default: white/no color (including "Fetching:" messages)
    originalLog.apply(console, args);
    if (outputLimit) lineCount++;
  };
  
  console.warn = function(...args) {
    const str = args[0];
    // Filter verbose warnings
    if (typeof str === 'string' && str.includes('RATE LIMITED')) {
      return;
    }
    // Warnings in yellow/orange
    if (typeof str === 'string') {
      originalWarn(colorize(str, 'yellow'));
    } else {
      originalWarn.apply(console, args);
    }
  };
  
  console.error = function(...args) {
    const str = args[0];
    // Errors in red
    if (typeof str === 'string') {
      originalError(colorize(str, 'red'));
    } else {
      originalError.apply(console, args);
    }
  };
}

// Create crawler with intelligent crawl settings
const crawler = new NewsCrawler(startUrl, {
  crawlType: 'intelligent',
  concurrency,              // CLI parameter (default: 1 for reliability)
  maxDepth: 2,
  maxDownloads,             // CLI parameter (default: unlimited)
  enableDb: true,
  useSitemap: true,
  preferCache: true,
  maxAgeMs: 24 * 60 * 60 * 1000  // Use cache if < 24 hours old
});

// Start the crawl
crawler.crawl()
  .then(() => {
    if (verbose) {
      console.log('---');
    }
    console.log('✓ Crawl completed');
    
    // Report discovered hubs
    if (discoveredHubs.place.length > 0 || discoveredHubs.topic.length > 0) {
      console.log('\n' + colorize('=== Hub Discovery Summary ===', 'blue'));
      
      if (discoveredHubs.place.length > 0) {
        const uniquePlaces = [...new Set(discoveredHubs.place)];
        const uniqueCountries = [...new Set(discoveredHubs.country)];
        
        console.log(colorize(`\n� Country Hubs Found (${uniqueCountries.length}):`, 'green'));
        uniqueCountries.forEach(country => {
          console.log(colorize(`  ✓ ${country}`, 'green'));
        });
        
        // Show other places (non-country places)
        const otherPlaces = uniquePlaces.filter(p => 
          !uniqueCountries.some(c => c.toLowerCase() === p.toLowerCase())
        );
        if (otherPlaces.length > 0) {
          console.log(colorize(`\n🗺️  Other Place Hubs Found (${otherPlaces.length}):`, 'green'));
          otherPlaces.forEach(place => {
            console.log(colorize(`  ✓ ${place}`, 'green'));
          });
        }
      }
      
      if (discoveredHubs.topic.length > 0) {
        console.log(colorize(`\n🗂️  Topic Hubs Found (${discoveredHubs.topic.length}):`, 'cyan'));
        const uniqueTopics = [...new Set(discoveredHubs.topic)];
        uniqueTopics.forEach(topic => {
          console.log(colorize(`  ✓ ${topic}`, 'cyan'));
        });
      }
      
      console.log(colorize('\n=== End Summary ===\n', 'blue'));
    }
    
    process.exit(0);
  })
  .catch(error => {
    if (verbose) {
      console.error('---');
    }
    console.error('✗ Crawl failed:', error.message);
    process.exit(1);
  });
