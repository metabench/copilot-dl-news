# Agent Guide: `tools/crawl/` — Crawl Diagnostic Instruments

> **Read this file first** when running diagnostics or investigating crawl issues.

---

## ⚡ SYNC-FIRST CRAWLING (Default Approach)

**Every crawl must include automatic sync to local `data/news.db`.**

The remote fleet (30 CrawlWorker nodes on Oracle VM at 144.21.35.104) produces data continuously. The local machine must pull that data automatically so the local DB stays current. **Never run a remote crawl without a sync pipeline.**

### Quick Start (One Command)

```bash
# Full crawl+sync: scan fleet → start idle → restart fatal → continuous sync
npm run fleet:crawl-sync

# Sync only (crawlers already running remotely)
npm run fleet:sync

# One-shot pull (no continuous polling)
npm run fleet:sync:quick

# Background daemon (recommended when an agent should continue other work)
npm run fleet:crawl:bg:start
npm run fleet:crawl:bg:status
```

### New Session Hand-off Recipe (Background + Rapid Local Population)

Use this exact sequence in a fresh session to avoid ambiguity:

```bash
# 1) Start background crawl+sync daemon (poll every 5s)
npm run fleet:crawl:bg:start

# 2) Confirm daemon is alive
npm run fleet:crawl:bg:status

# 3) Confirm fleet activity (fast snapshot + live check)
npm run fleet:running
npm run fleet:health

# 4) Confirm local DB is receiving rows
npm run db:downloads:recent
npm run db:downloads:stats

# 5) Stop when done
npm run fleet:crawl:bg:stop
```

Daemon files:
- PID: `tmp/fleet-crawl-sync-daemon.pid`
- Log: `tmp/fleet-crawl-sync-daemon.log`

If crawlers are already running remotely and you only want sync, use:

```bash
npm run fleet:crawl:bg:start:sync-only
```

### What `fleet:crawl-sync` Does

1. **Pre-flight**: Checks local `data/news.db` exists and shows baseline counts
2. **Fleet scan**: HTTP health check on all 30 nodes (ports 3300-3329)
3. **Start idle crawlers**: Seeds + starts any stopped/idle crawlers
4. **Restart fatal crawlers**: Attempts API reset-fatal on crashed nodes
5. **Continuous sync**: Polls remote `/api/export/batch` endpoints every 30s, ingests URLs + HTTP responses + content blobs + links into local DB

### Fleet NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run fleet:crawl-sync` | `fleet-crawl-sync.js --verbose` | Full crawl+sync (start + sync) |
| `npm run fleet:sync` | `fleet-crawl-sync.js --sync-only --verbose` | Sync only (don't touch crawlers) |
| `npm run fleet:sync:quick` | `batch-sync.js --all-nodes --window 3600 --verbose --max-polls 1` | One-shot pull from all nodes |
| `npm run fleet:health` | `fleet-cli.js health` | Fleet health scan |
| `npm run fleet:running` | `fleet-cli.js running` | Instant yes/no from local snapshot (<1s) |
| `npm run fleet:overview` | `fleet-cli.js overview` | Instant rich ops summary from local snapshot (<1s) |
| `npm run fleet:reliable` | `fleet-cli.js reliable` | Instant reliability ranking: which websites are currently crawlable |
| `node tools/crawl/fleet-cli.js freshness` | `fleet-cli.js freshness` | Diagnose why local crawl data is fresh or stale |
| `npm run fleet:question -- --q "..."` | `fleet-cli.js question --q "..."` | Deterministic question routing (no AI) |
| `npm run fleet:benchmark` | `fleet-cli.js benchmark` | Bounded benchmark run via unified fleet CLI |
| `npm run fleet:benchmark:matrix` | `fleet-cli.js benchmark matrix` | Deterministic benchmark profile matrix via unified fleet CLI |
| `npm run fleet:endpoints` | `fleet-endpoint-intel.js --target both --json` | Concise endpoint capability probe (local + remote) |
| `npm run fleet:endpoints:local` | `fleet-endpoint-intel.js --target local --json` | Local endpoint technical profile |
| `npm run fleet:endpoints:remote` | `fleet-endpoint-intel.js --target remote --json` | Remote endpoint technical profile |
| `npm run fleet:status` | `fleet-cli.js status` | Fleet status via SSH/PM2 |
| `node tools/crawl/crawl-remote.js bounded --domains ... --max-pages 50` | `crawl-remote.js bounded` | Start a bounded remote crawl and wait for all requested domains to finish |

### Instant answers policy (sub-second)

When the user asks fast operational questions like **"are any crawler processes still running?"**, use the local-snapshot fast path first:

```bash
node tools/crawl/fleet-cli.js running
node tools/crawl/fleet-cli.js running --json
node tools/crawl/fleet-cli.js overview --json
node tools/crawl/fleet-cli.js reliable --json
node tools/crawl/fleet-cli.js freshness --json
node tools/crawl/fleet-cli.js benchmark --profile quick --count 8 --benchmark-runs 1 --json
node tools/crawl/fleet-cli.js benchmark matrix --runs 3 --run-timeout-ms 12000 --timeout-ms 2500 --json
node tools/crawl/fleet-cli.js reliable --json --min-done=150 --min-stored=100
node tools/crawl/fleet-cli.js question --q "are any crawlers still running?"
node tools/crawl/fleet-cli.js question --q "why is local data stale?" --explain
node tools/crawl/fleet-cli.js question --q "Which websites can we reliably crawl?" --explain
node tools/crawl/fleet-cli.js question --q "why so much backlog?" --explain
node tools/crawl/fleet-cli.js question --list-rules --json
```

- `running` is designed for near-instant answers from `tools/crawl/.fleet-health-snapshot.json`.
- `reliable` is designed for near-instant evidence-based crawlability ranking from the same snapshot (with optional refresh), and supports sample-size gates via `--min-done` / `--min-stored` so sites are not marked reliable too early.
- `freshness` is the fast stale-data triage path: it combines local DB recency, sync-daemon state, cached fleet health, and remote PM2 inspection when every endpoint is dark.
- Refresh snapshot with `node tools/crawl/fleet-cli.js health` when snapshot is stale, missing, or when strict real-time accuracy is required.
- Use `--max-age=<seconds>` on `running` to enforce freshness requirements.

Decision rule:
- **Fast question / operator check** → `fleet-cli running`
- **Fast richer triage question** (top pending, fatal reasons, rate-limited domains) → `fleet-cli overview`
- **Fast reliability question** (“which sites can we reliably crawl?”) → `fleet-cli reliable`
- **Fast stale-data question** (“why is local data stale?” / “are downloads fresh?”) → `fleet-cli freshness`
- **Endpoint capability question** (what endpoints exist / what do they return / local vs remote) → `fleet-endpoint-intel.js`
- **Authoritative live state / incident triage** → `fleet-cli health`

### Bounded remote crawl recipe

When you need a small remote-only crawl that should just run and finish without manual polling:

```bash
node tools/crawl/crawl-remote.js bounded --domains bbc.com,reuters.com,apnews.com --max-pages 50 --poll 5 --timeout-min 30
```

- This command starts the requested remote domains on the multi-domain server, waits until every requested domain has either completed or timed out, and exits with a clear success/failure signal.
- Use `--json` for machine-readable progress/final summary.
- Keep the sync daemon running separately when you also want automatic local import + remote retention.

Endpoint intelligence workflow (AI-first):

```bash
node tools/crawl/fleet-endpoint-intel.js --target both --json
node tools/crawl/fleet-endpoint-intel.js --target local --deep --json
node tools/crawl/fleet-endpoint-intel.js --target remote --include-controls --json
```

- Default behavior is read-focused and safe (control endpoints are listed but skipped unless `--include-controls`).
- Use `--deep` to probe expensive endpoints (SSE/export) only when needed.
- Use JSON output for concise agent reasoning and answer composition.

### CLI evolution policy (mandatory)

Agents are expected to improve CLI tooling proactively when recurring questions are slow to answer.

- You may **modify existing commands** (e.g., `fleet-cli health`) to emit/cache data needed by instant workflows.
- You may **add new commands/flags/scripts** when they reduce repeated diagnosis latency.
- Keep commands machine-friendly (`--json`), deterministic, and safe by default.
- Prefer local snapshot/summary commands for repetitive high-frequency questions, with clear fallback to live scans.
- After adding commands, update `tools/crawl/AGENT.md`, command help in the CLI, and the active session notes.

### Sync Architecture

```
Remote VM (144.21.35.104)          Local Machine
┌─────────────────────┐           ┌──────────────────┐
│ 30 CrawlWorker nodes│──batch──→ │ batch-sync.js    │
│ (ports 3300-3329)   │  export   │ (polls every Ns) │
│                     │  (gzip)   │       │          │
│ Fleet Dashboard     │           │       ▼          │
│ (port 3350)         │           │  data/news.db    │
└─────────────────────┘           └──────────────────┘
```

**Data flow**: Crawler discovers URLs → fetches pages → stores content → export API serves gzip batches → batch-sync.js pulls + decompresses → sync-ingest.js writes to local DB (with SHA256 dedup)

### SSH Configuration

The fleet-cli uses SSH to manage PM2 processes. Required config:
- SSH alias: `oracle-worker` (defined in `~/.ssh/config`)
- Key: `~/.ssh/ssh-key-2025-11-11.key`
- User: `ubuntu@144.21.35.104`
- Remote PM2: `/usr/local/bin/pm2`
- Remote Node: `/usr/local/bin/node`

### Key Files

| File | Purpose |
|------|---------|
| `fleet-crawl-sync.js` | **Unified crawl+sync launcher** (scan → start → sync) |
| `batch-sync.js` | **Continuous polling sync** with watermark persistence |
| `lib/sync-ingest.js` | **Shared ingestion functions** (URLs, HTTP responses, content, links) |
| `fleet-cli.js` | **Fleet management CLI** (health, status, start, stop, restart, seed, sync, deploy) |
| `.batch-sync-watermarks.json` | Persistent per-node watermarks for incremental sync |
| `../../tools/crawl-monitor/fleet.json` | Fleet config (30 domains, ports, seed URLs) |

---

## What This Directory Contains

Six purpose-built CLI diagnostic tools for investigating crawl system health, plus utility scripts for sync, migration, and remediation.

---

## The 6 Diagnostic Instruments

| Tool | Command | Purpose | Key Flags |
|------|---------|---------|-----------|
| **crawl-health** | `node tools/crawl/crawl-health.js` | Overall health score (0–100), component scores, alerts | `--json` |
| **crawl-verify** | `node tools/crawl/crawl-verify.js --url <url>` | Per-URL pipeline trace (every stage) | `--url`, `--json` |
| **crawl-pipeline** | `node tools/crawl/crawl-pipeline.js` | Aggregate pipeline analytics (save rates, error rates) | `--json` |
| **crawl-run-report** | `node tools/crawl/crawl-run-report.js` | Per-run detailed analysis | `--run-id N`, `--json` |
| **crawl-errors** | `node tools/crawl/crawl-errors.js` | Error trend analysis across time | `--json` |
| **crawl-fix** | `node tools/crawl/crawl-fix.js` | Safe stuck-run remediation | `--confirm` (dry-run by default) |

---

## The Diagnostic Protocol (Mandatory Workflow)

When investigating any crawl issue, follow this sequence:

```
STEP 1: BASELINE
  node tools/crawl/crawl-health.js --json
  → Record health score, component scores, alerts

STEP 2: TRIAGE
  node tools/crawl/crawl-pipeline.js --json
  → Identify which pipeline stage is failing

STEP 3: ZOOM IN
  node tools/crawl/crawl-errors.js --json
  → Error patterns, temporal trends

STEP 4: TRACE
  node tools/crawl/crawl-verify.js --url <affected-url>
  → Follow one URL through every pipeline stage

STEP 5: ROOT CAUSE
  Read source code at identified failure point
  → Confirm hypothesis with code evidence

STEP 6: FIX
  Implement or delegate to specialist agent

STEP 7: VERIFY
  Re-run Step 1 baseline diagnostics
  → Confirm health score improved
```

## Continuous crawl operations

If you are running crawls while also improving the crawler/UX/robustness, follow:
[docs/workflows/continuous-crawl-repair-loop.md](../../docs/workflows/continuous-crawl-repair-loop.md)

## Evidence trust policy for crawl operations (mandatory)

When selecting operational fixes or workflow patterns:

- Use official docs and in-repo guidance as the default baseline.
- Accept community-discovered practices when they are repeatable and mechanistically plausible.
- Require local/fleet verification with bounded metrics before standardizing.

Decision rule:
- Do not dismiss a pattern only because it is non-official.
- Do not standardize a pattern only because it is popular.

---

## Essential Reading

1. **Crawl System Problems Catalogue** (8 diagnosed problems with severity ratings):
   [docs/designs/CRAWL_SYSTEM_PROBLEMS_AND_RESEARCH.md](../../docs/designs/CRAWL_SYSTEM_PROBLEMS_AND_RESEARCH.md)

2. **V4 Architecture Book** (system architecture context):
   [docs/guides/V4_ARCHITECTURE_BOOK.md](../../docs/guides/V4_ARCHITECTURE_BOOK.md)

3. **Crawler Runbook** (operational procedures):
   [docs/RUNBOOK.md](../../docs/RUNBOOK.md)

---

## Other Utility Scripts

| Script | Purpose |
|--------|---------|
| **crawl-remote.js** | **CLI for controlling the remote multi-domain crawl server** — start/stop/add/remove domains, pull batches, continuous sync |
| **fleet-endpoint-intel.js** | Deterministic endpoint capability profiler for local/remote v4 control planes |
| **v4-sync-if-needed.js** | **Conditional production sync** — runs dry-run safety check and syncs to `data/news.db` only when new rows exist |
| **agent-go.js** | **Intermittent autonomy command** — inspects elapsed time + recent logs, plans/executes diagnostics + conditional sync, writes session checkpoint state |
| **url-hash.js** | 12-byte truncated SHA256 URL hashing for fast dedup (~32MB for 1.3M URLs) |
| **crawl-dedup.js** | Check candidate URLs / crawl DBs against main DB using 12-byte hashes |
| **v4-sync-to-main.js** | Sync v4 per-domain crawl DBs into main news.db with dedup |
| `batch-sync.js` | Batch data synchronization from remote crawlers |
| `remote-sync.js` | Remote → local sync engine |
| `fleet-cli.js` | Fleet management CLI |
| `worker-cli.js` | Individual worker management |
| `intelligent-crawl.js` | Intelligent crawl orchestrator |
| `crawl-preflight.js` | Pre-crawl validation |
| `crawl-multi-modal.js` | Multi-modal crawl (HTTP + Puppeteer) |
| `url-status-reconcile.js` | URL status reconciliation |
| `distributed-500.js` | Distributed 500-page crawl script |
| `guess-place-hubs.js` | Place hub guessing from crawl data |

---

## Remote Multi-Domain Crawl Server

The new architecture uses a **single shared DB** with multiple CrawlWorker instances. No more per-domain temp databases.

### Architecture

- **Server**: `deploy/remote-crawler-v2/multi-domain-server.js` — single process, N CrawlWorkers sharing one SQLite DB
- **CLI**: `tools/crawl/crawl-remote.js` — local CLI to control remote server + pull batches
- **Admin UI**: `src/ui/server/remoteCrawlAdmin/` — jsgui3 SSR page with live status, controls
- **Config**: `deploy/remote-crawler-v2/crawl-domains.json` — domain list and per-domain settings

### Quick Start (Remote Crawl + Continuous Sync)

```bash
# 1. On the remote server — start multi-domain server
node deploy/remote-crawler-v2/multi-domain-server.js --config crawl-domains.json

# 2. From local machine — check health
node tools/crawl/crawl-remote.js health --host 144.21.35.104:3200

# 3. Start all domains
node tools/crawl/crawl-remote.js start --all

# 4. Monitor status
node tools/crawl/crawl-remote.js status

# 5. Start continuous 10s sync to local DB
node tools/crawl/crawl-remote.js sync --interval 10

# 6. Or pull a single batch
node tools/crawl/crawl-remote.js pull --window 30
```

### Conditional Sync to Production DB (Recommended)

Use this after v4 per-domain crawls to avoid unnecessary writes:

```bash
# Dry-run gate + auto-apply only when needed
node tools/crawl/v4-sync-if-needed.js --crawl-dir tmp/v4-20x50-fleet

# Equivalent npm script
npm run crawl:sync:if-needed -- --crawl-dir tmp/v4-20x50-fleet
```

### Intermittent Agent Autonomy (GO Command)

When a human issues "go", run the deterministic checkpoint command:

```bash
# Plan only (inspect + decide)
npm run crawl:go -- --session 2026-02-12-2026-02-12-20x50-multisite-crawl-diagnostics --json

# Apply due actions (diagnostics + sync-if-needed)
npm run crawl:go:apply -- --session 2026-02-12-2026-02-12-20x50-multisite-crawl-diagnostics --json
```

This command records state in `AUTONOMY_STATE.json` and appends checkpoints to session `WORKING_NOTES.md`, so future intermittent runs can resume from evidence rather than memory.

### Adding/Removing Domains at Runtime

```bash
# Add a new domain
node tools/crawl/crawl-remote.js add --domain nytimes.com --max-pages 100

# Seed with specific URLs
node tools/crawl/crawl-remote.js seed --domain nytimes.com --urls https://www.nytimes.com,https://www.nytimes.com/section/world

# Start it
node tools/crawl/crawl-remote.js start --domain nytimes.com

# Remove when done
node tools/crawl/crawl-remote.js remove --domain nytimes.com
```

---

## V4 Crawl → Main DB Pipeline

After running a v4 crawl (via FleetProcess or any orchestrator that creates per-domain `.db` files), sync the results to the main database:

```bash
# 1. Check what's new before syncing (dry run dedup)
node tools/crawl/crawl-dedup.js --crawl-dir <crawl-db-dir> --json

# 2. Preview the sync (dry run)
node tools/crawl/v4-sync-to-main.js --crawl-dir <crawl-db-dir> --dry-run

# 3. Execute the sync
node tools/crawl/v4-sync-to-main.js --crawl-dir <crawl-db-dir>

# 4. Verify content was persisted
node tools/crawl/crawl-dedup.js --crawl-dir <crawl-db-dir> --stats-only
# (should show 0% new — everything synced)
```

Both tools support `--key value` and `--key=value` arg formats. Run with `--help` for options.

---

## Ad-Hoc DB Forensics

When CLI tools don't cover a specific question, write targeted scripts in `tmp/`:

```javascript
const Database = require('better-sqlite3');
const db = new Database('data/news.db', { readonly: true });
try {
  const result = db.prepare('SELECT ... diagnostic query ...').all();
  console.log(JSON.stringify(result, null, 2));
} finally {
  db.close();
  process.exit(0);  // Always exit cleanly!
}
```

**Rules for ad-hoc scripts:**
- Open DB in `readonly: true` mode for diagnostics
- Always close DB in a `finally` block
- Always call `process.exit(0)` at the end
- Print structured JSON for machine parsing

---

## V4 CLI (`v4-cli.js`) — Single-Server Control Plane

Primary CLI for the V4 single-server crawler at `141.144.193.218:3300`.

### Quick Reference

```bash
node tools/crawl/v4-cli.js <command> [--json] [--env production|experimental]
```

### Crawl Operations
| Command | Purpose |
|---------|---------|
| `status` | Check remote server status (active crawls, domains, stored counts) |
| `health` | Quick health check (uptime, version, memory) |
| `start-all` | Start all configured domains (`--max-pages N`) |
| `start` | Start PM2 server process |
| `stop` | Stop PM2 server |
| `restart` | Restart PM2 server |
| `monitor` | Poll status + derived totals + rapid-sync state for precise live control |
| `sync` | One-shot sync remote → local DB |
| `rapid-sync` | Start high-frequency sync (attached by default; use `--sync-detached` to background) |
| `rapid-sync status` | Read detached sync PID/log status (safe, read-only) |
| `rapid-sync stop` | Stop detached sync process from PID file (`--dry-run` supported) |
| `rapid-sync restart` | Stop then start detached sync with same flags |
| `ttfsl` | Measure Time to First Save Locally |

### Precise rapid-sync lifecycle control (mandatory when detached mode is used)

When `crawl-sync` launches rapid-sync detached, always control it through `v4-cli` instead of ad-hoc process killing.

```bash
# Inspect lifecycle state (PID, stale pid-file detection, log file presence)
node tools/crawl/v4-cli.js rapid-sync status --json

# Dry-run stop check (safe, no signal sent)
node tools/crawl/v4-cli.js rapid-sync stop --dry-run --json

# Actual stop
node tools/crawl/v4-cli.js rapid-sync stop

# Restart
node tools/crawl/v4-cli.js rapid-sync restart --sync-detached
```

Deterministic behavior expectations:
- `rapid-sync status` is read-only and never mutates process state.
- `rapid-sync stop` uses PID-file + liveness check, cleans stale PID files, and escalates `SIGTERM -> SIGKILL` only when needed.
- `rapid-sync stop --dry-run` must be used before operational stop in high-risk windows.

### Live monitoring loop (recommended while crawl is active)

```bash
# 12 cycles, 5s interval by default
node tools/crawl/v4-cli.js monitor

# Custom interval + cycles with machine-readable evidence
node tools/crawl/v4-cli.js monitor --interval-sec 3 --max-cycles 10 --json
```

Monitor output includes:
- running/configured domain counts
- derived fetched/stored/error totals from per-domain stats
- mismatch warning when top-level totals diverge
- rapid-sync process state (PID, running/stale detection)

### VM Lifecycle (OCI Cloud API)
| Command | Purpose |
|---------|---------|
| `vm-status` | Query OCI VM lifecycle state (RUNNING/STOPPED/etc) |
| `vm-restart` | Send RESET action (hard reboot) |
| `vm-stop` | Stop VM gracefully |
| `vm-start` | Start a stopped VM |
| `vm-wait` | Poll until VM + SSH become reachable |
| `full-recovery` | Automated: VM reset → wait → start server → health check |

### Deployment & Recovery
| Command | Purpose |
|---------|---------|
| `deploy-v4` | Deploy v4 server/worker files to remote |
| `clean-redeploy` | Wipe remote app dir + (optionally) DB and redeploy (`--force`, `--keep-db`) |

### Reachability Decision Tree

When the remote server is unreachable, follow this sequence:
1. `health --json` → If ok → server healthy, proceed normally
2. `pm2-status --json` → If SSH works → server down, fix and start
3. `vm-status --json` → If RUNNING but no SSH → `vm-restart --json` (hard reset)
4. If STOPPED → `vm-start --json`
5. After VM is back → `vm-wait --json` → `start --json`
6. Or use `full-recovery --json` for automated end-to-end recovery

---

## Related Paths

| Path | Relationship |
|------|-------------|
| `src/v4/` | V4 system that creates the crawl databases |
| `deploy/remote-crawler-v2/` | CrawlWorker that populates the databases |
| `src/core/crawler/` | V1/V3 core crawler pipeline (different database) |
| `data/news.db` | Main local crawl database (~8GB) |

---

## Related Agent Specs

| Agent | When to Use |
|-------|------------|
| 🔬🛠️ Diagnostic & Repair Singularity | Full investigation with evidence-backed diagnosis |
| 🕷️🔍 Crawl Health Monitor | Routine monitoring and health checks |
| 🕷️ Crawler Singularity | Architecture-level crawler changes |
