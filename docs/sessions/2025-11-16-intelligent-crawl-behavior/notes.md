# Session Notes — Intelligent Crawl Behavior & Persistence (2025-11-16)

## Objective
Document the current "intelligent crawl" workflow (as of the 404-handling fixes) and outline concrete modifications that let the crawler keep harvesting beyond the 53 visits / 9 article saves observed on the latest capped run without requiring an alternate start URL.

## Current Behavior Snapshot

| Aspect | Details |
| --- | --- |
| Entry URL | `options.providedUrl` → `config.intelligentCrawl.url` → fallback `https://www.theguardian.com` (top-level home page). |
| Planner | `behavioralProfile: "country-hub-focused"` with `countryHubGaps`, `gapDrivenPrioritization`, `patternDiscovery`, pagination enabled, and a `countryHubTargetCount` of 150 (or 250 in hub-exclusive mode). |
| Depth / Scope | `maxDepth: 2` in intelligent mode (depth 1 when `--hub-exclusive`). Pagination fetches up to 50 pages per hub and budgets up to 50 hub pages per target, but navigation discovery stays enabled only until the queue empties. |
| Content mode | Articles download by default; `--hub-exclusive` flips `disableRegularArticles`, `disableTopicHubs`, `structureOnly`, and related toggles back on. |
| 404 handling | `CountryHubGapAnalyzer` now checks SQLite crawl history for repeated 404/410s and removes those URLs before they are enqueued. `FetchPipeline` and `PageExecutionService` both treat fresh 404/410 responses as `status: skipped`, so host retry budgets and lockouts are unaffected. |
| Max downloads | `maxDownloads` defaults to 500 but can be passed via CLI; the recent run used `--max-downloads 100`. The crawl halts earlier if the priority queue drains first. |
| Persistence guardrails | `preferCache` + 24h max-age reduce refetching; `useSitemap` is disabled, so discovery depends on planner predictions and on-page navigation only. |

### Recent Run (2025-11-15, cap = 100 downloads)
- Planner seeded Guardian country hubs off the `/world` landing page and successfully skipped the previously fatal `/world/<country>` 404s.
- The crawl processed 53 pages (mix of hub scaffolding + a handful of articles) and saved 9 unique articles before the queue exhausted.
- Termination reason: `NewsCrawler` completed normally because no new URLs were being produced faster than they were consumed; the article target of 100 was never reached even though the downloader was healthy.

## Why It Stops Early
1. **Single-seed focus**: Starting from the homepage funnels the planner directly into the Guardian "world" hub taxonomy. Once each hub page (and its pagination) is exhausted, few new places are discovered because `useSitemap` and topic-mode reseeding are disabled.
2. **Country hub saturation**: `countryHubTargetCount` limits the planner to ~150 hubs; with known 404s removed, the queue quickly descends into already-seen or low-signal hubs, so the prioritizer yields nothing new and the run ends cleanly.
3. **Article queue starvation**: Articles are scheduled only when hub parsing surfaces obvious story links. After 1–2 pages per hub, the system moves on; it never re-promotes previously seen hubs or uses remaining navigation links to branch into other Guardian desks.
4. **No fallback stage**: When `gapDrivenPrioritization` finishes its backlog, there is no "phase 2" that switches to sitemap traversal, generic article discovery, or heuristic link-walking. The crawler simply reports success with whatever it gathered so far.

## Modification Options (No Alternate Start URL Required)

| Category | Change | Impact |
| --- | --- | --- |
| Planner reseeding | **Enable topic hub + sitemap blending once hub queue < N items.** Invoke `useSitemap: true` or inject a sitemap-specific planner phase that seeds fresh article URLs from Guardian's sitemap index whenever `countryHubGaps` reports no remaining high-priority hubs. | Keeps the queue warm without changing the initial entry point; ensures max-download caps are approached even if world hubs dry up. |
| Dynamic target counts | **Raise `countryHubTargetCount` and add an auto-grow rule.** For example, bump to 400 and add logic inside `tools/intelligent-crawl.js` to increase the target dynamically whenever more than 20% of predictions are skipped as known 404s. | Compensates for the new 404 filter removing many planned hubs; prevents the planner from concluding early simply because the fixed quota was met. |
| Article-first fallback | **Add a "topic/article harvest" fallback profile.** After each hub completes, inject its sibling topics (politics, economy, etc.) or re-enqueue hub pagination with `maxDepth: 3` just for article links. This can live in `NewsCrawler`'s planner hooks or as a post-processing step inside `tools/intelligent-crawl.js`. | Keeps article downloads flowing even when geographic hubs are already mapped. |
| Navigation discovery boost | **Let navigation discovery stay active even after the prioritized queue drains.** Today `disableNavigationDiscovery` is `false`, but the planner rarely promotes generic nav links. Adding a rule that falls back to the Guardian homepage section links (e.g., `/world/europe`, `/business`) whenever the queue drops below a threshold will continuously repopulate work. | Maintains crawl momentum with minimal new code; still honors the user's default start URL. |
| Retry budget tuning | **Separate hub skips from download budget.** Track skipped hubs in the crawl report, and when the skip count crosses a threshold, automatically reseed using Guardian's region indexes or the sitemap API. | Gives operators visibility and ties reseeding directly to observable telemetry. |

### Minimal Code Touches to Implement
1. **Planner warm-up hook (tools/intelligent-crawl.js)**
   - After `const crawler = new NewsCrawler(...)`, attach an event listener (or extend the constructor options) that detects when `countryHubQueue.size === 0` while `downloads < maxDownloads`.
   - Inject either `crawler.enqueueSitemapEntries('https://www.theguardian.com/sitemaps-news.xml')` or a helper that replays topic hubs pulled from `newsTopics`.

2. **Dynamic `countryHubTargetCount`**
   - Replace the fixed `countryHubTargetCount` with a function that multiplies the base count by `(1 + skippedKnown404s / plannedHubs)` and caps at 500.
   - Persist this back into `priority-config.intelligent.json` alongside the `totalPrioritisation` flag so future runs inherit the larger budget.

3. **Article queue fallback**
   - Introduce a `fallbackArticleProfile` option (default `false`). When enabled, the planner should enqueue headlines from Guardian's front page sections once per run, but only after confirming the country hub backlog is empty.
   - Implementation detail: repurpose the existing `patternDiscovery` hook to treat section fronts (politics, business, science) as pseudo-hubs, keeping depth <= 2.

## Recommended Next Steps
- Prototype the **dynamic target count + sitemap fallback** combination; both live entirely inside `tools/intelligent-crawl.js` and `priority-config.intelligent.json`, so testing is straightforward.
- Capture telemetry (queue length over time, skip counts, reseed triggers) in `buildCrawlReport` so operators can see why a run ended early.
- Once the fallback proves it can reach the requested 100-download cap, expose a CLI flag (e.g., `--persistent`) that toggles the new behavior without affecting existing automation.

## References
- `tools/intelligent-crawl.js` — planner configuration, CLI flags, and crawl report emission.
- `src/services/CountryHubGapAnalyzer.js` — filters known 404s prior to queue insertion.
- `src/crawler/FetchPipeline.js` & `src/crawler/PageExecutionService.js` — host retry budgets and skip handling for 404/410 responses.
- Session 2025-11-15: [Intelligent Crawl Defaults](../2025-11-15-intelligent-crawl-defaults/notes.md) — details of the prior fixes that enabled the latest run.

## Exit Condition Coverage (2025-11-16)
- `NewsCrawler` now records whichever exit path triggers first (abort, download cap, queue exhaustion, or failure) and includes it in `_finalizeRun` logs plus the CLI summary. The helper lives in `NewsCrawler._recordExit`.
- `WorkerRunner` forwards exit metadata for concurrent crawls so we know whether the queue drained or if another worker tripped the download limit. See `WorkerRunner.run` for the callback wiring.
- `PageExecutionService` only increments `pagesDownloaded` after the fetch pipeline reports `source === 'network'`, ensuring cached responses no longer advance the download counter or stop a run early.
- `buildCrawlReport` now embeds runtime stats + exit details, so `--summary-format json` contains the same explanation that the ASCII summary prints.

See `diagnostic.md` for the exhaustive list of exit conditions and `fix-plan.md` for the remediation steps that keep the crawl running.
