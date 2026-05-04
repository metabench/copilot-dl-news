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
const { getTimeoutItems } = require('./analysis-version');
const ProcessStatus = require('../../src/utils/processStatus');

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
  analysisVersion: getArg('--analysis-version') ? parseInt(getArg('--analysis-version'), 10) : null,
  timeout: getArg('--timeout') ? parseInt(getArg('--timeout'), 10) : 5000,
  logSpeed: hasArg('--log-speed'),
  forceNewVersion: hasArg('--new') || hasArg('--force-new'),
  listTimeouts: hasArg('--list-timeouts'),
  daemon: hasArg('--daemon')
};

const statusWriter = new ProcessStatus('analysis-daemon', 'Analysis Daemon');

function createSubscribers() {
  return {
    onNext: (msg) => {
      if (msg.value) {
        const s = msg.value;
        const percent = s.total > 0 ? ((s.processed / s.total) * 100).toFixed(1) : '0.0';
        const avgItemStr = s.avgItemMs ? `avg ${(s.avgItemMs / 1000).toFixed(1)}s/item` : '';
        const lastItemStr = s.lastItemMs ? `last ${(s.lastItemMs / 1000).toFixed(1)}s` : '';
        const timingInfo = [avgItemStr, lastItemStr].filter(Boolean).join(', ');

        // Update tray status
        statusWriter.update({
          status: 'running',
          progress: {
            current: s.processed,
            total: s.total,
            percent: s.total > 0 ? s.processed / s.total : 0,
            unit: 'records'
          },
          message: `${s.processed}/${s.total} (${percent}%) - ${s.recordsPerSecond?.toFixed(1) || 0} rec/s`,
          metrics: {
            speed: `${s.recordsPerSecond?.toFixed(1) || 0} rec/s`,
            eta: formatDuration(s.etaMs)
          }
        });

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
    onComplete: (msg) => {
      statusWriter.complete('Analysis Complete');
      console.log('\n=== Analysis Complete ===');
      console.log(JSON.stringify(msg.value, null, 2));
    },
    onError: (msg) => {
      statusWriter.error(msg.error);
      console.error('\n=== Analysis Error ===');
      console.error(msg.error);
    }
  };
}

async function runListTimeouts() {
  console.log('=== Analysis Timeouts ===\n');
  const items = getTimeoutItems(null, options.limit || 50);
  
  if (items.length === 0) {
    console.log('No timeouts found.');
    return;
  }

  console.log(`Found ${items.length} timeouts (limit: ${options.limit || 50}):\n`);
  console.log('ID     | Version | Duration | Analyzed At         | URL');
  console.log('-------|---------|----------|---------------------|----------------------------------------');
  
  for (const item of items) {
    const duration = item.duration_ms ? `${Math.round(item.duration_ms)}ms` : '???';
    const url = item.url.length > 80 ? item.url.substring(0, 77) + '...' : item.url;
    console.log(
      `${String(item.id).padEnd(6)} | ` +
      `${String(item.analysis_version).padEnd(7)} | ` +
      `${duration.padEnd(8)} | ` +
      `${item.analyzed_at.padEnd(19)} | ` +
      `${url}`
    );
  }
  console.log();
}

async function runHeadless() {
  console.log('=== Analysis Observable Lab (Headless) ===\n');
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log();

  const subscribers = createSubscribers();

  const observable = createAnalysisObservable({
    limit: options.limit,
    verbose: options.verbose,
    dryRun: options.dryRun,
    analysisVersion: options.analysisVersion, // Note: server resolves this, but observable takes it raw. 
    // We need to resolve it here if we want the same logic.
    // Actually, createAnalysisObservable takes analysisVersion.
    // Let's resolve it here too.
    timeout: options.timeout,
    logSpeed: options.logSpeed
  });
  
  // Wait, createAnalysisObservable doesn't resolve version logic, it just uses what's passed or defaults to 1.
  // We should use the same resolution logic as the server.
  const { getAnalysisVersionStats, resolveTargetVersion } = require('./analysis-version');
  const stats = getAnalysisVersionStats();
  const resolvedVersion = options.analysisVersion ?? resolveTargetVersion(stats, options.forceNewVersion);
  
  console.log(`Target Analysis Version: ${resolvedVersion} (Current Max: ${stats.maxVersion})`);
  
  // Re-create with resolved version
  const observableResolved = createAnalysisObservable({
    limit: options.limit,
    verbose: options.verbose,
    dryRun: options.dryRun,
    analysisVersion: resolvedVersion,
    timeout: options.timeout,
    logSpeed: options.logSpeed
  });

  // Subscribe to progress
  observableResolved.subscribe({
    next: subscribers.onNext,
    complete: subscribers.onComplete,
    error: subscribers.onError
  });

  console.log('Starting analysis...\n');
  await observableResolved.start();
}

async function runWithServer() {
  console.log('=== Analysis Observable Lab (Server) ===\n');
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log();

  const subscribers = options.daemon ? createSubscribers() : {};

  const server = createAnalysisServer({
    port: options.port,
    limit: options.limit,
    verbose: options.verbose,
    dryRun: options.dryRun,
    autoStart: options.autoStart,
    analysisVersion: options.analysisVersion,
    timeout: options.timeout,
    logSpeed: options.logSpeed,
    forceNewVersion: options.forceNewVersion,
    immediateStart: options.daemon, // Daemon mode starts immediately
    onNext: subscribers.onNext,
    onComplete: subscribers.onComplete,
    onError: subscribers.onError
  });

  const { url } = await server.start();
  console.log(`\nOpen ${url} in your browser to view progress\n`);

  if (options.autoStart && !options.daemon) {
    console.log('Analysis will start when browser connects');
  } else if (options.daemon) {
    console.log('Analysis started in daemon mode');
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
  console.log('Launching Electron app...\n');

  // Build args for electron
  const electronArgs = [
    path.join(__dirname, 'electron-main.js'),
    '--port', String(options.port)
  ];

  if (options.limit) {
    electronArgs.push('--limit', String(options.limit));
  }
  if (options.verbose) {
    electronArgs.push('--verbose');
  }
  if (options.dryRun) {
    electronArgs.push('--dry-run');
  }
  if (!options.autoStart) {
    electronArgs.push('--no-auto-start');
  }
  if (options.analysisVersion) {
    electronArgs.push('--analysis-version', String(options.analysisVersion));
  }
  if (options.timeout) {
    electronArgs.push('--timeout', String(options.timeout));
  }
  if (options.logSpeed) {
    electronArgs.push('--log-speed');
  }
  if (options.forceNewVersion) {
    electronArgs.push('--new');
  }

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
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code || 0);
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
  --new                    Force a new analysis version iteration
  --verbose, -v            Enable verbose logging
  --dry-run                Don't persist changes to database
  --electron               Run in Electron app
  --no-auto-start          Don't auto-start analysis on connection
  --headless               Run without UI (observable only)
  --list-timeouts          List items that timed out
  --help, -h               Show this help

Examples:
  # Run with browser UI, analyze 5 pages
  node labs/analysis-observable/run-lab.js --limit 5

  # Continue current version (smart default)
  node labs/analysis-observable/run-lab.js --limit 100

  # Force new version iteration
  node labs/analysis-observable/run-lab.js --limit 100 --new

  # List timeouts
  node labs/analysis-observable/run-lab.js --list-timeouts
`);
    process.exit(0);
  }

  try {
    if (options.listTimeouts) {
      await runListTimeouts();
    } else if (options.headless) {
      await runHeadless();
    } else if (options.electron) {
      await runWithElectron();
    } else {
      // Default to server mode (which supports daemon mode via options.daemon)
      await runWithServer();
    }
  } catch (err) {
    console.error('Lab failed:', err);
    process.exit(1);
  }
}

main();
