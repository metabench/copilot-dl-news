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

## Testing Wrong Response Structure Path

**Added**: 2025-12-12
**Context**: General

**When to use**: Symptoms: Test assertions fail on properties that should exist; undefined or null when accessing nested objects

**Steps/Details**:
1. Why it's bad: API response structures often wrap data in envelopes (meta, data, pagination). Assuming the wrong nesting level causes false failures and wastes debugging time.
1. Better approach: Before writing assertions, log or inspect the actual response body structure. Check existing tests for the same endpoint to see the correct path. Use optional chaining in diagnostics: console.log(response.body?.meta?.pagination).

**Example**: Test checked response.body.pagination but actual structure was response.body.meta.pagination

---

## Hidden Skill in Prompt-Only Lore

**Added**: 2025-12-13
**Context**: AGI docs + handover reliability

**When to use**: Symptoms: Agents repeatedly ask how to do the same workflow; success depends on a specific prompt incantation; sessions show duplicate investigations.

**Steps/Details**:
1. Why it's bad: Knowledge isn’t discoverable or reusable; handovers fail because the procedure isn’t indexed and can’t be searched/validated reliably.
1. Better approach: Create a small skill pack (SKILL.md) with runnable commands + validation, link it from the skills registry, and record a one-line lesson after each improvement.

**Example**: Replace repeated ad-hoc ‘how do I run X’ chat with a skill pack + registry entry.

---

## Composing During Activation

**Added**: 2025-12-13
**Context**: jsgui3 control development

**When to use**: Symptoms: Control calls compose() or creates child controls inside activate(). Results in duplicate DOM elements or missing children on SSR-rendered pages.

**Steps/Details**:
1. Why it's bad: SSR-rendered HTML already has the DOM structure. Composing again creates duplicates and breaks hydration. Activation should only bind events, not create structure.
1. Better approach: Only call compose() in constructor when `!spec.el`. In activate(), query existing DOM elements and bind event handlers. Pattern: `if (!spec.el) { this.compose(); }`



---

## Forgetting __type_name Registration

**Added**: 2025-12-13
**Context**: jsgui3 control development

**When to use**: Symptoms: Control works in check scripts and Jest but fails with `Missing context.map_Controls[type]` or silently renders without interactivity in the browser.

**Steps/Details**:
1. Why it's bad: Without __type_name, jsgui3-client cannot find the constructor to activate the SSR markup. The HTML renders but events never bind.
1. Better approach: Always set `__type_name` in constructor: `super({ ...spec, __type_name: 'my_control' })`, then call `registerControlType('my_control', MyControl)` and add to `controlManifest.js`.



---

## Direct DOM Mutation in Constructor

**Added**: 2025-12-13
**Context**: jsgui3 control development

**When to use**: Symptoms: Control tries to access `this.dom.el.querySelector()` or `document.querySelector()` in the constructor. Throws errors on server-side rendering where DOM doesn't exist.

**Steps/Details**:
1. Why it's bad: On the server, there's no real DOM. `this.dom.el` is null until the HTML is rendered and parsed in the browser. Direct DOM access breaks SSR.
1. Better approach: Use jsgui control composition in constructor/compose(). Only access real DOM in activate() which runs client-side. Store control references (`this._labelEl`), not DOM nodes, during compose.



---
