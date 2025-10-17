/**
 * Lightweight HTTP benchmark for /api/queues endpoint
 * Tests just the API response time without browser overhead
 * 
 * Usage: node tools/benchmarks/benchmark-queues-api.js
 */

const http = require('http');
const { spawn } = require('child_process');

const SERVER_PORT = 3000;
const WARMUP_RUNS = 5;
const BENCHMARK_RUNS = 50; // More runs since HTTP is fast

async function startServer() {
  console.log('🚀 Starting server...');
  
  const serverProcess = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: SERVER_PORT,
      NODE_ENV: 'production',
      UI_FAST_START: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      serverProcess.kill();
      reject(new Error('Server startup timeout'));
    }, 10000);

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('listening on')) {
        clearTimeout(timeout);
        console.log('✅ Server ready\n');
        resolve(serverProcess);
      }
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const req = http.get({
      hostname: 'localhost',
      port: SERVER_PORT,
      path,
      timeout: 5000
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        
        let jsonLength = 0;
        try {
          const parsed = JSON.parse(data);
          jsonLength = parsed.queues ? parsed.queues.length : 0;
        } catch (e) {
          // Not JSON or parsing error
        }
        
        resolve({
          duration,
          status: res.statusCode,
          contentLength: data.length,
          itemCount: jsonLength
        });
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function runBenchmark() {
  let serverProcess = null;
  
  try {
    serverProcess = await startServer();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const endpoints = [
      { name: 'API Endpoint', path: '/api/queues' },
      { name: 'SSR Page', path: '/queues/ssr' }
    ];
    
    for (const endpoint of endpoints) {
      console.log('='.repeat(60));
      console.log(`Testing: ${endpoint.name}`);
      console.log(`Path: ${endpoint.path}`);
      console.log('='.repeat(60));
      
      // Warmup
      console.log(`\n🔥 Warmup (${WARMUP_RUNS} runs)...`);
      for (let i = 0; i < WARMUP_RUNS; i++) {
        await makeRequest(endpoint.path);
      }
      
      // Benchmark
      console.log(`\n📊 Benchmark (${BENCHMARK_RUNS} runs)...`);
      const timings = [];
      
      for (let i = 0; i < BENCHMARK_RUNS; i++) {
        const result = await makeRequest(endpoint.path);
        timings.push(result.duration);
        
        if (i === 0) {
          console.log(`   First run: ${result.duration}ms (${result.itemCount} items, ${result.contentLength} bytes)`);
        }
      }
      
      // Calculate statistics
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const sorted = [...timings].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const min = Math.min(...timings);
      const max = Math.max(...timings);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      
      console.log('\n' + '='.repeat(60));
      console.log('📈 RESULTS');
      console.log('='.repeat(60));
      console.log(`Average:     ${avg.toFixed(2)}ms`);
      console.log(`Median:      ${median}ms`);
      console.log(`Min:         ${min}ms`);
      console.log(`Max:         ${max}ms`);
      console.log(`P95:         ${p95}ms`);
      console.log(`P99:         ${p99}ms`);
      console.log('='.repeat(60));
      
      // Performance assessment
      console.log('\n💡 Performance Assessment:');
      if (avg < 10) {
        console.log('   ✅ EXCELLENT - Sub-10ms response time');
      } else if (avg < 50) {
        console.log('   ✅ VERY GOOD - Under 50ms response time');
      } else if (avg < 100) {
        console.log('   ✅ GOOD - Under 100ms response time');
      } else if (avg < 500) {
        console.log('   ⚠️  ACCEPTABLE - Under 500ms response time');
      } else {
        console.log('   ❌ SLOW - Over 500ms response time');
      }
      
      console.log('');
    }
    
    console.log('✅ Benchmark complete\n');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error.message);
    process.exit(1);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

runBenchmark().catch(console.error);
