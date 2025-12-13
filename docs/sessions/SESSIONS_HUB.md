# 📚 Session Documentation Hub

**Purpose**: Central index for all development sessions (short-term and long-term memory for AI agents)

---

## Memory Hierarchy

### 🟢 Current Session (Short-term Memory)
**Location**: `docs/sessions/[session-id]/`  
**Retention**: Active during development  
**Purpose**: Immediate context, current work, active tasks  
**Refresh Rate**: Real-time updates  
**For Agents**: Use this for immediate context when working on active tasks

### 🟡 Recent Sessions (Medium-term Memory)
**Location**: `docs/sessions/[session-id]/` (indexed)  
**Retention**: Last 4-8 weeks  
**Purpose**: Pattern recognition, decision continuity, approach validation  
**Refresh Rate**: Weekly archival  
**For Agents**: Reference these to understand project momentum and approach

### 🔵 Historical Sessions (Long-term Memory)
**Location**: `docs/sessions/archive/`  
**Retention**: Beyond 8 weeks  
**Purpose**: Lessons learned, architectural decisions, pattern evolution  
**Refresh Rate**: Quarterly archival  
**For Agents**: Search these for historical context and decision rationale

---

## Current Session

### Session 2025-12-13: Merge HTTP record/replay into main

**Duration**: Active
**Type**: integration
**Completion**: 🔄 In progress

**Focus**:
- Merge safe HTTP record/replay + decision trace changes into main, validate tests, and delete merged branches

**Location**: `docs/sessions/2025-12-13-merge-http-record-replay-into-main/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-13-merge-http-record-replay-into-main/INDEX.md)
- 🗺️ [Plan](./2025-12-13-merge-http-record-replay-into-main/PLAN.md)
- 📝 [Working Notes](./2025-12-13-merge-http-record-replay-into-main/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-13-merge-http-record-replay-into-main/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-13-merge-http-record-replay-into-main/FOLLOW_UPS.md)


### Session 2025-12-13: Integrate HTTP record/replay commit

**Duration**: Active
**Type**: integration
**Completion**: 🔄 In progress

**Focus**:
- Cherry-picked 0480388 onto current branch and validated tests

**Location**: `docs/sessions/2025-12-13-integrate-http-record-replay/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-13-integrate-http-record-replay/INDEX.md)
- 🗺️ [Plan](./2025-12-13-integrate-http-record-replay/PLAN.md)
- 📝 [Working Notes](./2025-12-13-integrate-http-record-replay/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-13-integrate-http-record-replay/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-13-integrate-http-record-replay/FOLLOW_UPS.md)


### Session 2025-12-13: HTTP Record/Replay Harness + Decision Trace Milestones

**Duration**: Completed
**Type**: crawler
**Completion**: ✅ Complete

**Focus**:
- Add opt-in HTTP fixture record/replay for deterministic crawler tests, and standardize decision traces persisted as milestones (opt-in).

**Location**: `docs/sessions/2025-12-13-http-record-replay-decision-traces/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-13-http-record-replay-decision-traces/INDEX.md)
- 🗺️ [Plan](./2025-12-13-http-record-replay-decision-traces/PLAN.md)
- 📝 [Working Notes](./2025-12-13-http-record-replay-decision-traces/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-13-http-record-replay-decision-traces/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-13-http-record-replay-decision-traces/FOLLOW_UPS.md)


### Session 2025-12-12: Phase 4 Hub Freshness Control (Fetch Policy)

**Duration**: Completed
**Type**: crawler
**Completion**: ✅ Complete

**Focus**:
- Implement fetchPolicy propagation + FetchPipeline enforcement + telemetry + focused tests per docs/CRAWL_REFACTORING_TASKS.md

**Location**: `docs/sessions/2025-12-12-hub-freshness-phase4-impl/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-hub-freshness-phase4-impl/INDEX.md)
- 🗺️ [Plan](./2025-12-12-hub-freshness-phase4-impl/PLAN.md)
- 📝 [Working Notes](./2025-12-12-hub-freshness-phase4-impl/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-hub-freshness-phase4-impl/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-hub-freshness-phase4-impl/FOLLOW_UPS.md)


### Session 2025-12-12: Crawler Plans Atlas Landscape WLILO V2

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Create a denser, landscape, WLILO-styled version of the crawler improvement plans atlas SVG and validate with svg-collisions --strict

**Location**: `docs/sessions/2025-12-12-crawler-plans-atlas-landscape-wlilo-v2/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-crawler-plans-atlas-landscape-wlilo-v2/INDEX.md)
- 🗺️ [Plan](./2025-12-12-crawler-plans-atlas-landscape-wlilo-v2/PLAN.md)
- 📝 [Working Notes](./2025-12-12-crawler-plans-atlas-landscape-wlilo-v2/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-crawler-plans-atlas-landscape-wlilo-v2/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-crawler-plans-atlas-landscape-wlilo-v2/FOLLOW_UPS.md)


### Session 2025-12-12: Crawler Plans Atlas SVG Polish

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Clear remaining svg-collisions strict findings for crawler-improvement-plans-atlas.svg

**Location**: `docs/sessions/2025-12-12-crawler-plans-atlas-svg-polish/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-crawler-plans-atlas-svg-polish/INDEX.md)
- 🗺️ [Plan](./2025-12-12-crawler-plans-atlas-svg-polish/PLAN.md)
- 📝 [Working Notes](./2025-12-12-crawler-plans-atlas-svg-polish/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-crawler-plans-atlas-svg-polish/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-crawler-plans-atlas-svg-polish/FOLLOW_UPS.md)


### Session 2025-12-12: Crawler improvements plan SVG

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Create an info-dense SVG diagram summarizing documented crawler improvement plans and suggested next ideas.

**Location**: `docs/sessions/2025-12-12-crawler-improvements-svg/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-crawler-improvements-svg/INDEX.md)
- 🗺️ [Plan](./2025-12-12-crawler-improvements-svg/PLAN.md)
- 📝 [Working Notes](./2025-12-12-crawler-improvements-svg/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-crawler-improvements-svg/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-crawler-improvements-svg/FOLLOW_UPS.md)


### Session 2025-12-12: Investigate unexpected terminal windows

**Duration**: Active
**Type**: recon
**Completion**: 🔄 In progress

**Focus**:
- Identify what is spawning external terminal windows (MCP/Jest/etc.) and rule out Git.

**Location**: `docs/sessions/2025-12-12-terminal-window-spawns/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-terminal-window-spawns/INDEX.md)
- 🗺️ [Plan](./2025-12-12-terminal-window-spawns/PLAN.md)
- 📝 [Working Notes](./2025-12-12-terminal-window-spawns/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-terminal-window-spawns/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-terminal-window-spawns/FOLLOW_UPS.md)


### Session 2025-12-12: Crawler reliability improvements

**Duration**: Active
**Type**: crawler
**Completion**: 🔄 In progress

**Focus**:
- Improve crawler resilience and observability with focused, tested changes

**Location**: `docs/sessions/2025-12-12-crawler-reliability/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-crawler-reliability/INDEX.md)
- 🗺️ [Plan](./2025-12-12-crawler-reliability/PLAN.md)
- 📝 [Working Notes](./2025-12-12-crawler-reliability/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-crawler-reliability/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-crawler-reliability/FOLLOW_UPS.md)


### Session 2025-12-12: Art Playground swatch palettes accessibility (keyboard + ARIA)

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Add roving-tabindex + arrow-key navigation and radio-like ARIA semantics for Fill/Stroke palettes

**Location**: `docs/sessions/2025-12-12-ui-art-playground-palette-a11y/`

**Quick Links**:
- 🗺️ [Plan](./2025-12-12-ui-art-playground-palette-a11y/PLAN.md)
- 📝 [Working Notes](./2025-12-12-ui-art-playground-palette-a11y/WORKING_NOTES.md)

### Session 2025-12-12: Art Splayground: color palette + selection

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Improve the art-splayground colour palette and selection UX in a consistent, reusable way

**Location**: `docs/sessions/2025-12-12-art-splayground-palette/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-art-splayground-palette/INDEX.md)
- 🗺️ [Plan](./2025-12-12-art-splayground-palette/PLAN.md)
- 📝 [Working Notes](./2025-12-12-art-splayground-palette/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-art-splayground-palette/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-art-splayground-palette/FOLLOW_UPS.md)


### Session 2025-12-12: Fix AGI-Orchestrator agent frontmatter

**Duration**: Active
**Type**: agents
**Completion**: 🔄 In progress

**Focus**:
- Verify and correct AGI-Orchestrator.agent.md parsing/tool metadata while preserving intent

**Location**: `docs/sessions/2025-12-12-fix-agi-orchestrator-agent/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-fix-agi-orchestrator-agent/INDEX.md)
- 🗺️ [Plan](./2025-12-12-fix-agi-orchestrator-agent/PLAN.md)
- 📝 [Working Notes](./2025-12-12-fix-agi-orchestrator-agent/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-fix-agi-orchestrator-agent/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-fix-agi-orchestrator-agent/FOLLOW_UPS.md)


### Session 2025-12-12: Fix agent YAML frontmatter for validation

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- Make .agent.md frontmatter parse correctly so handoff tooling/validation is reliable

**Location**: `docs/sessions/2025-12-12-agent-frontmatter-validate/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-agent-frontmatter-validate/INDEX.md)
- 🗺️ [Plan](./2025-12-12-agent-frontmatter-validate/PLAN.md)
- 📝 [Working Notes](./2025-12-12-agent-frontmatter-validate/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-agent-frontmatter-validate/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-agent-frontmatter-validate/FOLLOW_UPS.md)


### Session 2025-12-12: Fix AGI-Orchestrator Handoff Frontmatter

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Make subagent coordination YAML/frontmatter reliably produce handoff buttons

**Location**: `docs/sessions/2025-12-12-agent-orchestrator-handoffs/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-agent-orchestrator-handoffs/INDEX.md)
- 🗺️ [Plan](./2025-12-12-agent-orchestrator-handoffs/PLAN.md)
- 📝 [Working Notes](./2025-12-12-agent-orchestrator-handoffs/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-agent-orchestrator-handoffs/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-agent-orchestrator-handoffs/FOLLOW_UPS.md)


### Session 2025-12-12: Crawler Documentation Coverage & Accuracy

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Audit crawler docs and improve coverage, accuracy, and long-term planning guidance

**Location**: `docs/sessions/2025-12-12-crawler-docs-coverage/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-crawler-docs-coverage/INDEX.md)
- 🗺️ [Plan](./2025-12-12-crawler-docs-coverage/PLAN.md)
- 📝 [Working Notes](./2025-12-12-crawler-docs-coverage/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-crawler-docs-coverage/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-crawler-docs-coverage/FOLLOW_UPS.md)


### Session 2025-12-12: Data Explorer PR2: URL filters, domains API, DB perf

**Duration**: Active
**Type**: feature
**Completion**: 🔄 In progress

**Focus**:
- Add hostMode/multi-host URL filters, /api/domains with search/sort, and verify UI indexes

**Location**: `docs/sessions/2025-12-12-data-explorer-pr2-filters-domains-perf/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-data-explorer-pr2-filters-domains-perf/INDEX.md)
- 🗺️ [Plan](./2025-12-12-data-explorer-pr2-filters-domains-perf/PLAN.md)
- 📝 [Working Notes](./2025-12-12-data-explorer-pr2-filters-domains-perf/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-data-explorer-pr2-filters-domains-perf/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-data-explorer-pr2-filters-domains-perf/FOLLOW_UPS.md)


### Session 2025-12-12: Telemetry: process handler idempotency

**Duration**: Active
**Type**: bugfix
**Completion**: 🔄 In progress

**Focus**:
- Avoid MaxListeners warnings by wiring process handlers once

**Location**: `docs/sessions/2025-12-12-telemetry-process-handlers-idempotent/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-telemetry-process-handlers-idempotent/INDEX.md)
- 🗺️ [Plan](./2025-12-12-telemetry-process-handlers-idempotent/PLAN.md)
- 📝 [Working Notes](./2025-12-12-telemetry-process-handlers-idempotent/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-telemetry-process-handlers-idempotent/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-telemetry-process-handlers-idempotent/FOLLOW_UPS.md)


### Session 2025-12-12: Data Explorer gaps: plan + first implementation

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Plan Data Explorer gaps and implement first high-leverage improvement (domain counts batching) with tests

**Location**: `docs/sessions/2025-12-12-data-explorer-gaps-impl/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-data-explorer-gaps-impl/INDEX.md)
- 🗺️ [Plan](./2025-12-12-data-explorer-gaps-impl/PLAN.md)
- 📝 [Working Notes](./2025-12-12-data-explorer-gaps-impl/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-data-explorer-gaps-impl/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-data-explorer-gaps-impl/FOLLOW_UPS.md)


### Session 2025-12-12: When to use js-scan (agent guidance)

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Clarify when agents should prefer js-scan vs grep/read, with concrete examples like Data Explorer feature inventory.

**Location**: `docs/sessions/2025-12-12-js-scan-when-to-use/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-12-js-scan-when-to-use/INDEX.md)
- 🗺️ [Plan](./2025-12-12-js-scan-when-to-use/PLAN.md)
- 📝 [Working Notes](./2025-12-12-js-scan-when-to-use/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-12-js-scan-when-to-use/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-12-js-scan-when-to-use/FOLLOW_UPS.md)


### Session 2025-12-11: Standard server telemetry + z-server ingestion

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- Add shared structured telemetry (logs + status/health) so z-server can reliably observe and display server activity.

**Location**: `docs/sessions/2025-12-11-server-telemetry/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-server-telemetry/INDEX.md)
- 🗺️ [Plan](./2025-12-11-server-telemetry/PLAN.md)
- 📝 [Working Notes](./2025-12-11-server-telemetry/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-server-telemetry/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-server-telemetry/FOLLOW_UPS.md)


### Session 2025-12-11: Bundle freshness gates: first three

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Validate docsViewer server gate end-to-end and confirm Data Explorer + WYSIWYG E2E remain green

**Location**: `docs/sessions/2025-12-11-bundle-gates-first-three-continue/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-bundle-gates-first-three-continue/INDEX.md)
- 🗺️ [Plan](./2025-12-11-bundle-gates-first-three-continue/PLAN.md)
- 📝 [Working Notes](./2025-12-11-bundle-gates-first-three-continue/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-bundle-gates-first-three-continue/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-bundle-gates-first-three-continue/FOLLOW_UPS.md)


### Session 2025-12-11: Bundle Freshness Gates (url-toggle, wysiwyg, docsViewer)

**Duration**: Active
**Type**: ui-tests
**Completion**: 🔄 In progress

**Focus**:
- Add bundle freshness gates to selected UI tests/servers to avoid stale-bundle false failures.

**Location**: `docs/sessions/2025-12-11-bundle-freshness-gates-3/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-bundle-freshness-gates-3/INDEX.md)
- 🗺️ [Plan](./2025-12-11-bundle-freshness-gates-3/PLAN.md)
- 📝 [Working Notes](./2025-12-11-bundle-freshness-gates-3/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-bundle-freshness-gates-3/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-bundle-freshness-gates-3/FOLLOW_UPS.md)


### Session 2025-12-11: Art Playground: Fix fill undo/redo E2E

**Duration**: Active
**Type**: debug
**Completion**: 🔄 In progress

**Focus**:
- Make property edit undo/redo work reliably and keep Puppeteer E2E green

**Location**: `docs/sessions/2025-12-11-art-playground-undo-e2e-fix/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-art-playground-undo-e2e-fix/INDEX.md)
- 🗺️ [Plan](./2025-12-11-art-playground-undo-e2e-fix/PLAN.md)
- 📝 [Working Notes](./2025-12-11-art-playground-undo-e2e-fix/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-art-playground-undo-e2e-fix/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-art-playground-undo-e2e-fix/FOLLOW_UPS.md)


### Session 2025-12-11: Art Playground: ListenerBag promotion

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Promote lifecycle-safe event binding helper into production and refactor one control; keep SSR+activation stable

**Location**: `docs/sessions/2025-12-11-art-playground-listener-bag/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-art-playground-listener-bag/INDEX.md)
- 🗺️ [Plan](./2025-12-11-art-playground-listener-bag/PLAN.md)
- 📝 [Working Notes](./2025-12-11-art-playground-listener-bag/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-art-playground-listener-bag/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-art-playground-listener-bag/FOLLOW_UPS.md)


### Session 2025-12-11: Art Playground: Quality & Idioms Pass

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Continue improving Art Playground code quality and idiomatic jsgui3 patterns beyond activation, keeping checks/E2E green.

**Location**: `docs/sessions/2025-12-11-art-playground-quality-pass/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-art-playground-quality-pass/INDEX.md)
- 🗺️ [Plan](./2025-12-11-art-playground-quality-pass/PLAN.md)
- 📝 [Working Notes](./2025-12-11-art-playground-quality-pass/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-art-playground-quality-pass/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-art-playground-quality-pass/FOLLOW_UPS.md)


### Session 2025-12-11: Art Playground: Idiomatic Activation Refactor

**Duration**: Active
**Type**: UI
**Completion**: 🔄 In progress

**Focus**:
- Refactor Art Playground controls to use idiomatic jsgui3 activation patterns (SSR + client activation), simplify client boot, and keep check + E2E green.

**Location**: `docs/sessions/2025-12-11-art-playground-idiomatic-activation/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-art-playground-idiomatic-activation/INDEX.md)
- 🗺️ [Plan](./2025-12-11-art-playground-idiomatic-activation/PLAN.md)
- 📝 [Working Notes](./2025-12-11-art-playground-idiomatic-activation/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-art-playground-idiomatic-activation/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-art-playground-idiomatic-activation/FOLLOW_UPS.md)


### Session 2025-12-11: Art Playground Improvements

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Review the Art Playground app and implement high-impact UX/perf/test improvements.

**Location**: `docs/sessions/2025-12-11-art-playground-improvements/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-art-playground-improvements/INDEX.md)
- 🗺️ [Plan](./2025-12-11-art-playground-improvements/PLAN.md)
- 📝 [Working Notes](./2025-12-11-art-playground-improvements/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-art-playground-improvements/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-art-playground-improvements/FOLLOW_UPS.md)


### Session 2025-12-11: z-server status/progress truthfulness

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Define and verify a truth table for z-server status/progress indicators and add targeted tests so UI reflects actual backend state.

**Location**: `docs/sessions/2025-12-11-z-server-status-progress-truth/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-z-server-status-progress-truth/INDEX.md)
- 🗺️ [Plan](./2025-12-11-z-server-status-progress-truth/PLAN.md)
- 📝 [Working Notes](./2025-12-11-z-server-status-progress-truth/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-z-server-status-progress-truth/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-z-server-status-progress-truth/FOLLOW_UPS.md)


### Session 2025-12-11: Add docs-memory MCP usage to AGENTS.md

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Document how agents should use the docs-memory MCP server (preflight, common writes, and when to use it).

**Location**: `docs/sessions/2025-12-11-agents-md-memory-mcp/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-agents-md-memory-mcp/INDEX.md)
- 🗺️ [Plan](./2025-12-11-agents-md-memory-mcp/PLAN.md)
- 📝 [Working Notes](./2025-12-11-agents-md-memory-mcp/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-agents-md-memory-mcp/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-agents-md-memory-mcp/FOLLOW_UPS.md)


### Session 2025-12-11: z-server Review: Bugs, Status/Progress, Testing

**Duration**: Active
**Type**: research
**Completion**: 🔄 In progress

**Focus**:
- Review z-server for bugs, define expected behaviors, and design test harnesses for status/progress

**Location**: `docs/sessions/2025-12-11-z-server-review/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-z-server-review/INDEX.md)
- 🗺️ [Plan](./2025-12-11-z-server-review/PLAN.md)
- 📝 [Working Notes](./2025-12-11-z-server-review/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-z-server-review/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-z-server-review/FOLLOW_UPS.md)


### Session 2025-12-11: AGENTS: Research Gap Protocol

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Add guidance: when unexpected issue occurs, consult existing research and consider a research project to close the gap

**Location**: `docs/sessions/2025-12-11-agents-research-gap-protocol/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-agents-research-gap-protocol/INDEX.md)
- 🗺️ [Plan](./2025-12-11-agents-research-gap-protocol/PLAN.md)
- 📝 [Working Notes](./2025-12-11-agents-research-gap-protocol/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-agents-research-gap-protocol/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-agents-research-gap-protocol/FOLLOW_UPS.md)


### Session 2025-12-11: User-terminated banner for checks

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- Add a reusable red [USER TERMINATED] banner + clean exit behavior for Node check/test scripts

**Location**: `docs/sessions/2025-12-11-user-terminated-banner/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-user-terminated-banner/INDEX.md)
- 🗺️ [Plan](./2025-12-11-user-terminated-banner/PLAN.md)
- 📝 [Working Notes](./2025-12-11-user-terminated-banner/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-user-terminated-banner/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-user-terminated-banner/FOLLOW_UPS.md)


### Session 2025-12-11: Streaming SSR + Virtual Scrolling

**Duration**: Active
**Type**: research
**Completion**: 🔄 In progress

**Focus**:
- Investigate coupling between streaming SSR and virtual scrolling performance

**Location**: `docs/sessions/2025-12-11-streaming-ssr-virtual-scroll/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-streaming-ssr-virtual-scroll/INDEX.md)
- 🗺️ [Plan](./2025-12-11-streaming-ssr-virtual-scroll/PLAN.md)
- 📝 [Working Notes](./2025-12-11-streaming-ssr-virtual-scroll/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-streaming-ssr-virtual-scroll/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-streaming-ssr-virtual-scroll/FOLLOW_UPS.md)


### Session 2025-12-11: Event delegation lab

**Duration**: Active
**Type**: research
**Completion**: 🔄 In progress

**Focus**:
- Run 10 experiments on delegation and bubbling patterns

**Location**: `docs/sessions/2025-12-11-event-delegation-lab/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-event-delegation-lab/INDEX.md)
- 🗺️ [Plan](./2025-12-11-event-delegation-lab/PLAN.md)
- 📝 [Working Notes](./2025-12-11-event-delegation-lab/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-event-delegation-lab/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-event-delegation-lab/FOLLOW_UPS.md)


### Session 2025-12-11: Document mixin storage pattern

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Document push/each _store pattern for lab mixins

**Location**: `docs/sessions/2025-12-11-mixin-theme-docs/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-mixin-theme-docs/INDEX.md)
- 🗺️ [Plan](./2025-12-11-mixin-theme-docs/PLAN.md)
- 📝 [Working Notes](./2025-12-11-mixin-theme-docs/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-mixin-theme-docs/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-mixin-theme-docs/FOLLOW_UPS.md)


### Session 2025-12-11: jsgui3 platform helpers via lab

**Duration**: Active
**Type**: research
**Completion**: 🔄 In progress

**Focus**:
- Experiment with jsgui3 platform helpers and document patterns

**Location**: `docs/sessions/2025-12-11-jsgui3-gaps/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-jsgui3-gaps/INDEX.md)
- 🗺️ [Plan](./2025-12-11-jsgui3-gaps/PLAN.md)
- 📝 [Working Notes](./2025-12-11-jsgui3-gaps/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-jsgui3-gaps/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-jsgui3-gaps/FOLLOW_UPS.md)


### Session 2025-12-11: Log filter toggles popup

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Add popup checkboxes to toggle log types and use existing log color scheme

**Location**: `docs/sessions/2025-12-11-log-filters/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-log-filters/INDEX.md)
- 🗺️ [Plan](./2025-12-11-log-filters/PLAN.md)
- 📝 [Working Notes](./2025-12-11-log-filters/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-log-filters/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-log-filters/FOLLOW_UPS.md)


### Session 2025-12-11: Support multiple decision systems

**Duration**: Active
**Type**: feature
**Completion**: 🔄 In progress

**Focus**:
- Add DB + UI support to list and switch decision systems in decision tree viewer

**Location**: `docs/sessions/2025-12-11-decision-systems-multi/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-decision-systems-multi/INDEX.md)
- 🗺️ [Plan](./2025-12-11-decision-systems-multi/PLAN.md)
- 📝 [Working Notes](./2025-12-11-decision-systems-multi/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-decision-systems-multi/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-decision-systems-multi/FOLLOW_UPS.md)


### Session 2025-12-11: UI bugs identification and plan

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Identify UI bugs across project and plan fixes

**Location**: `docs/sessions/2025-12-11-ui-bug-audit/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-ui-bug-audit/INDEX.md)
- 🗺️ [Plan](./2025-12-11-ui-bug-audit/PLAN.md)
- 📝 [Working Notes](./2025-12-11-ui-bug-audit/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-ui-bug-audit/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-ui-bug-audit/FOLLOW_UPS.md)


### Session 2025-12-11: Polish decision tree controls UI

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Audit jsgui3 decision tree controls for presentation issues and SVG curves

**Location**: `docs/sessions/2025-12-11-decision-tree-controls/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-11-decision-tree-controls/INDEX.md)
- 🗺️ [Plan](./2025-12-11-decision-tree-controls/PLAN.md)
- 📝 [Working Notes](./2025-12-11-decision-tree-controls/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-11-decision-tree-controls/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-11-decision-tree-controls/FOLLOW_UPS.md)


### Session 2025-12-10: WLILO aesthetic guidance

**Duration**: Active
**Type**: design
**Completion**: 🔄 In progress

**Focus**:
- Document WLILO style and propagation for agents

**Location**: `docs/sessions/2025-12-10-wlilo-style/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-10-wlilo-style/INDEX.md)
- 🗺️ [Plan](./2025-12-10-wlilo-style/PLAN.md)
- 📝 [Working Notes](./2025-12-10-wlilo-style/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-10-wlilo-style/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-10-wlilo-style/FOLLOW_UPS.md)


### Session 2025-12-10: SVG/HTML theming workflows

**Duration**: Active
**Type**: design
**Completion**: 🔄 In progress

**Focus**:
- Add MCP + docs for theme storage, retrieval, and generation across SVG/HTML/jsgui3

**Location**: `docs/sessions/2025-12-10-svg-theme-workflows/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-10-svg-theme-workflows/INDEX.md)
- 🗺️ [Plan](./2025-12-10-svg-theme-workflows/PLAN.md)
- 📝 [Working Notes](./2025-12-10-svg-theme-workflows/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-10-svg-theme-workflows/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-10-svg-theme-workflows/FOLLOW_UPS.md)


### Session 2025-12-10: SVG Tooling V2: High-Bandwidth Templates & Recipes

**Duration**: Active
**Type**: design
**Completion**: 🔄 In progress

**Focus**:
- Design dense, guarded, template-based SVG generation and editing system for AI agents

**Location**: `docs/sessions/2025-12-10-svg-tooling-v2/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-10-svg-tooling-v2/INDEX.md)
- 🗺️ [Plan](./2025-12-10-svg-tooling-v2/PLAN.md)
- 📝 [Working Notes](./2025-12-10-svg-tooling-v2/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-10-svg-tooling-v2/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-10-svg-tooling-v2/FOLLOW_UPS.md)


### Session 2025-12-10: Fix HierarchicalPlanner plan fallback

**Duration**: Active
**Type**: bugfix
**Completion**: 🔄 In progress

**Focus**:
- Ensure crawler phase-123 integration tests pass by returning partial plans and robust heuristic sharing

**Location**: `docs/sessions/2025-12-10-phase-123-integration/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-10-phase-123-integration/INDEX.md)
- 🗺️ [Plan](./2025-12-10-phase-123-integration/PLAN.md)
- 📝 [Working Notes](./2025-12-10-phase-123-integration/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-10-phase-123-integration/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-10-phase-123-integration/FOLLOW_UPS.md)


### Session 2025-12-10: Retire deprecated suites

**Duration**: Active
**Type**: tests
**Completion**: 🔄 In progress

**Focus**:
- Formally retire tests flagged as deprecated for 2+ weeks; capture quick wins

**Location**: `docs/sessions/2025-12-10-retire-deprecated-tests/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-10-retire-deprecated-tests/INDEX.md)
- 🗺️ [Plan](./2025-12-10-retire-deprecated-tests/PLAN.md)
- 📝 [Working Notes](./2025-12-10-retire-deprecated-tests/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-10-retire-deprecated-tests/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-10-retire-deprecated-tests/FOLLOW_UPS.md)


### Session 2025-12-10: Test log scanning CLI

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- Summarize test failures/passes from logs

**Location**: `docs/sessions/2025-12-10-test-log-tools/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-10-test-log-tools/INDEX.md)
- 🗺️ [Plan](./2025-12-10-test-log-tools/PLAN.md)
- 📝 [Working Notes](./2025-12-10-test-log-tools/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-10-test-log-tools/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-10-test-log-tools/FOLLOW_UPS.md)


### Session 2025-12-10: SOLID splits for decision config

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Apply SOLID: extract DecisionConfigSet storage/service and API service layer

**Location**: `docs/sessions/2025-12-10-solid-configsets/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-10-solid-configsets/INDEX.md)
- 🗺️ [Plan](./2025-12-10-solid-configsets/PLAN.md)
- 📝 [Working Notes](./2025-12-10-solid-configsets/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-10-solid-configsets/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-10-solid-configsets/FOLLOW_UPS.md)


### Session 2025-12-07: Z-server scan counting

**Duration**: Active
**Type**: ui-dashboard
**Completion**: 🔄 In progress

**Focus**:
- Expose counting progress and messaging in z-server scan UI

**Location**: `docs/sessions/2025-12-07-z-server-counting/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-z-server-counting/INDEX.md)
- 🗺️ [Plan](./2025-12-07-z-server-counting/PLAN.md)
- 📝 [Working Notes](./2025-12-07-z-server-counting/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-z-server-counting/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-z-server-counting/FOLLOW_UPS.md)


### Session 2025-12-07: Crawler compact app jsgui3 binding

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Use jsgui3 controls for event binding in crawler compact electron app

**Location**: `docs/sessions/2025-12-07-crawler-compact-jsgui3/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-crawler-compact-jsgui3/INDEX.md)
- 🗺️ [Plan](./2025-12-07-crawler-compact-jsgui3/PLAN.md)
- 📝 [Working Notes](./2025-12-07-crawler-compact-jsgui3/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-crawler-compact-jsgui3/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-crawler-compact-jsgui3/FOLLOW_UPS.md)


### Session 2025-12-07: Investigate memory MCP server responsiveness

**Duration**: Active
**Type**: investigation
**Completion**: 🔄 In progress

**Focus**:
- Find why memory MCP server not responding and ensure error handling

**Location**: `docs/sessions/2025-12-07-memory-mcp-check/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-memory-mcp-check/INDEX.md)
- 🗺️ [Plan](./2025-12-07-memory-mcp-check/PLAN.md)
- 📝 [Working Notes](./2025-12-07-memory-mcp-check/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-memory-mcp-check/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-memory-mcp-check/FOLLOW_UPS.md)


### Session 2025-12-07: Split crawl widget controls into modules

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Modularize crawl widget controls for reuse and SSR

**Location**: `docs/sessions/2025-12-07-crawl-controls-split/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-crawl-controls-split/INDEX.md)
- 🗺️ [Plan](./2025-12-07-crawl-controls-split/PLAN.md)
- 📝 [Working Notes](./2025-12-07-crawl-controls-split/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-crawl-controls-split/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-crawl-controls-split/FOLLOW_UPS.md)


### Session 2025-12-07: Reliable Crawler Phase 1 Implementation

**Duration**: Active
**Type**: implementation
**Completion**: 🔄 In progress

**Focus**:
- Implement ResilienceService, ContentValidationService, and wire them into the crawler

**Location**: `docs/sessions/2025-12-07-reliable-crawler-phase1-impl/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-reliable-crawler-phase1-impl/INDEX.md)
- 🗺️ [Plan](./2025-12-07-reliable-crawler-phase1-impl/PLAN.md)
- 📝 [Working Notes](./2025-12-07-reliable-crawler-phase1-impl/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-reliable-crawler-phase1-impl/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-reliable-crawler-phase1-impl/FOLLOW_UPS.md)


### Session 2025-12-07: Reliable Crawler Phase 1 Planning

**Duration**: Active
**Type**: planning
**Completion**: 🔄 In progress

**Focus**:
- Create detailed specification for Phase 1 of the Reliable News Crawler

**Location**: `docs/sessions/2025-12-07-reliable-crawler-phase1-planning/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-reliable-crawler-phase1-planning/INDEX.md)
- 🗺️ [Plan](./2025-12-07-reliable-crawler-phase1-planning/PLAN.md)
- 📝 [Working Notes](./2025-12-07-reliable-crawler-phase1-planning/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-reliable-crawler-phase1-planning/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-reliable-crawler-phase1-planning/FOLLOW_UPS.md)


### Session 2025-12-07: Increase crawl widget log area

**Duration**: Active
**Type**: ui-fix
**Completion**: 🔄 In progress

**Focus**:
- Give crawling logs more space in crawl electron app

**Location**: `docs/sessions/2025-12-07-crawl-widget-log-space/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-crawl-widget-log-space/INDEX.md)
- 🗺️ [Plan](./2025-12-07-crawl-widget-log-space/PLAN.md)
- 📝 [Working Notes](./2025-12-07-crawl-widget-log-space/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-crawl-widget-log-space/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-crawl-widget-log-space/FOLLOW_UPS.md)


### Session 2025-12-07: UrlDecision orchestrator wiring

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Finish orchestrator integration and run focused queue/fetch tests

**Location**: `docs/sessions/2025-12-07-orchestrator-wiring/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-orchestrator-wiring/INDEX.md)
- 🗺️ [Plan](./2025-12-07-orchestrator-wiring/PLAN.md)
- 📝 [Working Notes](./2025-12-07-orchestrator-wiring/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-orchestrator-wiring/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-orchestrator-wiring/FOLLOW_UPS.md)


### Session 2025-12-07: Wire UrlDecisionOrchestrator

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Replace legacy decision flow with orchestrator in queue/fetch

**Location**: `docs/sessions/2025-12-07-phase3-url-decisions/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-phase3-url-decisions/INDEX.md)
- 🗺️ [Plan](./2025-12-07-phase3-url-decisions/PLAN.md)
- 📝 [Working Notes](./2025-12-07-phase3-url-decisions/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-phase3-url-decisions/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-phase3-url-decisions/FOLLOW_UPS.md)


### Session 2025-12-07: Phase 2 SequenceRunner unification

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Integrate unified sequence runner and finalize crawler abstraction integration

**Location**: `docs/sessions/2025-12-07-crawler-abstraction-phase2/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-crawler-abstraction-phase2/INDEX.md)
- 🗺️ [Plan](./2025-12-07-crawler-abstraction-phase2/PLAN.md)
- 📝 [Working Notes](./2025-12-07-crawler-abstraction-phase2/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-crawler-abstraction-phase2/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-crawler-abstraction-phase2/FOLLOW_UPS.md)


### Session 2025-12-07: Split z-server control factory

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Modularize z-server controls into separate files with shared index

**Location**: `docs/sessions/2025-12-07-zserver-controls/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-07-zserver-controls/INDEX.md)
- 🗺️ [Plan](./2025-12-07-zserver-controls/PLAN.md)
- 📝 [Working Notes](./2025-12-07-zserver-controls/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-07-zserver-controls/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-07-zserver-controls/FOLLOW_UPS.md)


### Session 2025-12-06: Post-push code structure review

**Duration**: Active
**Type**: analysis
**Completion**: 🔄 In progress

**Focus**:
- Identify structural improvements after recent additions

**Location**: `docs/sessions/2025-12-06-structure-review/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-structure-review/INDEX.md)
- 🗺️ [Plan](./2025-12-06-structure-review/PLAN.md)
- 📝 [Working Notes](./2025-12-06-structure-review/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-structure-review/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-structure-review/FOLLOW_UPS.md)


### Session 2025-12-06: NewsCrawler & DomainProcessor slicing

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Break down large crawler/orchestration files into smaller pipeline modules

**Location**: `docs/sessions/2025-12-06-crawler-modularization/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-crawler-modularization/INDEX.md)
- 🗺️ [Plan](./2025-12-06-crawler-modularization/PLAN.md)
- 📝 [Working Notes](./2025-12-06-crawler-modularization/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-crawler-modularization/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-crawler-modularization/FOLLOW_UPS.md)


### Session 2025-12-06: js-scan longest files

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Add capability to list longest JS files via js-scan

**Location**: `docs/sessions/2025-12-06-js-scan-longest/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-js-scan-longest/INDEX.md)
- 🗺️ [Plan](./2025-12-06-js-scan-longest/PLAN.md)
- 📝 [Working Notes](./2025-12-06-js-scan-longest/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-js-scan-longest/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-js-scan-longest/FOLLOW_UPS.md)


### Session 2025-12-06: Crawl CLI logger wiring

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Inject structured CLI logger so crawl.js honors verbosity/quiet/json uniformly

**Location**: `docs/sessions/2025-12-06-crawl-logger-routing/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-crawl-logger-routing/INDEX.md)
- 🗺️ [Plan](./2025-12-06-crawl-logger-routing/PLAN.md)
- 📝 [Working Notes](./2025-12-06-crawl-logger-routing/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-crawl-logger-routing/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-crawl-logger-routing/FOLLOW_UPS.md)


### Session 2025-12-06: Layout masks DB schema

**Duration**: Active
**Type**: implementation
**Completion**: 🔄 In progress

**Focus**:
- Add layout_masks migration + schema definition for template masking

**Location**: `docs/sessions/2025-12-06-structural-diffing-phase2/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-structural-diffing-phase2/INDEX.md)
- 🗺️ [Plan](./2025-12-06-structural-diffing-phase2/PLAN.md)
- 📝 [Working Notes](./2025-12-06-structural-diffing-phase2/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-structural-diffing-phase2/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-structural-diffing-phase2/FOLLOW_UPS.md)


### Session 2025-12-06: Repair MCP servers to spec

**Duration**: Active
**Type**: maintenance
**Completion**: 🔄 In progress

**Focus**:
- Align docs-memory and svg-editor MCP servers with latest MCP framing/version and restore functionality

**Location**: `docs/sessions/2025-12-06-mcp-servers-fix/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-mcp-servers-fix/INDEX.md)
- 🗺️ [Plan](./2025-12-06-mcp-servers-fix/PLAN.md)
- 📝 [Working Notes](./2025-12-06-mcp-servers-fix/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-mcp-servers-fix/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-mcp-servers-fix/FOLLOW_UPS.md)


### Session 2025-12-06: Implement SkeletonDiff core logic

**Duration**: Active
**Type**: implementation
**Completion**: 🔄 In progress

**Focus**:
- Add SkeletonDiff mask generator with unit tests

**Location**: `docs/sessions/2025-12-06-structural-diffing-phase1/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-structural-diffing-phase1/INDEX.md)
- 🗺️ [Plan](./2025-12-06-structural-diffing-phase1/PLAN.md)
- 📝 [Working Notes](./2025-12-06-structural-diffing-phase1/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-structural-diffing-phase1/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-structural-diffing-phase1/FOLLOW_UPS.md)


### Session 2025-12-06: Structure Mining Implementation

**Duration**: Active
**Type**: implementation
**Completion**: 🔄 In progress

**Focus**:
- Implement the SkeletonHash algorithm and Structure Miner tool for static analysis of page layouts.

**Location**: `docs/sessions/2025-12-06-structure-mining-implementation/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-structure-mining-implementation/INDEX.md)
- 🗺️ [Plan](./2025-12-06-structure-mining-implementation/PLAN.md)
- 📝 [Working Notes](./2025-12-06-structure-mining-implementation/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-structure-mining-implementation/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-structure-mining-implementation/FOLLOW_UPS.md)


### Session 2025-12-06: Hybrid Crawler Architecture Design

**Duration**: Active
**Type**: design
**Completion**: 🔄 In progress

**Focus**:
- Design the Teacher/Worker model for hybrid crawling.

**Location**: `docs/sessions/2025-12-06-hybrid-crawler-architecture-design/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-hybrid-crawler-architecture-design/INDEX.md)
- 🗺️ [Plan](./2025-12-06-hybrid-crawler-architecture-design/PLAN.md)
- 📝 [Working Notes](./2025-12-06-hybrid-crawler-architecture-design/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-hybrid-crawler-architecture-design/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-hybrid-crawler-architecture-design/FOLLOW_UPS.md)


### Session 2025-12-06: Project Direction: Reliable News Crawler Scope

**Duration**: Active
**Type**: planning
**Completion**: 🔄 In progress

**Focus**:
- Define scope and roadmap for a reliable, domain-aware news crawler system.

**Location**: `docs/sessions/2025-12-06-project-direction-reliable-news-crawler/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-project-direction-reliable-news-crawler/INDEX.md)
- 🗺️ [Plan](./2025-12-06-project-direction-reliable-news-crawler/PLAN.md)
- 📝 [Working Notes](./2025-12-06-project-direction-reliable-news-crawler/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-project-direction-reliable-news-crawler/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-project-direction-reliable-news-crawler/FOLLOW_UPS.md)


### Session 2025-12-06: Improve ui-pick Electron picker

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- Enhance ui-pick UX/output and agent usability

**Location**: `docs/sessions/2025-12-06-ui-pick-improve/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-ui-pick-improve/INDEX.md)
- 🗺️ [Plan](./2025-12-06-ui-pick-improve/PLAN.md)
- 📝 [Working Notes](./2025-12-06-ui-pick-improve/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-ui-pick-improve/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-ui-pick-improve/FOLLOW_UPS.md)


### Session 2025-12-06: Past/Present/Future view for what-next

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- Add past-present-future view and feature history surfacing in what-next output

**Location**: `docs/sessions/2025-12-06-what-next-past-present-future/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-what-next-past-present-future/INDEX.md)
- 🗺️ [Plan](./2025-12-06-what-next-past-present-future/PLAN.md)
- 📝 [Working Notes](./2025-12-06-what-next-past-present-future/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-what-next-past-present-future/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-what-next-past-present-future/FOLLOW_UPS.md)


### Session 2025-12-06: Improve what-next CLI

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- Add json output, session selection, sections filter

**Location**: `docs/sessions/2025-12-06-what-next-upgrade/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-what-next-upgrade/INDEX.md)
- 🗺️ [Plan](./2025-12-06-what-next-upgrade/PLAN.md)
- 📝 [Working Notes](./2025-12-06-what-next-upgrade/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-what-next-upgrade/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-what-next-upgrade/FOLLOW_UPS.md)


### Session 2025-12-06: Shared Context Menu Control

**Duration**: Active
**Type**: ui
**Completion**: 🔄 In progress

**Focus**:
- Add isomorphic context menu control usable in Electron + SSR

**Location**: `docs/sessions/2025-12-06-context-menu-control/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-context-menu-control/INDEX.md)
- 🗺️ [Plan](./2025-12-06-context-menu-control/PLAN.md)
- 📝 [Working Notes](./2025-12-06-context-menu-control/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-context-menu-control/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-context-menu-control/FOLLOW_UPS.md)


### Session 2025-12-06: Interactive SVG Editor in Electron with jsgui3 Windows

**Duration**: Active
**Type**: implementation
**Completion**: 🔄 In progress

**Focus**:
- Build Electron app for SVG element selection, right-click context menu, AI generation, and jsgui3 window display

**Location**: `docs/sessions/2025-12-06-svg-editor-electron/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-svg-editor-electron/INDEX.md)
- 🗺️ [Plan](./2025-12-06-svg-editor-electron/PLAN.md)
- 📝 [Working Notes](./2025-12-06-svg-editor-electron/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-svg-editor-electron/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-svg-editor-electron/FOLLOW_UPS.md)


### Session 2025-12-06: Consolidate agent instructions

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Move key guidance into AGENTS and slim Copilot file

**Location**: `docs/sessions/2025-12-06-instructions-consolidation/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-06-instructions-consolidation/INDEX.md)
- 🗺️ [Plan](./2025-12-06-instructions-consolidation/PLAN.md)
- 📝 [Working Notes](./2025-12-06-instructions-consolidation/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-06-instructions-consolidation/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-06-instructions-consolidation/FOLLOW_UPS.md)


### Session 2025-12-05: Agent backups app

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- CLI to backup/list/restore agent files to zip

**Location**: `docs/sessions/2025-12-05-agent-backups/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-05-agent-backups/INDEX.md)
- 🗺️ [Plan](./2025-12-05-agent-backups/PLAN.md)
- 📝 [Working Notes](./2025-12-05-agent-backups/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-05-agent-backups/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-05-agent-backups/FOLLOW_UPS.md)


### Session 2025-12-05: NPM Scripts Catalog

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Catalog runnable apps and render SVG overview

**Location**: `docs/sessions/2025-12-05-npm-scripts-map/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-05-npm-scripts-map/INDEX.md)
- 🗺️ [Plan](./2025-12-05-npm-scripts-map/PLAN.md)
- 📝 [Working Notes](./2025-12-05-npm-scripts-map/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-05-npm-scripts-map/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-05-npm-scripts-map/FOLLOW_UPS.md)


### Session 2025-12-04: Investigate MCP reduce undefined error

**Duration**: Active
**Type**: analysis
**Completion**: 🔄 In progress

**Focus**:
- Find MCP bug causing Copilot reduce undefined failure

**Location**: `docs/sessions/2025-12-04-mcp-reduce-error/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-04-mcp-reduce-error/INDEX.md)
- 🗺️ [Plan](./2025-12-04-mcp-reduce-error/PLAN.md)
- 📝 [Working Notes](./2025-12-04-mcp-reduce-error/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-04-mcp-reduce-error/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-04-mcp-reduce-error/FOLLOW_UPS.md)


### Session 2025-12-03: Extract service wiring to new module

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Reduce NewsCrawler.js by moving service wiring into dedicated module and keep compatibility

**Location**: `docs/sessions/2025-12-03-news-crawler-wiring-extract/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-news-crawler-wiring-extract/INDEX.md)
- 🗺️ [Plan](./2025-12-03-news-crawler-wiring-extract/PLAN.md)
- 📝 [Working Notes](./2025-12-03-news-crawler-wiring-extract/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-news-crawler-wiring-extract/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-news-crawler-wiring-extract/FOLLOW_UPS.md)


### Session 2025-12-03: Crawler SafeCall Expansion

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Extend safeCall utilities, add tests, and continue crawler cleanup

**Location**: `docs/sessions/2025-12-03-crawler-safecall-expansion/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-crawler-safecall-expansion/INDEX.md)
- 🗺️ [Plan](./2025-12-03-crawler-safecall-expansion/PLAN.md)
- 📝 [Working Notes](./2025-12-03-crawler-safecall-expansion/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-crawler-safecall-expansion/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-crawler-safecall-expansion/FOLLOW_UPS.md)


### Session 2025-12-03: Codex MCP memory wiring

**Duration**: Active
**Type**: config
**Completion**: 🔄 In progress

**Focus**:
- Enable Codex CLI to reach docs-memory MCP server

**Location**: `docs/sessions/2025-12-03-mcp-memory-codex/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-mcp-memory-codex/INDEX.md)
- 🗺️ [Plan](./2025-12-03-mcp-memory-codex/PLAN.md)
- 📝 [Working Notes](./2025-12-03-mcp-memory-codex/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-mcp-memory-codex/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-mcp-memory-codex/FOLLOW_UPS.md)


### Session 2025-12-03: NewsCrawler Code Cleanup

**Duration**: Active
**Type**: refactor
**Completion**: 🔄 In progress

**Focus**:
- Clean up error handling, extract utilities, improve code quality

**Location**: `docs/sessions/2025-12-03-crawler-cleanup/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-crawler-cleanup/INDEX.md)
- 🗺️ [Plan](./2025-12-03-crawler-cleanup/PLAN.md)
- 📝 [Working Notes](./2025-12-03-crawler-cleanup/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-crawler-cleanup/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-crawler-cleanup/FOLLOW_UPS.md)


### Session 2025-12-03: Docs Memory MCP

**Duration**: Active
**Type**: tooling
**Completion**: 🔄 In progress

**Focus**:
- Prototype MCP server that exposes AGI doc excerpts

**Location**: `docs/sessions/2025-12-03-mcp-docs-memory/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-mcp-docs-memory/INDEX.md)
- 🗺️ [Plan](./2025-12-03-mcp-docs-memory/PLAN.md)
- 📝 [Working Notes](./2025-12-03-mcp-docs-memory/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-mcp-docs-memory/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-mcp-docs-memory/FOLLOW_UPS.md)


### Session 2025-12-03: Enable js-edit file rename support

**Duration**: Active
**Type**: cli
**Completion**: 🔄 In progress

**Focus**:
- Allow js-edit to rename files and continue editing pipelines

**Location**: `docs/sessions/2025-12-03-js-edit-rename/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-js-edit-rename/INDEX.md)
- 🗺️ [Plan](./2025-12-03-js-edit-rename/PLAN.md)
- 📝 [Working Notes](./2025-12-03-js-edit-rename/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-js-edit-rename/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-js-edit-rename/FOLLOW_UPS.md)


### Session 2025-12-03: Create AGI Brainstorm agent

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Add new AGI brainstorming coordinator agent file with proper rules

**Location**: `docs/sessions/2025-12-03-agi-brainstorm-agent/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-agi-brainstorm-agent/INDEX.md)
- 🗺️ [Plan](./2025-12-03-agi-brainstorm-agent/PLAN.md)
- 📝 [Working Notes](./2025-12-03-agi-brainstorm-agent/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-agi-brainstorm-agent/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-agi-brainstorm-agent/FOLLOW_UPS.md)


### Session 2025-12-03: Guide: jsgui3 debugging

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Document workflow and techniques for debugging jsgui3 controls/activation

**Location**: `docs/sessions/2025-12-03-jsgui3-debug-guide/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-jsgui3-debug-guide/INDEX.md)
- 🗺️ [Plan](./2025-12-03-jsgui3-debug-guide/PLAN.md)
- 📝 [Working Notes](./2025-12-03-jsgui3-debug-guide/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-jsgui3-debug-guide/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-jsgui3-debug-guide/FOLLOW_UPS.md)


### Session 2025-12-03: Fix WYSIWYG demo e2e

**Duration**: Active
**Type**: bugfix
**Completion**: 🔄 In progress

**Focus**:
- Stabilize WYSIWYG demo server and Puppeteer test

**Location**: `docs/sessions/2025-12-03-wysiwyg-fix/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-wysiwyg-fix/INDEX.md)
- 🗺️ [Plan](./2025-12-03-wysiwyg-fix/PLAN.md)
- 📝 [Working Notes](./2025-12-03-wysiwyg-fix/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-wysiwyg-fix/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-wysiwyg-fix/FOLLOW_UPS.md)


### Session 2025-12-03: Inspect AGI agent system context

**Duration**: Active
**Type**: analysis
**Completion**: 🔄 In progress

**Focus**:
- Review AGI Singularity agent docs and latest session related to wysiwyg demo

**Location**: `docs/sessions/2025-12-03-wysiwyg-context/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-wysiwyg-context/INDEX.md)
- 🗺️ [Plan](./2025-12-03-wysiwyg-context/PLAN.md)
- 📝 [Working Notes](./2025-12-03-wysiwyg-context/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-wysiwyg-context/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-wysiwyg-context/FOLLOW_UPS.md)


### Session 2025-12-03: Deep jsgui3 Research for UI Singularity

**Duration**: Active
**Type**: research
**Completion**: 🔄 In progress

**Focus**:
- Deepen jsgui3 research to enable self-building UI capabilities (UI Singularity) via advanced shared controls and WYSIWYG foundations

**Location**: `docs/sessions/2025-12-03-jsgui3-deep-research-singularity/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-03-jsgui3-deep-research-singularity/INDEX.md)
- 🗺️ [Plan](./2025-12-03-jsgui3-deep-research-singularity/PLAN.md)
- 📝 [Working Notes](./2025-12-03-jsgui3-deep-research-singularity/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-03-jsgui3-deep-research-singularity/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-03-jsgui3-deep-research-singularity/FOLLOW_UPS.md)


### Session 2025-12-02: SVG Templates Expansion

**Duration**: Closed
**Type**: feature
**Completion**: ✅ Completed

**Focus**:
- Add architecture, flowchart, and timeline templates to the SVG generation system

**Location**: `docs/sessions/2025-12-02-svg-templates/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-02-svg-templates/INDEX.md)
- 🗺️ [Plan](./2025-12-02-svg-templates/PLAN.md)
- 📝 [Working Notes](./2025-12-02-svg-templates/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-02-svg-templates/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-02-svg-templates/FOLLOW_UPS.md)


### Session 2025-12-02: Implement Gap 5 and Gap 6 CLI Operations

**Duration**: Closed
**Type**: implementation
**Completion**: ✅ Completed

**Focus**:
- Add missing operation handlers for --call-graph, --hot-paths, --dead-code (Gap 6) in js-scan.js

**Location**: `docs/sessions/2025-12-02-gap5-gap6-cli-implementation/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-02-gap5-gap6-cli-implementation/INDEX.md)
- 🗺️ [Plan](./2025-12-02-gap5-gap6-cli-implementation/PLAN.md)
- 📝 [Working Notes](./2025-12-02-gap5-gap6-cli-implementation/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-02-gap5-gap6-cli-implementation/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-02-gap5-gap6-cli-implementation/FOLLOW_UPS.md)


### Session 2025-12-02: AI SVG Creation Methodology & Multi-Stage Tooling

**Duration**: Closed
**Type**: tooling
**Completion**: ✅ Completed

**Focus**:
- Design and build tooling for AI agents to create complex, beautiful SVG diagrams through structured multi-stage processes

**Location**: `docs/sessions/2025-12-02-svg-creation-methodology/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-02-svg-creation-methodology/INDEX.md)
- 🗺️ [Plan](./2025-12-02-svg-creation-methodology/PLAN.md)
- 📝 [Working Notes](./2025-12-02-svg-creation-methodology/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-02-svg-creation-methodology/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-02-svg-creation-methodology/FOLLOW_UPS.md)


### Session 2025-12-01: Fix Z-Server Green SVG

**Duration**: Closed
**Type**: bugfix
**Completion**: ✅ Completed

**Focus**:
- Restore styles for running server indicator

**Location**: `docs/sessions/2025-12-01-zserver-green-svg/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-01-zserver-green-svg/INDEX.md)
- 🗺️ [Plan](./2025-12-01-zserver-green-svg/PLAN.md)
- 📝 [Working Notes](./2025-12-01-zserver-green-svg/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-01-zserver-green-svg/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-01-zserver-green-svg/FOLLOW_UPS.md)


### Session 2025-12-01: Decision Tree Viewer Controls

**Duration**: Active
**Type**: ui-development
**Completion**: 🔄 In progress

**Focus**:
- Create beautifully styled jsgui3 controls for viewing decision trees

**Location**: `docs/sessions/2025-12-01-decision-tree-viewer-controls/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-01-decision-tree-viewer-controls/INDEX.md)
- 🗺️ [Plan](./2025-12-01-decision-tree-viewer-controls/PLAN.md)
- 📝 [Working Notes](./2025-12-01-decision-tree-viewer-controls/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-01-decision-tree-viewer-controls/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-01-decision-tree-viewer-controls/FOLLOW_UPS.md)


### Session 2025-12-01: Art Playground Layout Improvement

**Duration**: Active
**Type**: ui-improvement
**Completion**: 🔄 In progress

**Focus**:
- Implement ideal layout with tool panels, properties panel, and status bar using layout primitives methodology

**Location**: `docs/sessions/2025-12-01-art-playground-layout-improvement/`

**Quick Links**:
- 🧭 [Session Index](./2025-12-01-art-playground-layout-improvement/INDEX.md)
- 🗺️ [Plan](./2025-12-01-art-playground-layout-improvement/PLAN.md)
- 📝 [Working Notes](./2025-12-01-art-playground-layout-improvement/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-12-01-art-playground-layout-improvement/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-12-01-art-playground-layout-improvement/FOLLOW_UPS.md)


### Session 2025-11-30: Gazetteer ingestion review

**Duration**: Active
**Type**: analysis
**Completion**: 🔄 In progress

**Focus**:
- Review gazetteer ingestion pipeline/tooling and document findings

**Location**: `docs/sessions/2025-11-30-gaz-ingest-review/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-30-gaz-ingest-review/INDEX.md)
- 🗺️ [Plan](./2025-11-30-gaz-ingest-review/PLAN.md)
- 📝 [Working Notes](./2025-11-30-gaz-ingest-review/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-30-gaz-ingest-review/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-30-gaz-ingest-review/FOLLOW_UPS.md)


### Session 2025-11-30: Art Playground - Interactive SVG Component Editor

**Duration**: Active
**Type**: feature
**Completion**: 🔄 In progress

**Focus**:
- Build an interactive SVG component editor with click-to-select, resize handles, and drag-to-move as a stepping stone toward the decision tree editor

**Location**: `docs/sessions/2025-11-30-art-playground/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-30-art-playground/INDEX.md)
- 🗺️ [Plan](./2025-11-30-art-playground/PLAN.md)
- 📝 [Working Notes](./2025-11-30-art-playground/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-30-art-playground/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-30-art-playground/FOLLOW_UPS.md)


### Session 2025-11-30: Shared Controls Architecture & WYSIWYG Drawing Foundation

**Duration**: Active
**Type**: architecture
**Completion**: 🔄 In progress

**Focus**:
- Create shared jsgui3 controls library and lay foundation for WYSIWYG decision tree editor

**Location**: `docs/sessions/2025-11-30-shared-controls-architecture/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-30-shared-controls-architecture/INDEX.md)
- 🗺️ [Plan](./2025-11-30-shared-controls-architecture/PLAN.md)
- 📝 [Working Notes](./2025-11-30-shared-controls-architecture/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-30-shared-controls-architecture/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-30-shared-controls-architecture/FOLLOW_UPS.md)


### Session 2025-11-30: Decision Tree Visualization Apps Deep Research

**Duration**: Active
**Type**: research
**Completion**: 🔄 In progress

**Focus**:
- Research decision tree visualization tools and create example SVGs using Luxury Industrial Obsidian theme

**Location**: `docs/sessions/2025-11-30-decision-tree-viz-research/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-30-decision-tree-viz-research/INDEX.md)
- 🗺️ [Plan](./2025-11-30-decision-tree-viz-research/PLAN.md)
- 📝 [Working Notes](./2025-11-30-decision-tree-viz-research/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-30-decision-tree-viz-research/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-30-decision-tree-viz-research/FOLLOW_UPS.md)


### Session 2025-11-29: Fix Design Studio client errors

**Duration**: Active
**Type**: ui-dashboard
**Completion**: 🔄 In progress

**Focus**:
- Resolve Design Studio console errors and hydrate controls

**Location**: `docs/sessions/2025-11-29-design-studio-console/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-29-design-studio-console/INDEX.md)
- 🗺️ [Plan](./2025-11-29-design-studio-console/PLAN.md)
- 📝 [Working Notes](./2025-11-29-design-studio-console/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-29-design-studio-console/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-29-design-studio-console/FOLLOW_UPS.md)


### Session 2025-11-29: Design Studio Server App

**Duration**: Active
**Type**: feature
**Completion**: 🔄 In progress

**Focus**:
- Create Design Studio app based on docsViewer, targeting design directory with Luxury White Leather theme

**Location**: `docs/sessions/2025-11-29-design-studio-app/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-29-design-studio-app/INDEX.md)
- 🗺️ [Plan](./2025-11-29-design-studio-app/PLAN.md)
- 📝 [Working Notes](./2025-11-29-design-studio-app/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-29-design-studio-app/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-29-design-studio-app/FOLLOW_UPS.md)


### Session 2025-11-29: Industrial Luxury Obsidian Glyphs

**Duration**: Active
**Type**: design
**Completion**: 🔄 In progress

**Focus**:
- Create reusable SVG primitives in theme

**Location**: `docs/sessions/2025-11-29-industrial-obsidian-glyphs/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-29-industrial-obsidian-glyphs/INDEX.md)
- 🗺️ [Plan](./2025-11-29-industrial-obsidian-glyphs/PLAN.md)
- 📝 [Working Notes](./2025-11-29-industrial-obsidian-glyphs/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-29-industrial-obsidian-glyphs/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-29-industrial-obsidian-glyphs/FOLLOW_UPS.md)


### Session 2025-11-29: Improve jsgui3 Workflow Access

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Enhance guidelines + tooling discoverability for jsgui3 control workflows

**Location**: `docs/sessions/2025-11-29-jsgui-workflows/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-29-jsgui-workflows/INDEX.md)
- 🗺️ [Plan](./2025-11-29-jsgui-workflows/PLAN.md)
- 📝 [Working Notes](./2025-11-29-jsgui-workflows/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-29-jsgui-workflows/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-29-jsgui-workflows/FOLLOW_UPS.md)


### Session 2025-11-29: JSGUI3 patterns diagram

**Duration**: Active
**Type**: docs
**Completion**: 🔄 In progress

**Focus**:
- Add SVG diagram summarizing optimal jsgui3 patterns

**Location**: `docs/sessions/2025-11-29-jsgui-patterns-svg/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-29-jsgui-patterns-svg/INDEX.md)
- 🗺️ [Plan](./2025-11-29-jsgui-patterns-svg/PLAN.md)
- 📝 [Working Notes](./2025-11-29-jsgui-patterns-svg/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-29-jsgui-patterns-svg/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-29-jsgui-patterns-svg/FOLLOW_UPS.md)


### Session 2025-11-28: Fix gazetteer context menu events

**Duration**: Active
**Type**: bugfix
**Completion**: 🔄 In progress

**Focus**:
- Make importer context menu usable with jsgui events

**Location**: `docs/sessions/2025-11-28-gazetteer-context-menu/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-28-gazetteer-context-menu/INDEX.md)
- 🗺️ [Plan](./2025-11-28-gazetteer-context-menu/PLAN.md)
- 📝 [Working Notes](./2025-11-28-gazetteer-context-menu/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-28-gazetteer-context-menu/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-28-gazetteer-context-menu/FOLLOW_UPS.md)


### Session 2025-11-28: Z-Server Scan Progress Bar

**Duration**: Active
**Type**: Feature
**Completion**: 🔄 In progress

**Focus**:
- Add real progress bar to z-server scan with debounced IPC updates

**Location**: `docs/sessions/2025-11-28-z-server-progress-bar/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-28-z-server-progress-bar/INDEX.md)
- 🗺️ [Plan](./2025-11-28-z-server-progress-bar/PLAN.md)
- 📝 [Working Notes](./2025-11-28-z-server-progress-bar/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-28-z-server-progress-bar/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-28-z-server-progress-bar/FOLLOW_UPS.md)


### Session 2025-11-28: Add Scanning UI to Z-Server

**Duration**: Active
**Type**: Feature
**Completion**: 🔄 In progress

**Focus**:
- Implement SVG scanning indicator in Z-Server sidebar

**Location**: `docs/sessions/2025-11-28-z-server-scanning-ui/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-28-z-server-scanning-ui/INDEX.md)
- 🗺️ [Plan](./2025-11-28-z-server-scanning-ui/PLAN.md)
- 📝 [Working Notes](./2025-11-28-z-server-scanning-ui/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-28-z-server-scanning-ui/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-28-z-server-scanning-ui/FOLLOW_UPS.md)


### Session 2025-11-28: Fix z-server page_context error

**Duration**: Active
**Type**: Bug Fix
**Completion**: 🔄 In progress

**Focus**:
- Fix ReferenceError in z-server renderer

**Location**: `docs/sessions/2025-11-28-fix-z-server-page-context/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-28-fix-z-server-page-context/INDEX.md)
- 🗺️ [Plan](./2025-11-28-fix-z-server-page-context/PLAN.md)
- 📝 [Working Notes](./2025-11-28-fix-z-server-page-context/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-28-fix-z-server-page-context/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-28-fix-z-server-page-context/FOLLOW_UPS.md)


### Session 2025-11-28: Fix page_context not defined in z-server

**Duration**: Active
**Type**: Bugfix
**Completion**: 🔄 In progress

**Focus**:
- Identify and fix the page_context not defined error in z-server

**Location**: `docs/sessions/2025-11-28-z-server-page-context-fix/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-28-z-server-page-context-fix/INDEX.md)
- 🗺️ [Plan](./2025-11-28-z-server-page-context-fix/PLAN.md)
- 📝 [Working Notes](./2025-11-28-z-server-page-context-fix/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-28-z-server-page-context-fix/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-28-z-server-page-context-fix/FOLLOW_UPS.md)


### Session 2025-11-28: Fix z-server and Improve Puppeteer Workflow

**Duration**: Active
**Type**: Refactoring
**Completion**: 🔄 In progress

**Focus**:
- Fix z-server bugs and create Puppeteer log capture tool for UI workflows

**Location**: `docs/sessions/2025-11-28-z-server-fix-and-puppeteer-workflow/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-28-z-server-fix-and-puppeteer-workflow/INDEX.md)
- 🗺️ [Plan](./2025-11-28-z-server-fix-and-puppeteer-workflow/PLAN.md)
- 📝 [Working Notes](./2025-11-28-z-server-fix-and-puppeteer-workflow/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-28-z-server-fix-and-puppeteer-workflow/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-28-z-server-fix-and-puppeteer-workflow/FOLLOW_UPS.md)


### Session 2025-11-28: Z-Server jsgui3 Refactor

**Duration**: Active
**Type**: UI/Architecture
**Completion**: 🔄 In progress

**Focus**:
- Convert Z-Server Electron app to use jsgui3-client with Industrial Luxury Obsidian theme

**Location**: `docs/sessions/2025-11-28-z-server-jsgui3-refactor/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-28-z-server-jsgui3-refactor/INDEX.md)
- 🗺️ [Plan](./2025-11-28-z-server-jsgui3-refactor/PLAN.md)
- 📝 [Working Notes](./2025-11-28-z-server-jsgui3-refactor/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-28-z-server-jsgui3-refactor/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-28-z-server-jsgui3-refactor/FOLLOW_UPS.md)


### Session 2025-11-28: CSS/JS Separation Refactoring

**Duration**: Active
**Type**: Build System / Architecture
**Completion**: 🔄 Planning

**Focus**:
- Separate inline CSS from server files (getStyles() functions)
- Separate inline client JS from servers (getClientScript() functions)
- Extract CSS from control classes (ClassName.css = `...` pattern)
- Create esbuild-based build process for CSS/JS bundling
- Enable external static file serving from Express servers

**Inspired By**: jsgui3-server CSS extraction architecture using AST-based parsing

**Key Files**:
- `geoImportServer.js` - 500+ lines inline CSS
- `DatabaseSelector.js` - CSS in getStyles() method
- `diagramAtlasServer.js` - buildBaseStyles() function

**Location**: `docs/sessions/2025-11-28-css-js-separation/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-28-css-js-separation/PLAN.md)
- 📝 [Working Notes](./2025-11-28-css-js-separation/WORKING_NOTES.md)
- 🏗️ [Architecture Diagram](./2025-11-28-css-js-separation/architecture.svg)

---

### Session 2025-06-20: Gazetteer Ingestion Robustness

**Duration**: Closed
**Type**: Data Quality / Tooling
**Completion**: ✅ Completed

**Focus**:
- Fixed duplicate place records (5 Londons → 1)
- Created `gazetteer-cleanup.js` for manual and automatic duplicate cleanup
- Integrated multi-strategy deduplication into capital city creation
- Added `--cleanup` and `--cleanup-only` options to `populate-gazetteer.js`
- Backfilled `wikidata_qid` column from `place_external_ids`

**Results**:
- 252 places got `wikidata_qid` backfilled
- 8 duplicate records merged/deleted
- 0 duplicates remaining

**Location**: `docs/sessions/2025-06-20-gazetteer-ingestion-robustness/`

**Quick Links**:
- 📘 [Implementation Plan](./2025-06-20-gazetteer-ingestion-robustness/PLAN.md)

---

### Session 2025-11-27: URL Classification Improvement

**Duration**: Active
**Type**: Classification system enhancement
**Completion**: 🔄 In progress

**Focus**:
- Distinguish between URL-only predictions and content-verified classifications
- Learn URL patterns from verified classifications for better predictions
- Pattern matching from similar verified URLs
- New database tables: `url_classifications`, `url_classification_patterns`, `domain_classification_profiles`
- New services: `UrlClassificationService`, `UrlPatternLearningService`

**Location**: `docs/sessions/2025-11-27-url-classification-improvement/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-27-url-classification-improvement/PLAN.md)
- 📝 [Working Notes](./2025-11-27-url-classification-improvement/WORKING_NOTES.md)

---

### Session 2025-10-24: Gazetteer Tooling

**Duration**: Closed
**Type**: Tooling
**Completion**: ✅ Completed

**Focus**:
- Create CLI tooling (`gazetteer-scan.js`) for navigating and querying gazetteer data.
- Implement `gazetteer.search.js` query module.
- Document tools in `GAZETTEER_TOOLS.md`.

**Location**: `docs/sessions/2025-10-24-gazetteer-tooling/`

**Quick Links**:
- 📘 [Session Summary](./2025-10-24-gazetteer-tooling/SESSION_SUMMARY.md)
- 🗺️ [Plan](./2025-10-24-gazetteer-tooling/PLAN.md)

### Session 2025-11-21: Crawler Refactor

**Duration**: Active
**Type**: Backend architecture
**Completion**: 🔄 In progress

**Focus**:
- Centralize CLI + runner config merging via `ConfigurationService`.
- Introduce `CrawlerFactory` so `NewsCrawler` focuses on orchestration only.
- Update entry points (`crawl.js`, crawl API) to use the factory + new config pipeline.

**Location**: `docs/sessions/2025-11-21-crawler-refactor/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-21-crawler-refactor/PLAN.md)
- 📝 [Working Notes](./2025-11-21-crawler-refactor/WORKING_NOTES.md)

### Session 2025-11-21: Crawler Factory DI

**Duration**: Closed
**Type**: Backend architecture
**Completion**: ✅ Completed

**Focus**:
- Teach `NewsCrawler` to accept injected service bundles and expose reusable wiring helpers.
- Route `CrawlerFactory` and facade helpers through the DI pathway so future entry points can swap implementations safely.
- Document the plan + validation steps as the factory work continues.

**Location**: `docs/sessions/2025-11-21-crawler-factory-di/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-21-crawler-factory-di/PLAN.md)

### Session 2025-11-17: jsgui3 Isomorphic Screenshots

**Duration**: Active
**Type**: UI screenshot tooling
**Completion**: ✅ Completed

**Focus**:
- Capture Puppeteer snapshots for every server-rendered Data Explorer route (URLs, Domains, Crawls, Errors, detail views)
- Provide reusable helpers so agents can refresh documentation-quality screenshots on demand
- Log verification commands + artifacts under the session folder for future reference

**Location**: `docs/sessions/2025-11-17-jsgui3-isomorphic-screenshots/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-17-jsgui3-isomorphic-screenshots/PLAN.md)
- 📝 [Working Notes](./2025-11-17-jsgui3-isomorphic-screenshots/WORKING_NOTES.md)

### Session 2025-11-17: AGI Agent Alignment

**Duration**: Active
**Type**: Agent documentation alignment
**Completion**: 🔄 In progress

**Focus**:
- Sync AGI-Orchestrator, AGI-Scout, and the implementation/tooling agents with Singularity + AGI doc rules
- Ensure session/todo requirements, plan templates, and handoff expectations are explicit in each `.agent.md`
- Capture links into `/docs/agi` and the session folder so downstream agents inherit the updated workflow

**Location**: `docs/sessions/2025-11-17-agi-agents/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-17-agi-agents/PLAN.md)
- 📝 [Working Notes](./2025-11-17-agi-agents/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-17-agi-agents/SESSION_SUMMARY.md)

### Session 2025-11-17: jsgui Forward

**Duration**: Active
**Type**: UI remediation (jsgui3)
**Completion**: 🔄 In progress

**Focus**:
- Eliminate manual control activation fallbacks by seeding the registry from every SSR entry point.
- Add telemetry-aware refresh UX to the Diagram Atlas shell so CLI progress is surfaced to users.
- Introduce a shared listing state module for the Data Explorer so toggles, tables, diagnostics, and pagers stay synchronized.
- Capture the new workflow in `/docs/agi` plus this session folder for future agents.

**Location**: `docs/sessions/2025-11-17-jsgui-forward/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-17-jsgui-forward/PLAN.md)
- 📝 [Working Notes](./2025-11-17-jsgui-forward/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-17-jsgui-forward/SESSION_SUMMARY.md)

### Session 2025-11-17: UI Dashboard Routing

**Duration**: Active
**Type**: UI navigation & layout
**Completion**: 🔄 In progress

**Focus**:
- Split the heavy `/urls` landing experience into a lightweight dashboard home plus a dedicated URLs listing screen.
- Keep Diagram Atlas, jobs feed, and metrics on the home page without interfering with URL pagination UX.
- Improve responsive layout for jobs/URL cards so monitors under 1400px wide still render cleanly.

**Location**: `docs/sessions/2025-11-17-ui-dashboard-routing/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-17-ui-dashboard-routing/PLAN.md)
- 📝 [Working Notes](./2025-11-17-ui-dashboard-routing/WORKING_NOTES.md)

### Session 2025-11-17: UI Home Cleanup

**Duration**: Active
**Type**: UI layout polish
**Completion**: 🔄 In progress

**Focus**:
- Ensure the dashboard landing page renders only cards/status panels while the URL table lives exclusively on `/urls`.
- Remove legacy renderer paths that force the listing shell to appear even when hidden.
- Capture smoke-test commands plus future follow-ups in the session docs for downstream agents.

**Location**: `docs/sessions/2025-11-17-ui-home-cleanup/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-17-ui-home-cleanup/PLAN.md)
- 📝 [Working Notes](./2025-11-17-ui-home-cleanup/WORKING_NOTES.md)

### Session 2025-11-18: UI URL Details Fetch History Fix

**Duration**: Closed
**Type**: Bug Fix
**Completion**: ✅ Completed

**Focus**:
- Fix the "Fetched URLs" list on the URL details page which was showing 0 items.
- Update `src/db/sqlite/v1/queries/ui/urlDetails.js` to query `http_responses` instead of stale `fetches`.
- Verify the fix with a script.

**Location**: `docs/sessions/2025-11-18-ui-url-details-fetch-history-fix/`

**Quick Links**:
- 📘 [Session Summary](./2025-11-18-ui-url-details-fetch-history-fix/SESSION_SUMMARY.md)

### Session 2025-11-20: Crawl Config Workspace

**Duration**: Active
**Type**: UI controls & config surfacing
**Completion**: 🔄 In progress

**Focus**:
- Implement the property grid workspace, crawl profile drawer, behavior timeline, and diff mini-map for crawl config review
- Extend `ConfigMatrixControl` and `CrawlBehaviorPanelControl` with richer config data sourced from `config/crawl-runner.json`
- Update controls tests/checks so agents can verify the new panels quickly

**Location**: `docs/sessions/2025-11-20-crawl-config-workspace/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-20-crawl-config-workspace/PLAN.md)
- 📝 [Working Notes](./2025-11-20-crawl-config-workspace/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-20-crawl-config-workspace/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-20-crawl-config-workspace/FOLLOW_UPS.md)

### Session 2025-11-20: UI Data Explorer Production Tests

**Duration**: Active
**Type**: UI validation
**Completion**: 🔄 In progress

**Focus**:
- Exercise every Data Explorer view against production-sized SQLite snapshots
- Add Jest/SuperTest coverage that targets `data/news.db` with graceful skip logic
- Fix any regressions surfaced by the production-data runs and capture next steps

**Location**: `docs/sessions/2025-11-20-ui-data-explorer-tests/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-20-ui-data-explorer-tests/INDEX.md)
- 🗺️ [Plan](./2025-11-20-ui-data-explorer-tests/PLAN.md)
- 📝 [Working Notes](./2025-11-20-ui-data-explorer-tests/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-20-ui-data-explorer-tests/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-20-ui-data-explorer-tests/FOLLOW_UPS.md)

### Session 2025-11-20: Client Activation

**Duration**: Active
**Type**: UI activation & hydration
**Completion**: 🔄 In progress

**Focus**:
- Ensure the `/urls` bundle hydrates UrlListingTable, UrlFilterToggle, and PagerButton controls client-side
- Patch `src/ui/client/index.js` so the custom controls register via `Client_Page_Context`
- Capture manual verification notes for the toggle + table refresh flow

**Location**: `docs/sessions/2025-11-20-client-activation/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-20-client-activation/PLAN.md)
- 📝 [Working Notes](./2025-11-20-client-activation/WORKING_NOTES.md)

### Session 2025-11-20: UI Home Card CLI

**Duration**: Active
**Type**: UI home grid parity
**Completion**: 🔄 In progress

**Focus**:
- Wire `src/ui/render-url-table.js` to shared `homeCards` loaders so the CLI output matches the server home page badges and diagnostics.
- Capture js-scan/js-edit commands plus verification logs (Jest + control checks) inside the session directory.
- Brainstorm additional quick wins for UI reliability and documentation.

**Location**: `docs/sessions/2025-11-20-ui-home-card-cli/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-20-ui-home-card-cli/PLAN.md)
- 📝 [Working Notes](./2025-11-20-ui-home-card-cli/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-20-ui-home-card-cli/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-20-ui-home-card-cli/FOLLOW_UPS.md)

### Session 2025-11-20: UI E2E Testing

**Duration**: Active
**Type**: UI automation
**Completion**: 🔄 In progress

**Focus**:
- Validate the Puppeteer `/urls` toggle coverage, document run instructions, and capture gaps for expanding UI e2e reach.
- Outline additional high-value flows (home cards, pagination diagnostics) plus shared server/fixture helpers for new suites.
- Ensure session docs + `src/ui/README.md` call out the runner commands so agents can reliably exercise UI pathways.

**Location**: `docs/sessions/2025-11-20-ui-e2e-testing/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-20-ui-e2e-testing/PLAN.md)
- 📝 [Working Notes](./2025-11-20-ui-e2e-testing/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-20-ui-e2e-testing/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-20-ui-e2e-testing/FOLLOW_UPS.md)

### Session 2025-11-20: js-scan Continuation Loop

**Duration**: Active
**Type**: Tooling upgrade
**Completion**: 🔄 In progress

**Focus**:
- Wire js-scan continuation tokens (analyze/trace/ripple) to concrete action handlers so agents can resume workflows without manual reseeding.
- Extend token payloads with match snapshots (file, selector, hash) plus guardrails that detect stale results gracefully.
- Update AI-native smoke tests + AGI docs so downstream agents know how to capture, store, and replay tokens safely.

**Location**: `docs/sessions/2025-11-20-js-scan-continuation/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-20-js-scan-continuation/PLAN.md)
- 📝 [Working Notes](./2025-11-20-js-scan-continuation/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-20-js-scan-continuation/SESSION_SUMMARY.md)

### Session 2025-11-21: js-scan Relationship Tokens

**Duration**: Active
**Type**: Tooling upgrade
**Completion**: ✅ Completed

**Focus**:
- Extend `--what-imports`/`--export-usage` to emit `_ai_native_cli` payloads and continuation tokens.
- Replay relationship queries from tokens (importer/usage snapshots, digest warnings) so agents can resume workflows immediately.
- Capture session docs plus expanded smoke coverage for the new flows.

**Location**: `docs/sessions/2025-11-21-js-scan-relationship-tokens/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-21-js-scan-relationship-tokens/PLAN.md)
- 📝 [Working Notes](./2025-11-21-js-scan-relationship-tokens/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-21-js-scan-relationship-tokens/SESSION_SUMMARY.md)

### Session 2025-11-21: js-edit Ingestion

**Duration**: Closed
**Type**: Tooling upgrade
**Completion**: ✅ Completed

**Focus**:
- Teach js-edit to ingest js-scan match snapshots directly via `--match-snapshot` / `--from-token` so guard plans no longer require a second locate run.
- Validate snapshot hashes/spans against on-disk sources before wiring BatchDryRunner to emit guard plans or previews.
- Extend AI-native smoke coverage to prove a js-scan continuation token can hydrate js-edit without manual selector steps.

**Location**: `docs/sessions/2025-11-21-js-edit-ingestion/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-21-js-edit-ingestion/PLAN.md)
- 📝 [Working Notes](./2025-11-21-js-edit-ingestion/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-21-js-edit-ingestion/SESSION_SUMMARY.md)

### Session 2025-11-21: jsgui3 Isomorphic Diagram Polish

**Duration**: Closed
**Type**: UI polish & data surfacing
**Completion**: ✅ Completed

**Focus**:
- Extend the diagram data CLI/service so code tiles carry real byte sizes for accurate area scaling
- Refresh the diagram atlas presentation (header, diagnostics, refresh affordance) while preserving SSR/hydration
- Capture verification steps (diagram check + e2e) plus any follow-up findings inside the session folder

**Location**: `docs/sessions/2025-11-21-jsgui3-isomorphic-diagram-polish/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-21-jsgui3-isomorphic-diagram-polish/PLAN.md)
- 📝 [Working Notes](./2025-11-21-jsgui3-isomorphic-diagram-polish/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-21-jsgui3-isomorphic-diagram-polish/SESSION_SUMMARY.md)

### Session 2025-11-22: jsgui3 Isomorphic Data Explorer

**Duration**: Closed
**Type**: UI polish & responsiveness
**Completion**: ✅ Completed

**Focus**:
- Refresh Data Explorer headers, stats, and tables so they match the recent Diagram Atlas makeover polish
- Ensure typography + layout remain tidy from laptop widths up through ultra-wide monitors
- Capture SSR/hydration verification steps (checks + server tests) and wide-layout screenshots in the session folder

**Location**: `docs/sessions/2025-11-22-jsgui3-isomorphic-data-explorer/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-22-jsgui3-isomorphic-data-explorer/PLAN.md)
- 📘 [Session Summary](./2025-11-22-jsgui3-isomorphic-data-explorer/SESSION_SUMMARY.md)

### Session 2025-11-22: Gap 4 Plans Integration

**Duration**: Closed
**Type**: Tooling implementation
**Completion**: ✅ Completed

**Focus**:
- Implement `--emit-plan` and `--from-plan` in `js-edit` to enable safe, multi-step editing workflows.
- Build guard verification (file hashing) to prevent applying plans to stale files.
- Add comprehensive tests for plan generation, verification failure, and successful application.

**Location**: `docs/sessions/2025-11-22-gap4-plans-integration/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-22-gap4-plans-integration/PLAN.md)
- 📝 [Working Notes](./2025-11-22-gap4-plans-integration/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-22-gap4-plans-integration/SESSION_SUMMARY.md)

### Session 2025-11-22: Selector Suggestions

**Duration**: Closed
**Type**: Tooling enhancement
**Completion**: ✅ Completed

**Focus**:
- Implement `--suggest-selectors` in `js-edit` to provide structured disambiguation for ambiguous matches.
- Improve error messages for multiple matches to guide users toward the new flag.
- Verify with tests and document in AGENTS.md.

**Location**: `docs/sessions/2025-11-22-selector-suggestions/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-22-selector-suggestions/PLAN.md)
- 📝 [Working Notes](./2025-11-22-selector-suggestions/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-22-selector-suggestions/SESSION_SUMMARY.md)

### Session 2025-11-22: Partial Match & Diffing

**Duration**: Active
**Type**: Tooling enhancement
**Completion**: 🔄 In progress

**Focus**:
- Enable `js-edit` to match code blocks with minor whitespace/formatting differences (fuzzy matching).
- Add `--diff` flag to show unified diffs of changes.
- Increase robustness against auto-formatting differences.

**Location**: `docs/sessions/2025-11-22-partial-match-diffing/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-22-partial-match-diffing/PLAN.md)
- 📝 [Working Notes](./2025-11-22-partial-match-diffing/WORKING_NOTES.md)

### Session 2025-11-22: UI Dashboard Completion

**Duration**: Closed
**Type**: UI Polish
**Completion**: ✅ Completed

**Focus**:
- Finalize the split between Home Dashboard and URL Listing.
- Verify client-side hydration on `/urls`.
- Ensure navigation and state preservation.

**Location**: `docs/sessions/2025-11-22-ui-dashboard-completion/`

**Quick Links**:
- 🗺️ [Plan](./2025-11-22-ui-dashboard-completion/PLAN.md)
- 📘 [Session Summary](./2025-11-22-ui-dashboard-completion/SESSION_SUMMARY.md)

### Session 2025-11-22: UI Config Viewer

**Duration**: Closed
**Type**: UI Feature
**Completion**: ✅ Completed

**Focus**:
- Implement read-only configuration viewer in Data Explorer.
- Create DB query for `crawler_settings`.
- Add `/config` route to server.
- Update `render-url-table.js` to support arbitrary controls.

**Location**: `docs/sessions/2025-11-22-ui-config-viewer/`

**Quick Links**:
- 📘 [Session Summary](./2025-11-22-ui-config-viewer/SESSION_SUMMARY.md)

---

## How Agents Should Use Session Documentation

### For Active Development (Current Session)
1. **Start each task**: Read current session's INDEX.md for context
2. **During work**: Reference SESSION_SUMMARY.md for decisions and patterns
3. **Before major changes**: Check DECISIONS.md for precedents
4. **Update frequently**: Add notes to WORKING_NOTES.md as you progress

### For Pattern Recognition (Recent Sessions)
1. **Before new feature**: Search recent sessions for similar work
2. **For debugging**: Look for past issues and resolutions
3. **For decision-making**: Reference past options considered

### For Historical Context (Archive)
1. **When confused**: Why was X decided this way?
2. **For evolution**: How did our approach change over time?
3. **For lessons**: What did we learn that still applies?

---

## Session Structure

Each session directory contains:

```
docs/sessions/[YYYY-MM-DD]-[session-slug]/
├── INDEX.md                      ← Start here for session overview
├── SESSION_SUMMARY.md            ← Work completed, metrics, decisions
├── WORKING_NOTES.md              ← Live notes during session
├── DECISIONS.md                  ← Decisions made (ADR-lite format)
├── ROADMAP.md                    ← Tasks, priorities, next steps
├── AGENT_GUIDANCE.md             ← Instructions for agents on this domain
├── DELIVERABLES.md               ← What was created/modified
├── SEARCH_INDEX.md               ← Searchable content index (for agents)
├── FOLLOW_UPS.md                 ← Issues to address next session
└── archive/                      ← Session-specific archives
    ├── backup-docs/
    └── prior-context.md
```

---

## Session File Descriptions

### INDEX.md (Required)
- Quick overview of session objectives
- Status at a glance
- Links to key documents
- How to use this session's docs

### SESSION_SUMMARY.md (Required)
- What was accomplished
- Metrics and measurements
- Key decisions made
- Problems encountered
- Lessons learned
- Recommendations for next session

### WORKING_NOTES.md (Required)
- Live notes during development
- Decisions as they're made
- Blockers and solutions
- Questions to research
- Ideas for future work

### DECISIONS.md (Required)
- ADR-lite format entries
- One entry per major decision
- Context, options, decision, consequences
- Date and decision-maker

### ROADMAP.md (Required)
- Current session's tasks (done, in-progress, pending)
- Next session recommended priorities
- Effort estimates
- Dependencies and blockers

### AGENT_GUIDANCE.md (Conditional)
- Domain-specific guidance for agents
- How to approach problems in this area
- Tools and techniques available
- Common pitfalls and solutions
- Examples and patterns

### DELIVERABLES.md (Conditional)
- List of all files created/modified
- Brief description of each
- Links to implementation
- Test results and metrics

### SEARCH_INDEX.md (Required)
- Searchable keywords from session
- Function names, file paths, concepts
- Brief context snippets (for agents)
- Links to relevant sections

### FOLLOW_UPS.md (Required)
- Issues to address next session
- Questions that need research
- Incomplete tasks
- Blocked items and blockers
- Recommended next steps

---

## Example Session Usage

### Scenario: Starting New Task
```
1. Agent opens: docs/sessions/[CURRENT]/INDEX.md
   → Gets overview of current work
   
2. Agent reads: docs/sessions/[CURRENT]/SESSION_SUMMARY.md
   → Understands decisions and context
   
3. Agent searches: docs/sessions/[CURRENT]/SEARCH_INDEX.md
   → Finds relevant prior work
   
4. Agent reads: docs/sessions/[CURRENT]/AGENT_GUIDANCE.md
   → Learns domain-specific approaches
   
5. Agent executes with informed context
```

### Scenario: Debugging Unknown Issue
```
1. Agent searches: Current session's SEARCH_INDEX.md
   → No match found
   
2. Agent searches: Recent sessions (last 4 weeks)
   → Finds similar issue reported 2 weeks ago
   
3. Agent reads: prior session's DECISIONS.md
   → Learns why that approach was rejected
   
4. Agent reads: Archive for historical context
   → Understands architectural evolution
   
5. Agent makes informed decision based on full history
```

---

## Agent Memory Operations

### Quick Memory (Current Session)
**Operation**: `grep -r "keyword" docs/sessions/[CURRENT]/`  
**Use Case**: Find what was done today/this session  
**Speed**: <100ms  
**Accuracy**: 95%+

### Medium Memory (Last 4 weeks)
**Operation**: `grep -r "keyword" docs/sessions/` (exclude archive)  
**Use Case**: Find patterns from recent work  
**Speed**: <500ms  
**Accuracy**: 90%+

### Long Memory (All history)
**Operation**: `grep -r "keyword" docs/sessions/` (include archive)  
**Use Case**: Historical context and evolution  
**Speed**: 1-2s  
**Accuracy**: 85%+ (may need filtering)

---

## Tools for Agents (Recommended)

### Search Current Session
```bash
# Find all mentions of "payment" in current session
node tools/dev/js-scan.js --search "payment" docs/sessions/2025-11-13-strategic-planning/

# Find decisions related to refactoring
grep -n "refactor" docs/sessions/2025-11-13-strategic-planning/DECISIONS.md
```

### Search Recent Sessions
```bash
# Find similar issues from last month
find docs/sessions -type f -mtime -30 | xargs grep "issue-type"

# Get context from 3 weeks ago
grep -r "feature-name" docs/sessions --include="*.md" | head -20
```

### Build Agent Context
```bash
# Create a quick context file for new agent
cat docs/sessions/[CURRENT]/INDEX.md
cat docs/sessions/[CURRENT]/ROADMAP.md
cat docs/sessions/[CURRENT]/SEARCH_INDEX.md
# → Ready to work with full context
```

### Tooling References
- `docs/COMMAND_EXECUTION_GUIDE.md` — approved shell usage, encoding setup, and the repository’s no-Python rule.
- `docs/TESTING_QUICK_REFERENCE.md` — sanctioned Jest runners (`npm run test:by-path`, `npm run test:file`) and when to run them.
- `docs/AGENT_REFACTORING_PLAYBOOK.md` — end-to-end examples for `tools/dev/js-scan.js` and `tools/dev/js-edit.js`, including Gap 2/3/5/6 workflows.
- `tools/dev/README.md` — CLI flag reference for js-scan/js-edit/md-scan/md-edit.

### Workflow Playbooks
- Start at `docs/INDEX.md` for the curated map of workflow, agent, and standards documents.
- `docs/workflows/planning_review_loop.md` explains the plan → implement → verify cadence expected in session folders.
- `docs/AI_AGENT_DOCUMENTATION_GUIDE.md` outlines how session folders, summaries, and follow-ups fit together.
- `docs/agents/` contains persona-specific guides; cross-check the relevant `.agent.md` when taking over work from another agent.

---

## Session Lifecycle

### Active Session (Days 1-3)
- Live updates to WORKING_NOTES.md
- Frequent DECISIONS.md additions
- Regular ROADMAP.md updates
- End-of-day updates to SESSION_SUMMARY.md

### Wrapping Session (Day 4)
- Finalize SESSION_SUMMARY.md
- Archive WORKING_NOTES.md
- Complete DELIVERABLES.md
- Create SEARCH_INDEX.md
- Document FOLLOW_UPS.md

### Archiving (Day 5+)
- Move to recent sessions index
- Update parent INDEX.md with link
- After 8 weeks: move to archive/
- Maintain SEARCH_INDEX.md for searching

---

## Best Practices for Sessions

### For Humans/Teams
- **Update daily**: Keep WORKING_NOTES.md current
- **Decide clearly**: Document in DECISIONS.md when choices are made
- **Plan ahead**: Use ROADMAP.md to guide each day
- **Archive properly**: Complete SESSION_SUMMARY.md before moving on

### For Agents
- **Search first**: Check SEARCH_INDEX.md before asking humans
- **Read context**: Session overview before diving into details
- **Respect history**: Consider past decisions (in DECISIONS.md)
- **Add notes**: Update WORKING_NOTES.md with key findings
- **Report back**: Document results in DELIVERABLES.md

---

## Session Naming Convention

```
YYYY-MM-DD-session-slug

Examples:
- 2025-11-13-strategic-planning
- 2025-11-06-tier1-implementation
- 2025-10-29-performance-optimization
- 2025-10-15-refactor-database-adapters
```

---

## Accessing Session Documentation

### From Any Location
```bash
# Navigate to session hub
cd docs/sessions

# List active sessions
ls -la

# View current session
cat docs/sessions/2025-11-13-strategic-planning/INDEX.md

# Search across all sessions
grep -r "search-term" docs/sessions/
```

### From Agent Code
```javascript
// Load current session context
const currentSession = require('./docs/sessions/current.json');
const summary = fs.readFileSync(currentSession.path + '/SESSION_SUMMARY.md', 'utf8');

// Search for related work
const searchIndex = JSON.parse(fs.readFileSync('./docs/sessions/SEARCH_INDEX.md', 'utf8'));
const matches = searchIndex.find(item => item.keywords.includes('refactor'));
```

---

## Session Index

### 2025 Sessions
- [2025-11-13: Strategic Planning & Documentation](./2025-11-13-strategic-planning/INDEX.md)
- [2025-11-14: Place-Focused CLI Enablement](./2025-11-14-place-cli/INDEX.md)

### Previous Sessions Archive
- Location: `docs/sessions/archive/`
- Access: By date or topic
- Search: Full-text search across all sessions

---

## Next Steps

1. **Review**: Read the current session's INDEX.md
2. **Understand**: Check SESSION_SUMMARY.md for context
3. **Plan**: Reference ROADMAP.md for next tasks
4. **Execute**: Use AGENT_GUIDANCE.md for domain knowledge
5. **Update**: Add findings to WORKING_NOTES.md
6. **Decide**: Document choices in DECISIONS.md

---

**Last Updated**: November 22, 2025  
**Current Session**: 2025-11-22-gap4-plans-integration  
**Maintenance**: Add new sessions as they complete  
**For Agents**: This is your memory system. Use it!

