'use strict';

/**
 * Crawler Monitor Dashboard Check
 * 
 * Validates:
 * - Server starts successfully
 * - All API endpoints respond correctly
 * - Dashboard HTML renders
 * - SSE endpoint works
 * 
 * Usage: node checks/crawler-monitor.check.js
 */

const http = require('http');

const PORT = 3099; // Use different port for testing
process.env.CRAWLER_MONITOR_PORT = PORT;
process.env.CRAWLER_MONITOR_DEMO = '0'; // Disable demo mode for clean test

async function httpGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function checkSSE(path, duration = 1000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'GET',
      timeout: duration + 1000
    };

    const req = http.request(options, (res) => {
      const messages = [];
      
      res.on('data', chunk => {
        const str = chunk.toString();
        if (str.includes('data:')) {
          messages.push(str);
        }
      });

      setTimeout(() => {
        req.destroy();
        resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'],
          messageCount: messages.length
        });
      }, duration);
    });

    req.on('error', reject);
    req.end();
  });
}

async function runChecks() {
  console.log('🕷️  Crawler Monitor Dashboard Check\n');
  console.log('═'.repeat(50));

  // Import and start server
  console.log('\n📦 Starting server...');
  const { startServer, initComponents } = require('../src/ui/server/crawlerMonitor/server');
  
  let server;
  try {
    server = await startServer();
    console.log(`   ✅ Server started on port ${PORT}`);
  } catch (err) {
    console.error(`   ❌ Failed to start server: ${err.message}`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`   ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`   ❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  try {
    console.log('\n📋 Checking endpoints...\n');

    // Dashboard HTML
    await check('GET / returns HTML dashboard', async () => {
      const res = await httpGet('/');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!res.body.includes('Crawler Monitor')) throw new Error('Missing title');
      if (!res.body.includes('Workers')) throw new Error('Missing workers section');
    });

    // API: metrics
    await check('GET /api/metrics returns JSON', async () => {
      const res = await httpGet('/api/metrics');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = JSON.parse(res.body);
      if (typeof data.timestamp !== 'number') throw new Error('Missing timestamp');
      if (!data.workers) throw new Error('Missing workers');
      if (!data.queue) throw new Error('Missing queue');
      if (!data.throughput) throw new Error('Missing throughput');
    });

    // API: workers
    await check('GET /api/workers returns array', async () => {
      const res = await httpGet('/api/workers');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = JSON.parse(res.body);
      if (!Array.isArray(data)) throw new Error('Expected array');
    });

    // API: queue
    await check('GET /api/queue returns stats', async () => {
      const res = await httpGet('/api/queue');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = JSON.parse(res.body);
      if (typeof data.pending !== 'number') throw new Error('Missing pending');
    });

    // API: errors
    await check('GET /api/errors returns array', async () => {
      const res = await httpGet('/api/errors');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = JSON.parse(res.body);
      if (!Array.isArray(data)) throw new Error('Expected array');
    });

    // API: locks
    await check('GET /api/locks returns array', async () => {
      const res = await httpGet('/api/locks');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = JSON.parse(res.body);
      if (!Array.isArray(data)) throw new Error('Expected array');
    });

    // API: domains
    await check('GET /api/domains returns array', async () => {
      const res = await httpGet('/api/domains');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = JSON.parse(res.body);
      if (!Array.isArray(data)) throw new Error('Expected array');
    });

    // API: history
    await check('GET /api/history returns array', async () => {
      const res = await httpGet('/api/history');
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = JSON.parse(res.body);
      if (!Array.isArray(data)) throw new Error('Expected array');
    });

    // SSE endpoint
    await check('GET /api/metrics/stream returns SSE', async () => {
      const res = await checkSSE('/api/metrics/stream', 1500);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!res.contentType.includes('text/event-stream')) {
        throw new Error(`Wrong content-type: ${res.contentType}`);
      }
      if (res.messageCount < 1) throw new Error('No SSE messages received');
    });

  } finally {
    // Cleanup
    console.log('\n📦 Shutting down...');
    server.close();
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runChecks().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
