#!/usr/bin/env node
'use strict';

/**
 * intelligent-crawl-server.js — CLI for managing the Intelligent Crawl Server
 * 
 * Usage:
 *   node tools/dev/intelligent-crawl-server.js start [--port=3150]
 *   node tools/dev/intelligent-crawl-server.js stop
 *   node tools/dev/intelligent-crawl-server.js status [--json]
 *   node tools/dev/intelligent-crawl-server.js backfill [--dry-run] [--limit=1000]
 *   node tools/dev/intelligent-crawl-server.js crawl start [--batch-size=1000]
 *   node tools/dev/intelligent-crawl-server.js crawl stop
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// Configuration
const DEFAULT_PORT = 3150;
const PID_FILE = path.join(process.cwd(), 'tmp', 'intelligent-crawl-server.pid');
const LOG_FILE = path.join(process.cwd(), 'tmp', 'intelligent-crawl-server.log');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getBaseUrl(port) {
  return `http://127.0.0.1:${port}`;
}

async function httpRequest(method, path, port = DEFAULT_PORT, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch (_) {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function isServerRunning(port = DEFAULT_PORT) {
  try {
    const { data } = await httpRequest('GET', '/health', port);
    return data && data.status === 'ok';
  } catch (_) {
    return false;
  }
}

function readPidFile() {
  try {
    const content = fs.readFileSync(PID_FILE, 'utf8');
    const [pid, port] = content.trim().split(':');
    return { pid: parseInt(pid, 10), port: parseInt(port, 10) || DEFAULT_PORT };
  } catch (_) {
    return null;
  }
}

function writePidFile(pid, port) {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, `${pid}:${port}`);
}

function deletePidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch (_) {}
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────

async function cmdStart(args) {
  const port = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || DEFAULT_PORT, 10);
  const noAutoBackfill = args.includes('--no-auto-backfill');
  const foreground = args.includes('--foreground') || args.includes('-f');

  // Check if already running
  const pidInfo = readPidFile();
  if (pidInfo && isProcessRunning(pidInfo.pid)) {
    const running = await isServerRunning(pidInfo.port);
    if (running) {
      console.log(`⚠️  Server already running on port ${pidInfo.port} (PID: ${pidInfo.pid})`);
      return 1;
    }
  }

  if (await isServerRunning(port)) {
    console.log(`⚠️  Port ${port} already in use by another server`);
    return 1;
  }

  const serverPath = path.join(process.cwd(), 'src', 'services', 'IntelligentCrawlServer.js');

  if (foreground) {
    // Run in foreground
    console.log(`🚀 Starting Intelligent Crawl Server on port ${port} (foreground)...`);
    require(serverPath);
    return 0;
  }

  // Run as background daemon
  console.log(`🚀 Starting Intelligent Crawl Server on port ${port} (background)...`);

  const serverArgs = [`--port=${port}`];
  if (noAutoBackfill) serverArgs.push('--no-auto-backfill');

  const logStream = fs.openSync(LOG_FILE, 'a');
  
  const child = spawn('node', [serverPath, ...serverArgs], {
    detached: true,
    stdio: ['ignore', logStream, logStream],
    cwd: process.cwd()
  });

  child.unref();
  writePidFile(child.pid, port);

  // Wait for server to be ready
  await new Promise(r => setTimeout(r, 1500));

  if (await isServerRunning(port)) {
    console.log(`✅ Server started successfully`);
    console.log(`   PID: ${child.pid}`);
    console.log(`   URL: ${getBaseUrl(port)}`);
    console.log(`   Log: ${LOG_FILE}`);
    return 0;
  } else {
    console.log(`❌ Server failed to start. Check logs: ${LOG_FILE}`);
    deletePidFile();
    return 1;
  }
}

async function cmdStop(args) {
  const pidInfo = readPidFile();
  
  if (!pidInfo) {
    console.log('ℹ️  No PID file found. Server may not be running.');
    return 0;
  }

  if (!isProcessRunning(pidInfo.pid)) {
    console.log('ℹ️  Server process not running. Cleaning up PID file.');
    deletePidFile();
    return 0;
  }

  console.log(`🛑 Stopping server (PID: ${pidInfo.pid})...`);

  try {
    process.kill(pidInfo.pid, 'SIGTERM');
    
    // Wait for process to exit
    let attempts = 0;
    while (isProcessRunning(pidInfo.pid) && attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
    }

    if (isProcessRunning(pidInfo.pid)) {
      console.log('⚠️  Process not responding to SIGTERM, sending SIGKILL...');
      process.kill(pidInfo.pid, 'SIGKILL');
    }

    deletePidFile();
    console.log('✅ Server stopped');
    return 0;

  } catch (err) {
    console.log(`❌ Failed to stop server: ${err.message}`);
    return 1;
  }
}

async function cmdRestart(args) {
  await cmdStop(args);
  await new Promise(r => setTimeout(r, 1000));
  return cmdStart(args);
}

async function cmdStatus(args) {
  const asJson = args.includes('--json');
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  const result = {
    pidFile: pidInfo,
    processRunning: pidInfo ? isProcessRunning(pidInfo.pid) : false,
    serverResponding: false,
    serverStatus: null
  };

  try {
    const { data } = await httpRequest('GET', '/status', port);
    result.serverResponding = true;
    result.serverStatus = data;
  } catch (_) {
    // Server not responding
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  // Human-readable output
  console.log('\n┌─ Intelligent Crawl Server Status ─────────────────────');
  
  if (!result.processRunning && !result.serverResponding) {
    console.log('│  Status: 🔴 STOPPED');
  } else if (result.serverResponding) {
    console.log('│  Status: 🟢 RUNNING');
    console.log(`│  PID:    ${pidInfo?.pid || 'unknown'}`);
    console.log(`│  Port:   ${port}`);
    console.log(`│  URL:    ${getBaseUrl(port)}`);
    
    if (result.serverStatus) {
      console.log('│');
      console.log(`│  Uptime:           ${result.serverStatus.stats?.startTime || 'unknown'}`);
      console.log(`│  Total Backfills:  ${result.serverStatus.stats?.totalBackfills || 0}`);
      console.log(`│  Current Crawl:    ${result.serverStatus.currentCrawl?.phase || 'none'}`);
      
      if (result.serverStatus.lastBackfill) {
        console.log('│');
        console.log(`│  Last Backfill:`);
        console.log(`│    Time: ${result.serverStatus.lastBackfill.time}`);
        const bf = result.serverStatus.lastBackfill.result;
        if (bf) {
          console.log(`│    404 Candidates: ${bf.absentMappings?.inserted || 0} inserted`);
          console.log(`│    Verified Hubs:  ${bf.verifiedMappings?.inserted || 0} inserted`);
        }
      }
    }
  } else {
    console.log('│  Status: 🟡 PROCESS EXISTS BUT NOT RESPONDING');
    console.log(`│  PID:    ${pidInfo?.pid}`);
  }
  
  console.log('└────────────────────────────────────────────────────────\n');
  return 0;
}

async function cmdBackfill(args) {
  const dryRun = args.includes('--dry-run');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000', 10);
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running. Start it first with: intelligent-crawl-server start');
    return 1;
  }

  console.log(`🔄 Triggering backfill (dryRun=${dryRun}, limit=${limit})...`);

  try {
    const { status, data } = await httpRequest('POST', '/api/backfill', port, { dryRun, limit });
    
    if (status === 202) {
      console.log('✅ Backfill triggered. Use --status to check progress.');
      console.log(`   Or watch events: curl ${getBaseUrl(port)}/events`);
    } else {
      console.log(`⚠️  Unexpected response: ${status}`);
      console.log(data);
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

async function cmdBackfillStats(args) {
  const asJson = args.includes('--json');
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running');
    return 1;
  }

  try {
    const { data } = await httpRequest('GET', '/api/backfill/stats', port);
    
    if (asJson) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('\n┌─ Backfill Statistics ─────────────────────────────────');
      if (data.stats) {
        console.log(`│  404 Candidates:    ${data.stats.total_404_candidates || 0}`);
        console.log(`│  Verified Hubs:     ${data.stats.verified_hubs || 0}`);
        console.log(`│  Existing Absent:   ${data.stats.absent_mappings || 0}`);
        console.log(`│  Existing Present:  ${data.stats.present_mappings || 0}`);
        console.log(`│  Unmigrated:        ${data.stats.unmigrated_mappings || 0}`);
      }
      if (data.lastBackfillTime) {
        console.log('│');
        console.log(`│  Last Run: ${data.lastBackfillTime}`);
      }
      console.log('└────────────────────────────────────────────────────────\n');
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

async function cmdCrawlStart(args) {
  const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '1000', 10);
  const maxBatches = args.find(a => a.startsWith('--max-batches='))?.split('=')[1];
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running. Start it first.');
    return 1;
  }

  console.log(`🕷️  Starting intelligent crawl (batchSize=${batchSize})...`);

  try {
    const { status, data } = await httpRequest('POST', '/api/crawl/start', port, {
      batchSize,
      maxBatches: maxBatches ? parseInt(maxBatches, 10) : null,
      hubDiscovery: true
    });

    if (status === 202) {
      console.log('✅ Crawl started');
      console.log(`   Monitor: curl ${getBaseUrl(port)}/events`);
    } else if (status === 409) {
      console.log(`⚠️  Crawl already in progress`);
    } else {
      console.log(`⚠️  Response: ${status}`);
      console.log(data);
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

async function cmdCrawlStop(args) {
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running');
    return 1;
  }

  console.log('🛑 Stopping crawl...');

  try {
    const { status, data } = await httpRequest('POST', '/api/crawl/stop', port);

    if (status === 200) {
      console.log('✅ Crawl stopped');
    } else if (status === 404) {
      console.log('ℹ️  No crawl in progress');
    } else {
      console.log(`⚠️  Response: ${status}`);
      console.log(data);
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

async function cmdCrawlStatus(args) {
  const asJson = args.includes('--json');
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running');
    return 1;
  }

  try {
    const { data } = await httpRequest('GET', '/api/crawl/status', port);

    if (asJson) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('\n┌─ Crawl Status ────────────────────────────────────────');
      console.log(`│  Active: ${data.isActive ? '🟢 YES' : '🔴 NO'}`);
      
      if (data.currentCrawl) {
        console.log('│');
        console.log(`│  Phase:   ${data.currentCrawl.phase}`);
        console.log(`│  Started: ${data.currentCrawl.startTime}`);
        console.log(`│  Pages:   ${data.currentCrawl.pagesDownloaded}`);
        console.log(`│  Batches: ${data.currentCrawl.batchesCompleted}`);
      }
      
      if (data.recentHistory?.length) {
        console.log('│');
        console.log('│  Recent History:');
        data.recentHistory.slice(-3).forEach(h => {
          console.log(`│    ${h.startTime} → ${h.phase} (${h.pagesDownloaded || 0} pages)`);
        });
      }
      console.log('└────────────────────────────────────────────────────────\n');
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

// ─────────────────────────────────────────────────────────────
// Database Commands
// ─────────────────────────────────────────────────────────────

async function cmdDbStatus(args) {
  const asJson = args.includes('--json');
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running');
    return 1;
  }

  try {
    const { data } = await httpRequest('GET', '/api/db/status', port);

    if (asJson) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('\n┌─ Database Status ─────────────────────────────────────');
      console.log(`│  Mode:       ${data.mode}`);
      console.log(`│  Initialized: ${data.initialized ? '✅' : '❌'}`);
      
      if (data.primary) {
        console.log('│');
        console.log(`│  Primary:   ${data.primary.engine} ${data.primary.connected ? '●' : '○'}`);
      }
      
      if (data.secondary) {
        console.log(`│  Secondary: ${data.secondary.engine} ${data.secondary.connected ? '●' : '○'}`);
      }
      
      if (data.exportInProgress) {
        console.log('│');
        console.log(`│  Export:    ⏳ In Progress`);
        if (data.exportStats) {
          const pct = data.exportStats.totalRows > 0
            ? Math.round((data.exportStats.exportedRows / data.exportStats.totalRows) * 100)
            : 0;
          console.log(`│             ${pct}% (${data.exportStats.exportedRows}/${data.exportStats.totalRows} rows)`);
        }
      }
      
      console.log('│');
      console.log(`│  Available modes: ${data.availableModes?.join(', ')}`);
      console.log(`│  Available engines: ${data.availableEngines?.join(', ')}`);
      console.log('└────────────────────────────────────────────────────────\n');
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

async function cmdDbMode(args) {
  const mode = args[0];
  const secondaryConn = args.find(a => a.startsWith('--connection='))?.split('=')[1];
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!mode) {
    console.log('❌ Usage: db mode <mode> [--connection=<postgres-url>]');
    console.log('   Modes: single, dual-write');
    return 1;
  }

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running');
    return 1;
  }

  console.log(`🔄 Switching database mode to: ${mode}...`);

  try {
    const body = { mode };
    if (secondaryConn) {
      body.secondary = { engine: 'postgres', connectionString: secondaryConn };
    }
    
    const { status, data } = await httpRequest('POST', '/api/db/mode', port, body);

    if (status === 200 && data.success) {
      console.log(`✅ Mode changed to: ${mode}`);
      if (data.status?.secondary) {
        console.log(`   Secondary: ${data.status.secondary.engine} (${data.status.secondary.connected ? 'connected' : 'not connected'})`);
      }
    } else {
      console.log(`❌ Failed: ${data.error || 'Unknown error'}`);
      return 1;
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

async function cmdDbExport(args) {
  const targetConn = args.find(a => a.startsWith('--target='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');
  const tables = args.find(a => a.startsWith('--tables='))?.split('=')[1]?.split(',');
  const truncate = args.includes('--truncate');
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!targetConn) {
    console.log('❌ Usage: db export --target=<postgres-connection-string> [options]');
    console.log('   Options:');
    console.log('     --dry-run    Preview without writing');
    console.log('     --truncate   Truncate target tables first');
    console.log('     --tables=<list>  Comma-separated table names');
    return 1;
  }

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running');
    return 1;
  }

  console.log(`📤 Starting export to PostgreSQL${dryRun ? ' (dry-run)' : ''}...`);
  console.log(`   Target: ${targetConn.replace(/:[^:@]+@/, ':****@')}`);

  try {
    const { status, data } = await httpRequest('POST', '/api/db/export', port, {
      target: { connectionString: targetConn },
      dryRun,
      truncateFirst: truncate,
      tables
    });

    if (status === 202) {
      console.log('✅ Export started');
      console.log(`   Monitor: curl ${getBaseUrl(port)}/api/db/export/status`);
      console.log(`   Or watch: curl ${getBaseUrl(port)}/events`);
    } else if (status === 409) {
      console.log('⚠️  Export already in progress');
    } else {
      console.log(`❌ Failed: ${data.error || 'Unknown error'}`);
      return 1;
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

async function cmdDbExportStatus(args) {
  const asJson = args.includes('--json');
  const pidInfo = readPidFile();
  const port = pidInfo?.port || DEFAULT_PORT;

  if (!(await isServerRunning(port))) {
    console.log('❌ Server not running');
    return 1;
  }

  try {
    const { data } = await httpRequest('GET', '/api/db/export/status', port);

    if (asJson) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('\n┌─ Export Status ───────────────────────────────────────');
      console.log(`│  In Progress: ${data.exportInProgress ? '🟢 YES' : '🔴 NO'}`);
      
      if (data.progress) {
        const p = data.progress;
        console.log('│');
        console.log(`│  Status:        ${p.status}`);
        console.log(`│  Current Table: ${p.currentTable || 'none'}`);
        console.log(`│  Rows:          ${p.exportedRows || 0}/${p.totalRows || 0}`);
        
        if (p.durationMs) {
          console.log(`│  Duration:      ${(p.durationMs / 1000).toFixed(1)}s`);
        }
        
        if (p.errors?.length) {
          console.log('│');
          console.log(`│  Errors (${p.errors.length}):`);
          p.errors.slice(0, 3).forEach(e => {
            console.log(`│    ${e.table}: ${e.error}`);
          });
        }
      }
      console.log('└────────────────────────────────────────────────────────\n');
    }
    return 0;

  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    return 1;
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
intelligent-crawl-server — CLI for Intelligent Crawl Server

USAGE:
  node tools/dev/intelligent-crawl-server.js <command> [options]

SERVER COMMANDS:
  start              Start the server (background)
    --port=<n>         Port to listen on (default: ${DEFAULT_PORT})
    --no-auto-backfill Disable automatic backfill on startup
    --verbose          Enable verbose console output
    --db-mode=<mode>   Database mode: single, dual-write
    -f, --foreground   Run in foreground instead of daemon

  stop               Stop the server
  restart            Restart the server
  status             Show server status
    --json             Output as JSON

BACKFILL COMMANDS:
  backfill           Trigger a backfill
    --dry-run          Preview without making changes
    --limit=<n>        Max records to process (default: 1000)

  backfill-stats     Show backfill statistics
    --json             Output as JSON

CRAWL COMMANDS:
  crawl start        Start an intelligent crawl
    --batch-size=<n>   Pages per batch (default: 1000)
    --max-batches=<n>  Max batches before stopping

  crawl stop         Stop the current crawl
  crawl status       Show crawl status
    --json             Output as JSON

DATABASE COMMANDS:
  db status          Show database configuration and status
    --json             Output as JSON

  db mode <mode>     Switch database mode
    --connection=<url> PostgreSQL connection string (for dual-write)
    Modes: single, dual-write

  db export          Export SQLite to PostgreSQL
    --target=<url>     PostgreSQL connection string (required)
    --dry-run          Preview without writing
    --truncate         Truncate target tables first
    --tables=<list>    Comma-separated table names

  db export-status   Show export progress
    --json             Output as JSON

EXAMPLES:
  # Start server on default port
  node tools/dev/intelligent-crawl-server.js start

  # Start with dual-write to PostgreSQL
  node tools/dev/intelligent-crawl-server.js start --db-mode=dual-write

  # Check server and database status
  node tools/dev/intelligent-crawl-server.js status
  node tools/dev/intelligent-crawl-server.js db status

  # Switch to dual-write mode at runtime
  node tools/dev/intelligent-crawl-server.js db mode dual-write --connection=postgres://user:pass@localhost/news

  # Export database
  node tools/dev/intelligent-crawl-server.js db export --target=postgres://user:pass@localhost/news --dry-run
  node tools/dev/intelligent-crawl-server.js db export-status

  # Monitor all events (separate terminal)
  curl -N http://localhost:${DEFAULT_PORT}/events
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subArgs = args.slice(1);

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    return 0;
  }

  switch (command) {
    case 'start':
      return cmdStart(subArgs);
    case 'stop':
      return cmdStop(subArgs);
    case 'restart':
      return cmdRestart(subArgs);
    case 'status':
      return cmdStatus(subArgs);
    case 'backfill':
      return cmdBackfill(subArgs);
    case 'backfill-stats':
      return cmdBackfillStats(subArgs);
    case 'crawl':
      const crawlCmd = subArgs[0];
      const crawlArgs = subArgs.slice(1);
      if (crawlCmd === 'start') return cmdCrawlStart(crawlArgs);
      if (crawlCmd === 'stop') return cmdCrawlStop(crawlArgs);
      if (crawlCmd === 'status') return cmdCrawlStatus(crawlArgs);
      console.log(`Unknown crawl command: ${crawlCmd}`);
      return 1;
    case 'db':
      const dbCmd = subArgs[0];
      const dbArgs = subArgs.slice(1);
      if (dbCmd === 'status') return cmdDbStatus(dbArgs);
      if (dbCmd === 'mode') return cmdDbMode(dbArgs);
      if (dbCmd === 'export') return cmdDbExport(dbArgs);
      if (dbCmd === 'export-status') return cmdDbExportStatus(dbArgs);
      console.log(`Unknown db command: ${dbCmd}`);
      console.log('Available: status, mode, export, export-status');
      return 1;
    default:
      console.log(`Unknown command: ${command}`);
      showHelp();
      return 1;
  }
}

main().then(code => process.exit(code)).catch(err => {
  console.error(err);
  process.exit(1);
});
