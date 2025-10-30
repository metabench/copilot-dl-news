# CHANGE_PLAN.md

## Goal
- Provide a reusable, testable workflow for geography crawl SPARQL queries by introducing a query runner CLI, centralizing query templates, tightening their structure, and aligning documentation with the new tooling.

## Current Behavior
- Geography-focused SPARQL strings live inline in `WikidataCountryIngestor`, `WikidataAdm1Ingestor`, and `WikidataCitiesIngestor`, making review and reuse outside the ingestion pipeline difficult.
- `WikidataService` offers caching and query helpers but ingestors construct strings manually and the wider codebase lacks a lightweight way to execute the queries ad hoc.
- There is no CLI to validate or debug the SPARQL queries used by the geography crawl, so verifying query changes requires running the entire ingestion flow.
- Documentation for the geography crawl references SPARQL usage conceptually but does not surface the exact queries or describe how to test them in isolation.

## Proposed Changes
1. **Centralize query construction — ✅** Shared builders now live in `src/crawler/gazetteer/queries/geographyQueries.js` with reusable language lists and helper exports.
2. **Adopt builders in ingestors — ✅** Country, ADM1, and city ingestors call the shared builders instead of ad-hoc multiline templates, keeping telemetry and caching intact.
3. **Create CLI query runner — ✅** Added `src/tools/geography-crawl-queries.js` with list/print/run modes, country scoping, and JSON output for direct SPARQL validation.
4. **Improve SPARQL templates — ✅** Queries use `VALUES` blocks, `[AUTO_LANGUAGE]` label services, optional filters, and consistent ordering to reduce drift across call sites.
5. **Update docs and tests — ✅** Geography crawl docs highlight the CLI workflow, and `tests/unit/geography/GeographyQueries.test.js` guards the builders.

## Risks & Unknowns
- Real-time SPARQL execution from the CLI may hit Wikidata rate limits; need sensible defaults (sleep, max rows) and clear warnings.
- Refactoring ingestors must avoid subtle behavior changes (ordering, limits, or clauses that downstream logic expects).
- Some countries rely on fallback query logic; ensure centralization does not remove country-specific handling or reduce coverage.
- Documentation might reference legacy command names; need to audit for consistency after edits.

## Integration Points
- `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js`
- `src/crawler/gazetteer/ingestors/WikidataAdm1Ingestor.js`
- `src/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js`
- `src/crawler/gazetteer/services/WikidataService.js`
- New query module under `src/crawler/gazetteer/queries`
- CLI entry in `src/tools/geography-crawl-queries.js` (and potential package.json script shortcut)
- Geography crawl documentation under `docs/`

## Docs Impact
- `docs/GEOGRAPHY_CRAWL_TYPE.md` – add CLI usage and note the centralized queries.
- `docs/GEOGRAPHY_E2E_TESTING.md` (and any related quick references) – mention how to validate queries outside the crawl.
- If other docs enumerate tooling, add the CLI to the relevant section (e.g., tooling indexes or README snippets).

## Focused Test Plan
- `node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath tests/unit/gazetteer/WikidataCountryIngestor.test.js`
- `node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath tests/unit/geography/GeographyQueries.test.js`
- (Optional) When dedicated ADM1/cities suites are introduced, run their counterparts to keep ingestion coverage aligned.

## Rollback Plan
- Delete the query builder module and CLI file; revert ingestor imports to their previous inline strings.
- Restore documentation changes and remove any package.json script additions.
- Re-run targeted Jest suites to confirm ingestion behavior matches baseline.

## Latest Summary
- Centralized the Wikidata queries into `geographyQueries.js`, updated the country/ADM1/city ingestors to reuse them, and shipped the `geography-crawl-queries.js` CLI with documentation.
- Tests executed: `node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath tests/unit/gazetteer/WikidataCountryIngestor.test.js`, `node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath tests/unit/geography/GeographyQueries.test.js`.
