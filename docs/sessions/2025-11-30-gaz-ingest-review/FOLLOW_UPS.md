# Follow Ups – Gazetteer ingestion review

- Fix `populate-gazetteer.js`: respect `checkIngestionRun`’s `{ shouldSkip, lastRun }` shape instead of treating any return as a completed run.
- Replace the undefined `opt.verbose` reference in the capital dedup block with the actual verbose flag to avoid ReferenceError when dedup matches trigger logging.
- Call `HttpRequestResponseFacade.cache/getCachedHttpResponse` as static methods (or add instance wrappers) so SPARQL response caching works again.
- Point `src/tools/gazetteer_qa.js` at `src/db/sqlite/v1/tools/gazetteerQA.js` (or re-export), and add a smoke test to prevent missing-module regressions.
- Consolidate ingestion helpers: declare a single supported module (`src/db/sqlite/v1/queries/gazetteer.ingest.js`) and update callers/tests to avoid divergence from `src/db/sqlite/queries/gazetteer.ingest.js`.
- Rebuild `better-sqlite3` for the current environment to unblock running `populate-gazetteer` and ingestion-related tests locally.
