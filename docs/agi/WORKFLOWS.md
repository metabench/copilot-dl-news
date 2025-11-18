# AGI Workflows (Draft)

Each workflow follows the Sense → Plan → Act → Test/Verify → Document → Reflect cadence. Tools referenced are detailed in `TOOLS.md`.

## 1. Feature or Fix Delivery
1. **Sense**: Run `js-scan --what-imports` / `--what-calls` to map the surface area. Capture findings in the journal.
2. **Plan**: Draft a one-screen plan (per `AGENTS.md`) noting scope, risks, tests. Store under `docs/sessions/...` and link in the journal.
3. **Act**: Use `js-edit --dry-run` with batch change specs; iterate until the dry-run passes.
4. **Test/Verify**: Execute focused suites with `npm run test:by-path <test-file>`.
5. **Document**: Update relevant docs (workflow, decisions, AGI notes) and push deltas to `/docs/agi` if they affect AGI processes.
6. **Reflect**: Add lessons to `LESSONS.md` and backlog remaining questions.

## 2. Refactor & Architecture Reshaping
1. **Sense**: Build dependency maps via `js-scan --deps-of` and `--ripple-analysis`. Optionally emit JSON artifacts for reuse.
2. **Plan**: Consolidate change sets into batch edit specs; note sequencing constraints and fallback strategy.
3. **Act**: Apply edits using `js-edit` plan mode (`--from-plan` once Gap 4 lands). Keep each batch reversible.
4. **Test/Verify**: Run regression suites touching affected modules; create ad-hoc checks as needed.
5. **Document**: Record architectural consequences in `/docs/decisions/` and mirror key notes in `LIBRARY_OVERVIEW.md`.
6. **Reflect**: Summarize structural insights in `LESSONS.md` and raise follow-up research items.

## 3. Research & Tooling Exploration
1. **Sense**: Review existing docs plus previous journal entries; gather telemetry or tool output snapshots.
2. **Plan**: Write hypotheses and success metrics in `RESEARCH_BACKLOG.md`.
3. **Act**: Prototype scripts under `/tools/dev` (human agents only) and capture invocation recipes in `TOOLS.md`.
4. **Verify**: Compare expected vs. actual improvements (speed, coverage, accuracy).
5. **Document**: Publish findings in `/docs/agi/static-analysis/` (if applicable) and update backlog status.
6. **Reflect**: Note what worked/failed in `LESSONS.md` and adjust future experiments.

## 4. Documentation Stewardship
1. **Sense**: Identify stale or missing sections by scanning `INDEX.md`, `SELF_MODEL.md`, and `WORKFLOWS.md`.
2. **Plan**: Log the intended edits within the journal entry for the session.
3. **Act**: Update `/docs/agi` files only (or propose edits elsewhere via notes).
4. **Verify**: Self-review diffs to ensure consistency and cross-links.
5. **Document**: Record the changes in the journal and, when applicable, add ADR-lite notes referencing AGI impacts.
6. **Reflect**: Update `LESSONS.md` with doc maintenance insights.

## 5. Knowledge Graph Maintenance (Proposed)
- **Sense**: Nightly job runs `js-scan --build-index` and stores JSON snapshots.
- **Plan/Act**: Agents consume snapshots, compare deltas, and prioritize hotspots.
- **Document**: Summaries flow into `LIBRARY_OVERVIEW.md` and backlog items.
- **Status**: Tooling pending; outline maintained here for future adoption.

## 6. jsgui-forward UI Remediation (Registry + Diagram Atlas + Listing Store)
1. **Sense**: Review `docs/CLIENT_MODULARIZATION_PLAN.md`, the active session notes, and the rendered HTML (via `node src/ui/server/checks/*.check.js`) to pinpoint which client responsibilities still live in `src/ui/client/index.js`.
2. **Plan**: Update the session PLAN with a “Current Focus” checklist covering code targets, docs, and validation commands; capture risks (control registry drift, Atlas refresh latency, listing state divergence).
3. **Act**: Extract Diagram Atlas logic into `src/ui/client/diagramAtlas.js`, delegate listing state wiring to `listingStateStore.js` + `listingDomBindings.js`, and keep the entry file limited to registry setup + bootstrap calls. Use dependency injection hooks (`registerControls`) to avoid reintroducing manual fallbacks.
4. **Test/Verify**: Run `node src/ui/server/checks/diagramAtlas.check.js`, `node src/ui/server/checks/dataExplorer.check.js`, and the targeted Jest suites:
	- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
	- `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js`
5. **Document**: Log results in the session WORKING_NOTES and SESSION_SUMMARY, mark progress in `docs/CHANGE_PLAN.md`, and refresh `docs/JSGUI3_PATTERNS_ANALYSIS.md` with the new modularization guidance.
6. **Reflect**: File remaining UI modularization tasks (e.g., SSE handlers, crawl controls) back into the plan and flag follow-ups in `/docs/agi/journal/` for the next agent.
