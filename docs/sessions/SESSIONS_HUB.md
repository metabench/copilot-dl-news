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

### 🟣 Long-Term Strategic Sessions (Outcome Memory)
**Location**: `docs/sessions/long-term/`  
**Retention**: Multi-month, outcome lifecycle  
**Purpose**: Track progress toward very large outcomes that span many short sessions  
**Hard Limits**: max 5 long-term sessions total, recommended max 3, only 1 active at a time  
**For Agents**: Keep tactical implementation in normal dated sessions, but roll up decisions/progress here

---

## Long-Term Sessions

### LT-001: Advanced Crawler + Advanced UI

**Status**: 🔄 Active (only active long-term session)
**Outcome**: Production-grade advanced crawler plus advanced jsgui3-first operations/search UI.
**Location**: `docs/sessions/long-term/lt-001-advanced-crawler-ui/`

**Quick Links**:
- 🗺️ [Plan](./long-term/lt-001-advanced-crawler-ui/PLAN.md)
- 📝 [Working Notes](./long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md)
- 📘 [Session Summary](./long-term/lt-001-advanced-crawler-ui/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./long-term/lt-001-advanced-crawler-ui/FOLLOW_UPS.md)

---

## Current Sessions

### Session 2026-05-10: News Crawler DB Boundary Migration

**Status**: Active; not complete  
**Focus**: Continue staged migration of active `copilot-dl-news` DB/query ownership into explicit `news-crawler-db` APIs. Major slices are migrated, `src/services` now scans clean for active DB patterns, but the latest broad active-path scan still reports 1,586 raw SQL/driver-pattern matches after excluding docs/tests/WIP/public/data.  
**Location**: `docs/sessions/2026-05-10-news-crawler-db-boundary/`

**Quick Links**:
- [Session Index](./2026-05-10-news-crawler-db-boundary/INDEX.md)
- [Plan](./2026-05-10-news-crawler-db-boundary/PLAN.md)
- [Current Status](./2026-05-10-news-crawler-db-boundary/STATUS.md)
- [Working Notes](./2026-05-10-news-crawler-db-boundary/WORKING_NOTES.md)

### Session 2026-05-09: Cloud Crawl 15m Validation

**Duration**: Active
**Type**: Crawl Validation
**Completion**: 🔄 In progress

**Focus**:
- Make the 10x1000 cloud crawl path run under a strict 15-minute cap, validate useful crawl output, and emit actionable diagnostics.

**Location**: `docs/sessions/2026-05-09-cloud-crawl-15m-validation/`

**Quick Links**:
- 🧭 [Session Index](./2026-05-09-cloud-crawl-15m-validation/INDEX.md)
- 🗺️ [Plan](./2026-05-09-cloud-crawl-15m-validation/PLAN.md)
- 📝 [Working Notes](./2026-05-09-cloud-crawl-15m-validation/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-05-09-cloud-crawl-15m-validation/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-05-09-cloud-crawl-15m-validation/FOLLOW_UPS.md)


### Session 2026-05-08: Electron Crawl 10x1000

**Duration**: Active
**Type**: Crawl Operations / Electron / jsgui3 UI / Visual Validation
**Completion**: In progress

**Focus**:
- Run a 10-site x 1000-page crawl through the Electron-hosted unified app and capture UI evidence from the Crawl Status surface.

**Location**: `docs/sessions/2026-05-08-electron-crawl-10x1000/`

**Quick Links**:
- [Plan](./2026-05-08-electron-crawl-10x1000/PLAN.md)
- [Working Notes](./2026-05-08-electron-crawl-10x1000/WORKING_NOTES.md)
- [Screenshot Review](./2026-05-08-electron-crawl-10x1000/SCREENSHOT_REVIEW.md)
- [Screenshot Comments](./2026-05-08-electron-crawl-10x1000/SCREENSHOT_COMMENTS.md)

### Session 2026-05-04: Playwright Control Centre Visual QA

**Duration**: Active
**Type**: UI Visual QA / Playwright MCP / Crawl Display
**Completion**: In progress

**Focus**:
- Explore the unified control centre and crawl-related apps visually, apply only simple risk-free fixes, and keep crawl testing bounded to 5 sites x 5 pages.

**Location**: `docs/sessions/2026-05-04-playwright-control-centre-visual-qa/`

**Quick Links**:
- [Plan](./2026-05-04-playwright-control-centre-visual-qa/PLAN.md)
- [Working Notes](./2026-05-04-playwright-control-centre-visual-qa/WORKING_NOTES.md)
- [User Journeys](./2026-05-04-playwright-control-centre-visual-qa/USER_JOURNEYS.md)
- [Screenshot Review](./2026-05-04-playwright-control-centre-visual-qa/SCREENSHOT_REVIEW.md)
- [Screenshot Comments](./2026-05-04-playwright-control-centre-visual-qa/SCREENSHOT_COMMENTS.md)

### Session 2026-05-04: Screenshot Tooling Control Centre

**Duration**: 1 session
**Type**: UI Tooling / Control Center / Screenshot Feedback
**Completion**: Completed

**Focus**:
- Add reusable screenshot capture helpers plus a Control Center screenshot viewer/commenting panel.

**Location**: `docs/sessions/2026-05-04-screenshot-tooling-control-centre/`

**Quick Links**:
- [Plan](./2026-05-04-screenshot-tooling-control-centre/PLAN.md)
- [Working Notes](./2026-05-04-screenshot-tooling-control-centre/WORKING_NOTES.md)
- [User Journeys](./2026-05-04-screenshot-tooling-control-centre/USER_JOURNEYS.md)
- [Screenshot Review](./2026-05-04-screenshot-tooling-control-centre/SCREENSHOT_REVIEW.md)
- [Screenshot Comments](./2026-05-04-screenshot-tooling-control-centre/SCREENSHOT_COMMENTS.md)
- [Validation Matrix](./2026-05-04-screenshot-tooling-control-centre/VALIDATION_MATRIX.md)
- [Session Summary](./2026-05-04-screenshot-tooling-control-centre/SESSION_SUMMARY.md)
- [Follow-Ups](./2026-05-04-screenshot-tooling-control-centre/FOLLOW_UPS.md)
- [Decisions](./2026-05-04-screenshot-tooling-control-centre/DECISIONS.md)

### Session 2026-05-04: UI Screenshot Feedback Methodology

**Duration**: 1 session
**Type**: UI Methodology / Agent Instructions / Skills
**Completion**: Completed

**Focus**:
- Standardize automatic UI screenshot capture, Electron/Puppeteer rigging, control-centre screenshot review artifacts, and comment-driven UI iteration.

**Location**: `docs/sessions/2026-05-04-ui-screenshot-feedback-methodology/`

**Quick Links**:
- [Plan](./2026-05-04-ui-screenshot-feedback-methodology/PLAN.md)
- [Working Notes](./2026-05-04-ui-screenshot-feedback-methodology/WORKING_NOTES.md)
- [Validation Matrix](./2026-05-04-ui-screenshot-feedback-methodology/VALIDATION_MATRIX.md)
- [Session Summary](./2026-05-04-ui-screenshot-feedback-methodology/SESSION_SUMMARY.md)
- [Follow-Ups](./2026-05-04-ui-screenshot-feedback-methodology/FOLLOW_UPS.md)
- [Decisions](./2026-05-04-ui-screenshot-feedback-methodology/DECISIONS.md)

### Session 2026-05-04: Five-Site Cloud Crawl UI

**Duration**: 1 session
**Type**: Crawl Operations / jsgui3 UI / Visual Validation
**Completion**: Completed

**Focus**:
- Run a five-site, five-page parallel cloud crawl while adding a concise screenshot-capable crawl UI surface for agent visual review.

**Location**: `docs/sessions/2026-05-04-five-site-cloud-crawl-ui/`

**Quick Links**:
- [Plan](./2026-05-04-five-site-cloud-crawl-ui/PLAN.md)
- [Working Notes](./2026-05-04-five-site-cloud-crawl-ui/WORKING_NOTES.md)
- [Goals Review](./2026-05-04-five-site-cloud-crawl-ui/GOALS_REVIEW.md)
- [Validation Matrix](./2026-05-04-five-site-cloud-crawl-ui/VALIDATION_MATRIX.md)
- [Session Summary](./2026-05-04-five-site-cloud-crawl-ui/SESSION_SUMMARY.md)
- [Follow-Ups](./2026-05-04-five-site-cloud-crawl-ui/FOLLOW_UPS.md)
- [Decisions](./2026-05-04-five-site-cloud-crawl-ui/DECISIONS.md)
- [Next Agent Briefing](./2026-05-04-five-site-cloud-crawl-ui/NEXT_AGENT_BRIEFING.md)

### Session 2026-04-29: Download Verification UI

**Duration**: 1 session
**Type**: UI / Database Evidence
**Completion**: ✅ Completed

**Focus**:
- Add a unified UI screen that verifies recent downloads were fetched, saved to the database, and records their compression storage details.

**Location**: `docs/sessions/2026-04-29-download-verification-ui/`

**Quick Links**:
- 🧭 [Session Index](./2026-04-29-download-verification-ui/INDEX.md)
- 🗺️ [Plan](./2026-04-29-download-verification-ui/PLAN.md)
- 📝 [Working Notes](./2026-04-29-download-verification-ui/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-04-29-download-verification-ui/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-04-29-download-verification-ui/FOLLOW_UPS.md)


### Session 2026-04-29: Electron 500 Download Crawl

**Duration**: 1 session
**Type**: Crawl Operations / Electron UI Validation
**Completion**: ✅ Completed

**Focus**:
- Use a long-lived Electron unified app while running a remote crawl that adds at least 500 local OK downloads for each of eight major news websites.

**Location**: `docs/sessions/2026-04-29-electron-500-download-crawl/`

**Quick Links**:
- 🧭 [Session Index](./2026-04-29-electron-500-download-crawl/INDEX.md)
- 🗺️ [Plan](./2026-04-29-electron-500-download-crawl/PLAN.md)
- 📝 [Working Notes](./2026-04-29-electron-500-download-crawl/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-04-29-electron-500-download-crawl/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-04-29-electron-500-download-crawl/FOLLOW_UPS.md)


### Session 2026-04-29: Eight-Site 250 Download Crawl

**Duration**: 1 session
**Type**: Crawl Operations / UI Validation
**Completion**: ✅ Completed

**Focus**:
- Run a UI-visible distributed crawl that adds at least 250 local downloads for each of eight major news websites.

**Location**: `docs/sessions/2026-04-29-eight-site-250-download-crawl/`

**Quick Links**:
- 🧭 [Session Index](./2026-04-29-eight-site-250-download-crawl/INDEX.md)
- 🗺️ [Plan](./2026-04-29-eight-site-250-download-crawl/PLAN.md)
- 📝 [Working Notes](./2026-04-29-eight-site-250-download-crawl/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-04-29-eight-site-250-download-crawl/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-04-29-eight-site-250-download-crawl/FOLLOW_UPS.md)


### Session 2026-04-29: Churn Control Salvage

**Duration**: 1 session
**Type**: UI Cleanup / jsgui3 Shared Controls
**Completion**: ✅ Completed

**Focus**:
- Identify churn-type UI files, remove disposable sources, and salvage reusable controls into shared jsgui3 controls with focused render checks.

**Location**: `docs/sessions/2026-04-29-churn-control-salvage/`

**Quick Links**:
- 🧭 [Session Index](./2026-04-29-churn-control-salvage/INDEX.md)
- 🗺️ [Plan](./2026-04-29-churn-control-salvage/PLAN.md)
- 📝 [Working Notes](./2026-04-29-churn-control-salvage/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-04-29-churn-control-salvage/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-04-29-churn-control-salvage/FOLLOW_UPS.md)


### Session 2026-04-29: Electron jsgui3 Crawl Display

**Duration**: Active
**Type**: UI/Crawl/Electron Validation
**Completion**: 🔄 In progress

**Focus**:
- Run a small crawl and prove the crawl display path through jsgui3 unified UI, Electron, and screenshots with iterative fixes.

**Location**: `docs/sessions/2026-04-29-electron-jsgui3-crawl-display/`

**Quick Links**:
- 🧭 [Session Index](./2026-04-29-electron-jsgui3-crawl-display/INDEX.md)
- 🗺️ [Plan](./2026-04-29-electron-jsgui3-crawl-display/PLAN.md)
- 📝 [Working Notes](./2026-04-29-electron-jsgui3-crawl-display/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-04-29-electron-jsgui3-crawl-display/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-04-29-electron-jsgui3-crawl-display/FOLLOW_UPS.md)


### Session 2026-04-29: UI Tools Review

**Duration**: Active
**Type**: UI Review / jsgui3 Tooling
**Completion**: 🔄 In progress

**Focus**:
- Review and improve reusable UI tools, shared controls, and jsgui3 integration for the advanced crawler UI direction.

**Location**: `docs/sessions/2026-04-29-ui-tools-review/`

**Quick Links**:
- 🧭 [Session Index](./2026-04-29-ui-tools-review/INDEX.md)
- 🗺️ [Plan](./2026-04-29-ui-tools-review/PLAN.md)
- 📝 [Working Notes](./2026-04-29-ui-tools-review/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-04-29-ui-tools-review/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-04-29-ui-tools-review/FOLLOW_UPS.md)


### Session 2026-04-29: Simple Distributed Crawl Readiness

**Duration**: 1 session
**Type**: Crawl Readiness
**Completion**: ✅ Completed

**Focus**:
- Verify the smallest easy crawl path, including distributed Oracle Cloud execution, config/profile readiness, and terminology that separates simple scope from local-only execution.

**Location**: `docs/sessions/2026-04-29-simple-distributed-crawl-readiness/`

**Quick Links**:
- 🧭 [Session Index](./2026-04-29-simple-distributed-crawl-readiness/INDEX.md)
- 🗺️ [Plan](./2026-04-29-simple-distributed-crawl-readiness/PLAN.md)
- 📝 [Working Notes](./2026-04-29-simple-distributed-crawl-readiness/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-04-29-simple-distributed-crawl-readiness/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-04-29-simple-distributed-crawl-readiness/FOLLOW_UPS.md)


### Session 2026-04-04: Evaluate Static Analysis Tooling

**Duration**: Active
**Type**: General
**Completion**: 🔄 In progress

**Focus**:
- TBD

**Location**: `docs/sessions/2026-04-04-static-analysis-eval/`

**Quick Links**:
- 🧭 [Session Index](./2026-04-04-static-analysis-eval/INDEX.md)
- 🗺️ [Plan](./2026-04-04-static-analysis-eval/PLAN.md)
- 📝 [Working Notes](./2026-04-04-static-analysis-eval/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-04-04-static-analysis-eval/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-04-04-static-analysis-eval/FOLLOW_UPS.md)


### Session 2026-03-10: V5 Runtime Bootstrap

**Duration**: Active
**Type**: Implementation
**Completion**: 🔄 In progress

**Focus**:
- Start actual v5 implementation with a backend-first bootstrap: a real `src/v5/remote/` boundary and minimal bootable API contract for health, status, domains, and crawl control.

**Location**: `docs/sessions/2026-03-10-v5-runtime-bootstrap/`

**Quick Links**:
- 🗺️ [Plan](./2026-03-10-v5-runtime-bootstrap/PLAN.md)
- 📝 [Working Notes](./2026-03-10-v5-runtime-bootstrap/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-03-10-v5-runtime-bootstrap/SESSION_SUMMARY.md)
- 📋 [Follow-ups](./2026-03-10-v5-runtime-bootstrap/FOLLOW_UPS.md)

### Session 2026-03-08: Remote Crawler Application Review

**Duration**: 1 review session
**Type**: Architecture Review
**Completion**: ✅ Completed

**Focus**:
- Assess what remote crawler application capability already exists in the repo, what is directly operable today, and what gaps remain before it qualifies as a serious remotely hosted crawler application.

**Location**: `docs/sessions/2026-03-08-remote-crawler-application-review/`

**Quick Links**:
- 🗺️ [Plan](./2026-03-08-remote-crawler-application-review/PLAN.md)
- 📝 [Working Notes](./2026-03-08-remote-crawler-application-review/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-03-08-remote-crawler-application-review/SESSION_SUMMARY.md)
- 📋 [Follow-ups](./2026-03-08-remote-crawler-application-review/FOLLOW_UPS.md)


### Session 2026-03-08: V5 Remote Crawler Application Plan

**Duration**: 1 planning session
**Type**: Architecture Planning
**Completion**: ✅ Completed

**Focus**:
- Consolidate existing v5-related ideas into a concrete plan for a remote crawler application with browser UI, crawl control, article browsing, and large compressed bundle downloads.

**Location**: `docs/sessions/2026-03-08-v5-remote-crawler-application-plan/`

**Quick Links**:
- 🗺️ [Plan](./2026-03-08-v5-remote-crawler-application-plan/PLAN.md)
- 📝 [Working Notes](./2026-03-08-v5-remote-crawler-application-plan/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-03-08-v5-remote-crawler-application-plan/SESSION_SUMMARY.md)
- 📋 [Follow Ups](./2026-03-08-v5-remote-crawler-application-plan/FOLLOW_UPS.md)


### Session 2026-02-25: Hub Discovery & Mapping Review

**Duration**: Active
**Type**: Architecture Review
**Completion**: 🔄 In progress

**Focus**:
- Review current hub-page discovery and mapping logic, identify intelligence gaps, and define actionable improvements.

**Location**: `docs/sessions/2026-02-25-hub-discovery-mapping-review/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-25-hub-discovery-mapping-review/INDEX.md)
- 🗺️ [Plan](./2026-02-25-hub-discovery-mapping-review/PLAN.md)
- 📝 [Working Notes](./2026-02-25-hub-discovery-mapping-review/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-25-hub-discovery-mapping-review/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-02-25-hub-discovery-mapping-review/FOLLOW_UPS.md)


### Session 2026-02-25: Crawl Sync Reliability Hardening

**Duration**: Active
**Type**: Tooling Hardening
**Completion**: ✅ Completed

**Focus**:
- Harden `v4-cli crawl-sync` for immediate/reliable startup with auto-recovery, retries, and detached rapid-sync.

**Location**: `docs/sessions/2026-02-25-crawl-sync-reliability-hardening/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-25-crawl-sync-reliability-hardening/PLAN.md)
- 📝 [Working Notes](./2026-02-25-crawl-sync-reliability-hardening/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-25-crawl-sync-reliability-hardening/SESSION_SUMMARY.md)


### Session 2026-02-25: Geo Import + Geo Viewer Cesium Plan

**Duration**: Active
**Type**: Architecture Planning
**Completion**: 🔄 In progress

**Focus**:
- Design a comprehensive pluggable architecture plan to evolve Geo Import UI into Geo Import + Geo Viewer with CesiumJS integration

**Location**: `docs/sessions/2026-02-25-geo-import-geo-viewer-cesium-plan/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-25-geo-import-geo-viewer-cesium-plan/INDEX.md)
- 🗺️ [Plan](./2026-02-25-geo-import-geo-viewer-cesium-plan/PLAN.md)
- 📝 [Working Notes](./2026-02-25-geo-import-geo-viewer-cesium-plan/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-25-geo-import-geo-viewer-cesium-plan/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-02-25-geo-import-geo-viewer-cesium-plan/FOLLOW_UPS.md)


### Session 2026-02-25: jsgui3 UI Upgrade Review

**Duration**: Active
**Type**: Architecture Review
**Completion**: 🔄 In progress

**Focus**:
- Assess which UI subsystems most benefit from a rewritten/upgraded jsgui3 client+server stack

**Location**: `docs/sessions/2026-02-25-jsgui3-ui-upgrade-review/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-25-jsgui3-ui-upgrade-review/INDEX.md)
- 🗺️ [Plan](./2026-02-25-jsgui3-ui-upgrade-review/PLAN.md)
- 📝 [Working Notes](./2026-02-25-jsgui3-ui-upgrade-review/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-25-jsgui3-ui-upgrade-review/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-02-25-jsgui3-ui-upgrade-review/FOLLOW_UPS.md)


### Session 2026-02-21: V4 Super Audit Local Throughput

**Duration**: Active
**Type**: Diagnostics
**Completion**: 🔄 In progress

**Focus**:
- Evaluate whether V4 qualifies as v4-super under heavy local SQLite WAL ingestion, PM2 concurrency, and crash recovery stress.

**Location**: `docs/sessions/2026-02-21-v4-super-audit-local-throughput/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-21-v4-super-audit-local-throughput/INDEX.md)
- 🗺️ [Plan](./2026-02-21-v4-super-audit-local-throughput/PLAN.md)
- 📝 [Working Notes](./2026-02-21-v4-super-audit-local-throughput/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-21-v4-super-audit-local-throughput/SESSION_SUMMARY.md)
- 📍 [Pain Points Report](./2026-02-21-v4-super-audit-local-throughput/PAIN_POINTS_REPORT.md)
- ✅ [Follow Ups](./2026-02-21-v4-super-audit-local-throughput/FOLLOW_UPS.md)


### Session 2026-02-20: Graceful Shutdown Hardening

**Duration**: Active
**Type**: Implementation
**Completion**: 🔄 In progress

**Focus**:
- Harden process termination and graceful shutdown paths across crawler workers, servers, and launcher subprocesses.

**Location**: `docs/sessions/2026-02-20-graceful-shutdown-hardening/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-20-graceful-shutdown-hardening/INDEX.md)
- 🗺️ [Plan](./2026-02-20-graceful-shutdown-hardening/PLAN.md)
- 📝 [Working Notes](./2026-02-20-graceful-shutdown-hardening/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-20-graceful-shutdown-hardening/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-02-20-graceful-shutdown-hardening/FOLLOW_UPS.md)


### Session 2026-02-18: Advanced Crawler v1 Product Spec

**Duration**: Active
**Type**: architecture + product spec
**Completion**: 🔄 In progress

**Focus**:
- Define a low-budget, local-machine crawler v1: UI-configurable domains, reliable background execution, robots/sitemap compliance, scalable design toward 1000 domains, and jsgui3 search/date-range UX.

**Location**: `docs/sessions/2026-02-18-advanced-crawler-v1-spec/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-18-advanced-crawler-v1-spec/INDEX.md)
- 🗺️ [Plan](./2026-02-18-advanced-crawler-v1-spec/PLAN.md)
- 📝 [Working Notes](./2026-02-18-advanced-crawler-v1-spec/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-18-advanced-crawler-v1-spec/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-02-18-advanced-crawler-v1-spec/FOLLOW_UPS.md)


### Session 2026-02-14: Central Coordinator Architecture

**Duration**: Complete
**Type**: implementation + validation
**Completion**: ✅ Complete

**Focus**:
- Refactor crawl orchestration so local coordinator plans/dispatches/syncs/classifies while remote worker runs in coordinator-seeded mode.
- Add complete catch-up remote sync CLI and coordinator loop CLI.
- Add remote seeded-only mode (`--coordinator-mode`) with crawl endpoint aliases and pending queue visibility.

**Location**: `docs/sessions/2026-02-14-central-coordinator-architecture/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-14-central-coordinator-architecture/INDEX.md)
- 🗺️ [Plan](./2026-02-14-central-coordinator-architecture/PLAN.md)
- 📝 [Working Notes](./2026-02-14-central-coordinator-architecture/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-14-central-coordinator-architecture/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-02-14-central-coordinator-architecture/FOLLOW_UPS.md)


### Session 2026-02-13: V4 Priority Fixes

**Duration**: Active
**Type**: v4 reliability implementation
**Completion**: 🔄 In progress

**Focus**:
- Implement priority V4 architecture fixes: sync timestamp safety, export-window behavior, and robust fleet sync polling.
- Fix V4SyncEngine FleetProcess batch URL compatibility.
- Add domain-level anti-crawler circuit breaker behavior and targeted test coverage.

**Location**: `docs/sessions/2026-02-13-v4-priority-fixes/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-13-v4-priority-fixes/PLAN.md)
- 📝 [Working Notes](./2026-02-13-v4-priority-fixes/WORKING_NOTES.md)

### Session 2026-02-12: Crawl Monitor Repair

**Duration**: Active
**Type**: CrawlOps monitoring + repair
**Completion**: 🔄 In progress

**Focus**:
- Monitor active crawl/fleet processes and sync health.
- Diagnose concrete runtime/persistence errors with evidence-first CLI checks.
- Apply targeted fixes and verify restored crawl health.

**Location**: `docs/sessions/2026-02-12-crawl-monitor-repair/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-12-crawl-monitor-repair/PLAN.md)
- 📝 [Working Notes](./2026-02-12-crawl-monitor-repair/WORKING_NOTES.md)

### Session 2026-02-12: Fleet Reliable Sites CLI

**Duration**: Active
**Type**: CLI tooling enhancement
**Completion**: 🔄 In progress

**Focus**:
- Add a deterministic CLI answer for: “Which websites can we reliably crawl?”
- Route natural-language `fleet-cli question` reliability prompts to a dedicated evidence-based command.

**Location**: `docs/sessions/2026-02-12-fleet-reliable-sites-cli/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-12-fleet-reliable-sites-cli/PLAN.md)
- 📝 [Working Notes](./2026-02-12-fleet-reliable-sites-cli/WORKING_NOTES.md)

### Session 2026-02-12: CrawlOps Background Handoff

**Duration**: Active
**Type**: CrawlOps docs alignment
**Completion**: 🔄 In progress

**Focus**:
- Make fresh-session background crawl+sync startup/status/stop explicit for agents.
- Ensure local `data/news.db` population verification steps are clear and repeatable.

**Location**: `docs/sessions/2026-02-12-crawlops-bg-handoff/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-12-crawlops-bg-handoff/PLAN.md)
- 📝 [Working Notes](./2026-02-12-crawlops-bg-handoff/WORKING_NOTES.md)

### Session 2026-02-12: Fast Crawl Sync Smoke

**Duration**: Active
**Type**: CrawlOps smoke tooling
**Completion**: 🔄 In progress

**Focus**:
- Build a very fast operational smoke test: tiny crawl, rapid sync to local DB.
- Verify stored rows and critical metadata integrity in `data/news.db`.

**Location**: `docs/sessions/2026-02-12-fast-crawl-sync-smoke/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-12-fast-crawl-sync-smoke/PLAN.md)
- 📝 [Working Notes](./2026-02-12-fast-crawl-sync-smoke/WORKING_NOTES.md)

### Session 2026-02-12: V4 Server Single-Process Crawl

**Duration**: Active
**Type**: v4 server implementation
**Completion**: 🔄 In progress

**Focus**:
- Add server-side v4 single-process crawl mode.
- Limit initial fleet instantiation to max 4 crawler resources.
- Expose SSR HTML dashboard from the single-process runtime.

**Location**: `docs/sessions/2026-02-12-v4-server-single-process-crawl/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-12-v4-server-single-process-crawl/PLAN.md)
- 📝 [Working Notes](./2026-02-12-v4-server-single-process-crawl/WORKING_NOTES.md)

### Session 2026-02-12: V4 Endpoint Intel CLI

**Duration**: Active
**Type**: CLI tooling + agent guidance
**Completion**: 🔄 In progress

**Focus**:
- Build deterministic endpoint capability profiler for local/remote v4 control planes.
- Provide concise AI-ready endpoint shape/status summaries via CLI (`--json`).
- Update global and path-specific agent instructions to default to CLI-first endpoint discovery.

**Location**: `docs/sessions/2026-02-12-v4-endpoint-intel-cli/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-12-v4-endpoint-intel-cli/PLAN.md)
- 📝 [Working Notes](./2026-02-12-v4-endpoint-intel-cli/WORKING_NOTES.md)

### Session 2026-02-12: V4 Docs Structure Capabilities

**Duration**: Active
**Type**: Documentation refresh
**Completion**: 🔄 In progress

**Focus**:
- Reconcile v4 documentation with current `src/v4` implementation layout.
- Document current structure and capabilities without brittle static status claims.
- Align v4 test/run command examples with current repository command policy.

**Location**: `docs/sessions/2026-02-12-v4-docs-structure-capabilities/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-12-v4-docs-structure-capabilities/PLAN.md)
- 📝 [Working Notes](./2026-02-12-v4-docs-structure-capabilities/WORKING_NOTES.md)

### Session 2026-02-12: Fleet CLI Instant Guidance

**Duration**: Active
**Type**: CLI tooling guidance
**Completion**: 🔄 In progress

**Focus**:
- Codify sub-second fleet-status answer workflow for agents.
- Define when to use snapshot fast-path vs live scan.
- Clarify that agents should proactively add/modify CLI commands to answer recurring operational questions near-instantly.

**Location**: `docs/sessions/2026-02-12-fleet-cli-instant-guidance/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-12-fleet-cli-instant-guidance/PLAN.md)
- 📝 [Working Notes](./2026-02-12-fleet-cli-instant-guidance/WORKING_NOTES.md)

### Session 2026-02-12: Oracle Cli Agent Guidebook

**Duration**: Active
**Type**: General
**Completion**: 🔄 In progress

**Focus**:
- TBD

**Location**: `docs/sessions/2026-02-12-oracle-cli-agent-guidebook/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-12-oracle-cli-agent-guidebook/INDEX.md)
- 🗺️ [Plan](./2026-02-12-oracle-cli-agent-guidebook/PLAN.md)
- 📝 [Working Notes](./2026-02-12-oracle-cli-agent-guidebook/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-12-oracle-cli-agent-guidebook/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-02-12-oracle-cli-agent-guidebook/FOLLOW_UPS.md)


### Session 2026-02-12: 2026 02 12 20x50 Multisite Crawl Diagnostics

**Duration**: Active
**Type**: General
**Completion**: 🔄 In progress

**Focus**:
- TBD

**Location**: `docs/sessions/2026-02-12-2026-02-12-20x50-multisite-crawl-diagnostics/`

**Quick Links**:
- 🧭 [Session Index](./2026-02-12-2026-02-12-20x50-multisite-crawl-diagnostics/INDEX.md)
- 🗺️ [Plan](./2026-02-12-2026-02-12-20x50-multisite-crawl-diagnostics/PLAN.md)
- 📝 [Working Notes](./2026-02-12-2026-02-12-20x50-multisite-crawl-diagnostics/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-12-2026-02-12-20x50-multisite-crawl-diagnostics/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-02-12-2026-02-12-20x50-multisite-crawl-diagnostics/FOLLOW_UPS.md)


### Session 2026-02-10: Fleet Download Problem Monitoring Upgrades

**Duration**: Complete  
**Type**: implementation + validation  
**Completion**: ✅ Complete

**Focus**:
- Implement richer monitoring diagnostics for download problems discovered in live fleet runs.
- Add HTTP outcome buckets, seed telemetry, auth-wall inference, stagnation timing, and per-domain drilldown.
- Add extensive coverage in checks/tests and validate behavior end-to-end.
- Run/monitor a 250-page fleet attempt and record real anomaly signatures.

**Location**: `docs/sessions/2026-02-10-fleet-download-problem-monitoring-upgrades/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-10-fleet-download-problem-monitoring-upgrades/PLAN.md)
- 📝 [Working Notes](./2026-02-10-fleet-download-problem-monitoring-upgrades/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-10-fleet-download-problem-monitoring-upgrades/SESSION_SUMMARY.md)

### Session 2026-02-09: Fleet Follow-Ups Book Implementation

**Duration**: Complete  
**Type**: implementation  
**Completion**: ✅ Complete

**Focus**:
- Write the pending fleet follow-ups into the Download Verification Book before implementation.
- Implement orchestration follow-ups: seed reliability, staggered start, import merge pipeline, auto-retry, and unified fleet SSE streaming.
- Add checks and session artifacts for handoff continuity.

**Location**: `docs/sessions/2026-02-09-fleet-followups-book-implementation/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-09-fleet-followups-book-implementation/PLAN.md)
- 📝 [Working Notes](./2026-02-09-fleet-followups-book-implementation/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-09-fleet-followups-book-implementation/SESSION_SUMMARY.md)

### Session 2026-02-09: Fleet Download Anomaly Diagnostics

**Duration**: Complete  
**Type**: implementation + continuation  
**Completion**: ✅ Complete

**Focus**:
- Continue fleet-monitoring work by implementing verification-book diagnostics in the Fleet Dashboard.
- Detect and explain oversized/undersized download anomalies (including high-MB outliers like CNN-style cases).
- Surface root-cause hypotheses and recommended actions in both UI and API.

**Achievements**:
- Added `FleetViewModel.getProblemReport()` with taxonomy categories + zero-fetch diagnosis.
- Added `GET /api/diagnostics` and expanded `/diagnostics` UI with a Problem Causes section.
- Enriched anomaly cards with evidence and action text.
- Updated dashboard checks and tests for diagnostics behavior.

**Location**: `docs/sessions/2026-02-09-fleet-download-anomaly-diagnostics/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-09-fleet-download-anomaly-diagnostics/PLAN.md)
- 📝 [Working Notes](./2026-02-09-fleet-download-anomaly-diagnostics/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-09-fleet-download-anomaly-diagnostics/SESSION_SUMMARY.md)

### Session 2026-02-02: MoldBot research (OpenClaw)

**Duration**: Complete
**Type**: research
**Completion**: ✅ Complete

**Focus**:
- Research MoldBot/Moltbot/Clawdbot and current official OpenClaw naming
- Summarize architecture, capabilities, setup paths, and security risks
- Capture sources and produce a concise research brief

**Location**: `docs/sessions/2026-02-02-moldbot-research/`

**Quick Links**:
- 🗺️ [Plan](./2026-02-02-moldbot-research/PLAN.md)
- 📝 [Working Notes](./2026-02-02-moldbot-research/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-02-02-moldbot-research/SESSION_SUMMARY.md)

### Session 2026-01-18: README Update - Comprehensive Project Documentation

**Duration**: Complete
**Type**: documentation
**Completion**: ✅ Complete

**Focus**:
- Update README.md with comprehensive project information
- Document architecture, source structure, UI applications, tools
- Add Getting Started guide and table of contents
- Improve discoverability of 2174+ documentation files and 21+ UI applications

**Achievements**:
- Expanded README from 1255 to 1643 lines (+31%)
- Added 7 new major sections with 388 lines of content
- Documented all 21+ specialized UI applications
- Cataloged 50+ development and maintenance tools
- Created comprehensive navigation with table of contents

**Location**: `docs/sessions/2026-01-18-readme-update/`

**Quick Links**:
- 🗺️ [Plan](./2026-01-18-readme-update/PLAN.md)
- 📝 [Working Notes](./2026-01-18-readme-update/WORKING_NOTES.md)
- 📘 [Session Summary](./2026-01-18-readme-update/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2026-01-18-readme-update/FOLLOW_UPS.md)

---

### Session 2026-01-17: news-crawler-db drop-in labs

**Duration**: Active
**Type**: Database adapter research
**Completion**: 🔄 Planning

**Focus**:
- Define adapter compatibility surface for a drop-in DB layer swap
- Build lab experiments for adapter API coverage, raw handle compatibility, and smoke read/write flows
- Capture gaps for `news-crawler-db` improvements

**Location**: `docs/sessions/2026-01-17-news-crawler-db-drop-in/`

**Quick Links**:
- 🗺️ [Plan](./2026-01-17-news-crawler-db-drop-in/PLAN.md)
- 📝 [Working Notes](./2026-01-17-news-crawler-db-drop-in/WORKING_NOTES.md)

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

**Duration**: Active
**Type**: Backend architecture
**Completion**: 🔄 In progress

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

### 2026 Sessions
- [2026-05-10: Local Crawl Throughput Slice](./2026-05-10-local-crawl-throughput/PLAN.md)

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
