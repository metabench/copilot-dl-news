# Plan: Crawler Graph Feedback Loop

Date: 2026-05-26

## Objective

Start a separate crawler feedback-loop track that lets crawler planning consume the new DB-owned graph analysis surface without broad crawler rewrites.

## Done When

- The new session has a concise plan and working notes linked from the sessions hub.
- The integration boundary is explicit: `copilot-dl-news` consumes `WebsiteGraphAnalysisService`, which consumes `db.graph` from `news-crawler-db`.
- The first implementation step is narrow, testable, and does not change live crawl behavior.
- Any outputs are bounded in memory and on disk, with no derived graph tables or raw SQL outside `news-crawler-db`.
- The next prompt is ready for continuing the track.

## Context Read

- `AGENTS.md`
- `docs/INDEX.md`
- `docs/sessions/2026-05-25-news-ecosystem-status/WORKING_NOTES.md`
- `docs/sessions/2026-05-25-news-ecosystem-status/GRAPH_ACCESS_16_STEP_RECURSIVE_PLAN.md`
- `../news-crawler-db/docs/ACCESS_API.md`
- `../news-db-analysis/docs/06-services.md`
- `tools/crawl/AGENT.md`
- Active long-term session: `docs/sessions/long-term/lt-001-advanced-crawler-ui/`

## Boundary Design

Runtime data flow:

```text
copilot-dl-news crawler planning
  -> WebsiteGraphAnalysisService from news-db-analysis
      -> db.graph GraphAccess capability from news-crawler-db
          -> SQLite-owned graph queries over urls/links/http_responses/content metadata
```

Rules:

- `copilot-dl-news` must not issue SQL for graph summaries, hub discovery, orphan/dead-end analysis, or crawl-priority feature reads.
- `news-db-analysis` graph methods are the analysis-facing API; direct `GraphAccess` use in crawler code is acceptable only for narrow infrastructure/loading glue, not planning logic.
- Existing `crawl-remote.js graph-seeds` is legacy graph seeding. Do not broaden or rewrite it in the first step.
- Postgres parity remains optional because `DbAdapter.graph` is an optional capability; callers must fail with a clear missing-capability message.

## How Planning Should Consume Graph Outputs

Site graph summaries:

- Use `summarizeSiteGraph(host)` to classify crawl posture before launch: sparse graph, high dead-end ratio, high orphan ratio, hub-rich, or stale/content-missing.
- Feed those posture labels into operator-visible dry-run output and future adaptive crawl profiles.

Hub candidates:

- Use `findHubCandidates(host, { limit })` as seed candidates for remote `seed` or `collect`.
- Preserve transparent metadata: source `graph-hub-candidate`, `hubScore`, internal/external outbound counts, and signal labels.

Orphan pages:

- Treat as diagnostic and refresh candidates, not automatically high-priority crawl seeds.
- Pages with no inbound links but missing/stale content can become bounded refresh candidates.

Dead-end pages:

- Treat as link-extraction or content-parser feedback. High dead-end ratios should trigger planner caution and operator notes.
- Do not blindly recrawl all dead ends; emit compact samples.

Crawl-priority feature datasets:

- Use `buildCrawlPriorityDataset(host, { limit, staleBefore/staleFetchedBefore })` as the main seed-ranking source.
- Convert rows into bounded seed recommendations with reasons derived from `signals`, missing content, stale fetches, and graph counts.
- Keep feature rows transient unless an operator explicitly writes a small JSON/NDJSON artifact.

## Low-Storage Policy

- Default per-host materialization limit: 50 rows for planning, configurable but capped at a documented maximum in live CLI work.
- Store only compact manifests and top candidate rows when artifacts are requested.
- No new graph cache tables, duplicate link tables, or persisted scores without a separate ADR and schema-sync plan.
- Prefer JSON/NDJSON summaries over full adjacency dumps. Adjacency output must require explicit limit/batch options.

## Recursive Backlog Status

Future bundled recursive prompts should use `NEXT_FEW_DAYS_PLAN.md` together
with this section. That plan intentionally groups larger crawler-improvement
workloads across queue readiness, queue maintenance gates, deploy reliability,
second-seed readiness, and operator packaging.

Done:

- GraphAccess/service bridge: live read-only graph feedback uses `WebsiteGraphAnalysisService` through sibling repo APIs; no raw SQL in crawler planning.
- Bounded artifacts: `--out`, `--from-artifact`, schema/host/limit/sample/recommendation-count/URL-length/byte-size validation, and exact-host comparison are in place.
- Planning surfaces: `run.js --explain` and unified launcher remote/profile `--dry-run` can attach saved graph-feedback artifacts without enqueuing, seeding, or changing `collect`.
- Profile/report ergonomics: profile host extraction, `--profile-summary`, profile-aware recipe/compare/preflight, `--operator-report`, Markdown output, report compaction flags, artifact freshness evidence, readiness labels, and readiness aggregates are in place.
- Operator workflow packaging: `--profile-workflow` now emits a file-only profile checklist tying exact host summary, bounded artifact generation, compare, strict validation, text preflight, compact operator report, and canonical profile dry-run preview together.
- Durable workflow docs: `docs/workflows/graph-feedback-artifact-planning.md` now documents the safe artifact planning sequence, stale-artifact warning behavior, exact host mismatch checks, verification commands, and links back to this session and LT-001.
- Stale-artifact preview coverage: profile preflight and operator report modes warn on old `generatedAt` evidence without rejecting read-only previews; hard freshness rejection remains future-live-seeding-only.
- Read-only closure consistency: CLI help, crawl agent docs, workflow docs, session notes, and smoke commands now document `--recipe` as the compact artifact-derived recipe and `--profile-workflow` as the complete profile checklist.
- Sample evidence: `docs/workflows/graph-feedback-profile-workflow-sample.md` provides a compact bounded sample of the profile checklist output shape without candidate URL dumps.
- Guarded live seeding first slice: unified launcher now accepts `--use-graph-feedback-seeds` only with `--graph-feedback-artifact <path>` on explicit remote `start`/`launch`/`bounded`/`run` commands, preserving read-only defaults without the flag.
- Live seed safety gates: stale artifacts, host mismatches, more than 5 hosts, more than 10 candidates per host, more than 25 URLs total, URL/body overflows, status/sync/drain/hostless/non-remote paths, `collect`, and existing seed flags are rejected before delegation.
- Remote operations planning: `docs/workflows/remote-crawler-health-recovery-deploy.md` now records fast health checks, stop/stabilize steps, VM/PM2 inspection, deploy commands, deploy CLI/doc/test hardening, and post-recovery verification.
- Dry-run-first evidence: `--graph-feedback-preview-evidence <path>` writes a bounded dry-run fingerprint without candidate URL dumps, and the operator live path requires and verifies the fingerprint before delegation.
- Seed-attempt evidence: `--seed-attempt-log <path>` appends compact JSONL live-delegation records with artifact path, host/count/body/freshness evidence, and a redacted delegated command.
- Direct remote boundary: `crawl-remote.js` rejects direct graph-feedback artifact/live-seed flags and points operators to the unified launcher so all gates stay in one path.
- Remote deploy preflight hardening: tests now cover `start`/`run` as start-like preflight commands and keep `status`/`health`/`sync` read-only.
- Real-remote approval package: `--graph-feedback-approval-checklist <path>` writes a dry-run-only checklist for a tiny approved smoke, capped at 1 host, 3 URLs, 30s guard, with preview evidence, seed-attempt log path, health/status commands, rollback stop command, post-seed verification shape, and explicit approval line.
- Remote recovery/deploy proof paths: docs/tests now cover deploy override flags, stale/missing remote build metadata, busy-server evidence in dry-run summaries, always-deploy preflight args, and troubleshooting decision points before real fleet use.
- Post-seed evidence helper: `writePostSeedVerificationEvidenceSync()` records bounded post-seed proof with preview fingerprint, seed-attempt log path, hosts, check booleans, URL-redacted summaries, rollback status, and evidence-only/no-collect-change policy.
- Deploy recovery hinting: `deploy-remote-server.js` now has a pure troubleshooting-hint helper covered for failed health, stale local packages, busy-server refusal, custom remote dir/service targets, and `--force` decision points without contacting the fleet.
- Dry-run approval readiness: `buildLiveSeedApprovalReadiness()` validates the real-seed approval checklist, preview fingerprint, smoke caps, seed-attempt log path, no-action policy, and optional post-seed evidence shape as a file-only package before any human approval request.
- Launcher readiness artifact: `--graph-feedback-approval-readiness <path>` now writes the bounded approval-readiness object from the same dry-run package that writes preview evidence and the approval checklist.
- Pre-seed usability package: the approval checklist now includes no-contact command evidence for health, status/build metadata, recent errors, content probe, and deploy preflight before any approved real seed.
- Deploy target preflight passthrough: the unified launcher now exposes status host/port, remote dir, PM2 service, busy/health skip overrides, and DB-build skip passthrough for remote deploy preflight so wrong-target recovery can be rehearsed in dry-run before live launch.
- Deploy preflight dry-run visibility: start-like remote launcher dry-runs now print the exact deploy preflight command alongside the delegated crawl command, making target/override mistakes visible without contacting the fleet.
- Approval readiness proof summary: the launcher-written readiness artifact now includes blocker summaries, pre-seed usability command names, post-seed proof command names, rollback command names, seed-attempt log path, and no-action policy while staying bounded and URL-redacted.
- Post-seed checklist artifact: `--graph-feedback-post-seed-checklist <path>` writes the bounded dry-run-only post-seed proof command/evidence shape as a separate artifact, so the no-contact approval package has preview, approval, readiness, and post-seed proof files before human approval.
- Approval-blocked rehearsal: with no separate `APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE` line, the track now stops at no-contact dry-run artifacts, approval readiness, post-seed checklist, and direct remote flag rejection; no remote health/status/deploy/seed command is run.
- Approval-blocked drift check: repeated no-contact package verification confirmed the dry-run artifacts, local readiness, direct remote flag rejection, profile dry-run preview, and deploy-preflight rendering still match the documented blocker state.
- Approval-context note: the user stated "I approve it all" on 2026-05-27, but the active prompt still lacked the exact standalone approval token required by this track. Treat that statement as context only; real remote health/status/deploy/seed commands remain blocked until the exact token appears on its own line.
- Approved smoke pre-seed abort: the active 2026-05-27 prompt included the standalone `APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE` token. A fresh 1-host/1-candidate `bbc.com` artifact and dry-run proof package were generated, but the live seed was skipped because pre-seed `status`, `errors`, `content`, and deploy preflight commands hit the 30s guard. No seed-attempt log was written and no seed request was sent.
- Remote proof exit hardening: `crawl-remote.js` now clears the read-only proof command exit path by removing the orphan timeout race and forcing one-shot HTTP connections, with local-server tests proving `status --json`, `errors --json`, and `content --json` exit after printing JSON.
- Fast deploy proof mode: `deploy-remote-server.js --preflight-only --json` now reports local build state, remote build comparison, readiness, and proof-only action policy without building, deploying, stopping PM2, or contacting SSH. The graph-feedback approval checklist now uses this fast proof command instead of `--if-needed --json`.
- No-approval drift check after proof hardening: with the approval token absent, no real remote checks or seed retry were run. Local dry-run package, approval readiness, direct remote flag rejection, profile dry-run preview, and local deploy `--preflight-only --json --skip-busy-check` proof still match the documented blocker state.
- Approved retry reached the deploy-readiness blocker: the active prompt included the standalone approval token, a fresh 1-host/1-candidate `bbc.com` artifact and dry-run proof package were generated, local `deploy-remote-server.js --build-only --json --skip-busy-check` refreshed the local package, and real remote `health`, `status --json`, `errors --json`, `content --domain bbc.com --json`, and deploy preflight all exited within 30 seconds. No seed was sent because deploy preflight reported `deploy-needed` from missing remote build metadata, and the documented deploy path failed before upload with SSH public-key authentication unavailable.
- Approved SSH-readiness retry remained blocked before deploy: the active prompt included the standalone approval token, but non-destructive SSH checks found no `REMOTE_CRAWLER_SSH_KEY`, no `SSH_AUTH_SOCK`, no reachable ssh-agent, and `ssh -o BatchMode=yes ubuntu@141.144.193.218 true` still failed with `Permission denied (publickey)`. No deploy or seed was attempted.
- Approved SSH-readiness recheck still blocked before deploy: a later approved prompt again found no configured SSH key/env/agent and BatchMode SSH still failed with `Permission denied (publickey)`. No deploy, deploy proof, remote stop, or seed was attempted.
- Approved SSH-readiness recheck remains blocked before deploy: the latest approved prompt again found no `REMOTE_CRAWLER_SSH_KEY`, no `SSH_AUTH_SOCK`, no default private key under the runtime home, no reachable ssh-agent, and BatchMode SSH to `ubuntu@141.144.193.218` failed with `Permission denied (publickey)`. No deploy, remote proof, remote stop, or seed was attempted.
- Approved SSH-readiness recheck found candidate Windows SSH config but still blocked before deploy: the active prompt included the standalone approval token, `/mnt/c/Users/james/.ssh/config` maps `oracle-worker` to `ubuntu@141.144.193.218` with `ssh-key-2025-11-11.key`, and candidate key files exist, but OpenSSH ignored them because their permissions are too open (`0444`/`0777`). No deploy, remote proof, remote stop, or seed was attempted.
- Approved SSH-readiness recheck remains unchanged: a later approved prompt found the same unset env/agent state and the same Windows candidate key permissions (`0444`/`0777`), so explicit BatchMode key probes were ignored by OpenSSH before authentication. No deploy, remote proof, remote stop, or seed was attempted.
- 2026-05-28 approved SSH-readiness recheck remains blocked: the active prompt included the standalone approval token, but env/agent/default-key checks were unchanged and explicit probes with `/mnt/c/Users/james/.ssh/ssh-key-2025-11-10.key` / `ssh-key-2025-11-11.key` were still ignored by OpenSSH because their permissions are too open. No deploy, remote proof, remote stop, or seed was attempted.
- 2026-05-28 approved SSH/deploy recovery unblocked the first tiny live smoke: the Windows key was copied to `/root/.ssh/oracle-worker-2025-11-11.key` with `0600` permissions, BatchMode SSH to `ubuntu@141.144.193.218` succeeded, deploy preflight showed `deploy-needed`, the default `~/apps/...` remote-dir deploy path failed, and the documented deploy succeeded after using absolute `/home/ubuntu/apps/remote-crawler-v2` plus installing remote build tooling for `better-sqlite3` on Node 24 arm64.
- 2026-05-28 first approved tiny live seed completed: pre-seed health/status/errors/content/deploy proof exited cleanly and deploy proof was current, a fresh bounded `bbc.com` artifact produced 3 candidates, and exactly one unified-launcher live seed ran with `--remote-deploy never`, matching preview evidence, and a compact seed-attempt log. The run completed `bbc.com(3)` in 6.6s.
- 2026-05-28 post-seed evidence captured: post health stayed healthy, recent errors stayed 0, `content --domain bbc.com` showed 3 stored content records, one sync round pulled 5 URLs and 3 content records, local `db:downloads:recent` showed the 3 BBC downloads, and rollback stop left 0 running domains.
- 2026-05-28 residual blocker after first smoke: post-seed deploy preflight reports `blocked-busy` because `bbc.com` retains 1273 pending discovered URLs even though no domain is running. Do not broaden live seeding or deploy while this residual queue state is unresolved.
- 2026-05-28 residual queue closeout pass: bounded read-only status/errors/content evidence reconfirmed `bbc.com` stopped, 0 running domains, 0 recent errors, 3 stored BBC content records, and 1273 pending URLs. The safe decision is queue retention plus no further seed/deploy until an explicit maintenance policy chooses drain/sync/prune.
- 2026-05-28 deploy hardening: `deploy-remote-server.js` now expands home-relative remote dirs safely in the generated remote shell script, so the default `~/apps/remote-crawler-v2` path no longer lands inside a quoted variable as a literal `~`. The remote install script and troubleshooting hints now call out build-tool prerequisites for native dependencies such as `better-sqlite3` on Node 24 arm64.
- 2026-05-28 queue readiness surface: `crawl-remote.js queue-summary` now reads only `/api/status`, `/api/errors`, and `/api/content/stats` to classify running/stopped-pending/no-pending/error states, report bounded per-domain queue/content/error evidence, infer deploy-preflight implications, and name the next safest action.
- 2026-05-28 queue maintenance checklist: `crawl-remote.js queue-checklist` and `queue-summary --maintenance-checklist` now emit a dry-run evidence checklist with sync/local proof plan, rollback stop command, data-loss caveats, and approval tokens separate from graph-feedback live seed approval. No prune/drain/clear/stop/deploy/sync action is executed by these surfaces.
- 2026-05-28 remote operation taxonomy: `classifyRemoteOperation()` now gives queue/deploy prompts a tested classification for read-only, safe stop/stabilize, sync/local proof, destructive maintenance, deploy action, and live crawl behavior. It deliberately treats `pull`/`sync` as sync/local proof rather than pure read-only because prune flags or pending prune ledger state can mutate remote export state.
- 2026-05-28 combined readiness report: `crawl-remote.js readiness-report` is a file-only operator surface that reads saved graph artifact, queue summary, deploy preflight proof, preview evidence, and post-seed checklist JSON files; emits bounded readiness/stale/missing-evidence labels; keeps URLs and full remote payloads out; and performs no remote contact or state change.
- 2026-05-28 maintenance decision artifact: `crawl-remote.js maintenance-decision` is a file-only operator surface that consumes saved readiness/queue evidence, records the intended action (`retain-queue`, `sync-local-proof`, `stop-only`, `prune`, `drain`, `clear`, or `force-deploy`), cites required evidence and approval tokens, and keeps all execution flags false. It does not implement stop/sync/prune/drain/clear/force-deploy execution.
- 2026-05-28 maintenance evidence hardening: maintenance decisions now validate readiness-report vs queue-summary host match, pending-count match, freshness, and deploy-implication drift before any future approved maintenance path. `crawl-remote.js sync-proof-readiness` adds a file-only no-prune sync/local DB proof plan with local confirmation and rollback commands, without running sync or mutating remote state.
- 2026-05-28 dry-run maintenance execution design: `crawl-remote.js maintenance-execution-plan` now consumes saved maintenance-decision, sync-proof-readiness, readiness-report, queue-summary, and deploy-proof JSON; validates freshness, host match, pending-count match, deploy proof state, no-prune sync proof, local DB confirmation, rollback command, and approval-token presence; and emits a future command skeleton while keeping every execution flag false.
- 2026-05-28 deploy proof evidence shape: `deploy-remote-server.js --preflight-only --json` proof now includes `generatedAt`, so combined readiness and maintenance execution planning can distinguish fresh deploy evidence from stale/missing proof.
- 2026-05-28 second-seed readiness gate: `crawl-remote.js second-seed-readiness` now builds a file-only package from saved queue summary, combined readiness report, deploy proof, graph artifact, preview evidence, post-seed checklist, and optional maintenance execution plan. It blocks retained pending queues, running queues, stale/missing evidence, host mismatches, non-current deploy proof, missing preview fingerprint, and tiny-candidate cap overflow while keeping all seed/sync/stop/prune/drain/clear/deploy execution flags false.
- 2026-05-28 deploy proof operator messaging: deploy preflight JSON now includes a compact `operatorMessage` so blocked-busy, needs-local-build, deploy-needed, and current decisions explain the next safe operator interpretation without parsing logs.
- 2026-05-28 monitored small-crawl loop: `tools/crawl/monitored-small-crawl.js` now provides read-only `policy`, `baseline`, `recent`, and `verify` evidence modes for bounded small crawls. It uses DB-owned `downloadEvidence` APIs, records baseline/recent/post-run DB proof, reports no-new-data and failed DB confirmation blockers, and does not start crawlers, contact remote hosts, write DB rows, prune queues, force deploy, or change `collect`.
- 2026-05-28 Cloud Crawl recent evidence: `/api/cloud-crawl/status` now includes a bounded `monitoredSmallCrawl` report and uses its recent samples as a fallback for the visible Recent Downloads list, giving operators a dashboard/API overview of recent crawl volume by host/window.
- 2026-05-28 tiny local monitored-crawl harness: `tools/crawl/monitored-small-crawl.js local-smoke` now plans or executes a strict local UI-backed smoke crawl with one host, page/depth caps, isolated UI port, auto-stop, baseline capture, crawl command evidence, and post-crawl DB verification. `tools/crawl/profiles/local-tiny-monitored-smoke.json` exposes the same one-page target for launcher dry-run visibility.
- 2026-05-28 recent evidence performance and dashboard scanability: upstream `news-crawler-db` recent cloud-crawl evidence now avoids column-side timestamp normalization for mixed SQLite/ISO `fetched_at` rows, bringing the 60-minute `www.bbc.com` proof path under the 30s guard. `monitored-small-crawl` reports bounded DB evidence timings, and the Cloud Crawl health card shows compact recent-crawl readiness/count evidence.
- 2026-05-28 monitored report comparison: `tools/crawl/monitored-small-crawl.js compare` now reads saved monitored/local-smoke reports only, summarizes DB deltas, command/profile identity, no-new-data evidence, DB timing regressions, stable pass/fail evidence, and writes a bounded comparison artifact without starting crawlers or contacting remote hosts. `/api/cloud-crawl/status` now also exposes a compact `monitoredSmallCrawlSummary` and the Cloud Crawl health card includes recent proof timing.
- 2026-05-28 monitored local-smoke exit semantics: a follow-up bounded local-smoke run exposed a no-response/no-content DB persistence failure. The harness now keeps the evidence artifact but returns exit code 2 when `local-smoke --execute` verification has blockers, so automation cannot treat blocked persistence proof as a clean pass.
- 2026-05-28 local watch proof semantics: `run.js --watch` now treats timeout, poll-error, and missing-target outcomes as machine-failing follow-mode results instead of returning the launch exit code. JSON watch final evidence includes whether the local `--watch-min-fetches` guard was met, and local-smoke reports retain bounded stderr/stdout tails plus parsed `watchFinal`. Report comparison now flags URL-only DB deltas, started-without-fetch evidence, stale `latestFetchedAt`, missing recent samples, watch timeout, and unmet watch-min-fetches.
- 2026-05-28 post-fix local-smoke validation: a bounded local-smoke rerun now exits `2` for the no-fetch/no-content proof failure instead of appearing clean. The underlying local persistence issue remains visible and is the next diagnosis target, but automation now sees the run as blocked.
- 2026-05-28 local-smoke proof-path fix: the latest diagnosis showed the crawler did persist responses/content, but local watch proof was querying the wrong evidence window. `LocalBackend.status()` now uses the DB-owned recent download evidence API with an explicit `finishedAt` bound, `run.js --watch` stops cleanly on `--watch-min-fetches` DB proof, and `monitored-small-crawl local-smoke --execute` passed with `verified-new-data`, `responses:+3`, `content:+1`, and `watchFinal.stoppedReason:"min-fetches-met"`.

Next:

- Treat the first tiny live seed as complete but not rollout-ready. The queue summary/checklist/decision/sync-proof/execution-plan/second-seed-readiness surfaces now exist, but any actual prune/drain/clear/force-deploy workflow must remain blocked on explicit maintenance approval, bounded sync/local DB proof, and a separate implementation pass.
- Use the combined readiness report, maintenance decision artifact, sync-proof-readiness artifact, maintenance-execution-plan artifact, and second-seed-readiness artifact as the baseline for second-seed and queue-maintenance readiness; any future execution path for stop/sync/prune/drain/clear/force-deploy must remain separately approved, bounded, and tested.
- Keep future live seeds behind the same approval token, preview fingerprint, seed-attempt log, freshness gates, and post-seed evidence shape. No second live seed should run until the residual queue and deploy default-path issues are understood.
- Continue remote setup/recovery/deploy hardening from real findings: stale/missing remote build metadata, busy pending queues, build toolchain readiness, JSON cleanliness for deploy output, and clean bounded operator evidence.
- Use monitored small crawls as the next default development loop: capture a DB baseline, run only a bounded crawl when readiness is clean, verify new DB rows after the crawl, and review the Cloud Crawl recent evidence before broadening crawler changes.
- Keep extending the tiny local smoke cadence before any remote broadening: run occasional bounded local-smoke executions when useful, compare reports over time, surface no-new-data/partial-data failures clearly, and use the Cloud Crawl dashboard/recent API to track recent crawl volume.
- Continue the local-smoke cadence with occasional bounded executions, saved report comparisons, and Cloud Crawl recent-volume checks. Treat a future URL-only/no-content report as a regression now that the DB evidence window and local watch proof path are fixed.
- Treat remote small crawls as blocked while the retained `bbc.com` pending queue/deploy readiness blocker remains unresolved, unless a future prompt explicitly approves maintenance or a separate remote crawl with clean queue/deploy proof.

Later:

- Broaden full-mode graph-feedback smoke coverage beyond BBC/no-edge hosts when upstream GraphAccess has additional populated-host fixtures.
- Consider UI exposure for the read-only preflight/report artifacts after CLI behavior is stable.
- Consider broader live-seeding profiles only after remote health/recovery/deploy workflows are tested and one small real-seed smoke is explicitly approved and recorded.
- Consider a combined operator report that merges graph readiness, queue/deploy evidence, sync/local proof, second-seed blockers, and monitored-small-crawl DB persistence proof.

## Change Set

First narrow step:

- Add `tools/crawl/lib/graph-feedback-planner.js`.
- Add `tests/tools/crawl/graph-feedback-planner.test.js`.
- Update this session's `WORKING_NOTES.md`.

Later steps:

- Add a small loader that dynamically imports `news-db-analysis` and opens `news-crawler-db` read-only.
- Add a dry-run CLI (`graph-feedback` or a safer extension of `graph-seeds`) that prints bounded recommendations.
- Only after dry-run evidence, integrate seed recommendations into `collect` behind an explicit flag.

Second narrow step:

- Add `tools/crawl/lib/graph-feedback-loader.js`.
- Add `tools/crawl/graph-feedback.js`.
- Register `graph-feedback` in the crawl launcher.
- Add focused tests for loader seams and CLI JSON output.
- Update `tools/crawl/AGENT.md` after the CLI exists.

Next narrow step:

- Add a lightweight/fast graph-feedback mode for populated hosts, or fix the upstream GraphAccess/service queries that make the full all-method bundle too slow.
- Preserve the one-way dependency direction: `copilot-dl-news` consumes `news-db-analysis` and `news-crawler-db`; neither sibling repo imports `copilot-dl-news`.
- Keep live commands read-only and JSON-bounded.

Completed current narrow step:

- Fixed the owning `news-crawler-db` SQLite adapter `query()` path so CTE read queries (`WITH ... SELECT`) use row-returning execution instead of write metadata.
- Added `graph-feedback --fast` in `copilot-dl-news`; fast mode still uses `WebsiteGraphAnalysisService` but calls only `buildCrawlPriorityDataset()` and records skipped summary/hub/orphan/dead-end analyses in bounded JSON diagnostics.
- Left full graph feedback mode intact for later upstream query optimization, and did not alter remote seeding or `collect` behavior.

Next narrow step:

- Optimize the upstream `news-crawler-db` GraphAccess / `news-db-analysis` methods used by full mode, starting with `getSiteGraphSummary()` and orphan/dead-end page queries for large populated hosts.
- Keep fixes in the owning sibling repo and expose them through the existing `WebsiteGraphAnalysisService` boundary; do not add raw SQL in `copilot-dl-news`.

Completed upstream full-mode optimization step:

- Added a no-edge host fast path in `news-crawler-db` `SqliteGraphAccess` for site summary, orphan/dead-end discovery, and hub candidates. This matches populated hosts with many URL rows but no link rows, such as `www.bbc.com` in the local DB.
- Added early page-scope limiting for crawl-priority feature reads when fetched rows are included, keeping bounded dry runs from materializing host-wide response/content/link CTEs.
- Kept `news-db-analysis` unchanged; it benefits through the existing `WebsiteGraphAnalysisService -> db.graph` boundary.
- Verified full-mode `graph-feedback` on `www.bbc.com` under a 30s guard.

Next narrow step:

- Decide how graph feedback recommendations should be surfaced to crawler planning without changing live collect behavior: likely a read-only `--graph-feedback` explanation option on an existing dry-run/planning command, or a small JSON artifact writer with explicit path and limits.
- Keep remote seeding behind a separate future flag after at least two host families have full-mode smoke evidence.

Completed artifact-writer step:

- Added `graph-feedback --out <path>` as an explicit bounded JSON artifact writer. It writes the same dry-run plan that stdout prints, so future crawler planning can consume graph recommendations without starting crawlers or changing `collect`.
- The artifact stays bounded by `--limit` / `--sample-limit` and the planner's hard caps; it does not create graph cache tables or persist DB-derived scores.
- Documented `--out` in `tools/crawl/AGENT.md`.

Next narrow step:

- Add a read-only consumer for the saved graph-feedback artifact in a planning/dry-run command. It should validate `schemaVersion`, host list, and limits, then show how seed candidates would be considered without enqueueing or seeding anything.

Completed artifact-consumer step:

- Added `graph-feedback --from-artifact <path>` as a file-only planning dry run. It validates `schemaVersion`, artifact/requested host lists, planner limits, recommendation bounds, and diagnostic sample bounds.
- Artifact-consumer output shows candidate consideration with explicit non-action policy: no URL enqueue, no remote crawler seeding, and no `collect` behavior changes.
- The artifact path does not open `data/news.db`, import `news-db-analysis`, call `news-crawler-db`, or issue SQL.

Next narrow step:

- Add an optional read-only `--graph-feedback-artifact <path>` explanation field to an existing crawl planning command such as `tools/crawl/run.js --explain`, reusing the artifact validator/consumer and still refusing to seed or enqueue URLs.

Completed run.js explain integration step:

- Added `tools/crawl/run.js --explain --graph-feedback-artifact <path>` to attach a read-only `graphFeedback` block to the normal resolved crawl plan.
- `run.js` validates planned crawl hosts against the saved artifact hosts through the existing graph-feedback artifact consumer and refuses the flag outside `--explain`.
- The output remains planning-only: no URL enqueue, no remote seeding, no `collect` changes, no DB open, and no raw SQL.

Next narrow step:

- Add an optional operator-friendly summary/preview layer for graph-feedback explain output, such as compact candidate counts/reasons in non-JSON `run.js --explain`, or add the same read-only artifact field to a more specific remote dry-run surface. Do not wire candidates into live launch yet.

Completed non-JSON explain summary step:

- Added a compact human summary to non-JSON `tools/crawl/run.js --explain --graph-feedback-artifact <path>` output.
- The summary lists planned hosts, total/host candidate counts, top candidate URLs and reasons, and explicitly states that no URLs are enqueued, no remote crawlers are seeded, and `collect` behavior is unchanged.
- JSON explain output remains the existing resolved plan object with the existing `graphFeedback` field; the human summary is not emitted with `--json`.

Next narrow step:

- Add the same read-only artifact attachment to a more specific remote dry-run/planning surface, or introduce a separate explicit `--use-graph-feedback-seeds` design document for future live seeding without implementing it yet.

Completed unified-launcher remote dry-run step:

- Added a shared file-only graph-feedback artifact explanation helper for planning surfaces.
- Reused it from `tools/crawl/run.js --explain` and from `tools/crawl/index.js` remote `--dry-run` invocations.
- The unified launcher now accepts `--graph-feedback-artifact <path>` only with `--dry-run` remote invocations, validates the remote `--domain`/`--domains` hosts against the artifact, and prints the compact read-only operator summary.
- The remote dry-run path does not call `crawl-remote.js`, open the DB, import sibling repos, enqueue URLs, seed remote crawlers, or change `collect`.

Next continuation pass:

- Audit the remaining crawler planning/dry-run surfaces and profiles for graph-feedback readability, focusing on `profile ... --dry-run`, direct `remote bounded` dry-runs, and `run.js --remote --explain`.
- Add bounded schema/host mismatch examples and negative tests so operators get clear errors when artifact hosts do not match planned crawl hosts.
- Add a concise design note for a future explicit live seed flag, including flag name, safety gates, host/limit caps, rollback behavior, and verification requirements, without implementing live seeding yet.
- Refresh operational docs and command examples so the recommended sequence is artifact generation -> artifact validation -> read-only planner preview.
- Keep all behavior file-only/read-only in artifact consumer paths; no remote seeding, no enqueueing, no `collect` behavior changes, and no raw SQL outside `news-crawler-db`.

Completed hardening/design pass:

- Audited remaining planning surfaces. Safe coverage now includes direct unified-launcher remote dry-runs, remote profile dry-runs, `run.js --remote --explain`, and `graph-feedback --from-artifact`.
- Hardened artifact validation to reject aggregate `recommendationCount` mismatches and recommendation URLs longer than 4096 characters, in addition to existing schema, host, per-host limit, and diagnostic sample bound checks.
- Moved unified-launcher dry-run graph-feedback validation ahead of command printing so invalid artifacts fail without partial operator output.
- Added negative-path tests for host mismatch, missing remote hosts, malformed schema, excessive hard limits, aggregate recommendation mismatch, sample bounds, URL length, non-remote dry-run rejection, and live-path flag rejection.
- Added `FUTURE_LIVE_SEEDING_DESIGN.md` as documentation only. It defines a possible `--use-graph-feedback-seeds` path, safety gates, caps, rollback/disable strategy, and verification commands without implementing live seeding.

Next continuation pass:

- Improve operator ergonomics around artifact generation and preview: add a compact command recipe or helper output that clearly shows the sequence `graph-feedback --out` -> `graph-feedback --from-artifact` -> `run.js --explain` / `index.js --dry-run`.
- Add optional JSON summary fields to dry-run previews if useful, but keep existing JSON machine output stable unless a test documents the field.
- Consider a tiny reusable fixture builder for graph-feedback artifact tests to reduce repeated test setup across `run`, `index`, and `graph-feedback` tests.
- Do not implement live seed behavior yet.

Completed operator-ergonomics pass:

- Added `graph-feedback --from-artifact <path> --domains <host> --recipe` as a file-only recipe mode. It validates the saved artifact and prints bounded JSON containing the safe artifact workflow commands.
- The recipe shows artifact generation, artifact validation, `run.js --explain`, and unified-launcher remote `--dry-run` commands, plus the exact-host caveat.
- Recipe mode does not open the DB, import sibling repos, enqueue URLs, seed remote crawlers, or change `collect`.
- Added a shared test-local graph-feedback artifact fixture helper so run/index/graph-feedback tests use the same artifact shape.
- Documented the safe workflow and exact `bbc.com` / `www.bbc.com` matching behavior in `tools/crawl/AGENT.md`.

Next continuation pass:

- Add a lightweight operational check command or doc snippet that compares planned hosts with artifact hosts before operators spend time generating full artifacts for many hosts.
- Consider extending `graph-feedback --recipe` with a `--profile <name>` preview helper only if it can stay file-only and avoid invoking the launcher.
- Keep recipe output stable JSON; do not add live seed behavior.

Completed profile-host comparison pass:

- Added `graph-feedback --from-artifact <path> --domains <hosts> --compare-hosts` as a file-only host comparison mode.
- The comparison validates the artifact schema/limits/recommendation bounds, then reports artifact hosts, requested/planned hosts, matched hosts, missing hosts, extra artifact hosts, per-host recommendation counts, and the exact-host caveat without requiring host matches.
- Recipe output now includes a `compare-hosts` step before strict artifact validation so operators can catch profile spelling mismatches such as `bbc.com` vs `www.bbc.com`.
- `tools/crawl/AGENT.md` now documents the compare command and calls out that profile dry-runs use the exact `options.domains` spelling from profile JSON.

Next continuation pass:

- Audit and document profile-host extraction ergonomics for common remote profiles, ideally as a file-only recipe or docs table that does not invoke crawlers.
- Add more profile-focused examples for `simple-distributed-smoke`, `remote-bounded-smoke`, and Guardian/BBC profiles, including exact host spelling and expected mismatch behavior.
- Keep all graph-feedback artifact paths read-only and file-only unless explicitly running the live artifact generator; no live seeding, no enqueueing, no `collect` changes.

Completed profile-aware artifact pass:

- Added `tools/crawl/lib/profile-hosts.js` as a file-only crawl profile host extractor. It reads profile JSON directly, extracts `options.domains` / `options.domain` / safe static host fields / static `args` host flags, and reports caveats for hostless profiles.
- Added `graph-feedback --from-artifact <path> --profile <name>` for strict artifact validation using the exact static hosts from the named profile.
- Added `graph-feedback --from-artifact <path> --profile <name> --compare-hosts` for non-failing profile/artifact host comparison.
- Added `graph-feedback --from-artifact <path> --profile <name> --recipe` for profile-aware safe workflow commands: generate exact-host artifact, compare to profile, validate with profile, preview `run.js --explain`, and preview `index.js <profile> --dry-run --graph-feedback-artifact`.
- Added `graph-feedback --profile-summary` for compact file-only compatibility summaries of common remote profiles or explicitly supplied `--profile` names.
- Both explicit `--domains` and `--profile` can be supplied only when their normalized host sets agree exactly; mismatches fail before artifact reads.

Next continuation pass:

- Promote profile-aware graph-feedback output into an operator cheat-sheet or generated low-storage markdown/JSON artifact for common profiles.
- Review whether `run.js --explain` should optionally accept a named profile artifact context without changing launch behavior, or document why unified launcher profile dry-run remains the canonical profile surface.
- Add profile-aware examples for hostless profiles and orchestrator profiles without guessing runtime hosts.
- Keep future live seeding design-only unless explicitly requested.

Completed profile preflight/report pass:

- Added `graph-feedback --profile-preflight --profile <name> [--from-artifact <path>]` as a file-only operator report.
- The report summarizes static profile hosts, optional artifact hosts, host matches/misses, candidate counts, caveats, and recommended next safe commands.
- Added explicit report writing with `--out <path>` for this mode; the output is compact JSON and does not include candidate dumps.
- Expanded profile compatibility coverage to include common remote profiles, orchestrator, e2e, sync/status, and local fallback profiles.
- Hostless profiles report caveats instead of guessed hosts. Orchestrator/e2e profiles with static hosts report exact hosts plus runtime-path caveats.

Next continuation pass:

- Decide whether to add a generated operator cheat-sheet artifact from `--profile-summary` / `--profile-preflight` results, or whether the JSON CLI output is sufficient.
- Audit `run.js --explain` named-profile delegation to document why `tools/crawl/index.js <profile> --dry-run` remains the canonical profile preview path.
- Add any missing examples for multi-profile preflight/report workflows while keeping all output bounded and file-only.
- Keep future live seeding design-only unless explicitly requested.

Completed operator cheat-sheet/report pass:

- Added `graph-feedback --operator-report` as a file-only multi-profile report mode built from the existing profile-summary and profile-preflight data shape.
- Added explicit profile selection via repeated `--profile <name>` and common-profile selection via `--all-common-profiles`; report mode rejects ambiguous profile/common combinations and `--domains` because profile hosts are the source of truth.
- Added `--format json|markdown` for operator reports. JSON remains the default; Markdown can be written with `--out <path>` for a compact cheat sheet. Both formats include profile hosts, hostless/orchestrator/e2e caveats, suggested artifact paths, safe next commands, and optional artifact host-match/candidate-count evidence without candidate dumps.
- Confirmed `tools/crawl/index.js <profile> --dry-run --graph-feedback-artifact <path>` remains the canonical named-profile preview. `run.js --explain` remains the direct URL/host dispatcher preview and does not need profile-specific host extraction.

Next continuation pass:

- Add optional stale-artifact and artifact-size evidence to file-only graph-feedback artifact consumers/reports, without rejecting existing artifacts yet unless a hard safety limit is exceeded.
- Consider a compact per-profile readiness score in operator reports using only current file-only data: static hosts present, artifact supplied, exact host match, candidate count, and caveat count.
- Add focused negative tests for oversized artifacts, invalid timestamps, and stale-report warnings.
- Keep future live seeding design-only unless explicitly requested.

Completed artifact evidence/readiness pass:

- Added file-only artifact evidence for graph-feedback artifact reads: byte size, max supported bytes, `generatedAt` parse validity, reference time, age seconds, stale-warning threshold, and warnings for missing/invalid/future/stale timestamps.
- Added a hard artifact-size cap of 256 KB for graph-feedback artifact consumers, matching the future live-seeding design bound; oversized artifacts are rejected before JSON parsing.
- Threaded artifact evidence into `graph-feedback --from-artifact ... --compare-hosts`, `--profile-preflight`, and `--operator-report` without changing live crawler behavior.
- Added per-profile readiness labels in operator reports and profile preflights: `ready-for-preview`, `needs-artifact`, `host-mismatch`, and `hostless-caveat`.
- Kept `run.js`/`index.js` machine output stable; only their shared file reader now rejects clearly oversized artifacts before validation.

Next continuation pass:

- Add optional low-risk Markdown/JSON report compaction controls if operators need smaller multi-profile reports, such as `--report-max-profiles` or `--report-commands minimal`, while preserving current defaults.
- Consider exposing readiness labels in non-JSON profile preflight output only if a human-readable mode is added; keep JSON stable and documented.
- Audit whether stale-artifact warnings should become a future explicit live-seeding safety gate in `FUTURE_LIVE_SEEDING_DESIGN.md`, without implementing live seeding.
- Keep future live seeding design-only unless explicitly requested.

Completed operator report compaction/design-alignment pass:

- Added opt-in `--report-max-profiles <n>` for `graph-feedback --operator-report`, capped at 25 profiles, with truncation evidence in report output only when the option is used.
- Added opt-in `--report-commands full|minimal|none`; defaults remain full command output, while `minimal` keeps one readiness-specific next command per profile and `none` omits commands for compact reports.
- Improved Markdown report scanability with profile-selection evidence, command-detail mode, explicit readiness-label legend, and omitted-command notes.
- Updated the future live seeding design to treat existing artifact age warnings as the evidence source for a future hard freshness gate, without implementing live seeding.

Next continuation pass:

- Add a concise backlog/status section to this session plan so future recursive prompts draw from an explicit queue instead of implied next-agent suggestions.
- Consider a small human-readable `--profile-preflight` summary only if it stays file-only and does not change JSON output.
- Audit whether operator reports should include a compact aggregate readiness count by label, without candidate URL dumps.
- Keep future live seeding design-only unless explicitly requested.

Completed backlog/readiness/preflight scanability pass:

- Added this `Recursive Backlog Status` section so future recursive prompts continue from explicit Done/Next/Later items.
- Added aggregate readiness evidence to `--operator-report`: readiness counts by label, requested/reported/omitted profile counts, artifact supplied/missing counts, static/hostless counts, exact host matches, matched candidate totals, and caveat totals.
- Added explicit `--preflight-format text` for `--profile-preflight`. JSON remains the default, while text output gives readiness, artifact age/warnings, host match status, candidate count, next safest command, and the non-action policy.

Next continuation pass:

- Build a profile-specific safe workflow checklist command or recipe that ties together artifact generation, preflight text, compact operator report, and canonical profile dry-run.
- Add stale-artifact operator examples and decide whether they belong in `tools/crawl/AGENT.md` only or a durable workflow doc.
- Keep future live seeding design-only unless explicitly requested.

## Risks And Assumptions

- `news-db-analysis` is not currently installed as a direct dependency in `copilot-dl-news`; live integration should use a small resolver/dynamic import or add the dependency intentionally in a later step.
- `WebsiteGraphAnalysisService` is ESM; `copilot-dl-news` crawl tools are CommonJS, so live loading needs dynamic `import()`.
- Existing `git status` is slow on this Windows-mounted repo; use focused file diffs for touched paths.
- Existing `graph-seeds` behavior should remain untouched until the new typed path is proven.

## Tests

First step:

```bash
cd /mnt/c/Users/james/Documents/repos/copilot-dl-news
npm run test:by-path -- tests/tools/crawl/graph-feedback-planner.test.js
```

Follow-up verification:

```bash
cd /mnt/c/Users/james/Documents/repos/news-crawler-db
npm run build
npx vitest run src/db/__tests__/graphAccess.test.ts

cd /mnt/c/Users/james/Documents/repos/copilot-dl-news
npm run test:by-path -- tests/tools/crawl/graph-feedback-planner.test.js tests/tools/crawl/graph-feedback-loader.test.js
timeout 30s node tools/crawl/graph-feedback.js --domains www.bbc.com --limit 1 --sample-limit 1 --out tmp/graph-feedback-bbc-full-smoke.json --json
timeout 30s node tools/crawl/graph-feedback.js --domains www.bbc.com --fast --limit 1 --sample-limit 1 --json
npm run db:downloads:hosts
npm run db:downloads:recent
```

Operational dry-run target for later:

```bash
node tools/crawl/graph-feedback.js --domains bbc.com,theguardian.com --fast --limit 25 --out tmp/graph-feedback-plan.json --json
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains bbc.com --compare-hosts --pretty
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --profile simple-distributed-smoke --compare-hosts --pretty
node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-plan.json --pretty
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains bbc.com --json
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains bbc.com --recipe --pretty
node tools/crawl/graph-feedback.js --profile-summary --profile simple-distributed-smoke --profile remote-bounded-smoke --pretty
node tools/crawl/graph-feedback.js --profile-preflight --profile remote-status --pretty
node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-plan.json --preflight-format text
node tools/crawl/graph-feedback.js --operator-report --all-common-profiles --pretty
node tools/crawl/graph-feedback.js --operator-report --all-common-profiles --report-max-profiles 3 --report-commands minimal --format markdown --out tmp/graph-feedback-operator-report-compact.md
node tools/crawl/graph-feedback.js --operator-report --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-plan.json --format markdown --out tmp/graph-feedback-simple-distributed-smoke-report.md
node tools/crawl/run.js --explain --json --graph-feedback-artifact tmp/graph-feedback-plan.json bbc.com
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-plan.json
node tools/crawl/index.js simple-distributed-smoke --dry-run --graph-feedback-artifact tmp/graph-feedback-plan.json
```

## Docs To Update

- `docs/sessions/SESSIONS_HUB.md`
- This session `PLAN.md` and `WORKING_NOTES.md`
- `tools/crawl/AGENT.md` once a live CLI exists
- Active long-term session notes because this advances LT-001 crawler intelligence
