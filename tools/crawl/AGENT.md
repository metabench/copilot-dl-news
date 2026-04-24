# Agent Guide: `tools/crawl/` — Crawl Tools

> **Read this file first** when running crawls, investigating crawl issues, or managing the remote fleet.

---

## What's Here

This directory contains CLI tools for running and managing crawls. The **unified launcher** (`index.js`) is the preferred entry point for most crawl operations.

### Actual Tools

| File | Purpose | Status |
|------|---------|--------|
| `index.js` | **Unified crawl launcher** — delegates to tools and profiles | ✅ Working |
| `crawl-remote.js` | **Remote multi-domain crawl** — start/stop/sync/monitor remote crawlers | ✅ Working |
| `crawl-multi-modal.js` | Multi-modal crawl (HTTP + Puppeteer fallback) | ✅ Working |
| `crawl-place-hubs.js` | Crawl discovered place hub URLs from local DB | ✅ Working |
| `intelligent-crawl.js` | Intelligent crawl with hub discovery + learning loops | ✅ Working |
| `guess-place-hubs.js` | Infer place hubs from existing crawl data | ✅ Working |
| `list-place-hubs.js` | List known place hubs from the DB | ✅ Working |
| `distributed-500.js` | Distributed worker-based crawl run | ⚠️ Check deps |
| `peer-server.js` | Peer-to-peer crawl server | ⚠️ Check deps |
| `worker-cli.js` | Run a single crawler worker directly | ⚠️ Check deps |
| `migrate-db-crawl-logs.js` | DB migration: crawl logs | Utility |
| `migrate-db-for-worker.js` | DB migration: worker schema | Utility |
| `lib/crawl-remote-bounded.js` | Bounded crawl helper (used by `crawl-remote.js`) | Internal |

### Named Profiles (`profiles/`)

| Profile | Tool | Description |
|---------|------|-------------|
| `remote-bounded-smoke` | `remote` | Small bounded remote crawl smoke test |
| `remote-status` | `remote` | Quick remote crawl status snapshot |
| `place-hubs-local` | `place-hubs` | Local place-hub crawl against default news database |

---

## How to Run a Crawl — Decision Tree

```
What kind of crawl do you need?
│
├── 🔹 Quick status check / "are crawlers running?"
│   └── npm run crawl -- remote-status
│       (or: node tools/crawl/crawl-remote.js status)
│
├── 🔹 Small smoke test (remote, bounded)
│   └── npm run crawl -- remote-bounded-smoke
│       (or: npm run crawl -- remote-bounded-smoke --dry-run  to preview)
│
├── 🔹 Remote bounded crawl (specific domains)
│   └── npm run crawl -- remote bounded --domains bbc.com,reuters.com --max-pages 50
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

`crawl-remote.js` is the CLI for controlling the remote multi-domain crawl server at `144.21.35.104`.

### Commands

```bash
# Check what's happening
node tools/crawl/crawl-remote.js status
node tools/crawl/crawl-remote.js health --host 144.21.35.104:3200

# Start/stop domains
node tools/crawl/crawl-remote.js start --all
node tools/crawl/crawl-remote.js start --domain bbc.com
node tools/crawl/crawl-remote.js stop --all

# Bounded crawl (start, wait for completion, exit)
node tools/crawl/crawl-remote.js bounded --domains bbc.com,reuters.com --max-pages 50 --poll 5 --timeout-min 30

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

### Remote Server Architecture

```
Remote VM (144.21.35.104)              Local Machine
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
