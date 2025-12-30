# Decisions – Geo Import Progress Tree Telemetry

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-21 | Need the Nested Progress panel to light up from a real workflow (not just lab fixtures). | Emit `crawl:progress-tree:*` events from `StagedGazetteerCoordinator` for `wikidata-cities`, using throttling + node caps to prevent spam. | Real runs show nested progress automatically; tests may observe only 2 events due to throttling in tight loops. |
| 2025-12-21 | Tests using `initGazetteerTables(:memory:)` failed because schema init returned early under statement-mode schema-definitions. | Teach `src/db/sqlite/v1/schema.js` init helpers to apply statement-mode schema subsets (or fall back to full schema) instead of no-op. | In-memory tests become representative; missing-table warnings/errors removed. |
