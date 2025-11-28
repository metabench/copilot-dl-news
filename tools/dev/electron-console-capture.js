#!/usr/bin/env node
/**
 * Electron Console Capture Tool
 * 
 * Launches an Electron app, captures console logs via DevTools Protocol,
 * and outputs them to the terminal for AI agent debugging.
 * 
 * Usage:
 *   node tools/dev/electron-console-capture.js --app=z-server [--timeout=5000]
 * 
 * Options:
 *   --app=<name>      Name of the Electron app directory (e.g., z-server)
 *   --timeout=<ms>    How long to wait for logs (default: 5000ms)
 *   --build           Run npm build before starting
 *   --json            Output logs as JSON array
 */

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const args = process.argv.slice(2);
const appArg = args.find(a => a.startsWith('--app='));
const timeoutArg = args.find(a => a.startsWith('--timeout='));
const shouldBuild = args.includes('--build');
const jsonOutput = args.includes('--json');

const appName = appArg ? appArg.split('=')[1] : 'z-server';
const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : 5000;

const repoRoot = path.join(__dirname, '..', '..');
const appDir = path.join(repoRoot, appName);

// Find an available port for remote debugging
async function findFreePort(start = 9222) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(start, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      findFreePort(start + 1).then(resolve).catch(reject);
    });
  });
}

async function run() {
  const logs = [];
  
  if (shouldBuild) {
    console.log(`[Tool] Building ${appName}...`);
    await new Promise((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], {
        cwd: appDir,
        shell: true,
        stdio: 'inherit'
      });
      build.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Build failed with code ${code}`));
      });
    });
    console.log(`[Tool] Build complete.`);
  }

  const debugPort = await findFreePort(9222);
  console.log(`[Tool] Using debug port: ${debugPort}`);
  
  console.log(`[Tool] Starting Electron app: ${appName}`);
  
  // Start Electron with remote debugging enabled
  const electronProcess = spawn('npx', ['electron', '.', `--remote-debugging-port=${debugPort}`], {
    cwd: appDir,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1'
    }
  });

  // Capture Electron's own stdout/stderr
  electronProcess.stdout.on('data', d => {
    const text = d.toString().trim();
    if (text) {
      logs.push({ type: 'electron-stdout', text, timestamp: Date.now() });
      if (!jsonOutput) console.log(`[Electron]: ${text}`);
    }
  });
  
  electronProcess.stderr.on('data', d => {
    const text = d.toString().trim();
    if (text) {
      logs.push({ type: 'electron-stderr', text, timestamp: Date.now() });
      if (!jsonOutput) console.log(`[Electron Err]: ${text}`);
    }
  });

  // Wait for Electron to start
  console.log(`[Tool] Waiting for Electron to initialize...`);
  await new Promise(r => setTimeout(r, 3000));

  // Try to connect via Puppeteer to the Electron app
  let browser;
  let page;
  try {
    const puppeteer = require('puppeteer');
    
    // Get the WebSocket debugger URL
    const http = require('http');
    const debuggerUrl = await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${debugPort}/json/version`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const info = JSON.parse(data);
            resolve(info.webSocketDebuggerUrl);
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout connecting to debugger'));
      });
    });

    console.log(`[Tool] Connecting to debugger: ${debuggerUrl}`);
    browser = await puppeteer.connect({ browserWSEndpoint: debuggerUrl });
    
    // Get all pages/targets
    const pages = await browser.pages();
    console.log(`[Tool] Found ${pages.length} page(s)`);
    
    if (pages.length > 0) {
      page = pages[0];
      
      // Capture console messages
      page.on('console', msg => {
        const entry = {
          type: `console-${msg.type()}`,
          text: msg.text(),
          timestamp: Date.now()
        };
        logs.push(entry);
        if (!jsonOutput) {
          const prefix = msg.type() === 'error' ? '❌' : msg.type() === 'warning' ? '⚠️' : '📝';
          console.log(`${prefix} [Console ${msg.type()}]: ${msg.text()}`);
        }
      });

      page.on('pageerror', err => {
        const entry = { type: 'page-error', text: err.message, timestamp: Date.now() };
        logs.push(entry);
        if (!jsonOutput) console.log(`❌ [Page Error]: ${err.message}`);
      });

      // Wait for specified timeout to collect logs
      console.log(`[Tool] Collecting logs for ${timeout}ms...`);
      await new Promise(r => setTimeout(r, timeout));
    }
  } catch (e) {
    console.error(`[Tool] Puppeteer connection failed: ${e.message}`);
    logs.push({ type: 'tool-error', text: `Puppeteer connection failed: ${e.message}`, timestamp: Date.now() });
  }

  // Cleanup
  console.log(`[Tool] Cleaning up...`);
  
  if (browser) {
    try {
      await browser.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }

  // Kill Electron
  electronProcess.kill('SIGTERM');
  
  // Wait a moment for cleanup
  await new Promise(r => setTimeout(r, 500));

  // Output results
  if (jsonOutput) {
    console.log(JSON.stringify(logs, null, 2));
  } else {
    console.log('\n--- Summary ---');
    console.log(`Total log entries: ${logs.length}`);
    const errors = logs.filter(l => l.type.includes('error'));
    if (errors.length > 0) {
      console.log(`Errors found: ${errors.length}`);
      errors.forEach(e => console.log(`  - ${e.text}`));
    }
  }

  process.exit(0);
}

run().catch(e => {
  console.error(`[Tool] Fatal error: ${e.message}`);
  process.exit(1);
});
