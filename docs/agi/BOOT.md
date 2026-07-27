# BOOT — agent session entry point

Read this first each session, right after your private memory index. **One-hop rule:** everything
an agent needs is at most one link from this file. Knowledge not reachable from the boot path is
treated as lost — file it, don't rely on recall (the 2026-07 reconciliation found this corpus had
been invisible to an active agent lineage for months; see the reconciliation report below).

**Memory is a cache; this corpus is the database.** Private per-agent session memory holds
operational state and hot pointers. Research, lessons, procedures, and anything a human or a
*different* agent might need lives here, in the repo, versioned.

Everything in this file was **probe-verified on 2026-07-19** (commands run, files stat'd) — see
[RECONCILIATION_2026-07-19.md](RECONCILIATION_2026-07-19.md) for the full valid/stale verdicts.
Convention going forward: durable claims ship with a probe (a command that re-verifies them);
re-probe anything here whose subject you're about to depend on.

## The working loop — canonical commands

| Need | Command |
| --- | --- |
| Knowledge probes (RB-011) | `node tools/dev/run-probes.js` — executes every registered re-verification probe (frontier API, SSR/template-trap tripwire, churn tool, DB-probe incident guard); server-dependent probes SKIP (not fail) when :3170 is down. Run at orient; add an entry to `tools/dev/probes.json` when a claim gains a runnable check. |
| Targeted tests | `npm run test:by-path -- <test-file>` (Jest 30 careful runner — the house way) |
| SQL-boundary tripwire | `npm run sql:check-ui` — run after ANY DB-logic move (2026-07-19 triage: scans src/ui only, comment-aware, allow list empty; passes CLEAN — any finding is a regression) |
| AST search / impact | `node tools/dev/js-scan.js --ai-mode --json …`; `--ripple-analysis <file>`; `--call-graph <file> --depth 3` |
| Guarded edits | `node tools/dev/js-edit.js --from-plan / --from-token / --match-snapshot` |
| Docs search | `node tools/dev/md-scan.js --dir docs/agi --search <term>` |
| Cheap SSR check | `node src/ui/server/checks/<x>.check.js` — before any browser loop |
| Crawl state | `node tools/dev/crawl-status.js` (quick) → `node tools/dev/task-events.js` (telemetry) |
| App control | `tools/dev-bridge` inbox/outbox JSON: start-electron / stop-electron / status / ui-screenshot (unified app, port 3170) |
| Session history | `npm run sessions:list / :search / :read` (tools/dev/session-archive.js; 300+ session dirs) |
| SVG validation | `node tools/dev/svg-collisions.js --strict` + `svg-overflow.js` |

## Sharp edges (each cost a real debugging session — details in LESSONS.md)

- **Electron:** the server runs in system Node; Electron is only a shell pointing at localhost
  (better-sqlite3 ABI). `--smoke`/`--screenshot` flags INTENTIONALLY close the app.
- **jsgui3 five-gotcha line:** String_Control for text/inline JS (escaping breaks scripts);
  `compose()` is never auto-invoked; client activation needs `__type_name` + registerControlType +
  controlManifest; never override `on/off/set/get/add`; no real-DOM work in constructors — bind in
  `activate()` (SSR has no DOM).
- **Deploy boundary:** `src/core/crawler/*` is live per-crawl (worker forked fresh); main-process
  code (UI, jobProgress, in-app tasks) needs an Electron restart.
- **Evidence discipline:** crawl success = local `data/news.db` per-host `http_status=200` counts
  from a baseline timestamp — never remote counters, never the UI alone.
- **TLS fingerprinting (JA3/JA4)** detects Node before headers are sent — header spoofing is
  useless; FetchPipeline has a Puppeteer fallback keyed on ECONNRESET.
- **SQLite:** `COALESCE` in ORDER BY kills index use (use `DESC NULLS LAST` + composite index);
  JS `ESCAPE '\\'` is one escaping level; better-sqlite3 named params reject extra keys.
- **PowerShell:** `Tee-Object` writes UTF-16 LE — check BOM before `readFileSync('utf8')`; never
  inline SQL in shell strings — write a small Node script.

## Module ecosystem (owner directive 2026-07-22 — the working model)

Functionality is implemented and tested in **sibling module repos** with clearly defined
APIs; this repo is the **coordinator** that calls them (the ncdb pattern, generalized).
`../news-crawler-itself` is **the most important module** — the crawler engine's home
(first extraction: the remote worker + a worker-thread parallel-compression pool out of
`deploy/remote-crawler-v2/`). `news-crawler-backend-core` is excluded for the moment;
`http-cache-store` is not part of this ecosystem. Before writing new code here, ask
"which module owns this?" Full map + rules:
[../plans/2026-07-22-module-ecosystem.md](../plans/2026-07-22-module-ecosystem.md).
Focused deep-work cycles inside one module are first-class (owner expects breakthroughs
from that mode). Probe: `ls ../news-crawler-itself` (README + AGENTS.md exist since
2026-07-22).

## Corpus map (one hop each)

- **[../agents/FUTURE_AGENT_PLAYBOOK.md](../agents/FUTURE_AGENT_PLAYBOOK.md) — START HERE
  for step-by-step instructions** (2026-07-22): session ritual, where-code-goes decision
  table, golden rules G1–G10 with their incidents, the pending extraction mission
  (news-crawler-itself + compression pool + deploy + 5×10 crawl), exact deploy/crawl/
  restart procedures, troubleshooting table, STOP conditions. Written to be followed
  literally — verify after every step.
- [LESSONS.md](LESSONS.md) · [PATTERNS.md](PATTERNS.md) · [ANTI_PATTERNS.md](ANTI_PATTERNS.md) —
  distilled experience. Trust the mechanisms; re-resolve any pre-2026 path (table below).
- [SKILLS.md](SKILLS.md) + [skills/](skills/) — 17 skill packs on disk (jsgui3-activation-debug,
  ssr-activation-data-bridge, ui-screenshot-feedback, puppeteer-efficient-ui-verification …).
  9 registry rows are dangling (no SKILL.md) — see reconciliation.
- [WORKFLOWS.md](WORKFLOWS.md) — canonical Sense→Plan→Act loops.
- [RESEARCH_BACKLOG.md](RESEARCH_BACKLOG.md) — the live research queue. Each improvement cycle
  advances one item or records why none was actionable.
- [../plans/2026-07-db-driven-crawling.md](../plans/2026-07-db-driven-crawling.md) — owner-directed
  multi-turn roadmap: crawl from the DB frontier (urls⋈http_responses; ~1.5M known-but-undownloaded),
  per-type recency (hubs 1-day, UI-configurable), place-hub redownload. P1 shipped; ground-truth
  schema rules + traps live here (RB-012).
- [IMPROVEMENT_LEDGER.md](IMPROVEMENT_LEDGER.md) — cost-per-improvement + second-order-tools
  record; append a row per cycle, honestly (a no-delta cycle gets written down too). Emit a
  co-located `<!-- cycle:{...} -->` machine stanza under each row and read the computed verdict
  at orient: `node tools/agi/cycle-metrics.js` (COMPOUNDING/PLATEAU/BLOATING) — see
  [WORKFLOW_MEASUREMENT.md](WORKFLOW_MEASUREMENT.md) for the stanza schema + the workflow-scorecard.
  **After appending the row + stanza, regenerate the progress picture:**
  `node tools/agi/progress-svg.js` → [progress/progress.svg](progress/progress.svg) (owner
  directive 2026-07-27: the workflow produces visible progress artifacts, rendered from the
  stanzas — never hand-edit the SVG; edit the data and re-render. Milestones:
  `--annotate "cycleId=label"`).
- [SELF_MODEL.md](SELF_MODEL.md) — ecosystem model + the **model lineage table**; on a detected
  model swap, run the calibration in `.claude/skills/singularity/SKILL.md`.
- [journal/](journal/) and [../sessions/SESSIONS_HUB.md](../sessions/SESSIONS_HUB.md) — history.
- [../inventory/db-coordination-audit-2026-07-19.md](../inventory/db-coordination-audit-2026-07-19.md)
  — the copilot→ncdb migration map, verdicts, and the delegation recipe (ncdb-exact-SQL-first).
- [../decisions/2026-04-24-repo-slimdown.md](../decisions/2026-04-24-repo-slimdown.md) — the
  "why is X missing" oracle; 53 docs moved to docs/archives/2026-Q2/.
- `.github/agents/` — 42 promoted agent charters (incl. UI Singularity, Crawler Singularity).

## Path translation for pre-2026 docs

`src/crawler` → `src/core/crawler` · `src/planner` → `src/intelligence/planner` ·
`src/analysis` → `src/intelligence/analysis` · `src/pipelines` → `src/core/pipelines` ·
`src/utils/mcpLogger` → `src/shared/utils/mcpLogger` · `crawl-widget/` → `src/ui/electron/*`
(unified app, port 3170) · `tools/agi/*` → deleted in the 2026-04-24 slim-down ·
`v4-cli` → superseded by the unified app + dev-bridge.

## Volatile state lives elsewhere

Mission state, machine facts (pids, ports, current counts), and per-turn plans live in the
session continuation prompt and LOOP_STATE lines — never here, never trusted when stale. This
file holds only what is durable, and only with a probe path.
