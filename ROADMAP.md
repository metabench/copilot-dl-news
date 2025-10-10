# ROADMAP.md — Strategic priorities

**Status**: COMPLETE  
**Last Updated**: October 3, 2025  
**When to Read**: You need to understand project direction, planned features, or want to pick up new work

This document tracks medium-term priorities, milestones, and open investigations. Update entries as work begins or lands.

## Intelligent crawl & analysis priorities (Q4 2025)

### Near-term planner milestones (R-02, R-04, R-05, R-06)

- ✅ Ship structured planner stage logging (`planner-stage` SSE + persistence) so we can diagnose hub-seeding behaviour without overloading problem events.
- ✅ Finish the intelligent crawl completion milestone that summarises seeded hubs, unresolved problems, and coverage deltas for dashboards.
- Cluster repetitive planner problems before persistence so high-volume gaps (for example, repeated `missing-hub` notices) stay actionable.
- Persist planner knowledge shards (successful hubs, failed attempts, inferred patterns) for reuse across runs, with clear gating so basic crawl types remain untouched.

### Place-hub coverage & knowledge reuse (R-08 – R-16)

- Emit periodic coverage-score telemetry `{ hubs: { expected, discovered, coveragePct } }` and milestone thresholds so we can watch progress during long intelligent runs.
- Prototype the gap-driven prioritisation queue tier, guarded behind the intelligent crawl flag and backed by clustered `missing-hub` problems.
- Persist planner-learned regexes and sitemap inferences, replaying them on new runs and emitting a `patterns-reused` milestone when they activate.
- Explore predictive hub URL generation for partially covered taxonomies while respecting configurable 404 budgets.
- Adapt hub refetch windows using observed churn, with a `hub-refresh-accelerated` milestone when the scheduler tightens refreshes.
- Extend the problem taxonomy with `hub-stale`, `coverage-plateau`, `error-spike`, and `conflicting-classification` so the UI can filter intelligently.
- Draft the crawl budget heuristic (`crawlBudgetPages`) that scores work items by estimated coverage lift without regressing basic crawl pacing.
- Store multi-run coverage stats so milestone `coverage-improved` can quantify progress between executions.

### Analysis UI experience (design targets)

- Live run dashboard: stage timeline with heartbeat, aggregated metrics (coverage trend, topic-specific hubs, unresolved problems), and an event feed filtered to place-hub signals.
- Coverage inspector: drill-down cards for regions/topics showing discovered hubs, confidence bands, gaps, and supporting evidence.
- Topic-specific matrix: host × topic grid highlighting coverage density and linking to detailed hub cards.
- Gap inspector: dedicated view for unresolved hubs with remediation hints, linked planner stages, and prioritisation toggles.
- Knowledge reuse banner: badges for reused vs. newly discovered patterns, with links to prior runs contributing the cache.
- Historical comparison tools: side-by-side run diff, coverage progression charts, and export/share options for stakeholders.
- Accessibility and ops polish: keyboard navigation for filters, high-contrast palettes, toast notifications when coverage thresholds are reached, and responsive layouts for control-room displays.

### Action plan (next 2 sprints)

1. **Instrument coverage facts before heuristics change.** Extend the fake/intelligent runners to emit sampled coverage snapshots (`coveragePct`, `expectedHubs`, `seededHubs`) every N progress frames so we can baseline trends. Persist these snapshots alongside planner milestones to unblock dashboards without waiting for schema migrations.
2. **Schedule planner experiments behind feature flags.** Add planner toggles (`plannerReuseEnabled`, `predictiveHubEnabled`) that gate: (a) replaying persisted hub patterns, (b) generating candidate hubs from gazetteer gaps. Surface activation as milestones so we can A/B via configuration rather than branches.
3. **Close the loop on problem clustering.** Build a lightweight aggregation in the UI server that groups `missing-hub` problems by host + section before persistence. This feeds both the queues UI and the coverage inspector while reducing noise in SSE streams.
4. **Prototype two visual affordances.** (a) A sparkline or histogram for `coveragePct` on the dashboard header fed by the new snapshots. (b) An interactive table on `/gazetteer` that overlays coverage deltas per place using cached planner outputs.
5. **Automate regression detection.** Add Jest smoke tests that assert `/api/navigation/bar` + `/api/navigation/links` stay in sync with the nav helper, and extend the fake runner to confirm coverage snapshots remain monotonic during deterministic runs so planner tweaks can't silently regress coverage graphs.
	- Add focused unit tests for the analysis-progress pipeline helpers (`buildAnalysisHighlights`, pipeline state reducers) to ensure new telemetry states render correctly as the UI evolves.
	- Extend SSE integration tests to assert `analysis-progress` events stream in order and update the intelligent pipeline cards end-to-end.

## Roadmap & open problems

| ID | Theme | Next step | Status |
| :--- | :--- | :--- | :--- |
| `R-01` | Multi-job readiness | Persist finished crawl history so `/api/crawls` can list prior jobs (see `src/db.js`). | Not started |
| `R-02` | Planner UX | Emit a `milestone` summary at the end of intelligent crawls for quick post-run diagnostics (`src/crawl.js`). | Not started |
| `R-03` | Rate limiting | Share per-host pacing across concurrent jobs once `UI_ALLOW_MULTI_JOBS` is enabled. | Researching |
| `R-04` | Planner telemetry | Stream structured `planner-stage` timeline events (seeded, validated, backtracked) instead of overloading `/api/problems`. | Not started |
| `R-05` | Planner noise control | Cluster repeated problem events (same kind/scope/target) and surface aggregated counts to the UI. | Not started |
| `R-06` | Planner knowledge base | Persist successful/failed hub URLs per domain and reuse them on subsequent runs. | Not started |
| `R-07` | UI DB adapter | Route Express UI queries through `src/db.js` helpers (no direct SQL in UI layer). | Not started |
| `R-08` | Coverage telemetry | Investigate periodic coverage snapshots (e.g., hubs discovered vs. expected) and decide how to surface them without regressing non-intelligent crawls. | Proposed |
| `R-09` | Gap-driven prioritisation | Investigate priority queue tiers informed by unresolved `missing-hub` problems; draft plan before altering scheduler. | Proposed |
| `R-10` | Pattern cache reuse | Investigate persisting planner-learned hub patterns/regexes and emitting a `patterns-reused` milestone on subsequent runs. | Proposed |
| `R-11` | Predictive hub guesses | Investigate guarded hub URL prediction for partially-covered taxonomies (respecting configurable 404 budgets) before planning implementation. | Proposed |
| `R-12` | Dynamic hub refetching | Investigate adaptive refresh windows for hubs based on observed churn; outline milestones/telemetry before code changes. | Proposed |
| `R-13` | Planner summary milestone | Investigate enhancements to the end-of-run planner milestone (coverage totals, unresolved issues) building on `R-02`. | Proposed |
| `R-14` | Expanded problem taxonomy | Investigate new planner problem kinds (`hub-stale`, `coverage-plateau`, `error-spike`, `conflicting-classification`) and downstream handling. | Proposed |
| `R-15` | Planner budget mode | Investigate a crawl budget heuristic that prioritises estimated coverage lift, ensuring basic crawl types remain unaffected. | Proposed |
| `R-16` | Multi-run coverage analytics | Investigate storing historical coverage metrics to emit `coverage-improved` milestones between runs. | Proposed |

### `R-07` implementation notes

- Inventory all UI touch points (`server.js`, `/routes`, `/services`) that call `better-sqlite3` directly and group them by domain (jobs/queues, problems/milestones, analysis runs, gazetteer, health).
- Introduce a UI-facing adapter built on `NewsDatabase` so the Express layer depends on stable helpers instead of inline SQL; seed crawl-type presets from that adapter.
- Migrate write paths first (crawl job lifecycle, queue/problem/milestone persistence), then port read APIs/SSR pages, updating tests as each surface is converted.
- Once migration is complete, add lightweight guards (lint/tests) to prevent new direct DB access from creeping back into the UI.

Add yourself (name, PR, or issue link) to the table when you pick an item so the next agent has context.
