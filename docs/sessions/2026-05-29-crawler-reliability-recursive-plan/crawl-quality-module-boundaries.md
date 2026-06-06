# Crawl Quality Audit — Module Boundaries (companion to SVG)

**Node:** `audit_and_encapsulate_politeness_robots_cache_freshness_modules` (READ-ONLY)
**Date:** 2026-05-31
**Artifact:** `tmp/crawl-quality-audit.json` · diagram: `crawl-quality-module-boundaries.svg`

## Headline correction

The continuation prompt assumed robots caching, conditional GET, and `<lastmod>` were
missing. **They are not.** Evidence-based reality:

| Priority | State | Evidence (file:line) |
|---|---|---|
| Robots allow/deny | ✅ live | `RobotsAndSitemapCoordinator.isAllowed()` L89-97 |
| Robots DB cache + referral | ✅ mostly done | `loadRobotsTxt()` DB cache + 24h TTL L107-127; write-back L130-160 |
| Conditional GET (etag/last-modified) | ✅ live | `FetchPipeline._buildConditionalHeaders()` L1357 |
| 304 not-modified skip (no re-download) | ✅ live | `FetchPipeline` L915-965 (`body: null`, source `not-modified`) |
| Sitemap `<lastmod>` surfaced | ✅ live | `sitemap.js` L83-101 → `meta.lastmod` |
| 429/403 backoff + Retry-After | ✅ live | `RateLimitTracker.recordRateLimit()` L129-176 |
| **Crawl-delay floor** | ❌ gap | never parsed/persisted/enforced anywhere |
| **lastmod → prioritization** | ❌ gap | meta carried but unused for new-vs-updated |
| **Throughput regime decomposition** | ❌ gap | ttfb/transferKbps captured, never decomposed |
| **Typed robots cache + revalidation** | ❌ gap | stored as generic article row, hardcoded TTL |

## Proposed modules (reuse-first)

1. **RobotsCache** — extract `loadRobotsTxt` lifecycle; typed DB persist into the
   existing `robotsTxt` / `crawlDelaySeconds` / `sitemapUrls` columns; TTL +
   conditional revalidation; `getCrawlDelay(userAgent)`.
   → `implement_robots_txt_cache_with_ttl_revalidation_and_db_persistence`
2. **PolitenessGovernor** — thin wrapper that sets the per-host floor to
   `max(Crawl-delay, configured interval, learned interval)` via
   `RateLimitTracker.setInterval`. Hard floor; never lowered.
   → `honor_robots_crawl_delay_and_adaptive_per_host_politeness`
3. **FreshnessProbe** — surface new/updated/unchanged from sitemap `<lastmod>` +
   stored `last_modified`/`etag` (+ optional HEAD); prioritize fresh URLs.
   Enforcement reuses the existing 304 path.
   → `implement_freshness_detection_sitemap_lastmod_head_and_conditional_get`
4. **ThroughputAnalyzer** — aggregate `ttfbMs` (latency) + `transferKbps`
   (bandwidth) + politeness wait + concurrency into a regime classifier and
   adaptive-pacing recommendation. Extends `crawl-progress-monitor`. Read-only.
   → `build_throughput_analyzer_with_bandwidth_and_latency_decomposition`

## Throughput regimes (politeness-safe)

- **latency-bound** (high ttfb, spare bandwidth, low concurrency) → **raise concurrency / add hosts**.
- **bandwidth-bound** (bytes/sec near ceiling, transferKbps saturated) → **hold concurrency** (no gain).
- **politeness-bound** (Crawl-delay/interval dominates) → only lever is **more distinct hosts**.

**Invariant:** adaptive pacing may only RAISE concurrency or add hosts; it may
NEVER lower a per-host politeness floor. Politeness is a hard floor in every regime.

## Ownership

- `copilot-dl-news`: all four modules (extractions + analyzer), CLI, proofs, docs.
- `news-crawler-db`: populate `crawlDelaySeconds` / `sitemapUrls` coverage columns.
- `news-crawler-backend-core`: promote proven runtime behavior only after local proof.
- Do NOT move crawler work into `jsgui3-ecosystem`; do NOT edit
  `news-crawler-backend-core` / `InProcessCrawlJobRegistry.js` in early nodes.
