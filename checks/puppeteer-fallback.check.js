#!/usr/bin/env node
'use strict';

/**
 * Check: Puppeteer Fallback Integration
 * 
 * Verifies that FetchPipeline correctly initializes Puppeteer fallback configuration
 * and that the helper methods work as expected.
 */

const { FetchPipeline } = require('../src/crawler/FetchPipeline');

// Minimal mock dependencies
const minimalOpts = {
  getUrlDecision: () => ({ policy: 'network' }),
  normalizeUrl: url => url,
  isOnDomain: () => true,
  isAllowed: () => true,
  hasVisited: () => false,
  looksLikeArticle: () => true,
  getCachedArticle: async () => null,
  cache: null,
  preferCache: false,
  acquireDomainToken: async () => {},
  acquireRateToken: async () => {},
  rateLimitMs: 0,
  requestTimeoutMs: 30000,
  httpAgent: null,
  httpsAgent: null,
  currentDownloads: new Map(),
  emitProgress: () => {},
  note429: () => {},
  noteSuccess: () => {},
  recordError: () => {},
  handleConnectionReset: () => {},
  articleHeaderCache: new Map(),
  knownArticlesCache: new Map(),
  dbAdapter: null,
  parseRetryAfter: () => null,
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

function check(name, condition, expected, actual) {
  const pass = condition;
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    process.exitCode = 1;
  }
  return pass;
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('Check: Puppeteer Fallback Integration');
console.log('═══════════════════════════════════════════════════════════════\n');

// Test 1: Default configuration
const pipeline1 = new FetchPipeline(minimalOpts);
check(
  'Default: puppeteerFallbackEnabled = true',
  pipeline1.puppeteerFallbackEnabled === true,
  true,
  pipeline1.puppeteerFallbackEnabled
);

check(
  'Default: puppeteerFallbackOnEconnreset = true',
  pipeline1.puppeteerFallbackOnEconnreset === true,
  true,
  pipeline1.puppeteerFallbackOnEconnreset
);

check(
  'Default: includes theguardian.com in domains',
  pipeline1.puppeteerFallbackDomains.includes('theguardian.com'),
  true,
  pipeline1.puppeteerFallbackDomains.join(', ')
);

// Test 2: _shouldUsePuppeteerFallback method
check(
  '_shouldUsePuppeteerFallback("www.theguardian.com") = true',
  pipeline1._shouldUsePuppeteerFallback('www.theguardian.com') === true,
  true,
  pipeline1._shouldUsePuppeteerFallback('www.theguardian.com')
);

check(
  '_shouldUsePuppeteerFallback("theguardian.com") = true',
  pipeline1._shouldUsePuppeteerFallback('theguardian.com') === true,
  true,
  pipeline1._shouldUsePuppeteerFallback('theguardian.com')
);

check(
  '_shouldUsePuppeteerFallback("example.com") = false',
  pipeline1._shouldUsePuppeteerFallback('example.com') === false,
  false,
  pipeline1._shouldUsePuppeteerFallback('example.com')
);

// Test 3: Custom configuration
const pipeline2 = new FetchPipeline({
  ...minimalOpts,
  puppeteerFallback: {
    enabled: true,
    domains: ['mysite.com', 'blocked.org'],
    onEconnreset: true
  }
});

check(
  'Custom: domains = ["mysite.com", "blocked.org"]',
  pipeline2.puppeteerFallbackDomains.length === 2 &&
  pipeline2.puppeteerFallbackDomains.includes('mysite.com'),
  '["mysite.com", "blocked.org"]',
  JSON.stringify(pipeline2.puppeteerFallbackDomains)
);

check(
  'Custom: _shouldUsePuppeteerFallback("api.mysite.com") = true',
  pipeline2._shouldUsePuppeteerFallback('api.mysite.com') === true,
  true,
  pipeline2._shouldUsePuppeteerFallback('api.mysite.com')
);

// Test 4: Disabled configuration
const pipeline3 = new FetchPipeline({
  ...minimalOpts,
  puppeteerFallback: {
    enabled: false
  }
});

check(
  'Disabled: puppeteerFallbackEnabled = false',
  pipeline3.puppeteerFallbackEnabled === false,
  false,
  pipeline3.puppeteerFallbackEnabled
);

check(
  'Disabled: _shouldUsePuppeteerFallback("theguardian.com") = false',
  pipeline3._shouldUsePuppeteerFallback('theguardian.com') === false,
  false,
  pipeline3._shouldUsePuppeteerFallback('theguardian.com')
);

// Test 5: Methods exist
check(
  '_getPuppeteerFetcher method exists',
  typeof pipeline1._getPuppeteerFetcher === 'function',
  'function',
  typeof pipeline1._getPuppeteerFetcher
);

check(
  'destroyPuppeteer method exists',
  typeof pipeline1.destroyPuppeteer === 'function',
  'function',
  typeof pipeline1.destroyPuppeteer
);

console.log('\n───────────────────────────────────────────────────────────────');
console.log(process.exitCode ? '❌ Some checks failed' : '✅ All checks passed');
console.log('───────────────────────────────────────────────────────────────\n');
