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

## Soft Dependency Injection for DB Access

**Added**: 2025-12-14
**Context**: DB Access Refactoring

**When to use**: When you want to simplify component instantiation (zero-config) while maintaining testability (explicit injection).

**Steps/Details**:
1. 1. Create a singleton accessor (e.g., getDb()) that auto-discovers the resource.
1. 2. In the consumer class constructor, check if the resource is provided.
1. 3. If not provided, call the singleton accessor.
1. 4. If the accessor returns a wrapper (Facade), unwrap it to get the raw handle if needed.
1. 5. Throw an error only if both injection and auto-discovery fail.



---

## Smart SVG Diagramming

**Added**: 2025-12-14
**Context**: SVG Diagram Creation

**When to use**: Creating architectural diagrams or flowcharts via MCP

**Steps/Details**:
1. Use svg_create_new to initialize a canvas
1. Use svg_smart_add to place nodes without manual coordinate math
1. Use svg_smart_add suggestions to place related nodes nearby
1. Connect nodes with paths using standard SVG commands
1. Validate with svg-collisions tool before shipping

**Example**: node tools/dev/svg-collisions.js diagram.svg --strict

---

## Dual-Channel UI Inspection (Visual + Numeric)

**Added**: 2025-12-14
**Context**: Decision Tree Viewer / general jsgui3 UIs

**When to use**: You need to understand or improve UI layout/spacing and want agent-friendly evidence before changing styles. Especially useful for jsgui3 SSR+activation UIs where screenshots alone can miss the root cause.

**Steps/Details**:
1. Ensure the target UI server supports `--check` via `src/ui/server/utils/serverStartupCheck.js`.
1. Capture a baseline screenshot via Playwright MCP (navigate + fullPage screenshot).
1. Run a Puppeteer inspector script that emits JSON layout metrics (bounding boxes, computed styles, overflow flags).
1. Use the metrics to identify which nodes overflow / misalign; then apply targeted presentation changes.
1. Re-run both screenshot + metrics to validate improvements and reduce regressions.

**Example**: docs/workflows/ui-inspection-workflow.md + scripts/ui/inspect-decision-tree-layout.js

---

## jsgui3 Persisted Fields + ctrl_fields SSR Bridge

**Added**: 2025-12-14
**Context**: jsgui3-server activation lab (experiment 020) + post-npm-update verification

**When to use**: You need server-rendered UI state available on the client during activation without extra RPC calls (e.g., counters, selected ids, simple UI flags), and you want named access to child controls after hydration.

**Steps/Details**:
1. On the server, ensure each control renders a stable `data-jsgui-id` (default) and (when needed) a meaningful `data-jsgui-type` by setting `__type_name` on the control/tag.
1. Persist scalar state into `data-jsgui-fields` (via jsgui3 Control fields/persisted fields) so the client can hydrate it into `_persisted_fields`.
1. Expose named child refs by emitting `data-jsgui-ctrl-fields` mapping (key→childId) so `pre_activate_content_controls` binds `this[key]` to the hydrated child control.
1. In the control’s `activate()`, read `_persisted_fields` to restore state, then attach handlers using the hydrated ctrl_fields refs (e.g., `this.btn.on('click', ...)`).
1. Validate end-to-end with a deterministic Puppeteer check (use experiment-style scripts like `src/ui/lab/.../check.js`) and keep it as a regression guard for dependency upgrades.



---

## Data_Model SSR→Client Bridge via Persisted Fields

**Added**: 2025-12-14
**Context**: jsgui3 lab experiments 021/022

**When to use**: When you need to transfer Data_Object state from server-side rendering to client-side activation in jsgui3 isomorphic applications.

**Steps/Details**:
1. 1. Server-side: call `this.data.model.toJSON()` to get encoded string like `"Data_Object({...})"`
1. 2. Embed the encoded string in `data-jsgui-fields` attribute: `this.dom.attributes["data-jsgui-fields"] = toSingleQuoteJson({ encodedDataModel: encoded })`
1. 3. Client-side activate(): access `this._persisted_fields.encodedDataModel`
1. 4. Decode using regex: `const m = encoded.match(/^Data_Object\((.*)\)$/); const data = JSON.parse(m[1]);`
1. 5. Populate the live model: `Object.entries(data).forEach(([k, v]) => this.data.model.set(k, v, true));` (silent=true for initial population)
1. 6. Set up change listeners after population to react to future updates

**Example**: src/ui/lab/experiments/021-data-model-mvc/client.js

---

## Safe two-way binding for Data_Object (use set, not assignment)

**Added**: 2025-12-14
**Context**: src/ui/lab/experiments/023-advanced-mvvm-patterns/client.js

**When to use**: You need two-way sync between a `Data_Object` and a view-model field, and you rely on `change` events (raw property assignment may not emit `change`).

**Steps/Details**:
1. Read initial source value and write it to target using `model.set(prop, value, true)` (silent) when seeding.
1. Listen to `sourceModel.on('change', e => ...)` and when `e.name` matches, write to target with `targetModel.set(...)` (not `targetModel[prop]=...`).
1. Listen to `targetModel.on('change', e => ...)` and when `e.name` matches, write to source with `sourceModel.set(...)`.
1. Use a lock key (`sourceProp->targetProp`, `targetProp->sourceProp`) to suppress infinite loops.
1. If string values are JSON-quoted (e.g. `"Ada"`), normalize before comparing, formatting, or validating.
1. Optionally expose an `unbind()` to remove listeners for cleanup.



---

## Thin Pointer Agent Docs

**Added**: 2025-12-19
**Context**: docs consolidation (commands/testing)

**When to use**: Multiple documents repeat the same workflow steps (especially under docs/agents vs root quick references), causing drift.

**Steps/Details**:
1. Pick the canonical doc for the workflow (prefer a single quick reference or guide).
1. Update docs/INDEX.md and AGENTS.md to route to the canonical doc.
1. Convert duplicate docs into thin pointer pages: keep frontmatter + 5-bullet TL;DR, then link to canonical doc/section.
1. Update canonical doc examples to match the actual toolchain (e.g., apply_patch/js-edit).
1. Run a repo-wide grep for the old tool/API name to ensure only archives still mention it.

**Example**: docs/agents/command-rules.md -> pointer to docs/COMMAND_EXECUTION_GUIDE.md

---

## Controlled Process Wrapper (Snapshot + SSE + Commands)

**Added**: 2025-12-21
**Context**: Full-stack methodology for jsgui3-server + UI dashboards

**When to use**: Any long-running backend job (crawl, ingest, geo import) needs to be safely controllable (start/pause/resume/stop/step) and observable by a UI without coupling the UI to internal job implementation.

**Steps/Details**:
1. Define a small, stable state envelope: {status, stageId, progress, stall, logs, startedAt, elapsed, error, controls:{pausePending,...}, step:{enabled,awaiting,token,fromStageId,nextStageId}}.
1. Expose a read path and a stream path: GET /state returns the latest snapshot; GET /events is SSE that emits init + subsequent typed events (stage-change, progress, log, stall, awaiting-step, complete, error).
1. Expose command endpoints as the ONLY write surface: POST /start (options), POST /pause, POST /resume, POST /cancel, POST /next (for step mode).
1. Implement a thin server-side wrapper around the real job that (a) owns the state envelope, (b) translates internal events into typed UI events, and (c) binds control hooks (stop/pause/resume/next).
1. Keep job internals free of HTTP/UI concerns: the wrapper injects callbacks (emitProgress, emitStage, checkPaused, awaitStep) or uses an observable/event emitter adapter.
1. Add unit tests for the wrapper primitives (e.g., step gate, pausePending) and a small check script for the UI page to validate end-to-end wiring deterministically (no ‘debug-by-guessing’).
1. Make options explicit and namespaced; return the resolved options in the init event so the UI can render what it’s actually running.

**Example**: GeoImportStateManager + SSE (/api/geo-import/events) + command endpoints; step mode via StepGate + /api/geo-import/next

---

## Mode Isolation via Namespaced Config + Plugin Contracts

**Added**: 2025-12-21
**Context**: Prevent ‘feature bleed’ between intelligent crawl and geo crawl

**When to use**: You have multiple crawl “modes” (e.g., intelligent crawl, geo-focused crawl) and features/decision rules must not leak across modes, while still allowing shared primitives (fetching, persistence, telemetry).

**Steps/Details**:
1. Define a first-class mode identifier (e.g., modeId: 'intelligent'|'geo'|'basic') and require it in every run config.
1. Split config into namespaced blocks per mode (config.intelligent.*, config.geo.*). Never share a single ‘smart’ boolean flag across modes.
1. Create a plugin/contract boundary: each mode supplies (a) decision sets, (b) prioritization policy, (c) hub discovery strategy, (d) optional enrichers. Shared core only calls through the interface.
1. At runtime, validate and log the resolved mode + decision-set IDs at startup (and expose them in the UI state envelope). Fail fast on unknown/unsupported combinations.
1. Keep mode-specific code in mode-specific modules/directories; forbid cross-imports via code review + dependency scans (js-scan ripple analysis) when refactoring.
1. Write contract tests per mode: same shared harness, different plugin implementations; test that geo mode does not activate intelligent-only features unless explicitly enabled in geo namespace.
1. Surface configuration in the UI: show active mode, active decision sets, and which optional features are ON/OFF so operators can confirm behavior before crawling.

**Example**: Separate decision-set registries: geo:place-hub-search vs intelligent:news-hub-search; shared runner consumes IModePlugin interface

---

## App Monitoring via MCP Logs

**Added**: 2026-01-02
**Context**: Added as part of AGI observability strategy - enables agents to monitor apps without parsing console output

**When to use**: When debugging app issues, understanding app behavior, or monitoring running applications. Check logs before diving into code.

**Steps/Details**:
1. 1. List log sessions: docs_memory_listLogSessions() to see what apps have been running
1. 2. Get recent logs: docs_memory_getLogs({ session: '<app>-<date>', limit: 50 })
1. 3. Filter by severity: docs_memory_getLogs({ session, level: 'warn' }) for errors/warnings only
1. 4. Search for symptoms: docs_memory_searchLogs({ query: '<error message>', level: 'error' })
1. 5. For apps to write logs: const { createMcpLogger } = require('./src/utils/mcpLogger'); logger.info('msg', { data })



---

## Classification Cascade Pattern

**Added**: 2026-01-03
**Context**: Multi-stage article classification for news crawler

**When to use**: Multiple classification signals need to be combined (URL patterns, content analysis, visual/rendered analysis). Each signal has different costs and availability.

**Steps/Details**:
1. Create independent stage classifiers with standard output format: { classification, confidence, reason, signals }
1. Each stage has clear input requirements (URL only, HTML content, rendered DOM)
1. Order stages by cost/availability: cheap pre-download → medium post-download → expensive selective
1. Create aggregator with weighted voting, override rules, and provenance tracking
1. Later stages can override earlier stages when confidence delta exceeds threshold
1. Log provenance so decisions are auditable

**Example**: src/classifiers/Stage1UrlClassifier.js, Stage2ContentClassifier.js, StageAggregator.js

---
