#!/usr/bin/env node
'use strict';

/**
 * crawl-stop.js — Gracefully stop running crawls
 * 
 * Finds running crawl processes and terminates them with configurable signals.
 * 
 * Usage:
 *   node tools/dev/crawl-stop.js                  # Stop all crawls
 *   node tools/dev/crawl-stop.js --pid 12345      # Stop specific PID
 *   node tools/dev/crawl-stop.js --list           # List without stopping
 *   node tools/dev/crawl-stop.js --force          # Use SIGKILL instead of SIGTERM
 */

const { execSync } = require('child_process');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    help: false,
    list: false,
    pid: null,
    force: false,
    all: false,
    json: false,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '-l':
      case '--list':
        flags.list = true;
        break;
      case '--pid':
      case '-p':
        flags.pid = parseInt(next, 10);
        i++;
        break;
      case '-f':
      case '--force':
        flags.force = true;
        break;
      case '-a':
      case '--all':
        flags.all = true;
        break;
      case '--json':
        flags.json = true;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
    }
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────
// Process detection
// ─────────────────────────────────────────────────────────────

function findCrawlProcesses() {
  try {
    const basicResult = execSync(
      `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id,StartTime | ConvertTo-Json -Compress"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    
    if (!basicResult.trim()) return [];
    
    const basicProcs = JSON.parse(basicResult);
    const procs = Array.isArray(basicProcs) ? basicProcs : [basicProcs];
    
    const crawlPatterns = [
      'crawl.js',
      'mini-crawl',
      'NewsCrawler',
      'test-guardian',
      'crawl-runner'
    ];
    
    const crawls = [];
    
    for (const proc of procs) {
      try {
        const wmicResult = execSync(
          `wmic process where "ProcessId=${proc.Id}" get CommandLine /format:list`,
          { encoding: 'utf8', timeout: 5000 }
        );
        const cmdMatch = wmicResult.match(/CommandLine=(.+)/);
        const cmdLine = cmdMatch ? cmdMatch[1].trim() : '';
        
        if (crawlPatterns.some(pat => cmdLine.toLowerCase().includes(pat.toLowerCase()))) {
          crawls.push({
            pid: proc.Id,
            startTime: proc.StartTime,
            command: cmdLine,
            runtime: getProcessRuntime(proc.StartTime)
          });
        }
      } catch {
        // Skip processes we can't query
      }
    }
    
    return crawls;
  } catch {
    return [];
  }
}

function getProcessRuntime(startTime) {
  if (!startTime) return 'unknown';
  
  let start;
  if (typeof startTime === 'string' && startTime.includes('/Date(')) {
    const ts = parseInt(startTime.match(/\d+/)?.[0] || '0', 10);
    start = new Date(ts);
  } else {
    start = new Date(startTime);
  }
  
  if (isNaN(start.getTime())) return 'unknown';
  
  const diffMs = Date.now() - start;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ─────────────────────────────────────────────────────────────
// Stop processes
// ─────────────────────────────────────────────────────────────

function stopProcess(pid, force, dryRun) {
  const signal = force ? '-Force' : '';
  const cmd = `powershell -Command "Stop-Process -Id ${pid} ${signal} -ErrorAction SilentlyContinue"`;
  
  if (dryRun) {
    return { pid, status: 'would-stop', command: cmd };
  }
  
  try {
    execSync(cmd, { encoding: 'utf8', timeout: 10000 });
    return { pid, status: 'stopped' };
  } catch (err) {
    return { pid, status: 'error', error: err.message };
  }
}

function verifyProcessStopped(pid) {
  try {
    const result = execSync(
      `powershell -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return result.trim() === '';
  } catch {
    return true; // Process not found = stopped
  }
}

// ─────────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
crawl-stop.js — Gracefully stop running crawls

USAGE:
  node tools/dev/crawl-stop.js                  # Stop all crawls
  node tools/dev/crawl-stop.js --pid 12345      # Stop specific PID
  node tools/dev/crawl-stop.js --list           # List without stopping

OPTIONS:
  -l, --list         List crawl processes without stopping
  --pid, -p <pid>    Stop specific process by PID
  -f, --force        Use SIGKILL instead of graceful termination
  -a, --all          Stop all crawl processes (default if no PID)
  --dry-run          Show what would be stopped without doing it
  --json             Output as JSON
  -h, --help         Show this help

EXAMPLES:
  # List running crawls
  node tools/dev/crawl-stop.js --list

  # Stop all crawls gracefully
  node tools/dev/crawl-stop.js

  # Force kill a stuck crawl
  node tools/dev/crawl-stop.js --pid 12345 --force
`);
}

function printCrawlList(crawls, json) {
  if (json) {
    console.log(JSON.stringify(crawls, null, 2));
    return;
  }
  
  if (crawls.length === 0) {
    console.log('No crawl processes found.');
    return;
  }
  
  console.log(`\n🕷️  Active Crawl Processes (${crawls.length}):\n`);
  
  for (const c of crawls) {
    console.log(`  PID ${c.pid} │ Runtime: ${c.runtime}`);
    console.log(`     ${c.command?.substring(0, 70)}${c.command?.length > 70 ? '...' : ''}`);
    console.log();
  }
}

function printStopResults(results, json) {
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  
  console.log('\n🛑 Stop Results:\n');
  
  for (const r of results) {
    const icon = r.status === 'stopped' ? '✅' : r.status === 'would-stop' ? '🔸' : '❌';
    console.log(`  ${icon} PID ${r.pid}: ${r.status}`);
    if (r.error) console.log(`     Error: ${r.error}`);
  }
  console.log();
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  const flags = parseArgs();
  
  if (flags.help) {
    printHelp();
    process.exit(0);
  }
  
  const crawls = findCrawlProcesses();
  
  // List mode
  if (flags.list) {
    printCrawlList(crawls, flags.json);
    process.exit(0);
  }
  
  // Determine which processes to stop
  let targets = [];
  
  if (flags.pid) {
    const match = crawls.find(c => c.pid === flags.pid);
    if (match) {
      targets = [match];
    } else {
      // PID might not be a crawl but user explicitly wants to stop it
      targets = [{ pid: flags.pid, command: 'unknown', runtime: 'unknown' }];
    }
  } else {
    targets = crawls;
  }
  
  if (targets.length === 0) {
    if (!flags.json) {
      console.log('No crawl processes to stop.');
    } else {
      console.log(JSON.stringify({ stopped: [], message: 'No crawl processes found' }));
    }
    process.exit(0);
  }
  
  // Confirm before stopping (unless JSON mode)
  if (!flags.json && !flags.dryRun) {
    console.log(`\n⚠️  About to stop ${targets.length} crawl process(es):`);
    for (const t of targets) {
      console.log(`   PID ${t.pid}: ${t.command?.substring(0, 60)}...`);
    }
    console.log('\nProceeding in 2 seconds... (Ctrl+C to cancel)');
    
    // Brief delay for cancel opportunity
    const { execSync: syncSleep } = require('child_process');
    try {
      syncSleep('powershell -Command "Start-Sleep -Milliseconds 2000"', { timeout: 3000 });
    } catch {
      // Ignore timeout
    }
  }
  
  // Stop processes
  const results = [];
  
  for (const t of targets) {
    const result = stopProcess(t.pid, flags.force, flags.dryRun);
    results.push(result);
    
    // Verify if actually stopped (unless dry-run)
    if (!flags.dryRun && result.status === 'stopped') {
      setTimeout(() => {
        if (!verifyProcessStopped(t.pid)) {
          result.status = 'may-still-running';
        }
      }, 500);
    }
  }
  
  printStopResults(results, flags.json);
  
  // Exit with error if any stops failed
  const failed = results.filter(r => r.status === 'error');
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
