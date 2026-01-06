'use strict';

/**
 * Test harness for the crawler Electron app.
 * Runs the app with a timeout and captures all output/errors.
 */

const { spawn } = require('child_process');
const path = require('path');

const TIMEOUT_MS = parseInt(process.argv[2], 10) || 20000;
const CRAWLER_APP_DIR = __dirname;

console.log(`\n🧪 Crawler App Test Harness`);
console.log(`   Timeout: ${TIMEOUT_MS}ms`);
console.log(`   Dir: ${CRAWLER_APP_DIR}\n`);

// First test the server standalone
async function testServer() {
  console.log('--- Testing crawl-server.js standalone ---\n');
  
  return new Promise((resolve) => {
    const serverProc = spawn('node', [path.join(CRAWLER_APP_DIR, 'crawl-server.js')], {
      cwd: path.join(CRAWLER_APP_DIR, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CRAWL_API_PORT: '3099' }
    });

    let output = '';
    let errors = '';

    serverProc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('[server]', text.trim());
    });

    serverProc.stderr.on('data', (data) => {
      const text = data.toString();
      errors += text;
      console.error('[server error]', text.trim());
    });

    serverProc.on('error', (err) => {
      console.error('[server spawn error]', err);
    });

    // Wait 5 seconds to see if server starts
    setTimeout(() => {
      console.log('\n--- Server test complete, killing server ---\n');
      serverProc.kill();
      resolve({ output, errors });
    }, 5000);
  });
}

async function testElectronApp() {
  console.log('--- Testing Electron app ---\n');
  
  return new Promise((resolve) => {
    // Use npx to run electron
    const proc = spawn('npx', ['electron', '.'], {
      cwd: CRAWLER_APP_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let output = '';
    let errors = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('[electron]', text.trim());
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      errors += text;
      // Filter out Electron security warnings
      if (!text.includes('Electron Security Warning')) {
        console.error('[electron error]', text.trim());
      }
    });

    proc.on('error', (err) => {
      console.error('[electron spawn error]', err);
    });

    proc.on('exit', (code) => {
      console.log(`\n[electron] Exited with code: ${code}`);
    });

    // Kill after timeout
    setTimeout(() => {
      console.log(`\n--- Timeout reached (${TIMEOUT_MS}ms), killing Electron ---\n`);
      proc.kill();
      
      setTimeout(() => {
        resolve({ output, errors });
      }, 1000);
    }, TIMEOUT_MS);
  });
}

async function main() {
  // First test the server
  const serverResult = await testServer();
  
  if (serverResult.errors && !serverResult.output.includes('running on')) {
    console.log('\n❌ Server failed to start. Aborting Electron test.\n');
    console.log('Server errors:', serverResult.errors);
    process.exit(1);
  }

  // Then test the full Electron app
  const electronResult = await testElectronApp();
  
  console.log('\n=== Test Summary ===\n');
  console.log('Server output length:', serverResult.output.length);
  console.log('Server errors length:', serverResult.errors.length);
  console.log('Electron output length:', electronResult.output.length);
  console.log('Electron errors length:', electronResult.errors.length);
  
  if (electronResult.errors && electronResult.errors.length > 0) {
    console.log('\nElectron errors:');
    console.log(electronResult.errors);
  }
  
  console.log('\n✅ Test complete\n');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
