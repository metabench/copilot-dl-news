# Chapter 5: The Daemon in Detail

> **Implementation Status**: ✅ Fully implemented. The console filter and job registry are production-ready.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Daemon CLI | `tools/dev/crawl-daemon.js` | ✅ Complete |
| Daemon core | `src/cli/crawl/daemon.js` | ✅ Complete |
| Console filter | `src/cli/crawl/daemon.js` (lines 1-100) | ✅ 40+ patterns |
| Job registry | `src/cli/crawl/daemon.js` | ✅ In-process |
| API routes | `src/server/crawl-api/` | ✅ Complete |
| PID management | `tmp/crawl-daemon.pid` | ✅ Automatic |
| Log output | `tmp/crawl-daemon.log` | ✅ Automatic |

## Purpose

The crawl daemon serves as the **AI-agent-friendly** interface for background crawl operations:

- **Detached execution** — Survives terminal close
- **HTTP API** — Programmatic control from any client
- **Quiet operation** — Minimal noise, clean logs
- **Job tracking** — Status, progress, stop/start

---

## Starting the Daemon

### From CLI

```powershell
# Start in background
node tools/dev/crawl-daemon.js start

# Check status
node tools/dev/crawl-daemon.js status

# Stop daemon
node tools/dev/crawl-daemon.js stop

# Restart
node tools/dev/crawl-daemon.js restart
```

### What Happens on Start

```
1. Check if already running (read PID file)
2. Spawn detached child process
3. Child writes PID to tmp/crawl-daemon.pid
4. Child redirects stdout/stderr to tmp/crawl-daemon.log
5. Parent exits (terminal free)
6. Child initializes Express server on port 3099
7. Server ready, accepting requests
```

### Process Tree

```
[Terminal]
    └── node crawl-daemon.js start
            │
            └── spawn (detached) ──▶ [Background]
                                          │
                                          └── node daemon.js
                                                  │
                                                  └── Express :3099
```

---

## Configuration

### Port Selection

```javascript
// Default port
const DEFAULT_PORT = 3099;

// Override via environment
const port = process.env.CRAWL_DAEMON_PORT || DEFAULT_PORT;

// Override via config
const config = require('./crawl-daemon.config.json');
const port = config.port || DEFAULT_PORT;
```

### Quiet Mode Settings

```javascript
const daemonConfig = {
  // Suppress most console output
  outputVerbosity: 'silent',
  
  // Only emit lifecycle events
  eventFilter: ['LIFECYCLE', 'ERROR', 'MILESTONE'],
  
  // Log file for everything else
  logFile: 'tmp/crawl-daemon.log'
};
```

---

## Console Filter Deep Dive

### The Problem

Many modules write directly to `console.log`:
- `createCliLogger()` uses chalk + console.log
- Third-party libs log debug info
- Event handlers log noise

### The Solution: Early Interception

```javascript
// MUST be at the very top of daemon.js, before any requires

//─────────────────────────────────────────────────────────────────
// EARLY CONSOLE FILTER
// Intercepts console.log/info before any module loads
//─────────────────────────────────────────────────────────────────

const _daemonBlockPatterns = [
  // Queue noise
  /^\s*QUEUE\s*│/i,
  /queued|dequeued|dropped/i,
  
  // Progress noise
  /^\s*PROGRESS\s*│/i,
  /pages visited/i,
  
  // Telemetry noise
  /TELEMETRY\s*│/i,
  /memory usage/i,
  
  // Fetch noise
  /Fetching:/i,
  /Downloaded:/i,
  
  // Startup noise
  /Enhanced features enabled/i,
  /Enhanced database adapter/i,
  /Priority scorer/i,
  
  // Completion noise
  /Crawl completed$/i,
  /Exit reason:/i,
  
  // ... more patterns
];

const _daemonAllowPatterns = [
  /^\[daemon\]/i,
  /^\[INFO\]\s*\[CrawlOperations\]/i,
  /^\[ERROR\]/i,
];

function _stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function _shouldDaemonBlock(msg) {
  const clean = _stripAnsi(msg);
  
  // Always allow logger prefixes
  if (_daemonAllowPatterns.some(p => p.test(clean))) {
    return false;
  }
  
  // Block matching patterns
  return _daemonBlockPatterns.some(p => p.test(clean));
}

function _shouldDaemonBlockAny(...args) {
  return args.some(a => _shouldDaemonBlock(String(a)));
}

const _origConsoleLog = console.log;
const _origConsoleInfo = console.info;

console.log = function (...args) {
  if (!_shouldDaemonBlockAny(...args)) {
    _origConsoleLog.apply(console, args);
  }
};

console.info = function (...args) {
  if (!_shouldDaemonBlockAny(...args)) {
    _origConsoleInfo.apply(console, args);
  }
};

//─────────────────────────────────────────────────────────────────
// END EARLY CONSOLE FILTER
//─────────────────────────────────────────────────────────────────

// Now safe to require modules
const express = require('express');
// ...
```

### Why ANSI Stripping?

Chalk and other libraries embed ANSI escape codes:

```
Raw:    \x1b[32m✓\x1b[0m Crawl completed
Regex:  /Crawl completed$/
Result: NO MATCH (escape codes in the way)

After strip:
Clean:  ✓ Crawl completed
Regex:  /Crawl completed$/
Result: MATCH
```

### Why Check All Arguments?

Some code uses multi-argument console.log:

```javascript
// In progressReporter.js
console.log(chalk.green('✓'), 'Crawl completed');
// args[0] = "✓"
// args[1] = "Crawl completed"
```

Single-arg check would miss this. Check ALL args:

```javascript
function _shouldDaemonBlockAny(...args) {
  return args.some(a => _shouldDaemonBlock(String(a)));
}
```

---

## Job Registry

### InProcessCrawlJobRegistry

Tracks all active and recent jobs:

```javascript
class InProcessCrawlJobRegistry {
  constructor() {
    this.jobs = new Map();
    this.maxHistory = 100;
  }
  
  createJob(operation, seedUrl, options) {
    const jobId = `job-${Date.now()}-${randomId()}`;
    const job = {
      jobId,
      operation,
      seedUrl,
      options,
      status: 'starting',
      createdAt: new Date(),
      progress: { pages: 0, bytes: 0 }
    };
    this.jobs.set(jobId, job);
    return job;
  }
  
  updateProgress(jobId, progress) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = { ...job.progress, ...progress };
      job.updatedAt = new Date();
    }
  }
  
  completeJob(jobId, exitReason) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.exitReason = exitReason;
      job.completedAt = new Date();
    }
  }
}
```

### Job States

```
┌──────────┐    start()    ┌─────────┐    events    ┌─────────┐
│ starting │──────────────▶│ running │─────────────▶│completed│
└──────────┘               └─────────┘              └─────────┘
      │                         │
      │ error                   │ stop()
      ▼                         ▼
┌──────────┐               ┌─────────┐
│  failed  │               │ stopped │
└──────────┘               └─────────┘
```

---

## Express Server Setup

```javascript
const express = require('express');
const { CrawlOperations } = require('../../server/crawl-api');

async function startDaemonServer(port = 3099) {
  const app = express();
  app.use(express.json());
  
  const registry = new InProcessCrawlJobRegistry();
  const operations = new CrawlOperations(registry);
  
  // Mount API routes
  app.use('/api/v1', operations.router);
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });
  
  // Start server
  const server = app.listen(port, () => {
    console.log(`[daemon] Listening on port ${port}`);
    writePidFile(process.pid);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[daemon] Shutting down...');
    server.close(() => {
      removePidFile();
      process.exit(0);
    });
  });
}
```

---

## Logging

### Log File Format

```
2026-01-05T10:00:00.000Z [INFO] [daemon] Starting on port 3099
2026-01-05T10:00:01.234Z [INFO] [CrawlOperations] Job job-123 started
2026-01-05T10:05:23.456Z [INFO] [CrawlOperations] Job job-123 completed: maxPages
2026-01-05T10:10:00.000Z [INFO] [daemon] Shutdown requested
```

### Reading Logs

```powershell
# Tail the log
Get-Content tmp/crawl-daemon.log -Tail 50 -Wait

# Search for errors
Select-String -Path tmp/crawl-daemon.log -Pattern "ERROR"

# Filter by job
Select-String -Path tmp/crawl-daemon.log -Pattern "job-123"
```

---

## Troubleshooting

### Daemon Won't Start

```powershell
# Check if already running
node tools/dev/crawl-daemon.js status

# Force cleanup
Remove-Item tmp/crawl-daemon.pid -ErrorAction SilentlyContinue
Stop-Process -Name node -Force  # Careful!

# Try again
node tools/dev/crawl-daemon.js start
```

### Port Already in Use

```powershell
# Find process on port
netstat -ano | findstr :3099

# Kill by PID
Stop-Process -Id <PID>

# Or use different port
$env:CRAWL_DAEMON_PORT = 3100
node tools/dev/crawl-daemon.js start
```

### Logs Not Appearing

1. Check log file exists: `Test-Path tmp/crawl-daemon.log`
2. Check console filter isn't too aggressive
3. Add pattern to allow list if needed

---

## Integration with AI Agents

### Starting a Crawl (JSON workflow)

```powershell
# 1. Check daemon status
node tools/dev/crawl-api.js status --json

# 2. Start a job
node tools/dev/crawl-api.js jobs start siteExplorer https://example.com --max-pages 50 --json

# 3. Monitor progress
node tools/dev/crawl-api.js jobs get <jobId> --json

# 4. Check completion
node tools/dev/crawl-api.js jobs get <jobId> --json
```

### Agent Decision Flow

```
Agent checks daemon status
        │
        ▼
┌───────────────────┐
│ Daemon running?   │
└───────────────────┘
    │yes         │no
    ▼            ▼
Continue    Start daemon
    │            │
    └─────┬──────┘
          ▼
   Submit crawl job
          │
          ▼
   Poll for completion
          │
          ▼
   Trigger analysis
```

---

## Next Chapter

[Chapter 6: Crawl Operations →](06-crawl-operations.md)
