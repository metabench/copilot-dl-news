#!/usr/bin/env node
'use strict';

/**
 * Check script for Control Harness
 *
 * Verifies:
 * - Server app starts without errors
 * - /api/health returns { ok: true }
 * - / returns HTML with expected title marker
 */

const http = require('http');
const { createControlHarnessServer } = require('../src/ui/server/controlHarness/server');

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
        res.on('data', (chunk) => (body += chunk));
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
  console.log('Check: Control Harness');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  let app;
  try {
    const created = createControlHarnessServer();
    app = created.app;
    check(true, 'createControlHarnessServer() returns without error');
  } catch (err) {
    check(false, `createControlHarnessServer() returns without error: ${err.message}`);
    process.exit(1);
  }

  const healthRes = await request(app, '/api/health');
  check(healthRes.status === 200, 'GET /api/health returns 200');
  try {
    const healthJson = JSON.parse(healthRes.body);
    check(healthJson && healthJson.ok === true, 'GET /api/health returns { ok: true }');
  } catch (err) {
    check(false, `GET /api/health returns JSON: ${err.message}`);
  }

  const pageRes = await request(app, '/');
  check(pageRes.status === 200, 'GET / returns 200');
  check(pageRes.headers && String(pageRes.headers['content-type'] || '').includes('text/html'), 'GET / returns HTML content-type');
  check(pageRes.body.includes('<title>Control Harness</title>') || pageRes.body.includes('Control Harness'), 'HTML contains title marker');

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

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
