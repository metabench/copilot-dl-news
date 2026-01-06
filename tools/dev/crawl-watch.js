#!/usr/bin/env node
'use strict';

/**
 * crawl-watch.js — Live crawl monitoring CLI
 * 
 * Watches a running crawl by tailing its log file or querying task_events DB.
 * Provides real-time updates on:
 *   - Queue size and composition
 *   - Pages downloaded and pending
 *   - Errors and warnings
 *   - Decision milestones
 * 
 * Usage:
 *   node tools/dev/crawl-watch.js                     # Auto-detect active crawl
 *   node tools/dev/crawl-watch.js --pid 12345         # Watch specific crawl PID
 *   node tools/dev/crawl-watch.js --log tmp/crawl.log # Watch log file
 *   node tools/dev/crawl-watch.js --task-id <id>      # Watch via task_events DB
 *   node tools/dev/crawl-watch.js --pages             # Show per-page decisions
 *   node tools/dev/crawl-watch.js --queue             # Show queue dynamics
 *   node tools/dev/crawl-watch.js --decisions         # Show decision explanations
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const Database = require('better-sqlite3');

// ─────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    help: false,
    pid: null,
    logFile: null,
    taskId: null,
    pages: false,
    queue: false,
    decisions: false,
    errors: false,
    summary: false,
    json: false,
    follow: true, // Default to live following
    interval: 2000, // Poll interval in ms
    limit: 50,
    db: path.join(process.cwd(), 'data', 'news.db')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--pid':
        flags.pid = parseInt(next, 10);
        i++;
        break;
      case '--log':
      case '-l':
        flags.logFile = next;
        i++;
        break;
      case '--task-id':
      case '--task':
        flags.taskId = next;
        i++;
        break;
      case '--pages':
      case '-p':
        flags.pages = true;
        break;
      case '--queue':
      case '-q':
        flags.queue = true;
        break;
      case '--decisions':
      case '-d':
        flags.decisions = true;
        break;
      case '--errors':
      case '-e':
        flags.errors = true;
        break;
      case '--summary':
      case '-s':
        flags.summary = true;
        break;
      case '--json':
        flags.json = true;
        break;
      case '--no-follow':
        flags.follow = false;
        break;
      case '--interval':
        flags.interval = parseInt(next, 10);
        i++;
        break;
      case '--limit':
        flags.limit = parseInt(next, 10);
        i++;
        break;
      case '--db':
        flags.db = next;
        i++;
        break;
    }
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────
// Process detection
// ─────────────────────────────────────────────────────────────

function findActiveCrawlProcess() {
  try {
    const basicResult = execSync(
      `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id,StartTime | ConvertTo-Json -Compress"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    
    if (!basicResult.trim()) return null;
    
    const basicProcs = JSON.parse(basicResult);
    const procs = Array.isArray(basicProcs) ? basicProcs : [basicProcs];
    
    const crawlPatterns = ['crawl.js', 'mini-crawl', 'NewsCrawler', 'test-guardian'];
    
    for (const proc of procs) {
      try {
        const wmicResult = execSync(
          `wmic process where "ProcessId=${proc.Id}" get CommandLine /format:list`,
          { encoding: 'utf8', timeout: 5000 }
        );
        const cmdMatch = wmicResult.match(/CommandLine=(.+)/);
        const cmdLine = cmdMatch ? cmdMatch[1].trim() : '';
        
        if (crawlPatterns.some(pat => cmdLine.toLowerCase().includes(pat.toLowerCase()))) {
          return {
            pid: proc.Id,
            startTime: proc.StartTime,
            command: cmdLine
          };
        }
      } catch {
        // Skip processes we can't query
      }
    }
    
    return null;
  } catch {
    return null;
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
// Log file parsing (for live tailing)
// ─────────────────────────────────────────────────────────────

function readLogFile(logPath) {
  // Handle UTF-16 LE encoding from PowerShell Tee-Object
  const buf = fs.readFileSync(logPath);
  
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le').slice(1);
  } else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8').slice(1);
  } else {
    return buf.toString('utf8');
  }
}

function parseLogLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  
  // QUEUE events
  if (trimmed.startsWith('QUEUE ')) {
    try {
      const json = JSON.parse(trimmed.substring(6));
      return { type: 'queue', ...json };
    } catch { return null; }
  }
  
  // PAGE events
  if (trimmed.startsWith('PAGE ')) {
    try {
      const json = JSON.parse(trimmed.substring(5));
      return { type: 'page', ...json };
    } catch { return null; }
  }
  
  // MILESTONE events
  if (trimmed.startsWith('MILESTONE ')) {
    try {
      const json = JSON.parse(trimmed.substring(10));
      return { type: 'milestone', ...json };
    } catch { return null; }
  }
  
  // PROGRESS events
  if (trimmed.startsWith('PROGRESS ')) {
    try {
      const json = JSON.parse(trimmed.substring(9));
      return { type: 'progress', ...json };
    } catch { return null; }
  }
  
  // TELEMETRY events
  if (trimmed.startsWith('TELEMETRY ')) {
    try {
      const json = JSON.parse(trimmed.substring(10));
      return { type: 'telemetry', ...json };
    } catch { return null; }
  }
  
  return null;
}

function parseLogContent(content) {
  const lines = content.split(/\r?\n/);
  const events = [];
  
  for (const line of lines) {
    const event = parseLogLine(line);
    if (event) events.push(event);
  }
  
  return events;
}

// ─────────────────────────────────────────────────────────────
// Log analysis
// ─────────────────────────────────────────────────────────────

function analyzeEvents(events) {
  const analysis = {
    queue: {
      current: 0,
      max: 0,
      totalEnqueued: 0,
      totalDequeued: 0,
      dropped: 0,
      dropReasons: {}
    },
    pages: {
      downloaded: 0,
      errors: 0,
      totalBytes: 0,
      byStatus: {},
      byDepth: {},
      recentPages: []
    },
    milestones: [],
    decisions: [],
    lastProgress: null,
    errors: []
  };
  
  for (const event of events) {
    switch (event.type) {
      case 'queue':
        if (event.action === 'enqueued') {
          analysis.queue.totalEnqueued++;
          analysis.queue.current = event.queueSize || 0;
          analysis.queue.max = Math.max(analysis.queue.max, analysis.queue.current);
        } else if (event.action === 'dequeued') {
          analysis.queue.totalDequeued++;
          analysis.queue.current = event.queueSize || 0;
        } else if (event.action === 'drop') {
          analysis.queue.dropped++;
          const reason = event.reason || 'unknown';
          analysis.queue.dropReasons[reason] = (analysis.queue.dropReasons[reason] || 0) + 1;
        }
        break;
        
      case 'page':
        if (event.status === 'success') {
          analysis.pages.downloaded++;
          analysis.pages.totalBytes += event.bytesDownloaded || 0;
          
          const status = event.httpStatus || 'unknown';
          analysis.pages.byStatus[status] = (analysis.pages.byStatus[status] || 0) + 1;
          
          const depth = event.depth ?? 'unknown';
          analysis.pages.byDepth[depth] = (analysis.pages.byDepth[depth] || 0) + 1;
          
          analysis.pages.recentPages.push({
            url: event.url,
            bytes: event.bytesDownloaded,
            status: event.httpStatus,
            depth: event.depth,
            durationMs: event.totalMs
          });
          if (analysis.pages.recentPages.length > 20) {
            analysis.pages.recentPages.shift();
          }
        } else {
          analysis.pages.errors++;
        }
        break;
        
      case 'milestone':
        analysis.milestones.push({
          kind: event.kind,
          message: event.message,
          scope: event.scope
        });
        
        // Track decisions from milestones
        if (event.kind && event.message) {
          analysis.decisions.push({
            kind: event.kind,
            message: event.message
          });
          if (analysis.decisions.length > 30) {
            analysis.decisions.shift();
          }
        }
        break;
        
      case 'progress':
        analysis.lastProgress = {
          visited: event.visited,
          downloaded: event.downloaded,
          queueSize: event.queueSize,
          errors: event.errors,
          bytes: event.bytes
        };
        break;
        
      case 'telemetry':
        if (event.severity === 'error') {
          analysis.errors.push({
            event: event.event,
            message: event.message,
            details: event.details
          });
          if (analysis.errors.length > 20) {
            analysis.errors.shift();
          }
        }
        break;
    }
  }
  
  return analysis;
}

// ─────────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[0f');
}

function printHeader(crawlInfo) {
  console.log('\n┌─ 🕷️  Crawl Watch ────────────────────────────────────────────────────┐\n');
  if (crawlInfo) {
    console.log(`   PID: ${crawlInfo.pid}  │  Runtime: ${getProcessRuntime(crawlInfo.startTime)}`);
    console.log(`   ${crawlInfo.command?.substring(0, 70)}...`);
    console.log();
  }
}

function printSummary(analysis) {
  console.log('📊 CURRENT STATUS:');
  const prog = analysis.lastProgress || {};
  console.log(`   Pages: ${prog.downloaded || analysis.pages.downloaded || 0} downloaded, ${prog.errors || analysis.pages.errors || 0} errors`);
  console.log(`   Queue: ${prog.queueSize || analysis.queue.current} pending (max: ${analysis.queue.max})`);
  console.log(`   Data:  ${formatBytes(prog.bytes || analysis.pages.totalBytes)}`);
  console.log();
}

function printQueue(analysis, flags) {
  console.log('📈 QUEUE DYNAMICS:');
  console.log(`   Enqueued: ${analysis.queue.totalEnqueued}  │  Dequeued: ${analysis.queue.totalDequeued}  │  Dropped: ${analysis.queue.dropped}`);
  
  if (Object.keys(analysis.queue.dropReasons).length > 0) {
    console.log('   Drop reasons:');
    Object.entries(analysis.queue.dropReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([reason, count]) => {
        console.log(`      ${reason}: ${count}`);
      });
  }
  console.log();
}

function printPages(analysis, flags) {
  console.log('📄 RECENT PAGES:');
  const recent = analysis.pages.recentPages.slice(-10);
  if (recent.length === 0) {
    console.log('   (no pages yet)');
  } else {
    recent.forEach(p => {
      const urlShort = p.url.length > 50 ? '...' + p.url.slice(-47) : p.url;
      console.log(`   ${p.status} │ ${formatBytes(p.bytes).padStart(8)} │ ${p.durationMs}ms │ ${urlShort}`);
    });
  }
  console.log();
}

function printDecisions(analysis, flags) {
  console.log('🎯 DECISIONS & MILESTONES:');
  const recent = analysis.decisions.slice(-10);
  if (recent.length === 0) {
    console.log('   (no decisions yet)');
  } else {
    recent.forEach(d => {
      console.log(`   [${d.kind}] ${d.message}`);
    });
  }
  console.log();
}

function printErrors(analysis, flags) {
  console.log('⚠️  RECENT ERRORS:');
  if (analysis.errors.length === 0) {
    console.log('   (none)');
  } else {
    analysis.errors.slice(-5).forEach(e => {
      console.log(`   ${e.event}: ${e.message}`);
    });
  }
  console.log();
}

function printFooter(flags) {
  if (flags.follow) {
    console.log('─────────────────────────────────────────────────────────────────────────');
    console.log('Press Ctrl+C to stop watching. Refreshing every ' + (flags.interval / 1000) + 's...');
  }
  console.log('└─────────────────────────────────────────────────────────────────────────┘\n');
}

function displayAnalysis(analysis, crawlInfo, flags) {
  if (flags.json) {
    console.log(JSON.stringify({ crawlInfo, analysis }, null, 2));
    return;
  }
  
  clearScreen();
  printHeader(crawlInfo);
  printSummary(analysis);
  
  if (flags.queue || (!flags.pages && !flags.decisions && !flags.errors)) {
    printQueue(analysis, flags);
  }
  
  if (flags.pages) {
    printPages(analysis, flags);
  }
  
  if (flags.decisions || (!flags.pages && !flags.queue && !flags.errors)) {
    printDecisions(analysis, flags);
  }
  
  if (flags.errors) {
    printErrors(analysis, flags);
  }
  
  printFooter(flags);
}

// ─────────────────────────────────────────────────────────────
// Watch modes
// ─────────────────────────────────────────────────────────────

async function watchLogFile(logPath, flags) {
  let lastSize = 0;
  let events = [];
  
  const crawlProcess = findActiveCrawlProcess();
  
  const poll = () => {
    try {
      const stat = fs.statSync(logPath);
      
      if (stat.size !== lastSize) {
        lastSize = stat.size;
        const content = readLogFile(logPath);
        events = parseLogContent(content);
        const analysis = analyzeEvents(events);
        displayAnalysis(analysis, crawlProcess, flags);
      }
    } catch (err) {
      console.error(`Error reading log: ${err.message}`);
    }
  };
  
  poll(); // Initial read
  
  if (flags.follow) {
    setInterval(poll, flags.interval);
    
    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\nStopped watching.');
      process.exit(0);
    });
  }
}

async function watchTaskEvents(taskId, flags) {
  if (!fs.existsSync(flags.db)) {
    console.error(`Database not found: ${flags.db}`);
    process.exit(1);
  }
  
  const db = new Database(flags.db, { readonly: true });
  
  const poll = () => {
    try {
      const events = db.prepare(`
        SELECT event_type, severity, message, scope, details, created_at
        FROM task_events
        WHERE task_id = ?
        ORDER BY seq ASC
        LIMIT ?
      `).all(taskId, flags.limit);
      
      // Convert DB events to our internal format
      const parsedEvents = events.map(e => {
        const details = e.details ? JSON.parse(e.details) : {};
        return {
          type: mapEventType(e.event_type),
          ...details,
          message: e.message,
          scope: e.scope
        };
      });
      
      const analysis = analyzeEvents(parsedEvents);
      displayAnalysis(analysis, { taskId }, flags);
    } catch (err) {
      console.error(`Error querying DB: ${err.message}`);
    }
  };
  
  poll();
  
  if (flags.follow) {
    setInterval(poll, flags.interval);
    
    process.on('SIGINT', () => {
      db.close();
      console.log('\nStopped watching.');
      process.exit(0);
    });
  } else {
    db.close();
  }
}

function mapEventType(dbEventType) {
  // Map DB event types to our internal types
  if (dbEventType.includes('queue')) return 'queue';
  if (dbEventType.includes('page') || dbEventType.includes('fetch')) return 'page';
  if (dbEventType.includes('milestone')) return 'milestone';
  if (dbEventType.includes('progress')) return 'progress';
  return 'telemetry';
}

// ─────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
crawl-watch.js — Live crawl monitoring CLI

USAGE:
  node tools/dev/crawl-watch.js                     # Auto-detect active crawl
  node tools/dev/crawl-watch.js --log <file>        # Watch log file
  node tools/dev/crawl-watch.js --task-id <id>      # Watch via task_events DB
  node tools/dev/crawl-watch.js --pid <pid>         # Focus on specific PID

DISPLAY OPTIONS:
  --pages, -p        Show recent page downloads
  --queue, -q        Show queue dynamics
  --decisions, -d    Show decision milestones
  --errors, -e       Show recent errors
  --summary, -s      Summary only

CONTROL OPTIONS:
  --no-follow        Don't continuously poll (one-shot)
  --interval <ms>    Poll interval (default: 2000)
  --limit <n>        Max events to process
  --json             Output as JSON
  --db <path>        Database path (for task-id mode)
  -h, --help         Show this help

EXAMPLES:
  # Watch a log file in real-time
  node tools/dev/crawl-watch.js --log tmp/crawl.log

  # Focus on recent page downloads
  node tools/dev/crawl-watch.js --log tmp/crawl.log --pages

  # One-shot summary
  node tools/dev/crawl-watch.js --log tmp/crawl.log --no-follow --summary
`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  
  if (flags.help) {
    printHelp();
    process.exit(0);
  }
  
  // Determine watch mode
  if (flags.logFile) {
    if (!fs.existsSync(flags.logFile)) {
      console.error(`Log file not found: ${flags.logFile}`);
      process.exit(1);
    }
    await watchLogFile(flags.logFile, flags);
  } else if (flags.taskId) {
    await watchTaskEvents(flags.taskId, flags);
  } else {
    // Try to auto-detect active crawl and find its log
    const crawlProcess = findActiveCrawlProcess();
    
    if (!crawlProcess) {
      console.log('No active crawl detected.');
      console.log('\nUsage: node tools/dev/crawl-watch.js --log <file>');
      console.log('       node tools/dev/crawl-watch.js --task-id <id>');
      process.exit(1);
    }
    
    console.log(`Found active crawl: PID ${crawlProcess.pid}`);
    console.log(`Command: ${crawlProcess.command?.substring(0, 80)}...`);
    console.log('\nTo watch this crawl, pipe its output to a log file:');
    console.log('  node crawl.js ... 2>&1 | Tee-Object -FilePath tmp/crawl.log');
    console.log('\nThen run:');
    console.log('  node tools/dev/crawl-watch.js --log tmp/crawl.log');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
