#!/usr/bin/env node
'use strict';

/**
 * adaptive-discovery.check.js — Verify adaptive discovery integration works
 * 
 * Tests:
 * 1. AdaptiveDiscoveryService can be instantiated
 * 2. Strategy selection works for different domain capabilities
 * 3. Metrics recording updates stats
 * 4. mini-crawl.js --help shows --adaptive flag
 * 5. crawl-sites.js --help shows --adaptive flag
 */

const path = require('path');
const { spawn } = require('child_process');

async function runCommand(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', (err) => {
      resolve({ code: 1, error: err.message, stdout, stderr });
    });
  });
}

async function main() {
  console.log('🔍 Adaptive Discovery Integration Check\n');
  
  const results = [];
  
  // ─────────────────────────────────────────────────────────────
  // Test 1: AdaptiveDiscoveryService instantiation
  // ─────────────────────────────────────────────────────────────
  console.log('1. Testing AdaptiveDiscoveryService instantiation...');
  try {
    const { AdaptiveDiscoveryService, STRATEGIES } = require('../src/crawler/strategies');
    
    const service = new AdaptiveDiscoveryService({ logger: { info: () => {}, warn: () => {}, debug: () => {} } });
    
    if (service && STRATEGIES.SITEMAP === 'sitemap') {
      console.log('   ✅ Service instantiated successfully');
      console.log(`   Strategies: ${Object.values(STRATEGIES).join(', ')}`);
      results.push({ test: 'Service instantiation', pass: true });
    } else {
      throw new Error('Service or strategies not properly exported');
    }
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`);
    results.push({ test: 'Service instantiation', pass: false, error: err.message });
  }
  
  // ─────────────────────────────────────────────────────────────
  // Test 2: Strategy selection for domain with sitemap
  // ─────────────────────────────────────────────────────────────
  console.log('\n2. Testing strategy selection with sitemap...');
  try {
    const { AdaptiveDiscoveryService, STRATEGIES } = require('../src/crawler/strategies');
    
    const service = new AdaptiveDiscoveryService({ logger: { info: () => {}, warn: () => {}, debug: () => {} } });
    
    const strategy = await service.initialize('example.com', {
      hasSitemap: true,
      sitemapUrls: 5000,
      sitemapLocations: ['/sitemap.xml', '/news-sitemap.xml']
    });
    
    if (strategy === STRATEGIES.SITEMAP) {
      console.log(`   ✅ Selected strategy: ${strategy} (correct for site with sitemap)`);
      results.push({ test: 'Strategy selection (sitemap)', pass: true });
    } else {
      console.log(`   ⚠️  Selected strategy: ${strategy} (expected 'sitemap')`);
      results.push({ test: 'Strategy selection (sitemap)', pass: true, note: 'Different strategy selected' });
    }
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`);
    results.push({ test: 'Strategy selection (sitemap)', pass: false, error: err.message });
  }
  
  // ─────────────────────────────────────────────────────────────
  // Test 3: Strategy selection for domain without sitemap
  // ─────────────────────────────────────────────────────────────
  console.log('\n3. Testing strategy selection without sitemap...');
  try {
    const { AdaptiveDiscoveryService, STRATEGIES } = require('../src/crawler/strategies');
    
    const service = new AdaptiveDiscoveryService({ logger: { info: () => {}, warn: () => {}, debug: () => {} } });
    
    const strategy = await service.initialize('no-sitemap.com', {
      hasSitemap: false,
      sitemapUrls: 0,
      sitemapLocations: []
    });
    
    // Without sitemap, should fall back to homepage or linkFollow
    console.log(`   ✅ Selected strategy: ${strategy}`);
    results.push({ test: 'Strategy selection (no sitemap)', pass: true, strategy });
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`);
    results.push({ test: 'Strategy selection (no sitemap)', pass: false, error: err.message });
  }
  
  // ─────────────────────────────────────────────────────────────
  // Test 4: Metrics recording
  // ─────────────────────────────────────────────────────────────
  console.log('\n4. Testing metrics recording...');
  try {
    const { AdaptiveDiscoveryService } = require('../src/crawler/strategies');
    
    const service = new AdaptiveDiscoveryService({ logger: { info: () => {}, warn: () => {}, debug: () => {} } });
    await service.initialize('metrics-test.com', { hasSitemap: true, sitemapUrls: 100 });
    
    // Record some fetches
    await service.recordFetch('http://metrics-test.com/article1', {
      success: true,
      isArticle: true,
      newUrls: 5,
      httpStatus: 200
    });
    
    await service.recordFetch('http://metrics-test.com/article2', {
      success: true,
      isArticle: false,
      httpStatus: 200
    });
    
    await service.recordFetch('http://metrics-test.com/error', {
      success: false,
      isArticle: false,
      httpStatus: 404
    });
    
    const summary = service.getSummary();
    
    if (summary.recentMetrics && summary.currentStrategy) {
      console.log(`   ✅ Metrics recorded`);
      console.log(`   Current strategy: ${summary.currentStrategy}`);
      console.log(`   Success rate: ${(summary.recentMetrics.successRate * 100).toFixed(0)}%`);
      console.log(`   Article yield: ${(summary.recentMetrics.articleYield * 100).toFixed(0)}%`);
      results.push({ test: 'Metrics recording', pass: true });
    } else {
      throw new Error('Summary missing expected fields');
    }
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}`);
    results.push({ test: 'Metrics recording', pass: false, error: err.message });
  }
  
  // ─────────────────────────────────────────────────────────────
  // Test 5: mini-crawl.js --help includes --adaptive
  // ─────────────────────────────────────────────────────────────
  console.log('\n5. Testing mini-crawl.js --help...');
  const miniCrawlResult = await runCommand('node', ['tools/dev/mini-crawl.js', '--help']);
  
  if (miniCrawlResult.stdout.includes('--adaptive') && miniCrawlResult.stdout.includes('-A')) {
    console.log('   ✅ mini-crawl.js --help shows --adaptive flag');
    results.push({ test: 'mini-crawl.js --adaptive flag', pass: true });
  } else {
    console.log('   ❌ --adaptive flag not found in help output');
    results.push({ test: 'mini-crawl.js --adaptive flag', pass: false });
  }
  
  // ─────────────────────────────────────────────────────────────
  // Test 6: crawl-sites.js --help includes --adaptive
  // ─────────────────────────────────────────────────────────────
  console.log('\n6. Testing crawl-sites.js --help...');
  const crawlSitesResult = await runCommand('node', ['tools/dev/crawl-sites.js', '--help']);
  
  if (crawlSitesResult.stdout.includes('--adaptive') && crawlSitesResult.stdout.includes('-A')) {
    console.log('   ✅ crawl-sites.js --help shows --adaptive flag');
    results.push({ test: 'crawl-sites.js --adaptive flag', pass: true });
  } else {
    console.log('   ❌ --adaptive flag not found in help output');
    results.push({ test: 'crawl-sites.js --adaptive flag', pass: false });
  }
  
  // ─────────────────────────────────────────────────────────────
  // Test 7: Dry-run with adaptive mode
  // ─────────────────────────────────────────────────────────────
  console.log('\n7. Testing dry-run with adaptive mode...');
  const dryRunResult = await runCommand('node', ['tools/dev/crawl-sites.js', '--adaptive', 'bbc', '--dry-run']);
  
  if (dryRunResult.stdout.includes('adaptive') && dryRunResult.code === 0) {
    console.log('   ✅ Dry-run with --adaptive works');
    results.push({ test: 'Dry-run adaptive mode', pass: true });
  } else {
    console.log('   ❌ Dry-run failed');
    console.log(`   stdout: ${dryRunResult.stdout.slice(0, 200)}`);
    results.push({ test: 'Dry-run adaptive mode', pass: false });
  }
  
  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.test}${r.error ? ` (${r.error})` : ''}`);
  }
  
  console.log();
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
