'use strict';

/**
 * Unified App API Check Script
 * 
 * Validates the API endpoints for the unified app shell.
 * Run this against a running server (npm run ui:unified).
 */

const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log('=== Unified App API Check ===\n');
console.log(`Testing against ${BASE_URL}\n`);

const assertions = [];
let passed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}`);
  }
  assertions.push({ name, passed: condition });
}

function fetch(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runChecks() {
  try {
    // Test main page
    const mainPage = await fetch('/');
    assert('Main page returns 200', mainPage.status === 200);
    assert('Main page contains unified-shell', mainPage.raw.includes('unified-shell'));
    
    // Test apps registry API
    const appsApi = await fetch('/api/apps');
    assert('Apps API returns 200', appsApi.status === 200);
    assert('Apps API returns apps array', Array.isArray(appsApi.json?.apps));
    assert('Apps contains 13+ entries', appsApi.json?.apps?.length >= 13);
    
    // Check specific apps exist
    const apps = appsApi.json?.apps || [];
    assert('Registry has home app', apps.some(a => a.id === 'home'));
    assert('Registry has rate-limits app', apps.some(a => a.id === 'rate-limits'));
    assert('Registry has webhooks app', apps.some(a => a.id === 'webhooks'));
    assert('Registry has plugins app', apps.some(a => a.id === 'plugins'));
    
    // Check app structure
    const homeApp = apps.find(a => a.id === 'home');
    assert('Home app has label', typeof homeApp?.label === 'string');
    assert('Home app has icon', typeof homeApp?.icon === 'string');
    assert('Home app has category', typeof homeApp?.category === 'string');
    assert('Home app has description', typeof homeApp?.description === 'string');
    
    // Test content APIs
    const homeContent = await fetch('/api/apps/home/content');
    assert('Home content API returns 200', homeContent.status === 200);
    assert('Home content has appId', homeContent.json?.appId === 'home');
    assert('Home content has content string', typeof homeContent.json?.content === 'string');
    
    const rateLimitContent = await fetch('/api/apps/rate-limits/content');
    assert('Rate limits content API returns 200', rateLimitContent.status === 200);
    assert('Rate limits content has content', rateLimitContent.json?.content?.length > 100);
    
    const webhooksContent = await fetch('/api/apps/webhooks/content');
    assert('Webhooks content API returns 200', webhooksContent.status === 200);
    
    const pluginsContent = await fetch('/api/apps/plugins/content');
    assert('Plugins content API returns 200', pluginsContent.status === 200);
    
    // Test 404 for unknown app
    const unknownApp = await fetch('/api/apps/does-not-exist/content');
    assert('Unknown app returns 404', unknownApp.status === 404);
    assert('Unknown app returns error message', unknownApp.json?.error?.includes('not found'));
    
    console.log(`\n${passed}/${assertions.length} assertions passed`);
    
    if (passed === assertions.length) {
      console.log('\n✅ All API checks passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Some API checks failed');
      process.exit(1);
    }
    
  } catch (err) {
    console.error('\n❌ Connection error:', err.message);
    console.log('\nMake sure the server is running: npm run ui:unified');
    process.exit(2);
  }
}

runChecks();
