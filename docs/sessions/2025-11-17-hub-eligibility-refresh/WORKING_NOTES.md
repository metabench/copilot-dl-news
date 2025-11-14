# Working Notes — Hub Eligibility Refresh (2025-11-17)

## Initial Context
- Intelligent crawl runs still exit early because navigation links are skipped if they were fetched previously.
- `maxAgeHubMs` should force reseeding but UrlEligibilityService blocks enqueue when rows exist in `http_responses` + `content_storage`.

## Live Notes
- UrlEligibilityService currently blocks enqueue when `_isAlreadyProcessed` finds any successful fetch + content, regardless of freshness. Navigation/front-page pages often satisfy this because we persist their HTML.
- QueueManager never sees `maxAgeHubMs`, so even with freshness requirements configured, nav hubs drop before reaching FetchPipeline.
- Need helper that inspects the latest `http_responses.fetched_at` timestamp; if `maxAgeHubMs` is defined and the hub fetch is older than the threshold (or threshold is 0), treat it as eligible.
- Added `maxAgeHubMs` awareness to UrlEligibilityService with prepared-statement caching so nav hubs consult the latest fetch timestamp before deciding to drop.
- Wired NewsCrawler → UrlEligibilityService to pass `maxAgeHubMs`, then added Jest coverage (stale vs. fresh hub scenarios) using stubbed SQLite handles.
