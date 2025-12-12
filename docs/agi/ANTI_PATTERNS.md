# Anti-Patterns Catalog

AGI-accumulated knowledge catalog.

---


## Factory That Just Wraps Constructor

**Added**: 2025-12-03
**Context**: CrawlerFactory.js analysis

**When to use**: Symptoms: Factory class with single create() method that just calls new Target()

**Steps/Details**:
1. Why it's bad: Adds indirection without value
1. Better approach: Use constructor injection directly (new Target(url, options, services))

**Example**: See session 2025-11-21-crawler-refactor

---

## Breaking Public API During Extraction

**Added**: 2025-12-03
**Context**: NewsCrawler.js refactoring, any large class modularization

**When to use**: Symptoms: Changing method signatures, removing methods, requiring callers to import extracted modules directly, breaking existing tests

**Steps/Details**:
1. Why it's bad: Extraction should be invisible to callers. Breaking changes create cascading work across the codebase and risk regressions. The original class becomes a facade that delegates to extracted services.
1. Better approach: Keep public API stable. New code delegates to extracted services. Old tests keep passing. Add new tests for extracted service. Example: NewsCrawler.processPage() still works but internally calls this.pageExecutionService.processPage()

**Example**: Moving NewsCrawler.crawlConcurrent to a separate file but changing its signature or requiring callers to import the new module

---

## InnerHTML log rendering

**Added**: 2025-12-07
**Context**: crawl-widget/ui/controls/CrawlLogViewerControl.js

**When to use**: Symptoms: UI components render log lines via innerHTML templates to rebuild lists

**Steps/Details**:
1. Why it's bad: innerHTML bypasses jsgui control lifecycle, risks injection, and breaks control-level event wiring expectations
1. Better approach: Construct line elements via jsgui controls or safe DOM createElement/textContent; avoid innerHTML for dynamic log/output rendering

**Example**: Previous implementation used containerEl.innerHTML = ... with string interpolation to render log lines

---

## Debug-by-Guessing Instead of a Lab Experiment

**Added**: 2025-12-11
**Context**: jsgui3 lifecycle and event/delegation behaviors

**When to use**: Symptoms: Repeated trial edits to controls/activate/event handlers; lots of searches but no deterministic reproduction; changes made “because it seems right”; hard-to-explain regressions; no check script.

**Steps/Details**:
1. Why it's bad: It burns time, creates fragile fixes, and leaves no reusable artifact for future agents; jsgui3 lifecycle issues are often context-dependent (SSR vs client activation, dom.el linking, bubbling/capture).
1. Better approach: Do md-scan first; if the docs don’t answer, create a minimal src/ui/lab experiment with a check script; validate hypotheses with deterministic assertions; then update guides and/or production code with confidence.



---

## Puppeteer E2E Running Against Stale Client Bundle

**Added**: 2025-12-11
**Context**: Art Playground undo/redo E2E (fill edit)

**When to use**: Symptoms: Puppeteer/Jest E2E fails in ways that contradict server/isomorphic code changes; added debug instrumentation in source never appears in the browser; UI behavior seems "old" even after edits; rebuild makes tests suddenly pass.

**Steps/Details**:
1. Why it's bad: You waste time debugging the wrong layer (event wiring/undo logic) because the browser is executing outdated bundled JS. This leads to non-reproducible fixes, churny diagnostics, and false conclusions about the underlying app logic.
1. Better approach: Treat the browser bundle as an explicit dependency: rebuild it (or assert freshness) before E2E runs. When debugging, verify the served bundle includes your recent changes (e.g., a version stamp or temporary sentinel string) before changing app logic.

**Example**: `tests/ui/e2e/art-playground.puppeteer.e2e.test.js` failed until running `node scripts/build-art-playground-client.js`.

---
