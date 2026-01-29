'use strict';

/**
 * Check: CrawlStrategyExplorerControl renders correctly
 * 
 * Validates:
 * - Operations list view renders with category groupings
 * - Operation detail view shows option schema
 * - Sequences view shows steps
 */

const jsgui = require('jsgui3-html');
const { CrawlStrategyExplorerControl } = require('../controls');
const { OperationSchemaRegistry } = require('../../../../core/crawler/operations/schemas');

function makeContext() {
  return new jsgui.Page_Context();
}

// Get real operations from schema registry
function getRealOperations() {
  const summaries = OperationSchemaRegistry.listSchemas();
  return summaries.map(summary => {
    const schema = OperationSchemaRegistry.getSchema(summary.operation);
    return {
      name: summary.operation,
      label: schema?.label || summary.operation,
      description: schema?.description || 'No description',
      category: schema?.category || 'other',
      icon: schema?.icon || '❓',
      optionSchema: schema?.options || {}
    };
  });
}

const mockSequences = [
  {
    name: 'comprehensive-discovery',
    label: 'Comprehensive Discovery',
    description: 'Full site discovery with hub detection',
    stepCount: 4,
    continueOnError: true,
    steps: [
      { operation: 'siteExplorer', label: 'Site Explorer' },
      { operation: 'sitemapDiscovery', label: 'Sitemap Discovery' },
      { operation: 'guessPlaceHubs', label: 'Guess Place Hubs' },
      { operation: 'findTopicHubs', label: 'Find Topic Hubs' }
    ]
  }
];

console.log('===== CrawlStrategyExplorerControl Check =====\n');

// Get operations once for all tests
const allOperations = getRealOperations();
console.log(`Loaded ${allOperations.length} operations from schema registry\n`);

// Test 1: Operations list view
console.log('1. Operations List View');
try {
  const ctx = makeContext();
  const control = new CrawlStrategyExplorerControl({
    context: ctx,
    basePath: '/crawl-strategies',
    operations: allOperations,
    sequences: mockSequences,
    viewMode: 'operations'
  });

  const html = control.all_html_render();
  
  const assertions = [
    { test: html.includes('data-testid="crawl-strategies"'), name: 'has testid' },
    { test: html.includes('data-view="operations"'), name: 'view="operations"' },
    { test: html.includes('Article Crawling'), name: 'category header' },
    { test: html.includes('basicArticleCrawl'), name: 'operation name' },
    { test: html.includes('/operation/basicArticleCrawl'), name: 'operation link' },
    { test: html.includes('📰'), name: 'operation icon' },
    { test: html.includes('Sequences'), name: 'sequences tab' }
  ];

  let passed = 0;
  for (const a of assertions) {
    if (a.test) {
      passed++;
      console.log(`   ✓ ${a.name}`);
    } else {
      console.log(`   ✗ ${a.name}`);
    }
  }
  console.log(`   [${passed}/${assertions.length} passed]\n`);

} catch (err) {
  console.log(`   ✗ Error: ${err.message}\n`);
  console.log(`   Stack: ${err.stack}\n`);
  process.exitCode = 1;
}

// Test 2: Operation detail view
console.log('2. Operation Detail View');
try {
  const ctx = makeContext();
  const selectedOp = allOperations.find(op => op.name === 'basicArticleCrawl') || allOperations[0];
  
  const control = new CrawlStrategyExplorerControl({
    context: ctx,
    basePath: '/crawl-strategies',
    operations: allOperations,
    sequences: mockSequences,
    viewMode: 'detail',
    selectedOperation: selectedOp
  });

  const html = control.all_html_render();
  
  const assertions = [
    { test: html.includes('data-view="detail"'), name: 'view="detail"' },
    { test: html.includes('Back to operations'), name: 'back link' },
    { test: html.includes(selectedOp.label), name: 'operation label' },
    { test: html.includes('Configuration Options'), name: 'options header' },
    { test: html.includes('option-row'), name: 'option rows' }
  ];

  let passed = 0;
  for (const a of assertions) {
    if (a.test) {
      passed++;
      console.log(`   ✓ ${a.name}`);
    } else {
      console.log(`   ✗ ${a.name}`);
    }
  }
  console.log(`   [${passed}/${assertions.length} passed]\n`);

} catch (err) {
  console.log(`   ✗ Error: ${err.message}\n`);
  console.log(`   Stack: ${err.stack}\n`);
  process.exitCode = 1;
}

// Test 3: Sequences view
console.log('3. Sequences View');
try {
  const ctx = makeContext();
  
  const control = new CrawlStrategyExplorerControl({
    context: ctx,
    basePath: '/crawl-strategies',
    operations: allOperations,
    sequences: mockSequences,
    viewMode: 'sequences'
  });

  const html = control.all_html_render();
  
  const assertions = [
    { test: html.includes('data-view="sequences"'), name: 'view="sequences"' },
    { test: html.includes('Comprehensive Discovery'), name: 'sequence name' },
    { test: html.includes('4 steps'), name: 'step count badge' },
    { test: html.includes('resilient'), name: 'resilient badge' },
    { test: html.includes('seq-step'), name: 'step elements' }
  ];

  let passed = 0;
  for (const a of assertions) {
    if (a.test) {
      passed++;
      console.log(`   ✓ ${a.name}`);
    } else {
      console.log(`   ✗ ${a.name}`);
    }
  }
  console.log(`   [${passed}/${assertions.length} passed]\n`);

} catch (err) {
  console.log(`   ✗ Error: ${err.message}\n`);
  console.log(`   Stack: ${err.stack}\n`);
  process.exitCode = 1;
}

// Test 4: Category grouping
console.log('4. Category Grouping');
try {
  const ctx = makeContext();
  const control = new CrawlStrategyExplorerControl({
    context: ctx,
    basePath: '/crawl-strategies',
    operations: allOperations,
    sequences: [],
    viewMode: 'operations'
  });

  const html = control.all_html_render();
  
  const assertions = [
    { test: allOperations.length >= 11, name: '≥11 operations loaded' },
    { test: html.includes('Site Discovery'), name: 'discovery category' },
    { test: html.includes('Hub Management'), name: 'hub-management category' },
    { test: html.includes('Hub Discovery'), name: 'hub-discovery category' },
    { test: html.length > 5000, name: 'substantial HTML output' }
  ];

  let passed = 0;
  for (const a of assertions) {
    if (a.test) {
      passed++;
      console.log(`   ✓ ${a.name}`);
    } else {
      console.log(`   ✗ ${a.name}`);
    }
  }
  console.log(`   [${passed}/${assertions.length} passed]\n`);

} catch (err) {
  console.log(`   ✗ Error: ${err.message}\n`);
  console.log(`   Stack: ${err.stack}\n`);
  process.exitCode = 1;
}

console.log('===== Check Complete =====');
process.exit(process.exitCode || 0);
