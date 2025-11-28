const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const urlArg = args.find(a => a.startsWith('--url='));
const serverArg = args.find(a => a.startsWith('--server='));
const timeoutArg = args.find(a => a.startsWith('--timeout='));

const url = urlArg ? urlArg.split('=').slice(1).join('=') : 'http://localhost:3000';
const serverPath = serverArg ? serverArg.split('=').slice(1).join('=') : null;
const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : 2000;

async function run() {
  let serverProcess;

  if (serverPath) {
    console.log(`Starting server: ${serverPath}`);
    serverProcess = spawn('node', [serverPath], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });
    
    serverProcess.stdout.on('data', d => process.stdout.write(`[Server]: ${d}`));
    serverProcess.stderr.on('data', d => process.stderr.write(`[Server Err]: ${d}`));

    // Wait for server to be ready (naive wait)
    console.log("Waiting for server to start...");
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`Launching Puppeteer for ${url}...`);
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => {
    logs.push({
      type: msg.type(),
      text: msg.text(),
      // location: msg.location() // location is often circular or complex, simplify if needed
    });
  });

  page.on('pageerror', err => {
      logs.push({
          type: 'error',
          text: `Page Crash: ${err.message}`
      });
  });

  page.on('requestfailed', request => {
    logs.push({
      type: 'network-error',
      text: `${request.failure() ? request.failure().errorText : 'Unknown'} ${request.url()}`
    });
  });

  page.on('response', response => {
    if (!response.ok()) {
      logs.push({
        type: 'network-error',
        text: `Status ${response.status()} ${response.url()}`
      });
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log("Page loaded, waiting for logs...");
    await new Promise(r => setTimeout(r, timeout));
  } catch (e) {
    console.error("Navigation failed:", e.message);
  }

  console.log("--- Browser Console Logs ---");
  console.log(JSON.stringify(logs, null, 2));

  await browser.close();

  if (serverProcess) {
    console.log("Killing server...");
    serverProcess.kill();
  }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
