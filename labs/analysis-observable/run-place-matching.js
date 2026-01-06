/**
 * Run Place Matching Lab - CLI entry point
 * 
 * Usage:
 *   node labs/analysis-observable/run-place-matching.js [options]
 * 
 * Options:
 *   --limit <n>      Limit number of articles to process
 *   --port <n>       Server port (default: 3098)
 *   --rule-level <n> Matching rule level (1-4)
 *   --electron       Run in Electron app
 *   --no-auto-start  Don't auto-start on connection
 *   --headless       Run without UI (observable only)
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { createPlaceMatchingServer } = require('./place-matching-server');
const { createPlaceMatchingObservable } = require('./place-matching-observable');

const args = process.argv.slice(2);

function getArg(name, defaultValue = null) {
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

function hasArg(name) {
  return args.includes(name);
}

const options = {
  limit: getArg('--limit') ? parseInt(getArg('--limit'), 10) : null,
  port: parseInt(getArg('--port', '3098'), 10),
  electron: hasArg('--electron'),
  autoStart: !hasArg('--no-auto-start'),
  headless: hasArg('--headless'),
  ruleLevel: getArg('--rule-level') ? parseInt(getArg('--rule-level'), 10) : 1
};

async function runHeadless() {
  console.log('=== Place Matching Lab (Headless) ===\n');
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log();

  const observable = createPlaceMatchingObservable({
    limit: options.limit,
    ruleLevel: options.ruleLevel
  });

  observable.subscribe({
    next: (msg) => {
      if (msg.value) {
        const s = msg.value;
        const percent = s.total > 0 ? ((s.processed / s.total) * 100).toFixed(1) : '0.0';
        
        console.log(
          `[${s.phase}] ${s.processed}/${s.total} (${percent}%) | ` +
          `${s.recordsPerSecond?.toFixed(1) || 0} rec/s | ` +
          `Matched: ${s.matched} | ` +
          `ETA: ${s.etaMs ? Math.round(s.etaMs/1000) + 's' : '--'}`
        );
      }
    },
    complete: (msg) => {
      console.log('\n=== Matching Complete ===');
      console.log(JSON.stringify(msg.value, null, 2));
    },
    error: (msg) => {
      console.error('\n=== Matching Error ===');
      console.error(msg.error);
    }
  });

  console.log('Starting matching...\n');
  await observable.start();
}

async function runWithServer() {
  console.log('=== Place Matching Lab (Server) ===\n');
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log();

  const server = createPlaceMatchingServer({
    port: options.port,
    limit: options.limit,
    autoStart: options.autoStart,
    ruleLevel: options.ruleLevel
  });

  const { url } = await server.start();
  console.log(`\nOpen ${url} in your browser to view progress\n`);

  if (options.autoStart) {
    console.log('Matching will start when browser connects');
  } else {
    console.log('Click "Start Matching" in the UI to begin');
  }

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  });
}

async function runWithElectron() {
  console.log('=== Place Matching Lab (Electron) ===\n');
  console.log('Launching Electron app...\n');

  const electronArgs = [
    path.join(__dirname, 'electron-place-matching.js'),
    '--port', String(options.port)
  ];

  if (options.limit) electronArgs.push('--limit', String(options.limit));
  if (!options.autoStart) electronArgs.push('--no-auto-start');
  if (options.ruleLevel) electronArgs.push('--rule-level', String(options.ruleLevel));

  const electron = require('electron');
  const electronBin = typeof electron === 'string' ? electron : electron.toString();

  const child = spawn(electronBin, electronArgs, {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

async function main() {
  if (hasArg('--help') || hasArg('-h')) {
    console.log(`
Place Matching Lab

Usage:
  node labs/analysis-observable/run-place-matching.js [options]

Options:
  --limit <n>      Limit number of articles
  --port <n>       Server port (default: 3098)
  --rule-level <n> Matching rule level (1-4)
  --electron       Run in Electron app
  --no-auto-start  Don't auto-start
  --headless       Run without UI
`);
    process.exit(0);
  }

  try {
    if (options.headless) {
      await runHeadless();
    } else if (options.electron) {
      await runWithElectron();
    } else {
      await runWithServer();
    }
  } catch (err) {
    console.error('Lab failed:', err);
    process.exit(1);
  }
}

main();
