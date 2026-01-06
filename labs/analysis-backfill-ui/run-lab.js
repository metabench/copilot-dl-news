/**
 * Run Lab - CLI entry point for analysis observable lab
 * 
 * Usage:
 *   node labs/analysis-observable/run-lab.js [options]
 * 
 * Options:
 *   --limit <n>      Limit number of pages to analyze
 *   --port <n>       Server port (default: 3099)
 *   --verbose        Enable verbose logging
 *   --dry-run        Don't persist changes to database
 *   --electron       Run in Electron app (instead of browser)
 *   --no-auto-start  Don't auto-start analysis on connection
 *   --headless       Run without UI (observable only)
 */
'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');
const { createAnalysisServer } = require('./analysis-server');
const { createAnalysisObservable } = require('./analysis-observable');

// Parse command line args
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
  port: parseInt(getArg('--port', '3099'), 10),
  verbose: hasArg('--verbose') || hasArg('-v'),
  dryRun: hasArg('--dry-run'),
  electron: hasArg('--electron'),
  autoStart: !hasArg('--no-auto-start'),
  headless: hasArg('--headless'),
  analysisVersion: getArg('--analysis-version') ? parseInt(getArg('--analysis-version'), 10) : null
};

async function runHeadless() {
  console.log('=== Analysis Observable Lab (Headless) ===\n');
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log();

  const observable = createAnalysisObservable({
    limit: options.limit,
    verbose: options.verbose,
    dryRun: options.dryRun,
    analysisVersion: options.analysisVersion
  });

  // Subscribe to progress
  observable.subscribe({
    next: (msg) => {
      if (msg.value) {
        const s = msg.value;
        const percent = s.total > 0 ? ((s.processed / s.total) * 100).toFixed(1) : '0.0';
        const avgItemStr = s.avgItemMs ? `avg ${(s.avgItemMs / 1000).toFixed(1)}s/item` : '';
        const lastItemStr = s.lastItemMs ? `last ${(s.lastItemMs / 1000).toFixed(1)}s` : '';
        const timingInfo = [avgItemStr, lastItemStr].filter(Boolean).join(', ');

        console.log(
          `[${s.phase}] ${s.processed}/${s.total} (${percent}%) | ` +
          `${s.recordsPerSecond?.toFixed(1) || 0} rec/s | ` +
          `${formatBytes(s.bytesProcessed)} | ` +
          `ETA: ${formatDuration(s.etaMs)}` +
          (timingInfo ? ` | ${timingInfo}` : '')
        );

        // Show warnings if any
        if (s.warnings && s.warnings.length > 0) {
          for (const warn of s.warnings) {
            console.log(`  ⚠️  ${warn.message}`);
          }
        }
      }
    },
    complete: (msg) => {
      console.log('\n=== Analysis Complete ===');
      console.log(JSON.stringify(msg.value, null, 2));
    },
    error: (msg) => {
      console.error('\n=== Analysis Error ===');
      console.error(msg.error);
    }
  });

  console.log('Starting analysis...\n');
  await observable.start();
}

async function runWithServer() {
  console.log('=== Analysis Observable Lab (Server) ===\n');
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log();

  const server = createAnalysisServer({
    port: options.port,
    limit: options.limit,
    verbose: options.verbose,
    dryRun: options.dryRun,
    autoStart: options.autoStart,
    analysisVersion: options.analysisVersion
  });

  const { url } = await server.start();
  console.log(`\nOpen ${url} in your browser to view progress\n`);

  if (options.autoStart) {
    console.log('Analysis will start when browser connects');
  } else {
    console.log('Click "Start Analysis" in the UI to begin');
  }

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

async function runWithElectron() {
  console.log('=== Analysis Observable Lab (Electron) ===\n');
  
  // Start server first in this process (Node v25) to avoid Electron/Node version issues
  console.log('Starting analysis server...');
  const server = createAnalysisServer({
    port: options.port,
    limit: options.limit,
    verbose: options.verbose,
    dryRun: options.dryRun,
    autoStart: options.autoStart,
    analysisVersion: options.analysisVersion
  });

  const { url } = await server.start();
  console.log(`Server running at ${url}`);

  console.log('Launching Electron app...\n');

  // Build args for electron
  const electronArgs = [
    path.join(__dirname, 'electron-main.js'),
    '--url', url
  ];

  // Find electron executable - use the electron module's exported path
  const electron = require('electron');
  const electronBin = typeof electron === 'string' ? electron : electron.toString();

  const child = spawn(electronBin, electronArgs, {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  child.on('error', (err) => {
    console.error('Failed to start Electron:', err.message);
    console.log('\nTry running in browser mode: node labs/analysis-observable/run-lab.js');
    server.stop().then(() => process.exit(1));
  });

  child.on('close', async (code) => {
    console.log('Electron app closed. Stopping server...');
    await server.stop();
    process.exit(code || 0);
  });

  // Handle process signals to kill both
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    child.kill();
    await server.stop();
    process.exit(0);
  });
}

// Helpers
function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return '--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

// Main
async function main() {
  if (hasArg('--help') || hasArg('-h')) {
    console.log(`
Analysis Observable Lab

Usage:
  node labs/analysis-observable/run-lab.js [options]

Options:
  --limit <n>              Limit number of pages to analyze
  --port <n>               Server port (default: 3099)
  --analysis-version <n>   Target analysis version (pages with lower version will be analyzed)
  --timeout <ms>           Timeout per page in ms (default: 5000)
  --log-speed              Log analysis duration for each page
  --verbose, -v            Enable verbose logging
  --dry-run                Don't persist changes to database
  --electron               Run in Electron app
  --no-auto-start          Don't auto-start analysis on connection
  --headless               Run without UI (observable only)
  --help, -h               Show this help

Examples:
  # Run with browser UI, analyze 5 pages
  node labs/analysis-observable/run-lab.js --limit 5

  # Re-analyze pages with version < 1021
  node labs/analysis-observable/run-lab.js --limit 100 --analysis-version 1021

  # Run with Electron UI
  node labs/analysis-observable/run-lab.js --limit 10 --electron

  # Headless mode (CLI output only)
  node labs/analysis-observable/run-lab.js --limit 5 --headless
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
