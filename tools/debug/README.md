# Debugging Utilities

**When to Read**: Read this guide when you need to use one of the specialized debugging scripts in this directory. For example, if you are working on queue persistence and need to use `queue-persistence-probe.js` to quickly test the API and database state.

This directory hosts small, developer-oriented scripts that make it easier to debug the UI surface without wiring the full browser.

## Database Schema Tools (Parent Directory)

Two simple CLI tools in `tools/` provide instant database inspection without approval dialogs:

### `db-schema.js`

Inspect table structure, indexes, foreign keys, and row counts:

```bash
# List all tables
node tools/db-schema.js tables

# Show columns for a specific table
node tools/db-schema.js table analysis_runs

# List all indexes (or for specific table)
node tools/db-schema.js indexes
node tools/db-schema.js indexes articles

# Show foreign keys
node tools/db-schema.js foreign-keys analysis_run_events

# Show table row counts and database size
node tools/db-schema.js stats
```

### `db-query.js`

Execute read-only SQL queries:

```bash
# Query with formatted table output
node tools/db-query.js "SELECT * FROM articles LIMIT 5"

# Query with JSON output
node tools/db-query.js --json "SELECT * FROM analysis_runs ORDER BY started_at DESC LIMIT 3"

# Count records
node tools/db-query.js "SELECT COUNT(*) as count FROM articles WHERE host='bbc.co.uk'"
```

**Safety**: Both tools open the database in read-only mode. Write operations will fail.

**Environment**: Set `DB_PATH` to use a different database (default: `data/news.db`).

### `upgrade-analysis-schema.js`

Manually upgrade `analysis_runs` table to add background task linkage columns:

```bash
node tools/upgrade-analysis-schema.js
```

**When to use**: 
- After pulling code changes that add new columns to `analysis_runs`
- To upgrade existing databases before server start
- The server automatically runs this on startup, but manual upgrade lets you inspect results

**What it does**:
1. Adds `background_task_id` and `background_task_status` columns (if missing)
2. Creates index on `background_task_id` for fast lookups
3. Shows before/after column counts and new indexes

**Note**: This is idempotent - safe to run multiple times.

## `queue-persistence-probe.js`

Spin up the Express UI server with the fake crawler and capture queue persistence snapshots, which is handy when working on `/api/queues`, the queue SSR routes, or the SQLite pipeline.

### Usage

From the repository root:

```
node tools/debug/queue-persistence-probe.js
```

The script will:

1. Start the Express UI server with `UI_FAKE_RUNNER=1`, `UI_FAKE_QUEUE=1`, and `UI_QUEUE_DEBUG=1` (unless you override those environment variables).
2. POST to `/api/crawl` using `https://example.com` as the default start URL.
3. Wait ~800 ms for the fake runner to emit queue events.
4. Fetch `/api/queues` and `/api/queues/:id/events` and print the JSON payloads.
5. Shut everything back down.

### Options

You can tweak behaviour using CLI flags (all are optional):

| Flag | Description | Default |
| --- | --- | --- |
| `--startUrl=<url>` | Crawl a different domain. | `https://example.com` |
| `--depth=<n>` | Depth argument passed to POST `/api/crawl`. | `0` |
| `--maxPages=<n>` | Max pages argument passed to POST `/api/crawl`. | `1` |
| `--useSitemap=true` | Toggle sitemap usage. | `false` |
| `--delayMs=<ms>` | Wait time before inspecting the queue APIs. | `800` |
| `--realRunner` | Use the real crawler instead of the fake runner. | disabled |
| `--realQueue` | Disable `UI_FAKE_QUEUE`. | disabled |

Example:

```
node tools/debug/queue-persistence-probe.js --startUrl=https://news.ycombinator.com --delayMs=1500
```

> **Tip:** Because the script enables `UI_QUEUE_DEBUG`, you will see detailed DB insert logs in the console, which is invaluable when chasing schema or persistence regressions.
