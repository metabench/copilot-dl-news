# Working Notes – UI + UI Dev Process Improvements

- 2025-12-20 — Session created via CLI. Add incremental notes here.

## Known facts (repo-local)

- UI stack is **jsgui3 SSR + client activation**; activation failure modes and control-count performance constraints are documented in `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`.
- There is a working **theme persistence layer** in `src/ui/server/services/themeService.js` (system themes include **WLILO** + **Obsidian**, stored in `ui_themes`).
- Theme selection already exists as `?theme=<name>` query support in `src/ui/server/dataExplorerServer.js` (`resolveThemeConfig`).
- The “premium theme system” plan exists (session `2025-11-27-ui-premium-theme-system`), but a `ThemeEditorControl` / `/theme` route is not currently present in `src/ui` (as of this session’s scan).
- CSS/JS separation work exists and is proven valuable; there are build scripts `scripts/build-ui-css.js` and `scripts/build-ui-client.js`.
- The repo already has a strong “fast checks” culture: many `src/ui/**/checks/*.check.js` scripts exist (Data Explorer, docsViewer, diagramAtlas, etc.).
- Browser-level debugging support exists via `tools/dev/ui-console-capture.js` and scenario-suite guidance via the `puppeteer-efficient-ui-verification` skill.

## Ranked improvement options (UI + process)

| Option | Impact | Effort | Risk | Domains |
| --- | --- | --- | --- | --- |
| Finish Theme Editor + routes | Big usability + polish win; unlocks real WLILO/Obsidian switching and live tuning | M | Low–Med | UI / Tooling |
| Data Explorer “command center” header + nav | Makes the UI feel coherent: breadcrumbs, quick actions, route discovery, saved views | M | Low | UI |
| Table UX upgrades (one reusable Table core) | Most screens are tables; improves scanning, trust, and productivity | M–L | Med | UI |
| Per-page “state hygiene” (loading/empty/error) | Reduces confusion, improves reliability perception | S–M | Low | UI |
| Performance budgets + virtualization/pagination | Prevents slow/hanging pages at scale; makes UI responsive on big DBs | M | Med | UI / Data |
| Unified UI build/watch loop | Makes UI iteration fast (CSS + client bundle + server restart) | M | Med | Tooling / Ops |
| Browser verification ladder baked in | Detects regressions early with actionable artifacts | M | Low–Med | Tooling |
| WLILO tokens adoption sweep | Consistent look across apps; reduces one-off styling | M | Low | UI |

### Option details + concrete next experiments

#### 1) Finish Theme Editor + routes (direct UI improvement)

What to build:
- Add `/theme` UI route (Data Explorer server) with a Theme Editor screen:
	- list themes from `ui_themes`
	- preview theme presets (WLILO, Obsidian)
	- edit token groups (colors/typography/spacing/radii/shadows)
	- set default theme
- Add `/api/theme` CRUD endpoints already anticipated by the earlier plan.

Evidence / fastest next step:
- Add a check script `src/ui/server/dataExplorer/checks/themeEditor.check.js` that renders the editor control and asserts it contains the expected sections.
- Add a one-shot browser verification using:
	- `node tools/dev/ui-console-capture.js --server="src/ui/server/dataExplorerServer.js" --url="http://localhost:4600/theme"`

#### 2) Data Explorer header + navigation (direct UI improvement)

What to improve:
- A persistent header with:
	- breadcrumbs (already have `buildBreadcrumbs()` and navigation helpers)
	- a small “app switcher” / route index
	- quick actions (Refresh 🔄, Settings ⚙️, Search 🔍)
- Make “where am I?” obvious on every view; persist key filters in a compact pill row.

Evidence / fastest next step:
- Extend `src/ui/server/checks/dataExplorer.check.js` to assert header/breadcrumbs exist for at least 2 views.

#### 3) Table UX upgrades (direct UI improvement)

High-leverage upgrades to standardize:
- sticky header, zebra rows, denser spacing toggle
- sortable columns, column chooser
- per-column filter chips, copy cell value
- row expansion panel for details (avoid navigation churn)

Process note:
- Keep control counts lean: prefer rendering repeated rows/cells as plain HTML strings when lists exceed ~200 items.

Evidence:
- Add/extend existing checks under `src/ui/controls/checks/*` to cover new table features.

#### 4) State hygiene (direct UI improvement)

Add consistent patterns:
- loading skeletons/spinners for async sections
- explicit empty state (“No rows match filters” + reset action)
- inline error panels with next action (retry 🔄, view logs 🔍)

Evidence:
- Add check coverage for empty/error states for one table surface (e.g. url listing) with a synthetic dataset.

#### 5) Performance budgets + virtualization (UI + process)

Concrete policies:
- cap default page sizes (already: default 1000, max 2000) and expose UI paging controls clearly
- add server-side paging for worst offenders; precompute totals; cache heavy aggregates
- enforce “control budget” in checks: record count of rendered controls per view and flag big regressions.

Evidence:
- Add a perf-oriented check that prints timing + control count.

#### 6) Unified UI build/watch loop (process improvement)

Goal:
- One command for local UI iteration:
	- watch CSS (build-ui-css)
	- watch client bundle (build-ui-client)
	- restart the server when needed

Evidence:
- Add/extend npm scripts: `ui:build`, `ui:watch` (watch mode) and document in a short workflow.

#### 7) Browser verification ladder baked in (process improvement)

Standardize:
- for “SSR markup changes”: `checks/*.check.js`
- for “activation / CSS layout / interactivity”: `ui-console-capture` first, then scenario suite
- for regressions: promote to Jest E2E via `npm run test:by-path ...`

Evidence:
- Ensure each UI server has at least one browser-level scenario that asserts a user-visible invariant.

#### 8) WLILO tokens adoption sweep (direct UI improvement)

Goal:
- converge all dashboards on a small WLILO token set (from Skills), reduce one-off styling.

Evidence:
- Make sure each app root gets a `wlilo-app` (or equivalent) class and uses tokens.

