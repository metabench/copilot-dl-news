'use strict';

/**
 * Check script for Query Telemetry Dashboard
 * 
 * Verifies:
 * - Server starts successfully
 * - Dashboard renders SSR HTML
 * - API endpoints return expected JSON structure
 */

const path = require('path');
const http = require('http');

const PORT = 3020;
const SERVER_PATH = path.join(__dirname, '..', 'server.js');

async function waitForServer(port, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/`, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(500, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return false;
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function runChecks() {
  console.log('📈 Query Telemetry Dashboard Check');
  console.log('═'.repeat(50));
  
  // Start server
  console.log('\n🚀 Starting server...');
  const { app, initDb } = require(SERVER_PATH);
  
  initDb();
  
  const server = app.listen(PORT, () => {
    console.log(`   Server listening on port ${PORT}`);
  });

  try {
    // Wait for server
    const ready = await waitForServer(PORT);
    if (!ready) {
      throw new Error('Server failed to start');
    }
    console.log('   ✅ Server is ready');

    // Check 1: Dashboard HTML renders
    console.log('\n📊 Check 1: Dashboard SSR');
    const dashboardHtml = await fetchHtml(`http://localhost:${PORT}/`);
    
    const dashboardChecks = [
      ['Contains title', dashboardHtml.includes('Query Telemetry Dashboard')],
      ['Contains stats section', dashboardHtml.includes('Query Statistics') || dashboardHtml.includes('Cost Model Summary')],
      ['Contains nav links', dashboardHtml.includes('/api/stats')]
    ];
    
    for (const [label, passed] of dashboardChecks) {
      console.log(`   ${passed ? '✅' : '❌'} ${label}`);
    }

    // Check 2: Recent page renders
    console.log('\n📝 Check 2: Recent Queries Page');
    const recentHtml = await fetchHtml(`http://localhost:${PORT}/recent`);
    
    const recentChecks = [
      ['Contains title', recentHtml.includes('Recent Queries')],
      ['Has filter section', recentHtml.includes('Filter')]
    ];
    
    for (const [label, passed] of recentChecks) {
      console.log(`   ${passed ? '✅' : '❌'} ${label}`);
    }

    // Check 3: API /api/stats returns JSON
    console.log('\n🔌 Check 3: API /api/stats');
    const statsResponse = await fetchJson(`http://localhost:${PORT}/api/stats`);
    
    const statsChecks = [
      ['Has stats array', Array.isArray(statsResponse.stats)],
      ['Has summary object', typeof statsResponse.summary === 'object'],
      ['Summary has queryTypeCount', typeof statsResponse.summary?.queryTypeCount === 'number'],
      ['Summary has totalSamples', typeof statsResponse.summary?.totalSamples === 'number']
    ];
    
    for (const [label, passed] of statsChecks) {
      console.log(`   ${passed ? '✅' : '❌'} ${label}`);
    }

    // Check 4: API /api/recent returns JSON
    console.log('\n🔌 Check 4: API /api/recent');
    const recentResponse = await fetchJson(`http://localhost:${PORT}/api/recent`);
    
    const recentApiChecks = [
      ['Has queries array', Array.isArray(recentResponse.queries)],
      ['Has count field', typeof recentResponse.count === 'number'],
      ['Has queryType field', typeof recentResponse.queryType === 'string']
    ];
    
    for (const [label, passed] of recentApiChecks) {
      console.log(`   ${passed ? '✅' : '❌'} ${label}`);
    }

    // Summary
    const allChecks = [...dashboardChecks, ...recentChecks, ...statsChecks, ...recentApiChecks];
    const passed = allChecks.filter(([, p]) => p).length;
    const total = allChecks.length;
    
    console.log('\n' + '═'.repeat(50));
    console.log(`✅ Passed: ${passed}/${total} checks`);
    
    if (passed < total) {
      console.log(`❌ Failed: ${total - passed} checks`);
      process.exitCode = 1;
    }

  } finally {
    // Cleanup
    server.close();
    console.log('\n🛑 Server stopped');
  }
}

runChecks().catch(err => {
  console.error('❌ Check failed:', err.message);
  process.exit(1);
});
