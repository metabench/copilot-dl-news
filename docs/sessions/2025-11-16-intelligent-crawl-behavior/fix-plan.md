# Intelligent Crawl Persistence — Fix Plan (2025-11-16)

## Goals
1. Hit operator-provided download caps (e.g., 100) without changing the default start URL.
2. Keep the queue non-empty by reseeding work when the country-hub backlog dries up.
3. Preserve the structure-only workflow behind `--hub-exclusive`.
4. Publish enough telemetry (exit reason + queue depth) to prove why a run stopped.

## Recommended Changes

### 1. Dynamic country hub targets
- **Problem**: Filtering out known 404 hubs reduces the 150-slot quota drastically, which makes the planner think it's done.
- **Change**: Replace the static `countryHubTargetCount` (currently 150 in article mode) with a dynamic helper that scales up to 500 whenever `skippedKnown404s / plannedHubs > 0.2`.
- **Implementation sketch**:
  ```js
  const skippedFraction = skippedKnown404s / Math.max(plannedHubs, 1);
  const dynamicTarget = Math.min(500, Math.round(baseTarget * (1 + skippedFraction)));
  ```
  Persist the result back into `config/priority-config.intelligent.json` so the next run inherits the expanded budget.

### 2. Queue warming hook
- **Problem**: Once the planner hands back its initial queue, no other system feeds it.
- **Change**: Teach `tools/intelligent-crawl.js` to subscribe to a new `crawler.on('queue-empty')` (or reuse `exitSummary` once `queue-exhausted` is detected) and immediately enqueue:
  1. Guardian sitemap entries (`https://www.theguardian.com/sitemaps-news.xml`) when `useSitemap` is enabled.
  2. A curated list of topic hubs (politics, business, science) when sitemap ingestion is disabled.
- **Guardrails**: Only reseed when `stats.pagesDownloaded < maxDownloads` to avoid infinite crawls.

### 3. Article fallback stage
- **Problem**: Article discovery winds down after each hub yields a handful of links.
- **Change**: Add a `fallbackArticleProfile` option that, once the priority queue drops below N items, re-enqueues:
  - Pagination for previously visited hubs (`hubMaxPages` limit still applies).
  - The Guardian front-page sections (politics/world/business) at depth 1, so navigation discovery can keep seeding article links.
- **Implementation**: Extend `NavigationDiscoveryService` to label section links, then let `AdaptiveSeedPlanner` push them back with a low but non-zero priority bias.

### 4. Telemetry + UX
- Extend `buildCrawlReport` to record:
  - Queue depth at start vs. end.
  - Number of reseed events triggered.
  - Download vs. cache hit counts (available via `stats.pagesDownloaded` and `stats.cacheRateLimitedServed`).
- Gate the new behavior behind a CLI flag, e.g., `--persistent`:
  ```
  node tools/intelligent-crawl.js --max-downloads 100 --persistent
  ```
  which toggles on dynamic targets + fallback reseeding without disturbing existing automation.

## Validation Checklist
- [ ] Run `node tools/intelligent-crawl.js --max-downloads 100 --persistent` and confirm exit reason is `max-downloads-reached`.
- [ ] Capture the JSON summary to prove `runtime.stats.pagesDownloaded === 100`.
- [ ] Ensure unit tests cover the reseed trigger and the new telemetry fields (add Jest cases for `buildCrawlReport`).
- [ ] Update docs (`README`, session notes, AGENTS.md pointers) so operators know how to opt-in.
