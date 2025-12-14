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
1. Distill the validated outcome into a Skill (SOP + commands + validation) so future work starts from a known-good recipe (see `docs/agi/skills/jsgui3-lab-experimentation/SKILL.md`).



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

## WLILO Tokens + Panels for jsgui3 UI

**Added**: 2025-12-13
**Context**: WLILO (White Leather + Industrial Luxury Obsidian) design system Skills

**When to use**: Styling or polishing a jsgui3 UI (dashboards/tables/detail views) and you want a consistent WLILO look without per-element ad-hoc colors

**Steps/Details**:
1. Define a small CSS token set on a root container (e.g., `.wlilo-app`) using CSS variables (bg, panel, border, text, muted, gold accent).
2. Apply layout hierarchy: leather page background → obsidian panels → content.
3. Use semantic classes (`.wlilo-panel`, `.wlilo-table`, `.wlilo-table__row`) instead of inline styles.
4. Use emoji action icons consistently: 🔍/⚙️/➕/🗑️/✏️/🔄.
5. Keep control counts lean: render repeated rows/cells as plain HTML when possible; paginate/virtualize beyond ~200 rows.
6. Validate via the nearest `checks/*.check.js` and a focused Jest suite if behavior changed.

**Example**: Skills `wlilo-design-system` + `jsgui3-wlilo-ui`

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

## Skill Pack as Capability SOP

**Added**: 2025-12-13
**Context**: Repo-native emulation of Claude-like skills; improves agent handover + discoverability

**When to use**: When a workflow recurs across sessions/agents, or when handovers are failing because the procedure lives only in ephemeral chat context.

**Steps/Details**:
1. Create docs/agi/skills/<slug>/SKILL.md with: intent, when-to-use triggers, prerequisites, step-by-step commands, validation steps, and common failure modes.
1. Add the skill to the registry (docs/agi/SKILLS.md) with tags and a one-line purpose.
1. Reference at least one concrete check/test command (e.g., node <checks/*.check.js> or npm run test:by-path …) so the skill is self-verifying.
1. Link to the best prior session(s) in docs/sessions/ as ‘evidence’ and to avoid rewriting deep context.
1. After using the skill successfully, append one improvement note to LESSONS.md (tight, single idea).

**Example**: docs/agi/skills/*/SKILL.md + docs/agi/SKILLS.md registry

---

## jsgui3 Shared Control Template

**Added**: 2025-12-13
**Context**: jsgui3 isomorphic UI development

**When to use**: Creating a new reusable jsgui3 control for SSR + client activation

**Steps/Details**:
1. 1. Define CONTROL_TYPE constant for registration key
1. 2. Create class extending jsgui.Control with __type_name in constructor
1. 3. Store config (immutable) and state (mutable) in separate private objects
1. 4. Only call compose() if !spec.el (SSR path)
1. 5. In compose(): build child controls and store references with _xxxEl naming
1. 6. Implement activate(el): guard with __activated flag, bind events to this._rootEl
1. 7. Add public methods (getValue/setValue pattern) that update both state and DOM
1. 8. Export class and call registerControlType()
1. 9. Add to controlManifest.js if client activation is needed
1. 10. Create checks/XxxControl.check.js with test fixtures and assertions

**Example**: See src/ui/controls/UrlFilterToggle.js for complete implementation

---

## jsgui3 DOM Reference Pattern

**Added**: 2025-12-13
**Context**: jsgui3 control state synchronization

**When to use**: Control needs to update DOM after activation without full re-render

**Steps/Details**:
1. 1. In compose(), store child control references: this._labelEl = new jsgui.span(...)
1. 2. In activate(), resolve DOM elements: this._rootEl = el || this.dom.el
1. 3. For nested elements, use querySelector: this._labelEl.dom.el = this._rootEl.querySelector('.my-class')
1. 4. Create ensureDomRefs() helper for lazy DOM resolution
1. 5. In update methods, check existence before access: if (this._labelEl?.dom?.el) { ... }
1. 6. For text updates, use textContent: this._labelEl.dom.el.textContent = newValue
1. 7. For class updates, use classList: this._rootEl.classList.add/remove/toggle()

**Example**: z-server/ui/controls/scanningIndicatorControl.js ensureDomRefs() method

---

## jsgui3 Table Cell Value Types

**Added**: 2025-12-13
**Context**: Data display in jsgui3 tables

**When to use**: Populating TableControl rows with different content types

**Steps/Details**:
1. 1. Plain text: { key: 'col' } with row data { col: 'text' }
1. 2. Link cell: { col: { text: 'Label', href: '/path', title: 'Tooltip', target: '_blank' } }
1. 3. Control cell: { col: { control: new jsgui.Control(...) } }
1. 4. Styled text: { col: { text: 'value', classNames: ['highlight'], align: 'right' } }
1. 5. Raw HTML (escape carefully): { col: { html: '<span class="badge">New</span>' } }
1. 6. Stacked content: use html with <br> or nested spans for multi-line cells
1. 7. Empty/null: returns empty string, renders as blank cell

**Example**: src/ui/controls/Table.js _normalizeCellSpec() method

---

## Dual-Surface Theme Tokens (WLILO)

**Added**: 2025-12-13
**Context**: Data Explorer / themeService + dataExplorerCss

**When to use**: UI uses a light page background with dark panels (WLILO) and needs correct text contrast on both surfaces.

**Steps/Details**:
1. Add theme tokens for both contexts: bg (light) + surface (dark) text variants (e.g., `text*` for bg, `surfaceText*` for panels).
1. In CSS, keep body using `--theme-bg`/`--theme-text` and make panel-like containers set `color: var(--theme-surface-text, var(--theme-text))`.
1. For components with `background: var(--theme-surface)` (nav pills, panels, inputs), use `--theme-surface-text*` for `color` and placeholders.
1. If you want gradients, add `bgGradient` (or `bgImage`) instead of overloading `bg` (since `bg` may be used as a text color elsewhere).
1. Seed system themes (e.g., `wlilo`, `obsidian`) so apps can select via `?theme=` and checks stay deterministic.

**Example**: src/ui/server/services/themeService.js + src/ui/styles/dataExplorerCss.js

---

## Encoded Search Tokens for Unicode-Unfriendly Shells

**Added**: 2025-12-13
**Context**: md-scan + emoji-encode

**When to use**: You need to search for emoji/unusual Unicode tokens but the terminal/shell may strip or normalize characters (common on Windows/PowerShell, CI logs, or copy/paste pipelines).

**Steps/Details**:
1. Provide an encoder that accepts codepoints (not literal emoji) and emits UTF-8 `hex` + `base64`.
1. Teach the search tool to accept prefixed encoded tokens (e.g., `b16:`/`b64:`) and decode to the real Unicode string before matching.
1. Add an inventory mode to list all emojis in a directory with locations and encodings for copy/paste into searches.
1. Add regression tests that avoid literal emoji (use codepoints/encoded bytes).

**Example**: docs/workflows/emoji_search_markdown.md and tools/dev/emoji-encode.js

---
