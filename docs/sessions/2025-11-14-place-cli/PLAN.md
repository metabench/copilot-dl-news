# Plan: place-cli
Objective: Allow agents to run place-focused discovery workflows (GuessPlaceHubs, place hub exploration) directly from the CLI without needing ad-hoc scripts.
Done when:
- GuessPlaceHubs can be triggered via `crawl.js` with straightforward arguments and sensible defaults.
- Place hub exploration defaults are exposed through the CLI with discoverable help text.
- Availability output highlights the new workflows so agents can find them quickly.
- Documentation in this session captures decisions and next steps for follow-up.
Change set: crawl.js, src/crawler/CrawlOperations.js, src/crawler/operations/index.js, new place-focused operation modules or helpers, docs/sessions/2025-11-14-place-cli.
Risks/assumptions: Assumes existing NewsCrawler supports required `crawlType` settings for place hub exploration; GuessPlaceHubs dependencies will close cleanly after runs to avoid DB locks; CLI parsing must stay Windows-friendly.
Tests: Add focused unit coverage where feasible (e.g., operation registration sanity) and rely on manual CLI smoke test instructions.
Docs to update: docs/sessions/2025-11-14-place-cli notes; consider README snippet if CLI surface changes are substantial.
