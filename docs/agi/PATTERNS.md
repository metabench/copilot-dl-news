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
