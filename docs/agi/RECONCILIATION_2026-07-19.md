# Corpus Reconciliation — 2026-07-19

A 4-reader probe workflow (97 tool calls) audited every doc in `docs/agi/` against the live repo,
after discovering the corpus had been **invisible to the active agent lineage for months** — the
2026-07 sessions ran on private memory + continuation prompts alone and partially reinvented what
this corpus already held. Root cause: no forced read path. Fix: [BOOT.md](BOOT.md) (one-hop rule),
private memory now points here ("memory is a cache; the corpus is the database").

Also recorded here: the first **model-lineage swap** handled explicitly (see SELF_MODEL.md) —
sessions through 2026-07-19 ran Claude Opus 4.8; this reconciliation was executed by Fable 5,
inheriting the corpus. Earlier corpus authorship (2025-11 →) was a heterogeneous lineage
(GitHub Copilot-era agents and others).

## Headline discoveries (live capability the 2026-07 lineage didn't know it had)

| Find | Status |
| --- | --- |
| `npm run sql:check-ui` (tools/dev/sql-boundary-check.js) | ALIVE — an enforcement tripwire for the exact ncdb thin-coordination mission. Exits 1 today: 8 pre-existing findings in src/ui/server/* (several look like doc-comment false-positives) + scan scopes still reference deleted crawl-widget/. Triage task spawned. |
| `npm run test:by-path -- <file>` | ALIVE — the official targeted-test runner (careful runner, Jest 30). Supersedes ad-hoc `npx jest <path>`. |
| js-scan / js-edit / md-scan (tools/dev/) | ALIVE — AST search with `--ai-mode --json`, continuation tokens, `--ripple-analysis`, `--call-graph`, `--build-index`; guarded edits via `--from-plan/--from-token/--match-snapshot`. |
| docs/agi/skills/ — 17 packs on disk | ALIVE — incl. jsgui3-activation-debug, jsgui3-ssr-activation-data-bridge, ui-screenshot-feedback, puppeteer-efficient-ui-verification. 9 of 26 SKILLS.md registry rows are dangling (no SKILL.md). |
| tools/dev/session-archive.js (`npm run sessions:*`) | ALIVE — list/search/read/extract over 300+ session dirs. |
| Crawl Observer mounted at /crawl-observer in the unified app | ALIVE (subApps/registry.js:522; task_events-backed) — natural integration point for extending the 2026-07 crawl-status UI. |
| tools/crawl/ — 54 diagnostic tools (with AGENT.md) | ALIVE — intelligent-crawl, recent-errors, throughput-analyzer, crawl-progress-mon… |
| tools/dev/crawl-status.js + task-events.js; src/db/TaskEventWriter.js | ALIVE — telemetry goes to the task_events table, NOT the dormant docs/agi/logs NDJSON channel (last entries 2026-01). |
| Instruction self-modification pipeline (docs-memory MCP: proposeInstructionChange / reviewInstructionProposal / runRetrospective) | Survives in tools/mcp/docs-memory/mcp-server.js (wired via .vscode/mcp.json for editor agents; not connected in every environment). CLI twin died with tools/agi/. |
| .github/agents/ — 42 promoted charters | ALIVE — incl. "UI Singularity" and "Crawler Singularity". |
| SVG validators (svg-collisions --strict, svg-overflow) + theming cookbook | ALIVE. |
| docs/decisions/2026-04-24-repo-slimdown.md | The "why is X missing" oracle — consult before declaring anything lost. |

## Major staleness verdicts (do NOT follow these as written)

- **tools/agi/ automation layer is GONE** (session-retrospective.js, architect-loop.js,
  process-guardian.js, memory.js, run.js) — deleted ~2026-04-24. SELF_MODEL's "Current
  Capabilities" bullets for Architect Loop / Process Guardian / Session Retrospective CLI / OCI
  skill pack are historical. AGENT_MCP_ACCESS_GUIDE's CLI-fallback table (9 commands) is dead.
- **Path re-layering** (2026): `src/crawler`→`src/core/crawler`, `src/planner`→`src/intelligence/planner`,
  `src/analysis`→`src/intelligence/analysis`, `src/pipelines`→`src/core/pipelines`,
  `src/utils/mcpLogger`→`src/shared/utils/mcpLogger`. Every pre-2026 path needs translation
  (table in BOOT.md). NewsCrawler.js line-number inventories (2025-12-03) are stale snapshots.
- **crawl-widget/ is gone** — Electron surfaces live under `src/ui/electron/*` (unified app,
  port 3170). v4-cli.js gone (v5 era). mcp_config.json gone (.vscode/mcp.json is real).
- **LIBRARY_OVERVIEW's DB-adapter-layer description CONFLICTS with reality** — src/db is now a
  thin compat layer; DB-shaped logic is migrating to ncdb (news-crawler-db). Trust
  docs/inventory/db-coordination-audit-2026-07-19.md instead.
- **KNOWLEDGE_MAP.md** — historical ledger only (last real entry 2026-01-05, formatting corrupted).
- **jsgui3 Pattern Catalog blueprint** (examples/ dir, jsgui3Harness.js, catalog guide) was never
  built — only the checks/ half materialized (~20 scripts under src/ui/controls/checks/).
- **LESSONS.md ordering** — not chronological (2026-04-29 block at top; one heading mis-dated
  "2025-01-25" for 2026-01-25).
- **WORKFLOWS #8 Proactive Refactoring Loop** — aspirational; lesson-scanner/auto-branch machinery
  never built. WORKFLOWS #5 understates delivery (js-scan --build-index exists).

## Memory ↔ corpus overlap resolution (cache-vs-database sort)

| Topic | Verdict | Resolution |
| --- | --- | --- |
| jsgui3 micro-API gotchas + skill packs | corpus-richer | Memory keeps the 2026-07 audit pointer; corpus (LESSONS + skills/) is the authority for control-authoring details. |
| Deploy boundary (worker vs main-process), Electron restart recovery | memory-richer | Corpus predates the unified app; memory is authority. Boot doc now carries the two-line versions. |
| DB delegation recipe + migration state | memory-richer | Memory + the inventory audit are authority; corpus contributes the origin rationale (2025-12-21 SQL-boundary guard) and the dbClient _callDb seam. LIBRARY_OVERVIEW conflict noted above. |
| Compression (write path vs evidence-query shape) | equivalent | Non-overlapping halves; both stand. |
| WDQS/gazetteer ingest | memory-richer | Corpus contributes the complementary tool path (tools/gazetteer/ingest-historical-names.js) + WORKFLOWS #7. |

## Backlog deltas applied

RB-001 partially delivered (js-scan --build-index) · RB-002 DELIVERED (js-edit --from-plan) ·
RB-006 DELIVERED (continuation tokens) · RB-009 largely delivered by the 2026-07 crawl-status UI
+ ui-screenshot loop · RB-010 largely delivered, residue = desktop notifications on crawl
completion · RB-007/RB-008 partially realized by `.claude/skills/singularity/SKILL.md` (local).
See RESEARCH_BACKLOG.md for the updated table.

## Method note (for the next reconciliation)

4 parallel readers (lessons / patterns / self-model+tooling / trajectory), each REQUIRED to probe
claims against the live tree before issuing verdicts, returning structured
valid/stale/overlap/boot-worthy lists. ~371s wall clock, 0 agent errors. The forcing function —
"probe, don't summarize" — is what made the verdicts trustworthy; a summarizing pass would have
repeated the corpus's own stale claims back as fact.
