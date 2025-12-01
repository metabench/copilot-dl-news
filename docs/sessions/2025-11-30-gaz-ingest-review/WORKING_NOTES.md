# Working Notes – Gazetteer ingestion review

- 2025-11-30 — Session created via `node tools/dev/session-init.js --slug "gaz-ingest-review" --type "analysis" --title "Gazetteer ingestion review" --objective "..."`
- 2025-11-30 — Searched gazetteer-related files with `rg --files -g '*gazetteer*'` and skimmed prior session docs (2025-06-20 ingestion robustness, 2025-10-23 DB cache refactor).
- 2025-11-30 — Reviewed ingestion tooling:
  - `src/tools/populate-gazetteer.js` (REST Countries + optional Wikidata). Noted: (1) ingestion run guard misuses `checkIngestionRun` return shape, so it always takes the skip path with `Invalid Date`; (2) `opt.verbose` reference inside capital deduplication is undefined → potential runtime crash when dedup hits; (3) SPARQL caching uses `const facade = new HttpRequestResponseFacade(raw)` then calls instance methods that don’t exist on the class, so Wikidata cache is effectively disabled (warns and falls through).
  - `src/db/sqlite/v1/queries/gazetteer.ingest.js` vs `src/db/sqlite/queries/gazetteer.ingest.js`: two versions diverge (v1 adds `place_type`, but the non-v1 version updates canonical names; risk of callers picking the wrong one).
  - `src/tools/import-gazetteer.js` uses `initGazetteerTables` but bypasses ingestion_run tracking and dedup; good for raw imports but not instrumented.
  - `src/tools/gazetteer-cleanup.js` and `src/db/sqlite/v1/queries/gazetteer.deduplication.js` confirm cleanup/dedup strategies; dedupe module exports `checkIngestionRun` API expected by populate tool.
  - `src/tools/gazetteer_qa.js` requires `../db/sqlite/tools/gazetteerQA` (path does not exist; actual file is `src/db/sqlite/v1/tools/gazetteerQA.js`) → module currently broken.
- 2025-11-30 — Attempted to run `node src/tools/populate-gazetteer.js --db=tmp/gazetteer-test.db --countries=IE --offline`; blocked by `better-sqlite3` native module error (`invalid ELF header`). Unable to validate runtime behavior locally without rebuilding the native module.
