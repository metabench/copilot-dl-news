#!/usr/bin/env node
'use strict';

/**
 * crawl-daemon.js — CLI wrapper for the crawl daemon
 * 
 * Simple interface for managing the background crawl daemon.
 * AI agents should use this to start/stop the daemon, then use
 * crawl-api.js to interact with crawl jobs.
 * 
 * Usage:
 *   node tools/dev/crawl-daemon.js start           # Start in background
 *   node tools/dev/crawl-daemon.js stop            # Stop daemon
 *   node tools/dev/crawl-daemon.js status          # Check status
 *   node tools/dev/crawl-daemon.js restart         # Restart daemon
 */

const path = require('path');

// Load the daemon module
const daemonPath = path.join(__dirname, '../../src/cli/crawl/daemon.js');
const {
  getDaemonConfig,
  isDaemonRunning,
  startDaemonDetached,
  stopDaemon,
  getDaemonStatus
} = require(daemonPath);

// ─────────────────────────────────────────────────────────────
// CLI Parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    help: false,
    json: false,
    port: null,
    foreground: false
  };
  const positional = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    if (arg === '-h' || arg === '--help') {
      flags.help = true;
    } else if (arg === '-j' || arg === '--json') {
      flags.json = true;
    } else if (arg === '-p' || arg === '--port') {
      flags.port = parseInt(next, 10);
      i++;
    } else if (arg === '-f' || arg === '--foreground') {
      flags.foreground = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  
  return { flags, positional };
}

function printHelp() {
  console.log(`
crawl-daemon.js — Manage the background crawl daemon

USAGE:
  node tools/dev/crawl-daemon.js <command> [options]

COMMANDS:
  start            Start the daemon (background by default)
  stop             Stop the daemon
  status           Check daemon status
  restart          Restart the daemon

OPTIONS:
  -p, --port <n>   Port for HTTP API (default: 3099)
  -f, --foreground Run in foreground (don't detach)
  -j, --json       Output as JSON
  -h, --help       Show this help

EXAMPLES:
  # Start daemon in background
  node tools/dev/crawl-daemon.js start

  # Check status
  node tools/dev/crawl-daemon.js status --json

  # Restart with different port
  node tools/dev/crawl-daemon.js restart --port 3100

AI AGENT WORKFLOW:
  1. node tools/dev/crawl-daemon.js start
  2. node tools/dev/crawl-api.js jobs start siteExplorer https://bbc.com --json
  3. node tools/dev/crawl-api.js jobs get <jobId> --json
  4. node tools/dev/crawl-daemon.js stop
`);
}

// ─────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────

async function cmdStart(flags) {
  const config = getDaemonConfig({
    port: flags.port || undefined
  });
  
  // Check if already running
  const status = isDaemonRunning(config);
  if (status.running) {
    if (flags.json) {
      console.log(JSON.stringify({ success: false, error: 'already_running', pid: status.pid }));
    } else {
      console.log(`Daemon already running (PID ${status.pid})`);
    }
    return 0; // Not an error
  }
  
  if (flags.foreground) {
    // Run in foreground (load daemon module directly)
    const { startDaemon } = require(daemonPath);
    await startDaemon(config);
    // Keep running (will block until SIGINT)
    return 0;
  }
  
  // Start in background
  const result = await startDaemonDetached(config);
  
  if (flags.json) {
    console.log(JSON.stringify(result));
  }
  
  return result.success ? 0 : 1;
}

async function cmdStop(flags) {
  const config = getDaemonConfig({
    port: flags.port || undefined
  });
  
  const result = stopDaemon(config);
  
  if (flags.json) {
    console.log(JSON.stringify(result));
  }
  
  return result.success ? 0 : 1;
}

async function cmdStatus(flags) {
  const config = getDaemonConfig({
    port: flags.port || undefined
  });
  
  const status = await getDaemonStatus(config);
  
  if (flags.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    if (status.running) {
      console.log(`✅ Daemon running (PID ${status.pid})`);
      if (status.api) console.log(`   API: ${status.api}`);
      if (status.health) console.log(`   Health: ${status.health.status}`);
      if (status.error) console.log(`   Warning: ${status.error}`);
    } else {
      console.log('❌ Daemon not running');
    }
  }
  
  return status.running ? 0 : 1;
}

async function cmdRestart(flags) {
  const config = getDaemonConfig({
    port: flags.port || undefined
  });
  
  // Stop if running
  const status = isDaemonRunning(config);
  if (status.running) {
    if (!flags.json) console.log('Stopping existing daemon...');
    stopDaemon(config);
    // Wait a moment
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Start fresh
  const result = await startDaemonDetached(config);
  
  if (flags.json) {
    console.log(JSON.stringify(result));
  }
  
  return result.success ? 0 : 1;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const { flags, positional } = parseArgs(process.argv);
  
  if (flags.help || positional.length === 0) {
    printHelp();
    process.exit(0);
  }
  
  const [cmd] = positional;
  
  let exitCode = 0;
  
  try {
    switch (cmd) {
      case 'start':
        exitCode = await cmdStart(flags);
        break;
      case 'stop':
        exitCode = await cmdStop(flags);
        break;
      case 'status':
        exitCode = await cmdStatus(flags);
        break;
      case 'restart':
        exitCode = await cmdRestart(flags);
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        console.error('Use --help for usage');
        exitCode = 1;
    }
  } catch (e) {
    if (flags.json) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error('Error:', e.message);
    }
    exitCode = 1;
  }
  
  process.exit(exitCode);
}

main();
