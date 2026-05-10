# Crawl, DB & Telemetry Tooling

## Crawl Daemon & API — Background Crawl Control for AI Agents

For long-running crawls that need to be controlled programmatically, use the daemon-based architecture:

### Quick Start (AI Agent Workflow)

```powershell
# 1. Start the daemon (runs in background)
node tools/dev/crawl-daemon.js start

# 2. Start a crawl job
node tools/dev/crawl-api.js jobs start siteExplorer https://bbc.com -n 100 --json

# 3. Monitor progress
node tools/dev/crawl-api.js jobs get <jobId> --json
node tools/dev/crawl-live.js --task <taskId> --json

# 4. Stop if needed
node tools/dev/crawl-api.js jobs stop <jobId>

# 5. Stop the daemon when done
node tools/dev/crawl-daemon.js stop
```

### `crawl-daemon` — Background Daemon Management

```powershell
node tools/dev/crawl-daemon.js start           # Start in background
node tools/dev/crawl-daemon.js stop            # Stop daemon
node tools/dev/crawl-daemon.js status          # Check status (--json for AI)
node tools/dev/crawl-daemon.js restart         # Restart daemon
```

The daemon:
- Runs detached from the terminal
- Exposes HTTP API on port 3099 (configurable)
- Logs to `tmp/crawl-daemon.log`
- Manages PID in `tmp/crawl-daemon.pid`

### `crawl-api` — HTTP API Client for AI Agents

```powershell
# Daemon status
node tools/dev/crawl-api.js status --json

# List available operations
node tools/dev/crawl-api.js ops list --json

# Job management
node tools/dev/crawl-api.js jobs list --json
node tools/dev/crawl-api.js jobs start <operation> <url> [--max-pages N] --json
node tools/dev/crawl-api.js jobs get <jobId> --json
node tools/dev/crawl-api.js jobs stop <jobId>
node tools/dev/crawl-api.js jobs pause <jobId>
node tools/dev/crawl-api.js jobs resume <jobId>
```

All commands support `--json` for machine-readable output.

---


## `mini-crawl` — Quick Test Crawls

For quick test crawls (attached to terminal), use mini-crawl directly:

```powershell
# Basic crawl (terse output)
node tools/dev/mini-crawl.js https://example.com

# Site explorer operation
node tools/dev/mini-crawl.js https://bbc.com -o siteExplorer -n 50

# Quiet mode (use crawl-live.js to monitor)
node tools/dev/mini-crawl.js https://example.com -n 100 -q &
node tools/dev/crawl-live.js --last 10
```

Options:
- `-o, --operation <name>` — Crawl operation (default: basicArticleCrawl)
- `-n, --max-pages <n>` — Max pages (default: 3)
- `-d, --downloads-only` — Show only PAGE events
- `--terse` — Hide QUEUE/PROGRESS noise
- `-q, --quiet` — Suppress stdout (monitor with crawl-live.js)
- `--json` — JSON output

---

## `crawl-live` - Local Crawl Throughput Monitor

`crawl-live` watches the `task_events` table for the latest local crawl (or a specific task ID) and reports live throughput in the units operators need while a crawl is running.

```powershell
# Start a quiet local crawl in one terminal
node tools/dev/mini-crawl.js https://www.bbc.com/news -o siteExplorer -n 500 -q

# Watch downloaded/saved docs per second and MB/s in another terminal
node tools/dev/crawl-live.js --latest --metrics

# One-shot JSON snapshot for agents or scripts
node tools/dev/crawl-live.js --latest --metrics --json --no-follow
```

Metrics include:
- 5s, 1m, and lifetime downloaded docs/sec
- 5s, 1m, and lifetime saved docs/sec
- 5s, 1m, and lifetime network MB/s
- 5s, 1m, and lifetime saved MB/s
- totals, queue, ETA, average page size, average fetch duration, and stall detection

Artifacts are written by default under `tmp/crawl-runs/<taskId>/`:
- `metrics.ndjson` - append-only throughput snapshots
- `summary.json` - latest progress, totals, recent downloads, and current window metrics

Options:
- `--task <id>` or `--latest` - Select the crawl task
- `--window <duration>` - Add a custom rolling window such as `10s` or `5m`
- `--artifacts <dir>` - Change the artifact root
- `--no-artifacts` - Disable artifact writes

---

## `db-downloads` — Download Evidence & Statistics CLI

`db-downloads` queries the database for download evidence, statistics, and timeline data. Uses the `src/db/queries/downloadEvidence.js` module for verified download queries.

**Quick Examples:**
```powershell
# Show recent downloads (default: 25)
node tools/dev/db-downloads.js --recent 50

# Today's download statistics with hourly breakdown
node tools/dev/db-downloads.js --today

# Global statistics (all-time)
node tools/dev/db-downloads.js --stats

# Downloads by host
node tools/dev/db-downloads.js --hosts --limit 10

# Downloads since a specific time
node tools/dev/db-downloads.js --since "2026-01-03T00:00:00" --until "2026-01-03T04:00:00"

# Download timeline (grouped by minute)
node tools/dev/db-downloads.js --timeline --since "2026-01-03T03:00:00"

# Get evidence for a specific URL
node tools/dev/db-downloads.js --url "https://www.theguardian.com/sport/article"

# Verify a claimed download count
node tools/dev/db-downloads.js --verify 50 --since "2026-01-03T03:00:00"

# JSON output for automation
node tools/dev/db-downloads.js --stats --json
node tools/dev/db-downloads.js --recent 10 --json
```

**Commands:**
- `--recent [n]` — Show n most recent downloads (default: 25)
- `--today` — Today's download statistics with hourly breakdown
- `--stats` — Global download statistics (all-time)
- `--hosts` — Download counts by host
- `--since <time>` — Downloads since ISO timestamp
- `--until <time>` — Combined with --since for time range
- `--timeline` — Download timeline (grouped by minute)
- `--url <url>` — Get evidence for a specific URL
- `--verify <n>` — Verify claimed download count against DB

**Options:**
- `--limit, -l <n>` — Limit results (default: 25)
- `--json, -j` — Output as JSON
- `--help, -h` — Show help

**npm Scripts:**
```powershell
npm run db:downloads          # Default: recent 25
npm run db:downloads:recent   # Recent 25 downloads
npm run db:downloads:today    # Today's statistics
npm run db:downloads:stats    # Global statistics
npm run db:downloads:hosts    # By-host breakdown
```


## `task-events` — Crawl & Task Event Query Tool

`task-events` queries the `task_events` table for crawl telemetry, background task events, and other long-running operations. Designed for AI agents to analyze crawl behavior without parsing logs.

**Quick Examples:**
```powershell
# List all tasks (crawls, background jobs)
node tools/dev/task-events.js --list
node tools/dev/task-events.js --list --type crawl

# Get events for a specific task
node tools/dev/task-events.js --get crawl-2025-01-01-001
node tools/dev/task-events.js --get crawl-2025-01-01-001 --severity error

# Get summary statistics
node tools/dev/task-events.js --summary crawl-2025-01-01-001

# Find problems (errors + warnings)
node tools/dev/task-events.js --problems crawl-2025-01-01-001

# Get lifecycle timeline
node tools/dev/task-events.js --timeline crawl-2025-01-01-001

# Search across all events
node tools/dev/task-events.js --search example.com
node tools/dev/task-events.js --search "rate limit" --type crawl

# Storage statistics
node tools/dev/task-events.js --stats

# Prune old events (dry-run first)
node tools/dev/task-events.js --prune 30
node tools/dev/task-events.js --prune 30 --fix

# JSON output for automation
node tools/dev/task-events.js --list --json
node tools/dev/task-events.js --summary crawl-001 --json
```

**Filters:**
- `--type <type>` — Filter by task type (crawl, analysis, compression)
- `--category <cat>` — Filter by event category (lifecycle, work, error, metric)
- `--severity <sev>` — Filter by severity (info, warn, error)
- `--scope <scope>` — Filter by scope (domain:example.com, phase:discovery)
- `--since-seq <n>` — Pagination cursor (get events after sequence N)
- `--limit <n>` — Max results (default: 50)

**Chinese Aliases:**
- `--列` (list), `--取` (get), `--简` (summary), `--错` (problems), `--线` (timeline), `--搜` (search), `--统` (stats), `--清` (prune)

**Use Cases for AI Agents:**
1. **Crawl debugging**: Find why a crawl failed with `--problems`
2. **Performance analysis**: Check per-domain timing in `--summary` output
3. **Pattern detection**: Search for recurring errors across crawls
4. **Cleanup**: Prune old events to keep database lean


## `mini-crawl` — Small Test Crawl with Event Logging

`mini-crawl` runs a small test crawl with full event persistence to `task_events`, enabling detailed post-crawl analysis.

**Quick Examples:**
```powershell
# Crawl a single page (up to 3 pages by default)
node tools/dev/mini-crawl.js https://example.com

# Crawl up to 10 pages
node tools/dev/mini-crawl.js https://example.com --max-pages 10

# Use a specific operation
node tools/dev/mini-crawl.js https://example.com --operation discovery

# List available operations
node tools/dev/mini-crawl.js --list-operations

# Verbose output
node tools/dev/mini-crawl.js https://example.com -v
```

**Workflow:**
1. Run a mini-crawl: `node tools/dev/mini-crawl.js https://example.com`
2. Note the job ID printed at completion
3. Analyze: `node tools/dev/task-events.js --summary <jobId>`
4. Debug problems: `node tools/dev/task-events.js --problems <jobId>`
5. View in UI: `npm run ui:crawl-observer` → http://localhost:3007

**Options:**
- `--operation <name>` — Crawl operation (default: quickDiscovery)
- `--max-pages <n>` — Max pages to fetch (default: 3)
- `--max-depth <n>` — Max link depth (default: 1)
- `--timeout <ms>` — Timeout in ms (default: 30000)
- `-v, --verbose` — Verbose logging
- `--json` — Output results as JSON


## `crawl-status` — Crawl Session Status

`crawl-status` provides a unified view of active and recent crawls by combining process detection, evidence files, and log analysis.

**Quick Examples:**
```powershell
# Show overview of crawl activity
node tools/dev/crawl-status.js

# JSON output for automation
node tools/dev/crawl-status.js --json

# Focus on active crawls
node tools/dev/crawl-status.js --active

# Show recent evidence files
node tools/dev/crawl-status.js --evidence

# Analyze recent log files
node tools/dev/crawl-status.js --logs

# Show last N evidence files
node tools/dev/crawl-status.js --recent 5
```

**What it shows:**
- 🔄 Active crawl processes (PID, runtime, command)
- 📊 Recent evidence files with page counts, bytes, and exit reasons
- ✅/❌ Success/failure indicators


## `crawl-log-parse` — Deep Crawl Log Analysis

`crawl-log-parse` analyzes crawl log files to extract detailed metrics about queue dynamics, page fetches, milestones, and errors.

**Quick Examples:**
```powershell
# Analyze a crawl log file
node tools/dev/crawl-log-parse.js tmp/crawl.log

# JSON output for automation
node tools/dev/crawl-log-parse.js tmp/crawl.log --json

# Focus on queue dynamics
node tools/dev/crawl-log-parse.js tmp/crawl.log --queue

# Focus on errors
node tools/dev/crawl-log-parse.js tmp/crawl.log --errors

# Show milestone timeline
node tools/dev/crawl-log-parse.js tmp/crawl.log --timeline

# Limit results
node tools/dev/crawl-log-parse.js tmp/crawl.log --errors --limit=20
```

**Metrics extracted:**
- **Queue dynamics**: enqueued/dequeued/dropped counts, max size, drop reasons
- **Page metrics**: success/error counts, bytes downloaded, avg duration, HTTP status breakdown
- **Timeline**: milestone events in chronological order
- **Errors**: detected error messages with line numbers

**Encoding support:** Automatically handles UTF-8 and UTF-16 LE (common from PowerShell `Tee-Object`).


## `hub-discover-indices` — Hub-of-Hubs Indexer

`hub-discover-indices` crawls a "Table of Contents" or "Index" page (like `/world/all` or `/topics`) to discover potential place hubs (Depth 2 pages like `/world/france`).

**Quick Examples:**
```powershell
# Crawl the Guardian's World Index
node tools/dev/hub-discover-indices.js https://www.theguardian.com/world/all

# Output as JSON
node tools/dev/hub-discover-indices.js https://www.theguardian.com/world/all --json
```

**Features:**
- **Depth Analysis**: Identifies path depth relative to the seed (e.g., `/world/france` vs `/world/france/2023/...`)
- **Noise Filtering**: Excludes dated paths and deep articles
- **Structure Grouping**: Groups results by parent folder (e.g. `/world/`, `/news/`)

