# Refactoring Patterns Catalog

AGI-accumulated knowledge catalog.

---


## Constructor Injection for Testability

**Added**: 2025-12-03
**Context**: NewsCrawler refactoring

**When to use**: Class manually creates dependencies in constructor, making it hard to test

**Steps/Details**:
1. Identify dependencies created inside constructor
1. Add optional third parameter: services = {}
1. Use pattern: this.dep = services.dep ?? new Dep()
1. Update tests to inject mocks via services parameter

**Example**: new NewsCrawler(url, options, { fetchPipeline: mockPipeline })

---

## Safe Method Delegation Helper

**Added**: 2025-12-03
**Context**: Crawler dbClient refactoring, December 2025

**When to use**: When a class wraps another object and needs to call its methods with fallback behavior if the object/method is missing or throws

**Steps/Details**:
1. Create a private helper like `_callX(methodName, fallback, ...args)` that checks existence and wraps with safeCall
1. Replace all `if (!this.x || typeof this.x.method !== 'function') return fallback; try { return this.x.method(...args); } catch (_) { return fallback; }` with one-liner calls
1. Ensure fallback values match original behavior exactly
1. Keep the helper private (underscore prefix) as it's an implementation detail

**Example**: dbClient.js _callDb and _callNewsService helpers

---

## Centralized safeCall for Non-Critical Operations

**Added**: 2025-12-03
**Context**: Crawler cleanup session, December 2025

**When to use**: When you have multiple try/catch blocks that swallow errors for non-critical operations like logging, telemetry, cache writes, or persistence

**Steps/Details**:
1. Create shared utilities: safeCall(fn, fallback) for sync, safeCallAsync(fn, fallback) for async
1. Replace `try { x(); } catch (_) {}` with `safeCall(() => x())`
1. Replace `try { return x(); } catch (_) { return fallback; }` with `safeCall(() => x(), fallback)`
1. Add unit tests for the utilities themselves
1. When mocking utils in tests, use jest.requireActual to preserve real exports

**Example**: src/crawler/utils.js safeCall, safeCallAsync, safeHostFromUrl

---

## Modularize God Class via Service Extraction

**Added**: 2025-12-03
**Context**: NewsCrawler.js 2579 lines, 25+ injected services, wireCrawlerServices function at line 2280+

**When to use**: Class exceeds 1000 lines with multiple distinct responsibilities. In NewsCrawler.js (2579 lines), 8 cohesive service groups are identifiable by method prefixes and collaborator patterns.

**Steps/Details**:
1. 1. INVENTORY: Map method groups by prefix (_run*, _seed*, _finalize*, etc.) and identify injected services already extracted
1. 2. IDENTIFY COHESIVE GROUPS: In NewsCrawler, these are: (A) Startup/Init (init, _trackStartupStage, _markStartupComplete ~150 lines), (B) Execution Loop (_runSequentialLoop, _runConcurrentWorkers, _pullNextWorkItem ~200 lines), (C) Problem Resolution (_handleProblemResolution, _hydrateFromHistory ~100 lines), (D) Priority/Scheduling (computePriority, computeEnhancedPriority, _applyHubFreshnessPolicy ~150 lines), (E) Sequence Runner (_ensureStartupSequenceRunner, _runCrawlSequence ~200 lines)
1. 3. CHECK ALREADY EXTRACTED: Many services exist (PageExecutionService, FetchPipeline, QueueManager, etc.) - don't duplicate; enhance delegation instead
1. 4. EXTRACT ONE GROUP AT A TIME: Start with most isolated (Problem Resolution has fewest dependencies)
1. 5. USE CONSTRUCTOR INJECTION: new ProblemResolutionHandler({ state, telemetry, normalizeUrl: (u) => this.normalizeUrl(u) })
1. 6. DELEGATE VIA THIN WRAPPERS: _handleProblemResolution(payload) { return this.problemResolutionHandler.handle(payload); }
1. 7. PRESERVE BACKWARD COMPAT: Keep public API (crawlConcurrent, processPage, init) unchanged
1. 8. WIRE IN wireCrawlerServices: Add new service to the wiring function for non-injected instantiation

**Example**: NewsCrawler.js modularization - see docs/sessions/2025-11-21-crawler-refactor for prior factory pattern work

---

## Extract Pure Computation to Calculator Service

**Added**: 2025-12-03
**Context**: NewsCrawler.js PriorityCalculator extraction - lowest risk first extraction target

**When to use**: Method group is pure computation (no this.state mutations, no I/O, no telemetry side effects). Look for switch statements, arithmetic, and data transformation without external calls.

**Steps/Details**:
1. 1. CREATE SERVICE: src/crawler/PriorityCalculator.js with constructor({ enhancedFeatures }) and methods compute(args), computeEnhanced(args, callbacks)
1. 2. MOVE LOGIC: Copy computePriority switch statement and computeEnhancedPriority delegation logic
1. 3. INJECT SERVICE: Add priorityCalculator to services parameter in constructor, wire in wireCrawlerServices
1. 4. DELEGATE: computePriority(args) { return this.priorityCalculator.compute(args); }
1. 5. TEST: Create PriorityCalculator.test.js testing all priority scenarios in isolation
1. 6. VERIFY: Existing queue tests still pass since public API unchanged

**Example**: computePriority() and computeEnhancedPriority() at lines 1073-1130 are pure functions with no side effects

---

## Luxury Gemstone UI Theme

**Added**: 2025-12-10
**Context**: White Leather × Obsidian Luxe theme, decision tree editor SVG

**When to use**: Creating premium/luxury UI mockups, decision trees, dashboards, or editor interfaces that need visual polish and brand differentiation

**Steps/Details**:
1. 1. Define gradient defs: bgGradient (white→cream), obsidianFrame (#1a1f2e→#0a0d14), brushedMetal (5-stop alternating #e5e1d7/#d8cba9), and gemstone gradients (3-stop bright→rich→deep)
1. 2. Define filters: dropShadow (feOffset dy=4 + feGaussianBlur stdDeviation=8) and gemGlow (feGaussianBlur stdDeviation=3 + feComposite over)
1. 3. Build layer stack: background rect → mainPanel with shadow → header bar (obsidian + rounded top) → content areas
1. 4. Create gemstone buttons: outer obsidian frame (stroke: brushed gold #d8cba9) → inner gem rect with gradient + glow → white bold text centered
1. 5. Use semantic colors: Sapphire for primary/start actions, Emerald for navigation/decision, Ruby for results/destructive
1. 6. Add polish: Yes/No labels in green/red, property panels with brushedMetal inputs, legend with color swatches, theme attribution badge

**Example**: tmp/decision-tree-editor-v2.svg

---

## SVG MCP Element Construction Order

**Added**: 2025-12-10
**Context**: svg-editor MCP workflow

**When to use**: Building complex SVGs programmatically via svg-editor MCP tools

**Steps/Details**:
1. 1. svg_create_new with desired dimensions (1200×700 is good for editors)
1. 2. Add <defs> element first, then add gradients as children with id attributes
1. 3. Add gradient <stop> elements as children of each gradient (parallel calls OK)
1. 4. Add <filter> elements to defs, then filter primitives as children
1. 5. Add background layers in order: full-canvas rect, panel rects, header bars
1. 6. Create positioned groups with transform='translate(x,y)' for toolbar, tree, sidebar
1. 7. Add edges/paths BEFORE nodes so nodes render on top
1. 8. Add node frames, then gem fills, then text labels (parallel OK for independent elements)
1. 9. Run svg_detect_collisions with onlyStats:true to verify no HIGH severity issues
1. 10. svg_save and svg_close when complete

**Example**: tmp/decision-tree-editor-v2.svg creation session

---

## Lab-First jsgui3 Knowledge Gap Closure

**Added**: 2025-12-11
**Context**: jsgui3 work in this repo should default to small lab experiments for unknowns; treat the lab as the safe proving ground before touching production UI.

**When to use**: You hit an undocumented jsgui3 behavior, UI lifecycle mystery, performance question, or event/delegation edge case; or you’ve spent >10–15 minutes debugging with low confidence.

**Steps/Details**:
1. Search existing docs first (fast): run md-scan on guides, then docs, then docs/sessions for the topic/keywords.
1. If no clear answer emerges, create a minimal lab experiment under src/ui/lab/experiments/ (smallest reproduction; SSR + client activation if relevant).
1. Add a check script alongside the experiment (under the experiment’s checks/ folder or the repo’s expected lab check harness) that renders/asserts the behavior deterministically.
1. Wire the experiment into the lab manifest/catalog (keep status: proposed|active|validated|promoted|deprecated) and update the lab README if required.
1. Run the experiment check and record the finding (what worked, what failed, edge cases). Promote the discovery into a durable guide if it’s generally useful.
1. If the behavior affects bubbling/capture/selector semantics, also run the delegation suite scenarios relevant to keep parity with existing experiments.



---

## Bundle Freshness Gate for E2E

**Added**: 2025-12-11
**Context**: Art Playground + Puppeteer undo/redo tests

**When to use**: Any E2E test suite that depends on an ESBuild/Webpack/Vite/etc bundle served by the app (especially SSR+activation apps).

**Steps/Details**:
1. Add a deterministic bundle build step to the E2E workflow (pretest hook or test harness setup).
1. Optionally embed a build stamp (timestamp/git hash) into the bundle and expose it to the page (e.g., `window.__BUILD_ID__`).
1. In the E2E setup, assert the build stamp is present and matches expectations (or at least is non-empty), failing fast with a clear message if stale/missing.
1. Keep the build step fast (<1s) and cacheable so CI costs stay low.

**Example**: Build bundle with `node scripts/build-art-playground-client.js` before `npm run test:by-path tests/ui/e2e/art-playground.puppeteer.e2e.test.js`.

---

## Query Param Preservation in Pagination Links

**Added**: 2025-12-12
**Context**: General

**When to use**: Building pagination or navigation links that should preserve filter/sort state

**Steps/Details**:
1. 1. Create a base href builder that copies ALL query params from the original request
1. 2. Override only the params that change (e.g., page number)
1. 3. Use URLSearchParams or similar to handle encoding automatically
1. 4. For back-links, preserve everything except navigation-specific params (back, backLabel)
1. 5. Test with multiple filter combinations to verify preservation

**Example**: buildHref() in dataExplorerServer.js copies req.query then sets page; buildBackLinkTarget() in navigation.js copies all except back/backLabel

---

## Query Time Budget Instrumentation

**Added**: 2025-12-12
**Context**: General

**When to use**: Need to detect slow database queries without adding full APM overhead

**Steps/Details**:
1. 1. Create a timedQuery(fn, {label, thresholdMs, onSlow}) wrapper
1. 2. Use process.hrtime.bigint() for nanosecond precision
1. 3. Compare duration to threshold and call onSlow or console.warn if exceeded
1. 4. Optionally wrap statement objects to instrument .all()/.get()/.run() methods
1. 5. Keep threshold configurable (default 200ms is reasonable for UI queries)

**Example**: src/db/sqlite/v1/queries/helpers/queryTimeBudget.js - timedQuery(), instrumentStatement(), createTimedDb()

---
