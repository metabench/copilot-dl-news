# Debugging Utilities

**When to Read**: Read this guide when you need to use one of the specialized debugging scripts in this directory. For example, if you are working on queue persistence and need to use `queue-persistence-probe.js` to quickly test the API and database state.

This directory hosts small, developer-oriented scripts that make it easier to debug the UI surface without wiring the full browser.

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
