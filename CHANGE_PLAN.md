# CHANGE_PLAN.md

## Goal / Non-Goals
- **Goal:** Centralise navigation vs. article link heuristics so that analyzers, CLIs, and crawler components share the same classification and counting logic.
- **Non-Goals:** We are not refactoring the crawler’s `LinkExtractor` internals or changing how fetch records persist link arrays. The focus is on consolidating the lightweight counting code paths used outside the crawler pipeline.

## Current Behavior
- `src/analysis/page-analyzer.js` hand-rolls link counts by scanning anchors with inline heuristics (date-like paths, slug depth, host comparison).
- Scripts such as `src/tools/show-analysis.js` and `src/tools/analyse-pages-core.js` reconstruct similar counts when presenting results, leading to divergent heuristics over time.
- The crawler already exposes a richer `LinkExtractor`, but the offline analyzers cannot reuse it without bespoke plumbing, so they drift.

## Refactor & Modularization Plan
1. **Introduce `linkClassification` utility:** Create `src/utils/linkClassification.js` exporting a `summarizeLinks({ url, document })` helper that encapsulates the existing anchor-iteration heuristics and returns `{ total, nav, article, details }` data.
2. **Adopt helper in page analyzer:** Replace the inline link counting block in `src/analysis/page-analyzer.js` (including preparation timings) with a call to the new helper so the high-level function focuses on orchestration only, and extend the same helper to ancillary analysis scripts (e.g., `scripts/hub-analysis-workflow.js`) so offline tooling shares the exact classification.
3. **Surface helper output in analysis metadata:** Persist the helper’s summary (e.g., under `analysis.meta.linkSummary`) so offline tooling can consume consistent counts without recalculating HTML.
4. **Backfill unit coverage:** Add targeted tests for the new helper (e.g., in `src/utils/__tests__/linkClassification.test.js`) to guard the heuristics that were previously implicit.

## Patterns to Introduce
- `summarizeLinks({ url, document })` will expose a neutral API that callers can feed with a JSDOM document or raw HTML (internally building cheerio as needed).
- The helper will normalise host comparisons and slug heuristics in one place, making it easier to evolve the rules without surveying every consumer.

## Risks & Unknowns
- The helper must match existing behaviour exactly; otherwise hub detection metrics may shift. Mitigate by porting the current logic verbatim and validating with unit tests that capture representative URLs.
- Some consumers may run without full HTML (e.g., fetch rows from DB only). Ensure the helper gracefully handles missing DOM input and callers keep existing fallbacks.

## Docs Impact
- No public docs change is required. Internal module comments will describe the helper for future contributors.

## Focused Test Plan
- `node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath src/analysis/__tests__/page-analyzer.test.js`
- `node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath src/analysis/__tests__/page-analyzer-xpath.test.js`
- `node --experimental-vm-modules node_modules/jest/bin/jest.js --runTestsByPath src/utils/__tests__/linkClassification.test.js`

## Rollback Plan
- Delete `src/utils/linkClassification.js`, restore the previous inline logic in `page-analyzer` and the CLI consumer, and remove the new unit tests.
- Re-run the focused tests above to confirm behaviour matches baseline after reverting.

## Refactor Index
- `page-analyzer` link counting block → `linkClassification.summarizeLinks`.
- `analysis.meta.linkSummary` stores helper output for downstream tooling.
- New unit suite `src/utils/__tests__/linkClassification.test.js` protects the shared behaviour.
