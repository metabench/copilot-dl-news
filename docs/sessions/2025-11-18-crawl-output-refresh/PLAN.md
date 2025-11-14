# Plan: crawl-output-refresh
Objective: Trim crawl output to a single readable PAGE line per download while leaning on cached hub seeds and enforcing a 10-minute freshness window.
Done when:
- Session folder captures the scope (plan + hub update entry) and SESSIONS_HUB/index point at it.
- PageExecutionService emits PAGE telemetry that the CLI renders via progressAdapter without the legacy noisy link logs.
- Legacy crawl CLI accepts `--seed-from-cache` / `--cached-seed` and NewsCrawler defaults `maxAgeHubMs` to 10 minutes so cached hubs refresh automatically.
- Docs + help text mention the new flags/default, and regression/unit tests cover the CLI normalization + PAGE event formatting.
- Targeted Jest suites run green for the touched areas.
Change set: `docs/sessions/2025-11-18-crawl-output-refresh/*`, `docs/INDEX.md`, `AGENTS.md`, `src/crawler/PageExecutionService.js`, `src/crawler/cli/progressAdapter.js`, `src/crawler/cli/argumentNormalizer.js`, `src/crawler/cli/runLegacyCommand.js`, `src/crawler/NewsCrawler.js`, related Jest tests.
Risks/assumptions: Adding console interception for PAGE events must not swallow unrelated logs; defaulting `maxAgeHubMs` changes crawl freshness behavior so tests/documentation must anchor the expectation; CLI parsing has many legacy edge cases.
Tests: `npm run test:by-path src/crawler/cli/__tests__/argumentNormalizer.test.js`, `npm run test:by-path src/crawler/cli/__tests__/progressAdapter.test.js` (new), plus any additional suites touched by code changes.
Benchmark (if DB-heavy): Not applicable; logic changes are CLI/logging only.
Docs to update: `docs/sessions/2025-11-18-crawl-output-refresh/INDEX.md`, `docs/INDEX.md`, `AGENTS.md`.
