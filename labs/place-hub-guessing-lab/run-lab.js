#!/usr/bin/env node
/**
 * Place Hub Guessing Lab - CLI Entry Point
 * 
 * Usage:
 *   node labs/place-hub-guessing-lab/run-lab.js           # Browser mode
 *   node labs/place-hub-guessing-lab/run-lab.js --electron # Electron mode
 *   node labs/place-hub-guessing-lab/run-lab.js --verify   # Run tests only
 *   node labs/place-hub-guessing-lab/run-lab.js --headless # Verify and exit
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);

const useElectron = args.includes('--electron');
const verifyOnly = args.includes('--verify') || args.includes('--headless');
const verbose = args.includes('--verbose') || args.includes('-v');
const port = (() => {
  const idx = args.indexOf('--port');
  return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 3120;
})();

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 Place Hub Guessing Lab');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log(`  Mode: ${useElectron ? 'Electron' : 'Browser'}`);
console.log(`  Port: ${port}`);
console.log(`  Verbose: ${verbose}`);
console.log(`  Verify only: ${verifyOnly}`);
console.log('');

if (useElectron) {
  // Launch via Electron
  const electronPath = require('electron');
  const mainPath = path.join(__dirname, 'electron-main.js');
  
  const electronArgs = [mainPath, '--port', String(port)];
  if (verbose) electronArgs.push('--verbose');
  if (verifyOnly) electronArgs.push('--verify');

  console.log(`[run-lab] Launching Electron: ${electronPath} ${electronArgs.join(' ')}`);
  console.log('');

  const child = spawn(electronPath, electronArgs, {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

} else if (verifyOnly) {
  // Run verification tests without UI
  const { createLabServer } = require('./lab-server');
  const http = require('http');

  (async () => {
    const server = createLabServer({ port, verbose });
    const { url } = await server.start();

    console.log(`[run-lab] Server started at ${url}`);
    console.log('[run-lab] Running verification tests...');
    console.log('');

    http.get(`${url}/api/verify-tests`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const result = JSON.parse(data);

          console.log('═══════════════════════════════════════════════════════════════');
          console.log('Verification Results');
          console.log('═══════════════════════════════════════════════════════════════');
          console.log('');

          for (const test of result.tests) {
            const icon = test.passed ? '✅' : '❌';
            console.log(`${icon} ${test.name}`);
            console.log(`   ${test.details}`);
          }

          console.log('');
          console.log('Matrix Stats:');
          console.log(`  Verified: ${result.stats.verifiedCount} (${result.stats.verifiedPresentCount} present, ${result.stats.verifiedAbsentCount} absent)`);
          console.log(`  Guessed: ${result.stats.guessedCount}`);
          console.log(`  Pending: ${result.stats.pendingCount}`);
          console.log(`  Unchecked: ${result.stats.uncheckedCount}`);
          console.log('');
          console.log(result.allPassed ? '✅ All tests passed' : '❌ Some tests failed');

          await server.stop();
          process.exit(result.allPassed ? 0 : 1);
        } catch (err) {
          console.error('Failed to parse results:', err);
          await server.stop();
          process.exit(2);
        }
      });
    }).on('error', async (err) => {
      console.error('Failed to run tests:', err);
      await server.stop();
      process.exit(2);
    });
  })();

} else {
  // Browser mode - just start server
  const { createLabServer } = require('./lab-server');

  const server = createLabServer({ port, verbose });
  
  server.start().then(({ url }) => {
    console.log(`[run-lab] Lab running at ${url}`);
    console.log('');
    console.log('Open in browser to view the matrix with event logging.');
    console.log('Press Ctrl+C to stop.');
    console.log('');

    // Open browser automatically
    const opener = process.platform === 'win32' ? 'start' : 
                   process.platform === 'darwin' ? 'open' : 'xdg-open';
    
    const { exec } = require('child_process');
    exec(`${opener} ${url}`, (err) => {
      if (err && verbose) {
        console.log('[run-lab] Could not open browser automatically');
      }
    });
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n[run-lab] Shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}
