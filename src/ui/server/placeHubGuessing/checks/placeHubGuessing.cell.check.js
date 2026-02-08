'use strict';

/**
 * Check: Place Hub Guessing — Cell Detail
 * 
 * Validates that the cell detail page renders correctly with article metrics.
 */

const path = require('path');
const { resolveBetterSqliteHandle } = require('../../utils/dashboardModule');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

const {
  getCellModel,
  extractPathPattern,
  getHubArticleMetrics,
  getRecentHubArticles,
  getPlaceNameVariants,
  generateUrlPatterns,
  getHostUrlPatterns,
  getHostAnalysisFreshness
} = require('../../../../data/db/sqlite/v1/queries/placeHubGuessingUiQueries');

const jsgui = require('jsgui3-html');
const { renderPageHtml } = require('../../shared');
const { PlaceHubGuessingCellControl } = require('../controls');

function getMappingOutcome(mapping) {
  if (!mapping?.evidence) return null;
  const ev = typeof mapping.evidence === 'string' ? JSON.parse(mapping.evidence) : mapping.evidence;
  return ev?.presence || null;
}

function computeAgeLabel(isoString) {
  if (!isoString) return '';
  const ts = new Date(isoString).getTime();
  if (!Number.isFinite(ts)) return '';
  const deltaMs = Date.now() - ts;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return '';
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function renderCellHtml({ modelContext, place, mapping, host, articleMetrics, recentArticles, placeNameVariants, urlPatterns, hostPatterns, analysisFreshness }) {
  const placeLabel = place?.place_name || place?.country_code || String(place?.place_id || '');
  const outcome = mapping ? getMappingOutcome(mapping) : null;

  const cellState = mapping
    ? (mapping.status === 'verified' || mapping.verified_at
        ? (outcome === 'absent' ? 'Verified (not there)' : 'Verified (there)')
        : 'Pending')
    : 'Unchecked';

  const currentUrl = mapping?.url || '';
  const verifiedLabel = mapping?.verified_at
    ? `${mapping.verified_at} (${computeAgeLabel(mapping.verified_at)})`
    : '';

  const backParams = new URLSearchParams();
  backParams.set('kind', modelContext.placeKind);
  backParams.set('pageKind', modelContext.pageKind);
  const backHref = `./?${backParams.toString()}`;

  const ctx = new jsgui.Page_Context();
  const control = new PlaceHubGuessingCellControl({
    context: ctx,
    basePath: '',
    model: {
      backHref,
      placeLabel,
      host,
      place,
      mapping,
      modelContext,
      pageKind: modelContext.pageKind,
      cellState,
      currentUrl: currentUrl || '(none)',
      verifiedLabel,
      mappingJson: mapping ? JSON.stringify(mapping, null, 2) : '',
      articleMetrics: articleMetrics || null,
      recentArticles: recentArticles || [],
      placeNameVariants: placeNameVariants || [],
      urlPatterns: urlPatterns || [],
      hostPatterns: hostPatterns || [],
      analysisFreshness: analysisFreshness || null,
      hidden: {
        placeId: place?.place_id || '',
        host,
        kind: modelContext.placeKind,
        pageKind: modelContext.pageKind,
        placeLimit: modelContext.placeLimit || 30,
        hostLimit: modelContext.hostLimit || 12,
        q: '',
        hostQ: ''
      }
    }
  });

  return renderPageHtml(control, { title: '🧭 Place Hub Guessing — Cell' });
}

function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Check: Place Hub Guessing — Cell Detail');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function check(name, condition) {
    if (condition) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      failed++;
    }
  }

  // Resolve database
  const resolved = resolveBetterSqliteHandle({ dbPath: DB_PATH, readonly: true });
  check('Database handle resolved', !!resolved.dbHandle);

  if (!resolved.dbHandle) {
    console.log('\n❌ Cannot proceed without database\n');
    process.exit(1);
  }

  const dbHandle = resolved.dbHandle;

  // Find a verified mapping to test with
  const testMapping = dbHandle.prepare(`
    SELECT place_id, host, url, status, verified_at, evidence
    FROM place_page_mappings
    WHERE status = 'verified' AND url IS NOT NULL
    LIMIT 1
  `).get();

  check('Found test mapping', !!testMapping);

  if (!testMapping) {
    console.log('\n⚠️  No verified mappings found — using synthetic data\n');
  }

  // Get cell model
  const result = getCellModel(dbHandle, {
    placeId: testMapping?.place_id || 1,
    host: testMapping?.host || 'theguardian.com',
    placeKind: 'country',
    pageKind: 'country-hub',
    placeLimit: 30,
    hostLimit: 12
  });

  check('Cell model loaded', !!result && !result.error);

  // Test extractPathPattern
  const pattern1 = extractPathPattern('https://www.theguardian.com/world/africa');
  check('extractPathPattern works', pattern1 === '/world/africa');

  const pattern2 = extractPathPattern('https://example.com/news/');
  check('extractPathPattern strips trailing slash', pattern2 === '/news');

  const pattern3 = extractPathPattern(null);
  check('extractPathPattern handles null', pattern3 === null);

  // Get article metrics if we have a URL
  let articleMetrics = null;
  let recentArticles = [];
  
  if (testMapping?.url) {
    const urlPattern = extractPathPattern(testMapping.url);
    if (urlPattern) {
      articleMetrics = getHubArticleMetrics(dbHandle, {
        host: testMapping.host,
        urlPattern
      });
      recentArticles = getRecentHubArticles(dbHandle, {
        host: testMapping.host,
        urlPattern,
        limit: 10
      });
    }
  }

  check('getHubArticleMetrics returns object', articleMetrics !== null && typeof articleMetrics === 'object');
  check('Article metrics has article_count', typeof articleMetrics?.article_count === 'number');
  check('getRecentHubArticles returns array', Array.isArray(recentArticles));

  console.log(`\n📊 Article Metrics for test hub:`);
  console.log(`   article_count: ${articleMetrics?.article_count || 0}`);
  console.log(`   earliest: ${articleMetrics?.earliest_article?.slice(0, 10) || 'N/A'}`);
  console.log(`   latest: ${articleMetrics?.latest_article?.slice(0, 10) || 'N/A'}`);
  console.log(`   days_span: ${articleMetrics?.days_span || 0}`);
  console.log(`   recent_articles: ${recentArticles.length}`);

  // Test new query functions
  console.log('\n🌐 Testing new query functions...');

  // Test generateUrlPatterns (pure function, no DB)
  const urlPatterns = generateUrlPatterns('United Kingdom', 'www.bbc.com');
  check('generateUrlPatterns returns array', Array.isArray(urlPatterns));
  check('generateUrlPatterns has patterns', urlPatterns.length > 0);
  check('Pattern has required fields', urlPatterns[0]?.pattern && urlPatterns[0]?.description && urlPatterns[0]?.example);

  console.log(`   Generated ${urlPatterns.length} URL patterns for "United Kingdom"`);
  for (const p of urlPatterns.slice(0, 3)) {
    console.log(`     ${p.pattern} — ${p.description}`);
  }

  // Test getHostUrlPatterns
  const testHost = result?.host || testMapping?.host || 'theguardian.com';
  const hostPatterns = getHostUrlPatterns(dbHandle, testHost);
  check('getHostUrlPatterns returns array', Array.isArray(hostPatterns));
  console.log(`   Found ${hostPatterns.length} host patterns for ${testHost}`);

  // Test getHostAnalysisFreshness
  const analysisFreshness = getHostAnalysisFreshness(dbHandle, testHost);
  check('getHostAnalysisFreshness returns object', typeof analysisFreshness === 'object');
  check('Freshness has lastAnalyzedAt', analysisFreshness?.lastAnalyzedAt !== undefined);
  check('Freshness has articleCount', typeof analysisFreshness?.articleCount === 'number');
  check('Freshness has daysAgo', analysisFreshness?.daysAgo !== undefined);
  console.log(`   Analysis freshness: ${analysisFreshness?.daysAgo ?? 'unknown'} days ago, ${analysisFreshness?.articleCount || 0} articles`);

  // Test getPlaceNameVariants (requires gazetteer.db)
  let placeNameVariants = [];
  const gazetteerPath = path.join(process.cwd(), 'data', 'gazetteer.db');
  const fs = require('fs');
  if (fs.existsSync(gazetteerPath)) {
    const Database = require('better-sqlite3');
    const gazDb = new Database(gazetteerPath, { readonly: true });
    const testPlaceId = result?.place?.place_id || testMapping?.place_id || 1;
    placeNameVariants = getPlaceNameVariants(gazDb, testPlaceId);
    gazDb.close();
    check('getPlaceNameVariants returns array', Array.isArray(placeNameVariants));
    console.log(`   Found ${placeNameVariants.length} name variants for place_id=${testPlaceId}`);
  } else {
    console.log('   ⚠️  gazetteer.db not found, skipping place name variants test');
  }

  // Render HTML with all new data
  const html = renderCellHtml({
    modelContext: result?.modelContext || { placeKind: 'country', pageKind: 'country-hub' },
    place: result?.place || { place_id: 1, place_name: 'Test Country', country_code: 'TC' },
    mapping: result?.mapping || testMapping,
    host: result?.host || testMapping?.host || 'example.com',
    articleMetrics,
    recentArticles,
    placeNameVariants,
    urlPatterns,
    hostPatterns,
    analysisFreshness
  });

  check('HTML rendered', typeof html === 'string' && html.length > 100);
  check('Has root test id', html.includes('data-testid="place-hub-guessing-cell"'));
  check('Has back button', html.includes('Back for another'));
  check('Has verification form', html.includes('Mark Present') && html.includes('Mark Absent'));

  // Check for article metrics section if data exists
  if (articleMetrics?.article_count > 0) {
    check('Has article metrics section', html.includes('data-testid="article-metrics"'));
    check('Metrics shows article count', html.includes('Articles'));
  }

  // Check for recent articles section if data exists
  if (recentArticles.length > 0) {
    check('Has recent articles section', html.includes('data-testid="recent-articles"'));
    check('Shows Recent Articles title', html.includes('Recent Articles'));
  }

  // NEW SECTIONS: Check for new UI sections
  console.log('\n🧪 Testing new UI sections...');

  // Check URL patterns section
  if (urlPatterns.length > 0) {
    check('Has URL patterns section', html.includes('data-testid="url-patterns"'));
    check('URL patterns has Check button', html.includes('checkHubUrl'));
    check('URL patterns shows pattern code', html.includes('pattern-code'));
  }

  // Check hub check section
  check('Has hub check section', html.includes('data-testid="hub-check"'));
  check('Has hub check input', html.includes('hubCheckUrl'));
  check('Has hub check script', html.includes('async function checkHubUrl'));

  // Check host patterns section
  if (hostPatterns.length > 0) {
    check('Has host patterns section', html.includes('data-testid="host-patterns"'));
    check('Shows host pattern table', html.includes('host-patterns-table'));
  }

  // Check analysis freshness section
  if (analysisFreshness) {
    check('Has analysis freshness section', html.includes('data-testid="analysis-freshness"'));
    check('Shows freshness indicator', html.includes('Analysis Freshness'));
    // Check for correct freshness class
    if (analysisFreshness.daysAgo !== null) {
      if (analysisFreshness.daysAgo <= 7) {
        check('Shows fresh indicator (green)', html.includes('freshness-fresh'));
      } else if (analysisFreshness.daysAgo <= 30) {
        check('Shows stale indicator (yellow)', html.includes('freshness-stale'));
      } else {
        check('Shows old indicator (red)', html.includes('freshness-old'));
      }
    }
  }

  // Check place name variants section
  if (placeNameVariants.length > 0) {
    check('Has place name variants section', html.includes('data-testid="place-name-variants"'));
    check('Shows name variants table', html.includes('names-table'));
  }

  // Cleanup
  try {
    resolved.close();
  } catch {}

  // Summary
  console.log(`\n${passed}/${passed + failed} checks passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
