# Working Notes – Crawl CLI logger wiring

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- 2025-12-06 — Refactored crawl.js to delegate logger/args/reporting/runner helpers to src/cli/crawl modules; kept command surface intact.
- 2025-12-06 — Tests: npm run test:by-path tests/cli/crawl.logger.test.js (pass).
- 2025-12-06 — Extracted CLI command registry into src/cli/crawl/commands.js so crawl.js only wires handlers; reran crawl.logger.test.js (pass).
- 2025-12-06 — Moved place handlers (guess/explore) into src/cli/crawl/place.js; crawl.js now stays orchestration-only. Tests: crawl.logger.test.js (pass).
- 2025-12-06 — Centralized help text into reporting.printCrawlHelp and import printAvailabilitySummary at module scope in commands.js to cut inline requires. Tests: crawl.logger.test.js (pass).
