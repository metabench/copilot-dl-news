# Plan: crawl-config-workspace

Objective: Ship the first four crawl configuration UI features (workspace, drawer, timeline/impact, diff mini-map) inside the jsgui3 controls library so agents can inspect live config data quickly.

Done when:
- Config workspace renders grouped property grid tabs sourced from `config/crawl-runner.json` and section metadata.
- Crawl profile drawer surfaces sequence metadata + overrides using existing behavior panel plumbing.
- Behavior timeline/impact view provides a sequential visualization of steps with quick stats.
- Config diff mini-map highlights overrides vs defaults with clear indicators and hover detail.

Change set:
- `src/ui/controls/ConfigMatrixControl.js`
- `src/ui/controls/CrawlBehaviorPanelControl.js`
- `src/ui/controls/index.js`
- `src/ui/controls/checks/*.check.js`
- `tests/ui/controls/*.test.js`
- `docs/sessions/2025-11-20-crawl-config-workspace/*`

Risks/assumptions:
- Config files remain small enough to load eagerly on the client.
- Behavior data model stays compatible with existing tests.
- UI additions must avoid breaking consumers that rely on the existing API.

Tests:
- Expand `ConfigMatrixControl` + `CrawlBehaviorPanelControl` Jest snapshots/fixtures.
- Add/update checking scripts to render new UI surfaces manually.

Benchmark:
- N/A (UI-only for now).

Docs to update:
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/2025-11-20-crawl-config-workspace/WORKING_NOTES.md`
- Follow-up doc additions depending on discoveries.
