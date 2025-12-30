#!/usr/bin/env node
'use strict';

/**
 * Check script for Visual Diff Tool
 * 
 * Verifies:
 * - Server starts without errors
 * - Dashboard renders
 * - Compare endpoint handles valid/invalid input
 * - Queue endpoints work
 * - API endpoint returns JSON
 */

const http = require('http');
const { createApp } = require('../src/ui/server/visualDiff/server');

let passed = 0;
let failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    failed++;
  }
}

async function request(app, path) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      http.get(`http://localhost:${port}${path}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body, headers: res.headers });
        });
      }).on('error', (err) => {
        server.close();
        resolve({ status: 500, error: err.message });
      });
    });
  });
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Check: Visual Diff Tool');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Create app
  let app;
  try {
    app = createApp();
    check(true, 'createApp() returns without error');
  } catch (err) {
    check(false, 'createApp() returns without error: ' + err.message);
    process.exit(1);
  }

  // Test dashboard
  const dashRes = await request(app, '/');
  check(dashRes.status === 200, 'GET / returns 200');
  check(dashRes.body.includes('Visual Diff Tool'), 'Dashboard contains title');
  check(dashRes.body.includes('Low Confidence Queue'), 'Dashboard has queue links');

  // Test low confidence queue
  const lcRes = await request(app, '/review/low-confidence');
  check(lcRes.status === 200, 'GET /review/low-confidence returns 200');
  check(lcRes.body.includes('Low Confidence Queue'), 'Low confidence page has title');

  // Test unrated queue
  const urRes = await request(app, '/review/unrated');
  check(urRes.status === 200, 'GET /review/unrated returns 200');
  check(urRes.body.includes('Unrated Queue'), 'Unrated page has title');

  // Test golden set
  const goldRes = await request(app, '/golden');
  check(goldRes.status === 200, 'GET /golden returns 200');
  check(goldRes.body.includes('Golden Reference Set'), 'Golden page has title');

  // Test compare with missing query
  const compNoQ = await request(app, '/compare');
  check(compNoQ.status === 302 || compNoQ.body.includes('<!DOCTYPE'), 'GET /compare without query redirects or shows page');

  // Test API with invalid ID
  const apiInvalid = await request(app, '/api/compare/999999');
  check(apiInvalid.status === 404, 'GET /api/compare/999999 returns 404');
  const apiBody = JSON.parse(apiInvalid.body);
  check(apiBody.error === 'Not found', 'API returns error JSON');

  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  if (failed === 0) {
    console.log(`✅ All ${passed} checks passed`);
  } else {
    console.log(`❌ ${failed} checks failed, ${passed} passed`);
  }
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
