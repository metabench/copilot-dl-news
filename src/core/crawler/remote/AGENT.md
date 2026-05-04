# Remote Crawler – AGENT.md

## What This Directory Contains
The P2P distributed crawling subsystem. This replaces the legacy `deploy/remote-crawler/` and `deploy/remote-crawler-v2/` directories with a unified system backed by the full NewsCrawler engine.

### Components
| File | Purpose |
|------|---------|
| `PeerProtocol.js` | Wire format for inter-peer communication (announcements, work assignments, result sync, intelligence sharing, heartbeats) |
| `RemoteCrawlerAdapter.js` | Network bridge wrapping NewsCrawler. Observes events without modifying internals. Provides status, control, export, and intelligence APIs |
| `PeerCrawlServer.js` | Express API server hosting multi-domain NewsCrawler peers |

## Essential Reading
- **Schema**: [`src/data/db/sqlite/v1/schema-definitions.js`](../../../data/db/sqlite/v1/schema-definitions.js) — The `urls` table only has `id, url, canonical_url, created_at, last_seen_at, analysis, host`. All HTTP response data lives in `http_responses`, content in `content_storage`, analysis in `content_analysis`. Always JOIN across these tables.
- **DB Client**: [`src/core/crawler/dbClient.js`](../dbClient.js) — CrawlerDb adapter facade
- **NewsCrawler**: [`src/core/crawler/NewsCrawler.js`](../NewsCrawler.js) — Core engine (2400+ lines)
- **Base Crawler**: [`src/core/crawler/core/Crawler.js`](../core/Crawler.js) — Base class with abort mechanism

## Key Workflows

### Starting a Peer Server
```bash
node tools/crawl peer-server --domains bbc.com,reuters.com --port 3200 --auto-start
```

### Running Tests
```bash
node --test tests/core/crawler/remote/
```

## Critical Knowledge / Gotchas

1. **Export SQL must use JOINs** — The `urls` table does NOT contain `http_status`, `content_type`, `title`, `word_count`, etc. Those live in `http_responses` and `content_analysis`. Use the canonical JOIN pattern: `urls → http_responses → content_storage → content_analysis`.

2. **DB is not initialised until `crawl()` is called** — `NewsCrawler.dbAdapter` is `null` until the crawl lifecycle runs `init()`. The `RemoteCrawlerAdapter._getDb()` includes lazy init support but requires waiting for the async init to complete before export queries will work.

3. **Default shared DB** — By default, all domains write to `data/news.db`. Use `--per-domain-db` flag only when you intentionally want isolated databases (testing, migration).

4. **State sync** — The adapter uses an `onCrawlFinished` callback to notify the server when a crawl completes. Without this, `entry.state` in the server registry would stay `'running'` forever.

5. **Additive design** — This subsystem wraps NewsCrawler via adapters. Never modify NewsCrawler internals from here — observe events and call public methods only.

## Related Paths
- `tools/crawl/peer-server.js` — CLI entry point
- `tools/crawl/index.js` — Tool registry
- `deploy/remote-crawler/` — Legacy (to be deprecated)
- `deploy/remote-crawler-v2/` — Legacy v2 (to be deprecated)
- `tests/core/crawler/remote/` — Test suite
