# Agent Guide: `tools/crawl/` — Crawl Tools

> **Read this file first** when running crawls, investigating crawl issues, or managing the remote fleet.

---

## What's Here

This directory contains CLI tools for running and managing crawls. The **unified launcher** (`index.js`) is the preferred entry point for most crawl operations.

### Actual Tools

| File | Purpose | Status |
|------|---------|--------|
| `index.js` | **Unified crawl launcher** — delegates to tools and profiles | ✅ Working |
| `cloud-crawl-e2e.js` | **Strict 15-minute cloud crawl validation** — preflight, useful crawl window, drain/sync, DB/ledger/perf diagnostics | ✅ Working |
| `crawl-remote.js` | **Remote multi-domain crawl** — start/stop/sync/monitor remote crawlers (the canonical "distributed node" entry point) | ✅ Working |
| `crawl-batch.js` | **Batch in-process crawl launcher** — POST N jobs to the unified UI v1 API (`/api/v1/crawl/operations/:op/start`) with bounded concurrency + retries | ✅ Working |
| `crawl-multi-modal.js` | Multi-modal crawl (HTTP + Puppeteer fallback) | ✅ Working |
| `crawl-place-hubs.js` | Crawl discovered place hub URLs from local DB | ✅ Working |
| `intelligent-crawl.js` | Intelligent crawl with hub discovery + learning loops | ✅ Working |
| `guess-place-hubs.js` | Infer place hubs from existing crawl data | ✅ Working |
| `list-place-hubs.js` | List known place hubs from the DB | ✅ Working |
| `peer-server.js` | P2P NewsCrawler peer node | ✅ Working |
| `migrate-db-crawl-logs.js` | DB migration: crawl logs | Utility |
| `migrate-db-for-worker.js` | DB migration: worker schema | Utility |
| `lib/crawl-remote-bounded.js` | Bounded crawl helper (used by `crawl-remote.js`) | Internal |
| `lib/fleet-host-resolver.js` | Resolves fleet host (env `FLEET_HOST` → `.fleet-host` → default `141.144.193.218`) | Internal |

> **Terminology rule**: In this repo, **simple crawl** means low-scope and easy to run (few domains/pages, bounded timeout). It does **not** mean local-only. The canonical simple crawl is distributed through `simple-distributed-smoke` unless a user explicitly asks for a local crawl.

> **Mode rule**: **Harnessed crawls** run through `cloud-crawl-e2e.js` and must produce validation artifacts plus pass/fail diagnostics. Use them when proving the crawl system works under a fixed budget. **Non-harnessed crawls** run through `news-10x1000`, `crawl-remote.js`, `crawl-batch.js`, or legacy `npm start`; use them for normal operations, focused data collection, or manual recovery, then verify with status/DB/ledger checks.

> **Removed 2026-04-25**: `worker-cli.js`, `distributed-500.js`, and `deploy/remote-crawler/` (v1) were quarantined to `wip/legacy-distributed/` because they depended on `domain-intelligence`/`self-healing` modules that were never committed. Use `crawl-remote.js` (v2 path) for distributed crawls instead.

### Named Profiles (`profiles/`)

| Profile | Tool | Description |
|---------|------|-------------|
| `simple-distributed-smoke` | `remote` | **Simple distributed smoke**: 1 domain × 5 pages via Oracle/v2 remote server |
| `remote-bounded-smoke` | `remote` | Larger bounded distributed smoke crawl (3 domains × 50 pages) |
| `news-10x1000` | `orchestrate` | **Default 10x1000 operator crawl**: remote/cloud crawler when healthy, local fallback when unavailable, adaptive 5-second confirmed sync, exact remote payload pruning, ledger-tracked |
| `news-10x1000-15m-e2e` | `cloud-e2e` | **Strict 15-minute e2e validation**: preflight remote health/throttle, crawl useful data, drain/sync, verify local DB growth, ledger state, host spread, and benchmark stats |
| `remote-news-10x1000` | `remote` | Explicit remote/cloud alias for the adaptive 10x1000 operator crawl |
| `local-news-10x1000` | `batch` | Local/in-process fallback for 10 major news sites × 1000 pages each; use only when remote is unavailable |
| `remote-status` | `remote` | Quick remote crawl status snapshot |
| `place-hubs-local` | `place-hubs` | Local place-hub crawl against default news database |

### Lib Modules (`lib/`)

| Module | Purpose |
|--------|---------|
| `adaptive-sync-batching.js` | Adaptive batch controller: grow/shrink export limit toward a duration target |
| `backpressure.js` | Concurrency control: maps storage budget actions to crawler throttle requests |
| `cloud-crawl-e2e-validation.js` | Pure budget planning, evidence validation, ledger summary, and benchmark stat helpers for the 15-minute validator |
| `crawl-remote-bounded.js` | Bounded crawl utilities (domain resolution, summary) |
| `fleet-host-resolver.js` | Resolves fleet host from env / `.fleet-host` / default |
| `orchestrate-policy.js` | Orchestration decision (mode/profile/uiHint) from args |
| `perf-reporter.js` | Ring-buffer perf metrics with p50/p95 summaries |
| `prune-config.js` | Prune safety policy (refuses partial-export prune) |
| `storage-budget.js` | Storage budget evaluation (normal/shrink/pause-crawl) |
| `sync-ingest.js` | V2 batch ingest pipeline (urls/responses/content/links → local DB) |
| `sync-ledger.js` | **Append-only ledger** replacing the single-watermark file. Tracks batch → confirmed → pruned lifecycle with crash-resume support |
| `sync-loop-instrumentation.js` | **Shared instrumentation** for cmdSync and cmdRun: perf summaries, budget eval, backpressure transitions |

### New CLI Flags (crawl-remote.js)

| Flag | Default | Description |
|------|---------|-------------|
| `--remote-storage-budget-mb` | disabled | Soft cap on remote content storage (MB) |
| `--remote-storage-reserve-mb` | disabled | Hard reserve above the budget; triggers pause-crawl |
| `--perf-summary-every` | 10 | Print p50/p95 perf summary every N rounds |
| `--normal-concurrency` | 10 | Worker concurrency restored when budget returns to normal |
| `--reduced-concurrency` | 2 | Worker concurrency under storage pressure |

---

## How to Run a Crawl — Decision Tree

### Harnessed vs Non-Harnessed Modes

| Mode | Use when | Preferred command | What it guarantees |
|------|----------|-------------------|--------------------|
| Harnessed validation | You need proof the remote crawl path can do useful work under a strict 15-minute cap. | `npm run crawl -- news-10x1000-15m-e2e` | Preflight health/throttle, bounded crawl budget, stop/drain, DB growth, host spread, failure ratio, ledger state, p50/p95 benchmark stats, JSON/log artifacts. |
| Harnessed dry-run/preflight | You need to inspect the exact plan or verify the remote is safe before spending 15 minutes. | `npm run crawl -- news-10x1000-15m-e2e --dry-run` or `--preflight-only` | No long crawl; confirms budget math or remote contracts. |
| Non-harnessed operator crawl | You want the normal 10-site crawl with remote-first orchestration and local fallback. | `npm run crawl -- news-10x1000` | Runs useful crawling but does not impose the e2e harness deadline or produce a pass/fail validation artifact. |
| Non-harnessed explicit remote | You need direct remote control, bounded domains, sync, drain, or recovery. | `node tools/crawl/crawl-remote.js <status|bounded|run|sync|pull|stop>` | Operator-controlled lifecycle; you are responsible for stop/sync/ledger verification. |
| Non-harnessed local/batch | Remote is unavailable or the user explicitly asks for local/in-process crawling. | `npm run crawl -- local-news-10x1000` or `npm run crawl -- batch ...` | Local API-driven jobs; requires unified UI when using `crawl-batch.js`. |

For harnessed live runs, always keep the generated `cloud-crawl-e2e-*.json` and `cloud-crawl-e2e-*.log` artifacts with the session notes. For non-harnessed remote runs, always confirm `crawl-remote.js status`, local DB growth (`npm run db:downloads:recent` / `npm run db:downloads:stats`), and ledger state before declaring the crawl complete.

```
What kind of crawl do you need?
│
├── 🔹 Quick status check / "are crawlers running?"
│   └── npm run crawl -- remote-status
│       (or: node tools/crawl/crawl-remote.js status)
│
├── 🔹 Smallest distributed-node smoke (1 domain × 5 pages)
│   └── npm run crawl -- simple-distributed-smoke --dry-run    # preview
│       npm run crawl -- simple-distributed-smoke              # run
│
├── 🔹 Larger bounded smoke (3 domains × 50 pages)
│   └── npm run crawl -- remote-bounded-smoke
│
├── 🔹 Remote/cloud 10-site operator crawl (10 domains × 1000 pages)
│   └── npm run crawl -- news-10x1000
│       (non-harnessed remote-first default; confirmed local save then exact remote payload prune)
│
├── 🔹 Strict 15-minute cloud crawl e2e validation
│   └── npm run crawl -- news-10x1000-15m-e2e
│       npm run crawl -- news-10x1000-15m-e2e --dry-run
│       npm run crawl -- news-10x1000-15m-e2e --preflight-only
│       (harnessed 15-minute hard cap; validates DB growth, host spread, ledger, health, and p50/p95 stats)
│
├── 🔹 Remote bounded crawl (specific domains)
│   └── npm run crawl -- remote bounded --domains bbc.com,reuters.com --max-pages 50 --max-concurrent 2
│
├── 🔹 Batch start N in-process crawls against the unified UI (single command)
│   └── npm run crawl -- local-news-10x1000                   # explicit local fallback preset
│       npm run crawl -- batch --preset news-5 --max-pages 200
│       npm run crawl -- batch --urls-file urls.txt --concurrency 4 --json
│       (Requires unified UI on UI_HOST:UI_PORT, default 127.0.0.1:3000,
│        started with UI_ALLOW_MULTI_JOBS=true for parallel jobs.)
│
├── 🔹 Start/manage remote crawl server
│   └── See "Remote Crawl Operations" section below
│
├── 🔹 Local intelligent crawl
│   └── npm run crawl -- intelligent [args]
│
├── 🔹 Place hub crawling
│   └── npm run crawl -- place-hubs-local
│       (or: npm run crawl -- place-hubs [args])
│
└── 🔹 Legacy config-driven crawl
    └── npm start  (runs node src/crawl.js)
        See docs/cli/crawl.md for commands & override precedence
```

The simple distributed smoke path is:
`npm run crawl -- simple-distributed-smoke` → `tools/crawl/index.js` → `tools/crawl/profiles/simple-distributed-smoke.json` → `tools/crawl/crawl-remote.js bounded --domains bbc.com --max-pages 5` → Oracle/v2 multi-domain server `/api/status`, `/api/domains/add` when needed, `/api/start`, repeated `/api/status` until complete.

The strict validation harness path is:
`npm run crawl -- news-10x1000-15m-e2e` → `tools/crawl/index.js` → `tools/crawl/profiles/news-10x1000-15m-e2e.json` → `tools/crawl/cloud-crawl-e2e.js` → remote preflight (`/api/health`, `/api/throttle`, `/api/content/stats`, `/api/status`) → `crawl-remote.js run` with bounded sync/prune → remote stop → drain sync → local DB/ledger/log validation artifact.

---

## Unified Launcher Usage

The launcher (`tools/crawl/index.js`) is the preferred way to run crawl tools:

```bash
# List all available tools and profiles
npm run crawl -- list
npm run crawl -- list --json      # machine-readable

# Run a named profile (preferred for repeatable operations)
npm run crawl -- remote-bounded-smoke
npm run crawl -- remote-bounded-smoke --dry-run

# Run a tool directly with arguments
npm run crawl -- remote bounded --domains bbc.com --max-pages 50
npm run crawl -- remote status

# Explicit forms
npm run crawl -- profile remote-bounded-smoke
npm run crawl -- run remote bounded --domains bbc.com

# Help
npm run crawl -- help
```

**Precedence**: If a name matches both a tool and a profile, the tool wins. Reserved launcher commands (`help`, `list`, `profile`, `run`) require the explicit `profile <name>` form.

---

## Remote Crawl Operations

`crawl-remote.js` is the CLI for controlling the remote multi-domain crawl server.

**Default host**: resolved in this order:
1. `--host <h:p>` flag
2. `process.env.CRAWL_REMOTE_HOST`
3. `process.env.FLEET_HOST` (host only — port `:3200` appended)
4. `tools/crawl/.fleet-host` file (host only)
5. Default `141.144.193.218:3200`

### Commands

```bash
# Check what's happening
node tools/crawl/crawl-remote.js status
node tools/crawl/crawl-remote.js health --host 141.144.193.218:3200

# Start/stop domains
node tools/crawl/crawl-remote.js start --all
node tools/crawl/crawl-remote.js start --domain bbc.com
node tools/crawl/crawl-remote.js stop --all

# Bounded crawl (start, wait for completion, exit)
node tools/crawl/crawl-remote.js bounded --domains bbc.com,reuters.com --max-pages 50 --max-concurrent 2 --poll 5 --timeout-min 30

# Domain management
node tools/crawl/crawl-remote.js add --domain nytimes.com --max-pages 100
node tools/crawl/crawl-remote.js seed --domain nytimes.com --urls https://www.nytimes.com
node tools/crawl/crawl-remote.js remove --domain nytimes.com

# Data sync
node tools/crawl/crawl-remote.js sync --interval 10    # continuous sync
node tools/crawl/crawl-remote.js pull --window 30       # single batch pull

# Error inspection
node tools/crawl/crawl-remote.js errors
node tools/crawl/crawl-remote.js content
```

For explicit bounded domains, `crawl-remote.js` registers any missing domain with `/api/domains/add` before starting. That keeps the simple distributed smoke profile usable even when the Oracle server was launched with a narrower domain config.

### Remote-First Storage Drain Policy

Use the remote crawler by default for medium/large crawls. The local/in-process batch path is a fallback for local debugging or remote outages, not the operator default.

For storage-constrained crawler nodes, sync and cleanup must follow this order:

1. Export a full payload batch from `/api/export/batch` (`includeContent=true`, `includeLinks=true`).
2. Ingest the batch into local `data/news.db`.
3. Confirm the local DB contains the exported URLs, responses, content rows, and links.
4. Prune the remote node with exact exported `urlIds`, not a watermark-only sweep.
5. Retain remote URL state rows while crawls are active unless `--prune-delete-urls` is explicitly requested for a completed/manual maintenance run.

`--prune-after-ingest` enforces this sequence in `crawl-remote.js`. It refuses partial exports because metadata-only sync cannot safely delete content/link payloads that were not transferred. The five-second metadata lane is useful for UI visibility, but it must not be combined with destructive pruning.

### Adaptive Sync Batching

Use adaptive batching when the operator wants a duration budget instead of a fixed row count:

```bash
node tools/crawl/crawl-remote.js sync --adaptive-limit --target-sync-ms 5000 --limit 5 --min-limit 1 --max-limit 25
```

The controller starts at `--limit`, shrinks immediately after slow/error rounds, and grows only after repeated fast full batches. It uses total round work time: remote fetch + local ingest + local verification + remote prune. For confirmed-prune production profiles, prefer conservative caps (`min=1`, `max=25`) because content and link payload size varies sharply by page.

Use `/api/health` for lightweight status under load. Reserve `/api/status` for bounded completion polling or cases where detailed per-domain state is required.

### Remote Server Configs

The v2 server accepts either CLI domains or a JSON config:

```bash
node deploy/remote-crawler-v2/multi-domain-server.js --config deploy/remote-crawler-v2/crawl-domains.simple.json
node deploy/remote-crawler-v2/multi-domain-server.js --config deploy/remote-crawler-v2/crawl-domains.bounded-smoke.json
node deploy/remote-crawler-v2/multi-domain-server.js --domains bbc.com,reuters.com --max-pages 50 --max-concurrent 2
```

Config files may set `port`, `db`, `maxPages`, `maxConcurrent`, `idleTimeoutMin`, `coordinatorMode`, `autoStart`, and `domains`. CLI flags override config values. The smoke configs set `autoStart: false` so the Oracle server can sit ready until a profile starts bounded work.

### Remote Server Architecture

```
Remote VM (141.144.193.218)           Local Machine
┌─────────────────────────┐           ┌──────────────────┐
│ multi-domain-server.js  │──batch──→ │ crawl-remote.js  │
│ (single process,        │  export   │ (pull / sync)    │
│  N CrawlWorkers,        │           │       │          │
│  shared SQLite DB)      │           │       ▼          │
│                         │           │  data/news.db    │
└─────────────────────────┘           └──────────────────┘
```

- **Server code**: `deploy/remote-crawler-v2/multi-domain-server.js`
- **Domain config**: `deploy/remote-crawler-v2/crawl-domains.json`

---

## Crawl-Adjacent NPM Scripts

These NPM scripts relate to crawling but use tools outside `tools/crawl/`:

### Database Inspection

| Script | Purpose |
|--------|---------|
| `npm run db:downloads` | Full download listing |
| `npm run db:downloads:recent` | Last 25 downloads |
| `npm run db:downloads:today` | Today's downloads |
| `npm run db:downloads:stats` | Download statistics |
| `npm run db:downloads:hosts` | Downloads by host |

### Intelligent Crawl Server (ICS)

The ICS is a separate background service for intelligent crawling, managed via `tools/dev/intelligent-crawl-server.js`:

| Script | Purpose |
|--------|---------|
| `npm run ics:start` | Start ICS server (background, port 3150) |
| `npm run ics:stop` | Stop ICS server |
| `npm run ics:status` | Show server status |
| `npm run ics:crawl:start` | Start a crawl via ICS |
| `npm run ics:crawl:stop` | Stop ICS crawl |
| `npm run ics:db:status` | ICS database status |
| `npm run ics:db:export` | Export ICS database |
| `npm run ics:backfill` | Backfill missing data |

### V4 Supervisor

| Script | Purpose |
|--------|---------|
| `npm run v4:supervisor` | Run V4 fleet supervisor (local) |
| `npm run v4:supervisor:remote` | Run V4 fleet supervisor (remote target) |
| `npm run v4:server:single` | Single-process V4 crawl (max 4 resources) |

### Mini Crawl

| Script | Purpose |
|--------|---------|
| `npm run crawl:mini` | Quick mini crawl via `tools/dev/mini-crawl.js` |

### Test Hang Analyzer

Static analysis to catch test patterns that commonly hang Jest (spawn without kill, setInterval without cleanup, puppeteer.launch without close, missing per-test timeouts, unbounded loops, SSE/sqlite leaks).

| Script | Purpose |
|--------|---------|
| `npm run test:hang-check` | Scan `tests/` and exit 1 on any error-severity finding |
| `npm run test:hang-report` | Write a full JSON report to `tmp/test-hang-report.json` |

Source: `tools/dev/test-hang-analyzer.js`. Regression tests: `tests/tools/test-hang-analyzer.test.js`.

---

## Legacy Local Crawling

For config-driven local crawling (operations, sequences, place commands):

```bash
npm start                    # Default config-driven crawl
node crawl.js availability   # List operations and sequences
```

See [docs/cli/crawl.md](../../docs/cli/crawl.md) for full CLI reference including:
- Override precedence (CLI flags > JSON blobs > config > defaults)
- Verbosity modes (`--output-verbosity`, `--json`)
- Sequence/operation commands

---

## Known Issues

> [!NOTE]
> The `CliFormatter` import paths in `intelligent-crawl.js`, `crawl-multi-modal.js`, `crawl-place-hubs.js`, and `list-place-hubs.js` were fixed (April 2025). All tools should now load without MODULE_NOT_FOUND errors.

> [!NOTE]
> 55 broken NPM scripts (`fleet:*`, `v4:*`, `data:*`, etc.) that referenced non-existent files were removed from `package.json` (April 2025). The remaining scripts all point to real files.

---

## Related Paths

| Path | Relationship |
|------|-------------|
| `src/v4/` | V4 distributed crawl system |
| `deploy/remote-crawler-v2/` | CrawlWorker + multi-domain server |
| `tools/remote-crawl/` | Legacy Oracle crawler scripts; do not use for the simple distributed smoke path |
| `src/core/crawler/` | V1/V3 core crawler pipeline |
| `tools/dev/intelligent-crawl-server.js` | ICS server management |
| `tools/dev/mini-crawl.js` | Quick mini crawl script |
| `tools/dev/db-downloads.js` | Download DB inspection |
| `data/news.db` | Main local crawl database |
| `docs/cli/crawl.md` | Legacy CLI quick reference |
| `docs/RUNBOOK.md` | Operational runbook (legacy focus) |

---

## Related Agent Specs

| Agent | When to Use |
|-------|------------|
| 🕷️ Crawler Singularity | Architecture-level crawler changes |
| 💡UI Singularity💡 | Crawler UI / dashboard work |
