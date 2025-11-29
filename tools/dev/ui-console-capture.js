/**
 * UI Console Capture Tool
 * 
 * Captures browser console output via Puppeteer for debugging UI servers.
 * Can optionally start a server, wait for it to be ready, then capture logs.
 * 
 * Usage:
 *   node tools/dev/ui-console-capture.js --url=http://localhost:4800
 *   node tools/dev/ui-console-capture.js --server=src/ui/server/designStudio/server.js --url=http://localhost:4800
 *   node tools/dev/ui-console-capture.js --url=http://localhost:4800 --timeout=5000 --errors-only
 *   node tools/dev/ui-console-capture.js --url=http://localhost:4800 --wait-for-idle
 * 
 * Options:
 *   --url=<url>       URL to visit (default: http://localhost:3000)
 *   --server=<path>   Start this server script before visiting URL
 *   --timeout=<ms>    Wait time after load (default: 2000)
 *   --errors-only     Only show errors and warnings
 *   --wait-for-idle   Wait for network idle instead of fixed timeout
 *   --json            Output raw JSON (default is formatted)
 *   --screenshot=<path>  Save a screenshot to this path
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);

function getArg(prefix, defaultValue = null) {
  const arg = args.find(a => a.startsWith(prefix + '='));
  if (arg) return arg.split('=').slice(1).join('=');
  return defaultValue;
}

function hasFlag(flag) {
  return args.includes(flag) || args.includes('--' + flag);
}

const url = getArg('--url', 'http://localhost:3000');
const serverPath = getArg('--server');
const timeout = parseInt(getArg('--timeout', '2000'), 10);
const errorsOnly = hasFlag('--errors-only');
const waitForIdle = hasFlag('--wait-for-idle');
const jsonOutput = hasFlag('--json');
const screenshotPath = getArg('--screenshot');

/**
 * Wait for a URL to respond with 200
 */
async function waitForServer(targetUrl, maxWait = 30000) {
  const start = Date.now();
  const parsed = new URL(targetUrl);
  
  while (Date.now() - start < maxWait) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get({
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname,
          timeout: 2000
        }, res => {
          if (res.statusCode === 200 || res.statusCode === 304) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

/**
 * Format a log entry for human display
 */
function formatLog(log) {
  const icons = {
    'error': '❌',
    'warning': '⚠️',
    'log': '📝',
    'info': 'ℹ️',
    'debug': '🔍',
    'network-error': '🌐',
    'page-error': '💥'
  };
  const icon = icons[log.type] || '•';
  const location = log.location ? ` (${log.location})` : '';
  return `${icon} [${log.type.toUpperCase()}] ${log.text}${location}`;
}

async function run() {
  let serverProcess;
  const logs = [];

  try {
    // Start server if specified
    if (serverPath) {
      console.error(`Starting server: ${serverPath}`);
      serverProcess = spawn('node', [serverPath], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      
      serverProcess.stdout.on('data', d => {
        if (!jsonOutput) process.stderr.write(`[Server] ${d}`);
      });
      serverProcess.stderr.on('data', d => {
        if (!jsonOutput) process.stderr.write(`[Server] ${d}`);
      });

      // Wait for server to be ready
      if (!jsonOutput) console.error("Waiting for server to be ready...");
      const ready = await waitForServer(url);
      if (!ready) {
        console.error("Server did not become ready in time");
        if (serverProcess) serverProcess.kill();
        process.exit(1);
      }
      if (!jsonOutput) console.error("Server ready!");
    }

    if (!jsonOutput) console.error(`Launching Puppeteer for ${url}...`);
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Capture console messages
    page.on('console', msg => {
      const type = msg.type();
      const loc = msg.location();
      logs.push({
        type,
        text: msg.text(),
        location: loc && loc.url ? `${loc.url}:${loc.lineNumber}` : null
      });
    });

    // Capture uncaught page errors
    page.on('pageerror', err => {
      logs.push({
        type: 'page-error',
        text: err.message,
        stack: err.stack
      });
    });

    // Capture failed network requests
    page.on('requestfailed', request => {
      const failure = request.failure();
      logs.push({
        type: 'network-error',
        text: `Request failed: ${failure ? failure.errorText : 'Unknown'}`,
        url: request.url()
      });
    });

    // Capture non-OK HTTP responses
    page.on('response', response => {
      if (!response.ok() && response.status() !== 304) {
        logs.push({
          type: 'network-error',
          text: `HTTP ${response.status()}`,
          url: response.url()
        });
      }
    });

    try {
      const waitUntil = waitForIdle ? 'networkidle0' : 'domcontentloaded';
      await page.goto(url, { waitUntil, timeout: 30000 });
      if (!jsonOutput) console.error("Page loaded, collecting logs...");
      
      // Additional wait for async JS to run
      await new Promise(r => setTimeout(r, timeout));
    } catch (e) {
      logs.push({
        type: 'page-error',
        text: `Navigation failed: ${e.message}`
      });
    }

    // Take screenshot if requested
    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      if (!jsonOutput) console.error(`Screenshot saved to ${screenshotPath}`);
    }

    await browser.close();

    // Filter logs if errors-only
    let outputLogs = errorsOnly 
      ? logs.filter(l => ['error', 'warning', 'page-error', 'network-error'].includes(l.type))
      : logs;

    // Output results
    if (jsonOutput) {
      console.log(JSON.stringify({
        url,
        timestamp: new Date().toISOString(),
        totalLogs: logs.length,
        filteredLogs: outputLogs.length,
        hasErrors: logs.some(l => ['error', 'page-error'].includes(l.type)),
        logs: outputLogs
      }, null, 2));
    } else {
      console.log("\n╔════════════════════════════════════════════════════════════╗");
      console.log("║               BROWSER CONSOLE CAPTURE                      ║");
      console.log("╠════════════════════════════════════════════════════════════╣");
      console.log(`║ URL: ${url}`);
      console.log(`║ Total logs: ${logs.length}`);
      console.log(`║ Errors: ${logs.filter(l => ['error', 'page-error'].includes(l.type)).length}`);
      console.log(`║ Warnings: ${logs.filter(l => l.type === 'warning').length}`);
      console.log("╚════════════════════════════════════════════════════════════╝\n");
      
      if (outputLogs.length === 0) {
        console.log("✅ No console messages captured.");
      } else {
        for (const log of outputLogs) {
          console.log(formatLog(log));
        }
      }
    }

    // Exit with error code if there were errors
    const hasErrors = logs.some(l => ['error', 'page-error'].includes(l.type));
    if (hasErrors) {
      process.exitCode = 1;
    }

  } finally {
    if (serverProcess) {
      if (!jsonOutput) console.error("\nStopping server...");
      serverProcess.kill();
    }
  }
}

run().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
