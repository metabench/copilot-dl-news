# Modularisation Audit Notes

The audit below captures several recurring patterns where concrete modules could replace bespoke logic. Each item lists current behaviour, hotspots, and a proposal for a reusable abstraction.

## 1. Navigation vs. Article Link Heuristics
- **Where it lives today:** `src/analysis/page-analyzer.js` manually inspects anchor tags with ad-hoc rules while `src/crawler/LinkExtractor.js` and downstream services maintain their own classification strategies; smaller scripts such as `src/tools/show-analysis.js` and `src/tools/analyse-pages-core.js` repeat the counting logic again when presenting metrics.
- **Problems:** The heuristics drift between modules, making hub detection and fetch persistence disagree about navigation density. Page analyzer duplicates URL parsing, host comparisons, and “article slug” checks already available elsewhere, and the CLI tooling only ever sees a subset of those improvements.
- **Potential module:** A shared `LinkClassification` helper that accepts a DOM/cheerio instance and returns consistent `nav`, `article`, and `pagination` counts plus supporting evidence (host filtering, deep path detection). Both the crawler and the offline analyzer could consume it, and the CLIs could reuse it to avoid reimplementing host/path heuristics.

## 2. Article Metadata Extraction
- **Where it lives today:** `ArticleProcessor._extractArticleMetadata` walks DOM nodes with selectors that almost mirror the logic in `HtmlArticleExtractor`’s extended metadata routines. Additional scripts (e.g., analytics tooling and `src/tools/analyse-pages-core.js`) query similar fields again when persisting analysis rows.
- **Problems:** Selector drift causes inconsistent section/date detection and forces every consumer to handle canonical fallbacks manually. Updating the metadata heuristics requires touching multiple sites and re-aligning fixture data in separate test suites.
- **Potential module:** An `ArticleMetadataExtractor` utility returning normalized `{ title, section, publicationDate, canonicalUrl }` objects. The crawler, analyzer, and CLI tools would consume the same API, and tests could lock behaviour in a single place.

## 3. Gazetteer & URL Place Matching Pipelines
- **Where it lives today:** `page-analyzer`, `placeHubDetector`, and `analyse-pages-core` all rebuild “URL place analysis” chains and dedupe gazetteer detections on their own; the crawler’s hub discovery jobs repeat similar steps inside `src/tools/find-place-hubs.js`.
- **Problems:** Each site normalises chain data differently (e.g., bestChain mapping vs. matches array). Evidence packaging for hub detection becomes fragile, and new heuristics (non-geo blockers, fallback chains) must be ported by hand to every consumer.
- **Potential module:** A `PlaceDetectionContext` helper that assembles URL matches, text matches, deduped detections, and evidence metadata. Hub detection could then accept the context object instead of raw arrays, and CLI tooling could toggle diagnostics from the same structure.

## 4. HTML Processing & Readability Extraction Wrappers
- **Where it lives today:** Multiple modules now call `createJsdom`, but they still reinvent the steps for running Readability, measuring timings, and closing windows. `page-analyzer` also calculates link counts and signals inline, while tools like `backfill-dates.js` and `HtmlArticleExtractor` track their own timing metrics.
- **Problems:** Timings instrumentation and cleanup logic diverge, risking missing `window.close()` calls or inconsistent metrics. It also increases the cognitive load for any new DOM-based feature and makes benchmarking output harder to compare.
- **Potential module:** An `HtmlAnalysisSession` abstraction managing DOM lifecycle, Readability parsing, link summarisation, and instrumentation hooks. Callers request the parts they need, while cleanup remains automatic and metrics remain uniform.

## 5. Date Extraction & Normalisation
- **Where it lives today:** `src/tools/backfill-dates.js` contains both lightweight regex parsing and heavier JSDOM work. Other ingestion paths (e.g., article ingestion, export validators) need similar capabilities but currently reimplement them or go without.
- **Problems:** Only the backfill tool benefits from the hardened parser and ISO normaliser. Without a shared helper, future import/export scripts risk diverging or duplicating complex regexes, and analytics tasks cannot report extraction provenance consistently.
- **Potential module:** A `DateExtraction` utility exposing `quickScan(html)` and `fromDom(document)` that returns structured metadata `{ iso, source }`. Backfill, ingestion, and analytics services could share it, and tests could cover edge cases once.
