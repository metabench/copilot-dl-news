# Goals Review — Single UI app cohesion roadmap (2025-12-30)

## Sources consulted
- `docs/ROADMAP.md` — Strategic priorities (Q4 2025) and analysis-UI design targets.
- `docs/goals/RELIABLE_CRAWLER_ROADMAP.md` — Long-term crawler vision + delivered dashboard surfaces.
- This session plan: `docs/sessions/2025-12-30-2025-12-30-single-ui-app-cohesion/PLAN.md`.
- `docs/ui-integration/*` — prior UI integration specs (admin dashboard control-oriented integration).

## Working definition of “project goals” (as of 2025-12-30)

### A) Primary product goals (what the repo is optimizing for)
1) **Reliable, self-improving crawler**
   - Tenacious under failure; domain-aware; learns layouts; produces high-quality article records.
2) **Actionable operational visibility**
   - Dashboards for crawl health, rate limiting, extraction quality, query telemetry, etc.
3) **Strategic analysis UI**
   - Planner/coverage-focused UI that supports long-running intelligent crawl experimentation.

### B) Engineering goals (how we want to build)
1) **Modular boundaries**
   - DB access through adapters/services, not inline SQL in UI; stable module contracts.
2) **Deterministic validation**
   - Cheap checks (`--check`, check scripts) + focused Jest where appropriate.
3) **No-retirement UI evolution**
   - Keep existing servers and ports working while enabling a unified app to reuse modules.

## Goal alignment for “Single UI app cohesion”

### Why “single UI” is a goal (not just a refactor)
A unified UI app improves:
- Operator productivity: one place to look during incidents.
- Feature discoverability: dashboards don’t “hide” behind ports.
- Consistency: shared theme, shared client bundle/activation, shared nav patterns.
- Reuse: features built once, runnable in legacy mode or mounted in the unified shell.

### Hard constraints (must remain true)
- **No retirement**: every existing UI server remains runnable on its legacy port.
- **No loss of behavior**: routes and SSR output stay compatible.
- **Composable modules**: unified server mounts feature routers under stable prefixes.

## Gaps / friction points identified

### 1) Dashboard/server integration is inconsistent
- Some dashboards export `create<Feature>Router`, others export `createApp`, others export only `app`.
- Some servers self-start on import; others are safe to import.

### 2) Route-prefix safety varies
- Some servers assume they are mounted at `/` and build absolute paths.
- Unified mounting needs explicit `mountPrefix` or “prefix-safe URL building” conventions.

### 3) Client-side activation is uneven
- The unified shell historically used “fetch fragment + innerHTML”, which breaks embedded scripts.
- jsgui3 activation needs stable hooks so controls remain interactive under unified navigation.

### 4) DB injection is not uniform
- Some dashboards open their own `better-sqlite3` handle.
- Some accept `getDbRW`/`getDbHandle`.
- This is a reliability and contention risk if the unified app mounts multiple dashboards.

### 5) Validation coverage is per-dashboard, not systematic
- `--check` exists for many servers, but there is no single “UI surface health matrix” doc.

## Recommended goal framing (for the next phase)

### UI Cohesion Program Goals
1) **Single root UI experience**
   - One root server (likely `unifiedApp`) that hosts everything else at stable prefixes.
2) **Feature modules are first-class**
   - Every dashboard has a router factory and can be mounted or run standalone.
3) **Unified validation story**
   - Every UI server supports `--check`; unified app supports `--check` plus a minimal integrated route probe.

### Explicit non-goals (for now)
- Do not force a rewrite of jsgui3 control architecture.
- Do not remove old servers, ports, or scripts.
- Do not require a front-end SPA rewrite.

## Items implied by this goals review
- Standardize a **dashboard module contract** (router factory + close + prefix safety).
- Produce a **UI validation matrix** with canonical `--check` commands.
- Draft a **phased implementation roadmap** (modularize remaining servers first; then unify nav/theme/client).
