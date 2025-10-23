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
  --verification          Check if crawl has all required systems and plugins loaded
  --quick-verification    Fast verification without heavy initialization
  --limit N               Limit output to first N lines (useful for startup analysis)
  --concurrency N         Number of parallel downloads (default: 1 for reliability)
  --max-downloads N       Maximum number of pages to download (default: unlimited)
  --verbose               Show all output including structured events
  --compact               Show minimal output focused on country hub discovery progress

EXAMPLES:
   node tools/intelligent-crawl.js                                    # Crawl URL from config.json
   node tools/intelligent-crawl.js https://example.com               # Crawl specific URL
   node tools/intelligent-crawl.js --verification                    # Check system readiness
   node tools/intelligent-crawl.js --quick-verification              # Fast verification without heavy init
   node tools/intelligent-crawl.js --limit 50                        # Show first 50 lines only
   node tools/intelligent-crawl.js --concurrency 3 --max-downloads 100  # Parallel crawl with limit
   node tools/intelligent-crawl.js --verbose                         # Show all detailed output
   node tools/intelligent-crawl.js --compact                         # Show compact country hub discovery progress

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

// LAZY LOADING: Cache for gazetteer data - load only when needed
let gazetteerCache = {
  placeNames: null,
  allCountries: null,
  newsTopics: null,
  loaded: false
};

// Track discovered hubs throughout the run (place/topic/country)
const discoveredHubs = {
  place: [],
  country: [],
  topic: []
};

// ANSI color helper for console formatting
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function loadGazetteerData() {
  if (gazetteerCache.loaded) return gazetteerCache;

  console.log('Loading gazetteer data for verification...');
  gazetteerCache.placeNames = getAllPlaceNames(db);
  gazetteerCache.allCountries = getAllCountries(db);
  gazetteerCache.newsTopics = getTopicTermsForLanguage(db, 'en');
  gazetteerCache.loaded = true;

  const countryCount = gazetteerCache.allCountries.length;
  const totalPlaces = gazetteerCache.placeNames.size;

  console.log(`Loaded ${gazetteerCache.placeNames.size} place names for verification`);
  console.log(`🌍 ${countryCount} country hubs available | 🗺️  ${totalPlaces} total place names in gazetteer`);
  console.log(`Loaded ${gazetteerCache.newsTopics.size} topic keywords for verification`);

  return gazetteerCache;
}

// For backward compatibility, expose as direct variables (lazy-loaded)
let placeNames, allCountries, newsTopics;
function ensureGazetteerLoaded() {
  if (!gazetteerCache.loaded) {
    loadGazetteerData();
    placeNames = gazetteerCache.placeNames;
    allCountries = gazetteerCache.allCountries;
    newsTopics = gazetteerCache.newsTopics;
  }
}

// Parse command line arguments early so logging (and --limit) apply to startup output
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const compact = args.includes('--compact');
const verification = args.includes('--verification');
const quickVerification = args.includes('--quick-verification');

// Parse --limit parameter (used by console overrides)
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

// Suppress structured output unless in verbose/compact mode
if (!verbose && !compact) {
  // Track output line count for --limit functionality
  let lineCount = 0;
  let limitReached = false;

  // Preserve originals
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // Track consecutive non-hub messages to suppress noise
  let consecutiveNonHubMessages = 0;
  const MAX_CONSECUTIVE_NON_HUB = 2;

  const emitLimitMessageAndExit = () => {
    if (!limitReached) {
      limitReached = true;
      originalLog(colorize(`\n[Output limit of ${outputLimit} lines reached - exiting]`, 'gray'));
      originalLog(colorize('[Use --verbose to see all output, or increase --limit]', 'gray'));
    }
    process.exit(0);
  };

  const incrementLineCount = () => {
    if (!outputLimit) {
      return;
    }
    lineCount++;
    if (lineCount >= outputLimit) {
      emitLimitMessageAndExit();
    }
  };

  console.log = function(...logArgs) {
    const str = logArgs[0];

    if (typeof str === 'string') {
      // Show startup messages in gray so they count toward limit
      if (str.startsWith('Loading priority configuration') || str.startsWith('Loading crawl configuration')) {
        originalLog(colorize(str, 'gray'));
        incrementLineCount();
        return;
      }

      // Skip technical system messages
      if (str.startsWith('[schema]') ||
          str.startsWith('SQLite DB initialized') ||
          str.startsWith('Priority config loaded') ||
          str.startsWith('Enhanced features configuration:') ||
          str.startsWith('Enhanced DB adapter') ||
          str.startsWith('Problem resolution service') ||
          str.startsWith('Crawl playbook service') ||
          str.startsWith('Failed to initialize') ||
          str.startsWith('✓ Partial success') ||
          str.startsWith('[NewsDatabase]') ||
          str.startsWith('Loading robots.txt') ||
          str.startsWith('robots.txt loaded') ||
          (str.startsWith('Found') && str.includes('sitemap URL(s)')) ||
          str.startsWith('Starting crawler') ||
          str.startsWith('Data will be saved') ||
          str.startsWith('[IntelligentPlanning]') ||
          str.startsWith('[APS]') ||
          str.startsWith('QUEUE ') ||
          str.startsWith('MILESTONE ') ||
          str.startsWith('TELEMETRY ') ||
          str.startsWith('PROGRESS ') ||
          str.startsWith('PROBLEM ') ||
          str.startsWith('PLANNER_STAGE ') ||
          str.startsWith('Skipping query URL') ||
          str.includes('duplicate') ||
          str.includes('robots-disallow') ||
          str.includes('Reason:') ||
          str.includes('Enhanced features initialization failed') ||
          str.includes('requires database connection') ||
          str.includes('No countryHubGapService available')) {
        return;
      }

      // Green: successful downloads / saves
      if (str.includes('Saved article:') || str.match(/^✓/)) {
        const titleMatch = str.match(/Saved article: (.+)$/);
        const title = titleMatch ? titleMatch[1] : '';

        const placeHub = title && isActualPlaceHub(title);
        if (placeHub.isHub) {
          const hubStr = `🌐 ${placeHub.name}`;
          originalLog(colorize(hubStr, 'green'));
          discoveredHubs.place.push(placeHub.name);

          const isCountry = allCountries.some(c =>
            c.name.toLowerCase() === placeHub.name.toLowerCase()
          );
          if (isCountry) {
            discoveredHubs.country.push(placeHub.name);
          }
          consecutiveNonHubMessages = 0;
          incrementLineCount();
          return;
        }

        const topicHub = title && isActualTopicHub(title);
        if (topicHub.isHub) {
          const hubStr = `🗂️ ${topicHub.name}`;
          originalLog(colorize(hubStr, 'cyan'));
          discoveredHubs.topic.push(topicHub.name);
          consecutiveNonHubMessages = 0;
          incrementLineCount();
          return;
        }

        consecutiveNonHubMessages++;
        if (consecutiveNonHubMessages > MAX_CONSECUTIVE_NON_HUB) {
          return;
        }
      }

      if (str.includes('Found') && str.includes('navigation links')) {
        const urlMatch = str.match(/on (https?:\/\/.+)$/);
        const url = urlMatch ? urlMatch[1] : '';

        ensureGazetteerLoaded();
        const isPlaceUrl = url && placeNames?.has(url.split('/').pop()?.toLowerCase() || '');
        const isTopicUrl = url && Array.from(newsTopics || []).some(t => url.includes(`/${t}/`) || url.includes(`/${t}`));

        if (isPlaceUrl || isTopicUrl) {
          const countryName = url.split('/').pop();
          originalLog(colorize(`🔗 ${countryName}`, 'cyan'));
          consecutiveNonHubMessages = 0;
          incrementLineCount();
        }
        return;
      }

      if (str.includes('Enqueued') && str.includes('article links')) {
        const countMatch = str.match(/Enqueued (\d+) article links/);
        if (countMatch) {
          const count = parseInt(countMatch[1]);
          if (count > 0) {
            originalLog(colorize(`📄 +${count} articles`, 'green'));
            consecutiveNonHubMessages = 0;
            incrementLineCount();
          }
        }
        return;
      }

      if ((str.includes('Failed to fetch') || (str.includes('Error') && !str.startsWith('ERROR '))) || str.match(/^✗/)) {
        if (str.includes('404')) {
          const urlMatch = str.match(/https?:\/\/[^\/]+\/world\/([^\/\s]+)/);
          if (urlMatch) {
            const countrySlug = urlMatch[1];
            originalLog(colorize(`❌ ${countrySlug.replace(/-/g, ' ')}`, 'red'));
            incrementLineCount();
          }
        }
        return;
      }

      if (str.includes('Intelligent crawl planning') ||
          str.includes('Intelligent plan:') ||
          str.includes('Hub seeded:') ||
          str.includes('Pattern discovered:') ||
          str.match(/^Sitemap enqueue complete: \d+/)) {
        if (str.match(/^Sitemap enqueue complete: \d+/)) {
          const countMatch = str.match(/complete: (\d+)/);
          if (countMatch) {
            originalLog(colorize(`📋 +${countMatch[1]} sitemap URLs`, 'blue'));
            incrementLineCount();
          }
        }
        return;
      }

      if (str.includes('Skipping known 404') || str.includes('CACHE')) {
        return;
      }

      if (str.startsWith('Fetching:')) {
        return;
      }
    }
  };

  console.warn = function(...warnArgs) {
    const str = warnArgs[0];
    if (typeof str === 'string' && str.includes('RATE LIMITED')) {
      return;
    }
    if (compact && typeof str === 'string' && !str.includes('Failed to initialize')) {
      return;
    }
    if (typeof str === 'string') {
      originalWarn(colorize(str, 'yellow'));
    } else {
      originalWarn.apply(console, warnArgs);
    }
    incrementLineCount();
  };

  console.error = function(...errorArgs) {
    const str = errorArgs[0];
    if (compact && typeof str === 'string' && !str.includes('Failed to initialize')) {
      return;
    }
    if (typeof str === 'string') {
      originalError(colorize(str, 'red'));
    } else {
      originalError.apply(console, errorArgs);
    }
    incrementLineCount();
  };
}

// Load priority configuration
console.log('Loading priority configuration...');
const priorityConfigPath = path.join(__dirname, '..', 'config', 'priority-config.json');
let priorityConfig = {};
try {
   const priorityData = fs.readFileSync(priorityConfigPath, 'utf-8');
   priorityConfig = JSON.parse(priorityData);
} catch (error) {
   console.warn(`Warning: Could not load priority-config.json, using defaults`);
}


// Load configuration
console.log('Loading crawl configuration...');
const configCandidates = [
  path.join(__dirname, '..', 'config.json'),
  path.join(__dirname, 'config.json')
];
let configPath = null;
for (const candidate of configCandidates) {
  if (fs.existsSync(candidate)) {
    configPath = candidate;
    break;
  }
}

let config = { url: 'https://www.theguardian.com' }; // Default fallback

if (configPath) {
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(configData);
    if (parsed && typeof parsed === 'object') {
      config = parsed;
    } else {
      console.warn(`Warning: Config at ${configPath} is not valid JSON object, using default URL`);
    }
  } catch (error) {
    console.warn(`Warning: Could not load config from ${configPath}, using default URL`);
  }
} else {
  console.warn(`Warning: No config.json found (checked root and tools directories), using default URL`);
}

// Determine starting URL (command line arg overrides config)
const urlArg = args.find(arg => !arg.startsWith('--') && arg.startsWith('http'));
const configUrl = config.intelligentCrawl?.url || config.url;
const startUrl = urlArg || configUrl || 'https://www.theguardian.com';

function resolveTotalPrioritySetting(runConfig) {
  if (!runConfig || typeof runConfig !== 'object') {
    return undefined;
  }
  const settings = runConfig.intelligentCrawl;
  if (!settings || typeof settings !== 'object') {
    return undefined;
  }
  if (typeof settings.totalPriority === 'boolean') {
    return settings.totalPriority;
  }
  if (typeof settings.totalPrioritisation === 'boolean') {
    return settings.totalPrioritisation;
  }
  if (typeof settings.mode === 'string') {
    const normalized = settings.mode.trim().toLowerCase();
    if (normalized === 'total-priority' || normalized === 'country-hubs-total') {
      return true;
    }
    if (normalized === 'balanced' || normalized === 'standard') {
      return false;
    }
  }
  return undefined;
}

const totalPriorityOverride = resolveTotalPrioritySetting(config);

if (typeof totalPriorityOverride === 'boolean') {
  if (!priorityConfig.features) {
    priorityConfig.features = {};
  }
  if (priorityConfig.features.totalPrioritisation !== totalPriorityOverride) {
    priorityConfig.features.totalPrioritisation = totalPriorityOverride;
    try {
      fs.writeFileSync(
        priorityConfigPath,
        `${JSON.stringify(priorityConfig, null, 2)}\n`,
        'utf-8'
      );
      console.log(`Priority configuration updated: totalPrioritisation set to ${totalPriorityOverride ? 'ENABLED' : 'DISABLED'} via config.json`);
    } catch (error) {
      console.warn(`Warning: Failed to persist total priority setting to priority-config.json (${error.message})`);
    }
  }
}

const totalPrioritisation = (typeof totalPriorityOverride === 'boolean')
  ? totalPriorityOverride
  : priorityConfig.features?.totalPrioritisation === true;


// Function to verify if a title corresponds to a real place
function isActualPlaceHub(title, url) {
  // Ensure gazetteer data is loaded
  ensureGazetteerLoaded();

  // Extract place name from title like "France | The Guardian" or "Latest Australia news"

  // Pattern 1: "PlaceName | The Guardian"
  const pattern1 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
  if (pattern1) {
    const placeName = pattern1[1];
    // Only consider countries as place hubs for news websites
    const isCountry = allCountries.some(c =>
      c.name.toLowerCase() === placeName.toLowerCase()
    );
    if (isCountry) {
      return { isHub: true, name: placeName };
    }
  }

  // Pattern 2: "Latest PlaceName news"
  const pattern2 = title.match(/Latest\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/);
  if (pattern2) {
    const placeName = pattern2[1];
    // Only consider countries as place hubs for news websites
    const isCountry = allCountries.some(c =>
      c.name.toLowerCase() === placeName.toLowerCase()
    );
    if (isCountry) {
      return { isHub: true, name: placeName };
    }
  }

  // Pattern 3: "PlaceName news from"
  const pattern3 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/);
  if (pattern3) {
    const placeName = pattern3[1];
    // Only consider countries as place hubs for news websites
    const isCountry = allCountries.some(c =>
      c.name.toLowerCase() === placeName.toLowerCase()
    );
    if (isCountry) {
      return { isHub: true, name: placeName };
    }
  }

  return { isHub: false, name: null };
}

// Function to verify if a title/URL corresponds to a topic hub
function isActualTopicHub(title, url) {
  // Ensure gazetteer data is loaded
  ensureGazetteerLoaded();

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

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Handle verification mode
if (verification || quickVerification) {
  console.log(colorize('🔍 Intelligent Crawl System Verification', 'blue'));
  console.log('');

  let allSystemsReady = true;

  // Check database connectivity
  try {
    console.log(colorize('📊 Database Systems:', 'blue'));
    console.log(colorize(`   ✓ SQLite database: ${db ? 'connected' : 'failed'}`, db ? 'green' : 'red'));

    if (!quickVerification) {
      // Load gazetteer data for full verification
      ensureGazetteerLoaded();
      console.log(colorize(`   ✓ Gazetteer data: ${placeNames.size} place names loaded`, placeNames.size > 0 ? 'green' : 'red'));
      console.log(colorize(`   ✓ Topic keywords: ${newsTopics.size} topics loaded`, newsTopics.size > 0 ? 'green' : 'red'));
    } else {
      // Quick verification - just check DB connectivity
      console.log(colorize(`   ✓ Gazetteer data: skipped (quick mode)`, 'yellow'));
      console.log(colorize(`   ✓ Topic keywords: skipped (quick mode)`, 'yellow'));
    }
    console.log('');
  } catch (error) {
    console.log(colorize(`   ✗ Database systems: ${error.message}`, 'red'));
    allSystemsReady = false;
    console.log('');
  }

  // Check priority configuration
  try {
    console.log(colorize('⚙️  Priority Configuration:', 'blue'));
    console.log(colorize(`   ✓ Config loaded: ${priorityConfig ? 'yes' : 'no'}`, priorityConfig ? 'green' : 'red'));
    if (priorityConfig?.features) {
      const enabledFeatures = Object.entries(priorityConfig.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature);
      console.log(colorize(`   ✓ Enabled features: ${enabledFeatures.join(', ')}`, enabledFeatures.length > 0 ? 'green' : 'yellow'));
    }
    console.log(colorize(`   ✓ Total prioritisation: ${totalPrioritisation ? 'enabled' : 'disabled'}`, totalPrioritisation ? 'green' : 'yellow'));
    console.log('');
  } catch (error) {
    console.log(colorize(`   ✗ Priority configuration: ${error.message}`, 'red'));
    allSystemsReady = false;
    console.log('');
  }

  // Check crawler initialization
  try {
    console.log(colorize('🤖 Crawler Systems:', 'blue'));
    const testCrawler = new NewsCrawler(startUrl, {
      crawlType: 'intelligent',
      concurrency: 1,
      maxDepth: 2,
      enableDb: true,
      useSitemap: true,
      preferCache: true,
      maxDownloads: 1 // Minimal for verification
    });

    console.log(colorize('   ✓ NewsCrawler instance created', 'green'));
    console.log(colorize(`   ✓ Crawl type: intelligent`, 'green'));
    console.log(colorize(`   ✓ Target URL: ${startUrl}`, 'green'));

    // Check enhanced features status
    const featuresEnabled = testCrawler.featuresEnabled || {};
    const enhancedDbAvailable = !!testCrawler.enhancedDbAdapter;

    console.log(colorize(`   ✓ Enhanced DB adapter: ${enhancedDbAvailable ? 'available' : 'unavailable (optional)'}`, enhancedDbAvailable ? 'green' : 'yellow'));

    // Check specific feature availability
    const criticalFeatures = ['gapDrivenPrioritization', 'patternDiscovery', 'countryHubGaps'];
    const availableFeatures = criticalFeatures.filter(f => featuresEnabled[f]);
    const missingFeatures = criticalFeatures.filter(f => !featuresEnabled[f]);

    if (availableFeatures.length > 0) {
      console.log(colorize(`   ✓ Available features: ${availableFeatures.join(', ')}`, 'green'));
    }
    if (missingFeatures.length > 0) {
      console.log(colorize(`   ⚠️  Missing features: ${missingFeatures.join(', ')} (may affect functionality)`, 'yellow'));
    }

    console.log('');
  } catch (error) {
    console.log(colorize(`   ✗ Crawler initialization: ${error.message}`, 'red'));
    allSystemsReady = false;
    console.log('');
  }

  // Check gazetteer data quality (skip in quick mode)
  if (!quickVerification) {
    try {
      console.log(colorize('🌍 Gazetteer Data Quality:', 'blue'));
      ensureGazetteerLoaded();
      console.log(colorize(`   ✓ Total countries: ${allCountries.length}`, allCountries.length > 0 ? 'green' : 'red'));

      // Check for major world regions
      const continents = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'];
      const continentCount = continents.filter(c =>
        allCountries.some(country => country.continent === c)
      ).length;
      console.log(colorize(`   ✓ Continents represented: ${continentCount}/6`, continentCount >= 4 ? 'green' : 'yellow'));

      // Check for major countries
      const majorCountries = ['United States', 'United Kingdom', 'China', 'India', 'Germany', 'France'];
      const majorCount = majorCountries.filter(name =>
        allCountries.some(country => country.name === name)
      ).length;
      console.log(colorize(`   ✓ Major countries present: ${majorCount}/6`, majorCount >= 4 ? 'green' : 'yellow'));

      console.log('');
    } catch (error) {
      console.log(colorize(`   ✗ Gazetteer quality check: ${error.message}`, 'red'));
      allSystemsReady = false;
      console.log('');
    }
  }

  // Summary
  console.log(colorize('📋 Verification Summary:', 'blue'));
  if (allSystemsReady) {
    console.log(colorize('✅ All critical systems are ready for intelligent crawling', 'green'));
    console.log('');
    console.log(colorize('🎯 Ready to run: node tools/intelligent-crawl.js [url] [options]', 'cyan'));
  } else {
    console.log(colorize('❌ Some systems are not ready - check errors above', 'red'));
    console.log('');
    console.log(colorize('🔧 Fix issues and re-run verification before crawling', 'yellow'));
  }

  process.exit(allSystemsReady ? 0 : 1);
}

if (verbose) {
  console.log(`Starting intelligent crawl of: ${startUrl}`);
  console.log('Configuration: single-threaded, depth 2, intelligent mode');
  console.log('---');
} else if (compact) {
  console.log(colorize('🌍 Country Hub Discovery', 'blue'));
  console.log(colorize(`Target: ${startUrl}`, 'cyan'));
  console.log('');
} else {
  console.log(colorize('🚀 Starting Intelligent Crawl', 'blue'));
  console.log(colorize(`📍 Target: ${startUrl}`, 'cyan'));
  console.log(colorize('🎯 Mode: Country Hub Prioritization', 'green'));
  console.log(colorize('🌍 Focus: Geographic Coverage & Country Hub Discovery', 'yellow'));
  console.log('');
}

  console.log('');

// Show country hub validation status
if (!verbose && !compact) {
  console.log(colorize('🌍 Country Hub Validation:', 'blue'));
  ensureGazetteerLoaded();
  console.log(colorize(`   ✓ ${allCountries.length} countries loaded from gazetteer`, 'green'));
  console.log(colorize(`   🎯 Total Prioritisation: ${totalPrioritisation ? 'ENABLED' : 'DISABLED'}`, totalPrioritisation ? 'green' : 'yellow'));
  console.log('');
}

// Create crawler to EXHAUSTIVELY CRAWL ALL COUNTRY HUBS WITH PAGINATION
const crawler = new NewsCrawler(startUrl, {
  crawlType: 'intelligent',  // Use intelligent crawl to discover country hubs
  concurrency: 1,            // Single thread for reliability
  maxDepth: 1,               // Only crawl hub pages themselves (depth 0 = start, depth 1 = hubs)
  maxDownloads: 500,         // Allow enough downloads for all country hubs + pagination
  enableDb: true,
  useSitemap: false,         // DISABLE sitemap loading - interferes with country hub focus
  preferCache: true,
  maxAgeMs: 24 * 60 * 60 * 1000,  // Use cache if < 24 hours old
  // Enable country hub discovery and exhaustive pagination crawling
  plannerEnabled: true,      // Enable intelligent planning for country hub discovery
  behavioralProfile: 'country-hub-focused',
  totalPrioritisation,
  gapDrivenPrioritization: true,
  patternDiscovery: true,    // Enable pattern discovery for country hubs
  countryHubGaps: true,
  countryHubBehavioralProfile: true,
  countryHubTargetCount: 250, // Target all 250 countries
  exhaustiveCountryHubMode: true,
  countryHubExclusiveMode: true,
  disableTopicHubs: true,    // Disable topic hubs
  disableRegularArticles: true, // Disable regular articles
  priorityMode: 'country-hubs-only',
  skipQueryUrls: false,      // Allow pagination query URLs (page=2, etc.)
  // Pagination-specific settings
  enablePaginationCrawling: true,  // Enable pagination detection and following
  maxPaginationPages: 50,    // Maximum pages to crawl per country hub
  paginationDetectionEnabled: true, // Detect pagination links
  paginationLoopProtection: true,  // Prevent infinite pagination loops
  paginationTimeoutMs: 30000, // Timeout for pagination crawling per hub
  // Hub-specific settings
  hubMaxPages: 50,          // Maximum pages per hub (for pagination)
  hubMaxDays: 365,          // No time limit for hub crawling
  // Disable all non-hub content
  disableNavigationDiscovery: false, // Keep navigation discovery for pagination
  disableContentAcquisition: true,   // Don't save articles, just crawl structure
  structureOnly: true        // Skip article downloads and focus on hub structure
});

// Show planning phase with EXHAUSTIVE mode messaging
if (!verbose && !compact) {
  console.log(colorize('🧠 Planning Phase - EXHAUSTIVE COUNTRY HUB MODE:', 'blue'));
  console.log(colorize('   🔍 Analyzing existing coverage and gaps...', 'cyan'));
  console.log(colorize('   📊 Prioritizing ALL 250 country hubs for discovery...', 'cyan'));
  console.log(colorize('   🎯 EXHAUSTIVE: Process all country hubs before other content', 'green'));
  console.log(colorize('   🚀 HIGH CONCURRENCY: 3 parallel downloads for speed', 'yellow'));
  console.log('');
}

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
