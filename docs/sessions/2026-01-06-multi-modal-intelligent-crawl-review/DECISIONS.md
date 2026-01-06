# Decisions – Multi-modal crawl review and parallelization

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2026-01-06 | SQL in multi-modal crawler + services | Moved SQL into SQLite adapter queries (`multiModalCrawl.js`, `patternLearning.js`) and resolved queries via adapter helpers. | Orchestrators/services stay SQL-free; requires adapter coverage when adding new query needs. |
| 2026-01-06 | Reanalysis by layout signature | Stubbed signature-based reanalysis until schema persists signature→URL mappings; fall back to confidence/version reanalysis. | Reanalysis works but is less targeted; follow-up to persist signature mapping if needed. |
| 2026-01-06 | Default crawl mode | Set multi-modal as default via `crawlDefaults.mode` + runner dispatch (ADR `docs/decisions/2026-01-06-multi-modal-default.md`). | Default runs now use multi-modal; sequence presets remain for explicit use. |
