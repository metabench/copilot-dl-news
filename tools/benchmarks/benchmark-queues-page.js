/**
 * Benchmark script for /queues page load performance
 * 
 * Measures:
 * - Initial page load time
 * - API response time for /api/queues
 * - DOM ready time
 * - Total time to interactive
 * 
 * Usage: node tools/benchmarks/benchmark-queues-page.js
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

// Configuration
const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const WARMUP_RUNS = 2; // Warm up browser/server
const BENCHMARK_RUNS = 5; // Actual measurements

async function startServer() {
  console.log('🚀 Starting server...');
  
  const serverProcess = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: SERVER_PORT,
      NODE_ENV: 'production',
      UI_FAST_START: '1' // Skip unnecessary startup tasks
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Wait for server to be ready
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      serverProcess.kill();
      reject(new Error('Server startup timeout'));
    }, 10000);

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('listening on')) {
        clearTimeout(timeout);
        console.log('✅ Server ready');
        resolve(serverProcess);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      // Ignore stderr during startup
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function measurePageLoad(browser, url, runNumber, isWarmup = false) {
  const page = await browser.newPage();
  
  // Track API requests and responses
  const apiRequests = [];
  
  page.on('request', (request) => {
    const reqUrl = request.url();
    if (reqUrl.includes('/api/queues') || reqUrl.includes('/queues')) {
      apiRequests.push({
        url: reqUrl,
        type: request.resourceType(),
        startTime: Date.now()
      });
    }
  });
  
  page.on('response', async (response) => {
    const resUrl = response.url();
    const matchingReq = apiRequests.find(r => r.url === resUrl && !r.endTime);
    if (matchingReq) {
      matchingReq.endTime = Date.now();
      matchingReq.duration = matchingReq.endTime - matchingReq.startTime;
      matchingReq.status = response.status();
    }
  });

  // Measure page load
  const startTime = Date.now();
  
  await page.goto(url, { 
    waitUntil: 'networkidle0', // Wait for network to be idle
    timeout: 30000 
  });
  
  const loadTime = Date.now() - startTime;
  
  // Wait for any final rendering
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const domReadyTime = await page.evaluate(() => {
    return window.performance.timing.domContentLoadedEventEnd - 
           window.performance.timing.navigationStart;
  });
  
  // Find API call timing
  const apiCall = apiRequests.find(r => r.url.includes('/api/queues') && r.type === 'fetch');
  const apiTime = apiCall ? apiCall.duration : 0;
  
  await page.close();
  
  if (!isWarmup) {
    console.log(`  Run ${runNumber}: Total=${loadTime}ms, DOM Ready=${domReadyTime}ms, API=${apiTime}ms`);
    if (apiCall) {
      console.log(`           API: ${apiCall.url.split('?')[0]} (${apiCall.status})`);
    }
  }
  
  return {
    totalLoadTime: loadTime,
    domReadyTime,
    apiTime,
    apiRequests
  };
}

function calculateStats(measurements) {
  const values = measurements.map(m => m.totalLoadTime);
  const apiValues = measurements.map(m => m.apiTime);
  
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const apiAvg = apiValues.reduce((a, b) => a + b, 0) / apiValues.length;
  
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  return {
    average: Math.round(avg),
    median: Math.round(median),
    min,
    max,
    apiAverage: Math.round(apiAvg)
  };
}

async function runBenchmark() {
  let serverProcess = null;
  let browser = null;
  
  try {
    // Start server
    serverProcess = await startServer();
    
    // Wait a bit for server to fully initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Launch browser
    console.log('🌐 Launching browser...');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Test both SSR and client-side rendered versions
    const testUrls = [
      { name: 'SSR Version (Optimized)', url: `${SERVER_URL}/queues/ssr` },
      { name: 'Client-Side Version', url: `${SERVER_URL}/queues` }
    ];
    
    for (const test of testUrls) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing: ${test.name}`);
      console.log(`URL: ${test.url}`);
      console.log('='.repeat(60));
      
      // Warmup runs
      console.log(`\n🔥 Warmup (${WARMUP_RUNS} runs)...`);
      for (let i = 0; i < WARMUP_RUNS; i++) {
        await measurePageLoad(browser, test.url, i + 1, true);
      }
      
      // Benchmark runs
      console.log(`\n📊 Benchmark (${BENCHMARK_RUNS} runs):`);
      const measurements = [];
      for (let i = 0; i < BENCHMARK_RUNS; i++) {
        const result = await measurePageLoad(browser, test.url, i + 1, false);
        measurements.push(result);
      }
      
      // Calculate and display statistics
      const stats = calculateStats(measurements);
      
      console.log('\n' + '='.repeat(60));
      console.log(`📈 RESULTS - ${test.name}`);
      console.log('='.repeat(60));
      console.log(`Average:     ${stats.average}ms`);
      console.log(`Median:      ${stats.median}ms`);
      console.log(`Min:         ${stats.min}ms`);
      console.log(`Max:         ${stats.max}ms`);
      console.log(`API Time:    ${stats.apiAverage}ms (avg)`);
      console.log('='.repeat(60));
      
      // Performance assessment
      console.log('\n💡 Performance Assessment:');
      if (stats.average < 100) {
        console.log('   ✅ EXCELLENT - Page loads very quickly (<100ms)');
      } else if (stats.average < 500) {
        console.log('   ✅ GOOD - Page loads quickly (<500ms)');
      } else if (stats.average < 1000) {
        console.log('   ⚠️  ACCEPTABLE - Page loads in under 1 second');
      } else if (stats.average < 3000) {
        console.log('   ⚠️  SLOW - Page takes 1-3 seconds to load');
      } else {
        console.log('   ❌ VERY SLOW - Page takes >3 seconds to load');
      }
    }
    
    console.log('\n✅ Benchmark complete\n');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    if (browser) {
      await browser.close();
    }
    if (serverProcess) {
      serverProcess.kill();
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// Run benchmark
runBenchmark().catch(console.error);
