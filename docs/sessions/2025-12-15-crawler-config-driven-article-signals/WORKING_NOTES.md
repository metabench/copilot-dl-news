# Working Notes – Config-driven ArticleSignals patterns

## 2025-12-15

- Implemented config-driven article URL heuristics: `DecisionConfigSet.articleSignals` now carries `skipPatterns`, `articlePatterns`, and `datePathRegex`.
- `ArticleSignalsService` consumes `decisionConfigSet.articleSignals` (or explicit `articleSignalsConfig`) with safe defaults.
- `CrawlerServiceWiring` loads a config set synchronously when `decisionConfigSetSlug` (options) or `DECISION_CONFIG_SET_SLUG` (env) is provided.
- `CrawlerServiceWiring` also attempts a best-effort async load of the active config set from `news.db` (if available) and applies `configSet.articleSignals`.
- Updated `config/decision-sets/baseline-2025-12-08.json` to include `articleSignals` so this can be tuned without code edits.
- Added unit tests: `tests/crawler/unit/ArticleSignalsService.test.js`.

- 2025-12-15 — Session created via CLI. Add incremental notes here.
