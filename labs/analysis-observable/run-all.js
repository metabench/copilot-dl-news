#!/usr/bin/env node
/**
 * Run All Analysis - Simple launcher for agents
 *
 * Automatically detects the next analysis version and runs analysis on all records.
 *
 * Usage:
 *   node labs/analysis-observable/run-all.js [options]
 *
 * Options:
 *   --limit <n>       Limit number of pages (default: all)
 *   --electron        Run in Electron app (default)
 *   --browser         Run in browser instead of Electron
 *   --headless        Run without UI (CLI output only)
 *   --dry-run         Don't persist changes
 *   --version <n>     Override target version (default: auto-detect next)
 *   --info            Just show version info, don't run
 *
 * Examples:
 *   # Run all records to next version in Electron
 *   node labs/analysis-observable/run-all.js
 *
 *   # Run 1000 records in Electron
 *   node labs/analysis-observable/run-all.js --limit 1000
 *
 *   # Just show version info
 *   node labs/analysis-observable/run-all.js --info
 *
 *   # Run headless (for CI/scripts)
 *   node labs/analysis-observable/run-all.js --limit 100 --headless
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { getAnalysisVersionStats, getPendingCount, printVersionSummary } = require('./analysis-version');

// Parse command line args
const args = process.argv.slice(2);

function getArg(name, defaultValue = null) {
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return defaultValue;
}

function hasArg(name) {
  return args.includes(name);
}

async function main() {
  // Show help
  if (hasArg('--help') || hasArg('-h')) {
    console.log(`
Run All Analysis - Simple launcher for agents

Automatically detects the next analysis version and runs analysis on all records.

Usage:
  node labs/analysis-observable/run-all.js [options]

Options:
  --limit <n>       Limit number of pages (default: all)
  --electron        Run in Electron app (default)
  --browser         Run in browser instead of Electron
  --headless        Run without UI (CLI output only)
  --daemon          Run as background daemon (Server + Tray Status)
  --dry-run         Don't persist changes
  --version <n>     Override target version (default: auto-detect next)
  --info            Just show version info, don't run

Examples:
  # Run all records to next version in Electron
  node labs/analysis-observable/run-all.js

  # Run 1000 records in Electron
  node labs/analysis-observable/run-all.js --limit 1000

  # Just show version info
  node labs/analysis-observable/run-all.js --info

  # Run headless (for CI/scripts)
  node labs/analysis-observable/run-all.js --limit 100 --headless
`);
    process.exit(0);
  }

  // Get version stats
  console.log('Checking database...');
  const stats = getAnalysisVersionStats();
  printVersionSummary(stats);

  // Determine target version
  const overrideVersion = getArg('--version');
  const targetVersion = overrideVersion
    ? parseInt(overrideVersion, 10)
    : stats.nextVersion;

  // Get pending count
  const pendingCount = getPendingCount(targetVersion);
  console.log(`Target version: ${targetVersion}`);
  console.log(`Records to analyze: ${pendingCount.toLocaleString()}`);

  // Info only mode
  if (hasArg('--info')) {
    console.log('\n(Info only - use without --info to run analysis)');
    process.exit(0);
  }

  if (pendingCount === 0) {
    console.log('\nNo records need analysis. All records are up to date!');
    process.exit(0);
  }

  // Determine mode
  const limit = getArg('--limit');
  const useHeadless = hasArg('--headless');
  const useDaemon = hasArg('--daemon');
  const useBrowser = hasArg('--browser');
  const useElectron = !useHeadless && !useBrowser && !useDaemon; // Default to Electron
  const dryRun = hasArg('--dry-run');

  // Build command args for run-lab.js
  const labArgs = [
    path.join(__dirname, 'run-lab.js'),
    '--analysis-version', String(targetVersion)
  ];

  if (limit) {
    labArgs.push('--limit', limit);
  }

  if (useHeadless) {
    labArgs.push('--headless');
  } else if (useDaemon) {
    labArgs.push('--daemon');
  } else if (useElectron) {
    labArgs.push('--electron');
  }
  // Browser mode is the default for run-lab.js, so no flag needed

  if (dryRun) {
    labArgs.push('--dry-run');
  }

  // Describe what we're about to do
  const recordsToProcess = limit ? Math.min(parseInt(limit, 10), pendingCount) : pendingCount;
  let mode = 'Electron';
  if (useHeadless) mode = 'headless';
  else if (useDaemon) mode = 'daemon (Server + Tray)';
  else if (useBrowser) mode = 'browser';

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Starting analysis...`);
  console.log(`  Mode:       ${mode}`);
  console.log(`  Version:    ${targetVersion}`);
  console.log(`  Records:    ${recordsToProcess.toLocaleString()}${limit ? ` (limited from ${pendingCount.toLocaleString()})` : ''}`);
  console.log(`  Dry run:    ${dryRun}`);
  console.log(`${'='.repeat(50)}\n`);

  // Run the lab
  const child = spawn('node', labArgs, {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  child.on('error', (err) => {
    console.error('Failed to start analysis:', err.message);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
