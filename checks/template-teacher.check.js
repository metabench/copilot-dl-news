#!/usr/bin/env node
'use strict';

/**
 * Check script for Template Teacher
 *
 * Verifies:
 * - Router starts without errors (services init)
 * - Dashboard renders
 * - Templates page renders
 * - API returns expected JSON for missing URL
 */

const http = require('http');
const { createTemplateTeacherRouter } = require('../src/ui/server/templateTeacher/server');

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
  console.log('Check: Template Teacher');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  let router;
  let close;

  try {
    const created = await createTemplateTeacherRouter();
    router = created.router;
    close = created.close;
    check(true, 'createTemplateTeacherRouter() returns without error');
  } catch (err) {
    check(false, `createTemplateTeacherRouter() returns without error: ${err.message}`);
    process.exit(1);
  }

  const dashRes = await request(router, '/');
  check(dashRes.status === 200, 'GET / returns 200');
  check(dashRes.body.includes('Template Teacher') || dashRes.body.includes('Teach New'), 'Dashboard contains Template Teacher UI');

  const templatesRes = await request(router, '/templates');
  check(templatesRes.status === 200, 'GET /templates returns 200');
  check(templatesRes.body.includes('Extraction Templates'), 'Templates page contains title');

  const analyzeRes = await request(router, '/api/analyze');
  check(analyzeRes.status === 200, 'GET /api/analyze returns 200');
  try {
    const analyzeJson = JSON.parse(analyzeRes.body);
    check(analyzeJson && analyzeJson.error === 'URL required', 'GET /api/analyze without url returns { error: "URL required" }');
  } catch (err) {
    check(false, `GET /api/analyze returns JSON: ${err.message}`);
  }

  try {
    if (typeof close === 'function') {
      await close();
      check(true, 'Service lifecycle close() completes');
    } else {
      check(true, 'Service lifecycle close() is optional');
    }
  } catch (err) {
    check(false, `Service lifecycle close() completes: ${err.message}`);
  }

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
