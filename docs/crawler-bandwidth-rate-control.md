# Crawler bandwidth & rate control

*2026-07-19 — how the global download cap works, why slices are demand-aware,
and what actually bounds throughput. Probe: run the unit tests
(`npm run test:by-path -- src/core/crawler/__tests__/GlobalBandwidthLimiter.test.js
src/core/crawler/__tests__/sitemap-budget.test.js`) and the live choke test below.*

## The cap

- **Set/read:** `GET|POST /api/v1/crawl/bandwidth-cap` (`{"mbps": 4}`; `0` =
  unlimited). Persists in `data/crawl-settings.json`; applied at server boot
  (default **4 MB/s**). Changes take effect live, mid-crawl.
- **Units:** *uncompressed* body bytes — the same units as
  `http_responses.bytes_downloaded` and every MB figure in the UI, so cap, DB
  and dashboards agree. On-wire (compressed) usage sits *below* the cap — the
  safe direction for a metered link.
- **Mechanism:** `src/core/crawler/GlobalBandwidthLimiter.js` — a post-paid
  token bucket (acquire before fetch, waits only while in byte-debt; record
  actual bytes after). `FetchPipeline` charges HTML + Puppeteer-fallback
  bodies. Sitemap XML is deliberately **not** charged: charging it was tried
  and stalled fleets (multi-MB indexes vs small per-worker slices = minutes of
  debt before the first article). XML volume is bounded by the
  `sitemapMaxFetches` budget instead; the cap governs page content, which
  dominates steady-state.

## Worker-mode coordination (how 20 concurrent jobs share one cap)

Crawl jobs are **forked worker processes** (`UI_CRAWL_WORKER=1`, the
dev-bridge default), so the server's limiter never sees worker fetches.
Instead `InProcessCrawlJobRegistry` divides the cap into per-worker slices and
pushes them over IPC (`{type:'bandwidth-rate', bytesPerSec}`, plus
`bandwidthBytesPerSec` on the initial `run` message so there is no uncapped
window).

Slices are **demand-aware and work-conserving** (`computeDemandSlices`):
workers report actual bytes every 2s (`{type:'bandwidth-usage'}`); every 3s the
registry recomputes slices from EWMA rates — demand = observed rate × 1.6
headroom, floored so quiet workers can ramp; surplus is spread when demand
fits, proportional scaling when it doesn't. **Σ slices == cap always.** A
worker stuck in discovery yields budget to a supplied one within ~1 cycle, so
the aggregate tracks the cap as network conditions fluctuate, without ever
exceeding it. Rebalance also fires on job start/finish and cap change.

**Live proof (choke test, 2026-07-19):** mid-crawl `POST {"mbps":0.05}`
collapsed the fleet 0.29 → 0.04 MB/s within ~3 min (debt drain), and restoring
recovered it.

## What actually bounds throughput (measured 2026-07-19)

Uncapped 20-site polite fleet: **0.285 MB/s avg / 0.446 MB/s peak-60s**
(646 fetches, avg ~196 KB on-wire). The cap was NOT the limiter — supply was:

1. **Sitemap detours** — one host chained 30+ video-sitemap XMLs before any
   article (each XML large, none throttled pre-fix). Fixed: `sitemapMaxFetches`
   budget (default 12 docs/crawl, override-able), news/article-looking children
   fetched before `video|image|podcast|gallery` ones, XML bytes now capped.
2. **Per-host politeness** — ≈1 req/s/host effective (fetch+process
   serialization; DomainThrottle is reactive on 429/robots). Politeness is
   per-host, so aggregate scales with *host fan-out*: ~0.1–0.3 MB/s per
   productive host. 1.8 MB/s wants ~10–15 productive hosts; 4 MB/s wants ~25+
   (or richer per-host supply via section starts + `maxDepth: 3`).
3. **Dedup** — recently-crawled hosts yield mostly known URLs. Use fresh
   section pages as seeds, not fronts.

Config that matters per job: `concurrency` (engine default 1 — always set ≥2),
`maxDepth` 3 for supply, `rateLimitMs` is 0 on the API path (the base-class
`|| 1000` at `core/Crawler.js:90` is overwritten at `NewsCrawler.js:291`).

## Verifying rate empirically

Never trust in-process counters for worker-mode crawls; measure the DB:

```sql
SELECT COUNT(*), SUM(bytes_downloaded)/1048576.0 AS mb
FROM http_responses
WHERE datetime(fetched_at) >= datetime('now','-60 seconds');
```

The mini dashboard (`/crawl-mini`) charts MB/s over the last hour with the cap
as a reference line (`/api/v1/crawl-rate-timeseries`).
