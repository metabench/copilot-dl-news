# AGI Tool Catalog (Draft)

_All commands run from repository root unless noted. Categories: `static_analysis`, `code_navigation`, `doc_ops`, `runtime_experiment`, `planning_support`._

## Existing Tools

| Tool | Category | Location | Purpose & When to Use | Example Invocation |
| --- | --- | --- | --- | --- |
| `js-scan` | static_analysis | `tools/dev/js-scan.js` | Semantic discovery (imports/exports, ripple analysis, call graphs, bilingual terse views). Run during Sense phase and before/after major edits. | `node tools/dev/js-scan.js --dir src --what-imports src/services/news.js --json`
| `js-edit` | code_navigation | `tools/dev/js-edit.js` | Guarded locate/replace with SWC parsing, recipes, and plan emission. Use during Act phase for any AST-sensitive edit. | `node tools/dev/js-edit.js --file src/services/news.js --locate "exports.fetch" --emit-plan tmp/plan.json`
| `md-scan` | doc_ops | `tools/dev/md-scan.js` | Markdown search/indexing across `docs/`; perfect for dependency-aware doc updates. | `node tools/dev/md-scan.js --dir docs --search "AGI" --json`
| `npm run test:by-path` | runtime_experiment | `package.json` scripts | Official runner for targeted suites; required verification step after edits. | `npm run test:by-path tests/services/news.test.js`
| `docs/sessions` conventions | planning_support | `docs/sessions/` | Stores per-session plans; AGI work should reference or create these before acting. | `docs/sessions/2025-11-16-plan.md` (manual)
| `ingest-historical-names` | knowledge_ingestion | `tools/gazetteer/ingest-historical-names.js` | Fetches place data from Wikidata and populates historical names from a candidate list. | `node tools/gazetteer/ingest-historical-names.js`

## Docs-memory MCP (when available)

If your agent has `docs-memory/*` tools enabled, prefer them for fast, structured memory retrieval and append-only updates.

- **Pre-flight check**: `node tools/dev/mcp-check.js --quick --json`
- **Reference**: `docs/agi/AGENT_MCP_ACCESS_GUIDE.md`

## Proposed Tooling Extensions

| Proposal | Category | Outline | Expected Impact |
| --- | --- | --- | --- |
| **`js-scan --graph-slice`** | static_analysis | Emit a DOT/JSON graph limited to selected modules/functions for visualization and AGI ingest. | Enables knowledge graph snapshots and automated hotspot detection. |
| **`state-plan` CLI** | planning_support | Persists plan objects (objective, files, risks) and exposes continuation tokens so agents can resume multi-day efforts. Could wrap existing `js-edit --from-plan`. | Reduces context loss between sessions; unlocks long-horizon AGI planning. |
| **`doc-weaver`** | doc_ops | Generates cross-reference maps between `/docs/agi` and legacy docs to highlight divergence. | Keeps AGI docs synchronized with broader repository knowledge. |
| **`scan-metrics`** | static_analysis | Aggregates `js-scan --build-index` output into metrics (fan-in/out, churn) for prioritizing refactors. | Offers quantitative guidance for AGI agents choosing next actions. |
| **Relationship tokens + js-edit replay** | static_analysis / code_navigation | ✅ AI-mode support + continuation tokens now ship for `what-imports`/`export-usage`; ✅ js-edit ingestion (2025-11-21) accepts `_ai_native_cli` snapshots/tokens via `--match-snapshot` / `--from-token` so guards emit instantly. | Eliminates the manual locate cycle between discovery and guarded edits—capture a token during Sense, then pipe it into js-edit to hydrate guard plans without re-running locate. |

## Usage Guidelines
1. **Prefer JSON outputs** from `js-scan`/`md-scan` for downstream automation; store large results under `tmp/.ai-cache` or session folders.
2. **Never invoke Python-based tooling**; replicate functionality via Node.js or PowerShell-friendly scripts per repository policy.
3. **Tie tool runs to workflow steps**: log commands + findings in the journal to maintain traceability.
4. **Flag tooling gaps** in `RESEARCH_BACKLOG.md` so future sessions can prioritize implementation.

## Advanced Tool Playbooks

### js-scan Deep Usage
- **Bilingual ergonomics**: Mix English/Chinese flags in one call (`--搜`, `--视 简`, `--域 location,name,hash`) to squeeze output when capturing tokens for downstream automation.
- **Graph-first reconnaissance**: Chain `--what-imports`, `--deps-of`, and `--ripple-analysis` for any module before edits; capture JSON payloads plus continuation tokens via `--ai-mode --json` for long-lived plans.
- **Meta-scans**: Analyze `tools/dev/js-scan.js` itself to understand operations (e.g., `node tools/dev/js-scan.js --dir tools/dev --what-imports tools/dev/js-scan/operations/search.js --json`); pair with `--ripple-analysis tools/dev/js-scan/operations/rippleAnalysis.js` to score refactor risk inside the toolchain.
- **Selector capture & handoff**: Use `--view terse --fields location,name,selector,hash` plus the new `matches[].jsEditHint` JSON payload, which now includes ready-to-run js-edit commands/args/plan metadata for every hit. Pipe the JSON to disk and replay the hint to jump directly into `js-edit` without another locate.
- **Continuation playback**: When `--ai-mode --json` is set, each match now carries `match` snapshots (file, hash, selector, traits) plus replay context. Store the emitted `continuation_tokens` blob so you can later run `node tools/dev/js-scan.js --continuation - --json` (token via stdin) to execute `analyze`, `trace`, or `ripple` follow-ups with no extra flags.
- **Digest safety**: If a replay requires re-running the search and the stored `results_digest` no longer matches, js-scan now emits `warnings[0].code === "RESULTS_DIGEST_MISMATCH"` so you know to regenerate selectors before editing.
- **Call-graph slices**: `node tools/dev/js-scan.js --dir src --call-graph src/crawler/IntelligentPlanningFacade.js --depth 3 --json` (call graph flags live under `operations/callGraph.js`).

### js-edit Guard Cascades
- **Three-phase guard**: `--locate` + `--emit-plan` (capture hash/span); `--replace` with `--expect-hash`/`--expect-span --preview-edit`; rerun `--locate` to confirm new hash. Plans live under `tmp/plan-*.json` for reuse.
- **Recipe orchestration**: Execute `--recipe` workloads (e.g., rename globally) where step 1 runs `js-scan --ripple-analysis`, step 2 locates selectors, step 3 applies rename—all without ad-hoc scripting.
- **Variable spans**: For CommonJS exports, default to `--variable-target declarator` so guardrails track the precise `module.exports.foo` binding, avoiding diff noise.

### md-scan Cross-References
- Combine `md-scan` with `js-scan` results: after discovering modules needing doc updates, run `node tools/dev/md-scan.js --dir docs --search "<ModuleName>" --json` to find all references and keep docs synchronized.
- Use `--ai-mode --json` to persist doc search results for future sessions; store under `docs/sessions/<date>/md-scan-<topic>.json` and link from the journal.

For detailed js-scan instructions (including meta-scans on the tooling itself), see `docs/agi/tools/JS_SCAN_DEEP_DIVE.md`. For js-edit guard workflows and self-editing guidance, see `docs/agi/tools/JS_EDIT_DEEP_DIVE.md`.
