# Next Few Days Plan: Crawler Graph Feedback And Remote Readiness

Date: 2026-05-28

## Purpose

Use this plan as the multi-day source of truth for bundled recursive prompts on
the crawler graph-feedback, remote crawler readiness, deploy, queue maintenance,
and operator-proof workflow. Future prompts should reference this file together
with `PLAN.md` `Recursive Backlog Status`.

The immediate objective is not only another live seed. The objective is to turn
the first successful tiny graph-feedback seed into a reliable crawler
improvement loop: read-only evidence, explicit maintenance gates, deploy
readiness, bounded live seeding, sync/local proof, monitored small crawls that
persist real news data, and operator-facing verification.

## Prompt Bundling Policy

Future recursive prompts should intentionally combine a larger workload:

- Bundle roughly 8-12 related implementation/documentation/verification items
  per turn, not 1-3 narrow items.
- Each returned prompt must tell the next agent to do the same breadth again.
- Each returned prompt must reference this file and `PLAN.md` as planning
  sources.
- Each returned prompt should include implementation, tests, docs, operational
  smokes, verification, and session-note updates in one pass when safe.
- Live seeds, prune/drain/clear, force deploys, or other destructive remote
  maintenance still require explicit approval tokens or plain human approval in
  the active prompt.
- If approval is absent, agents should still make progress on local tooling,
  tests, docs, read-only reports, dry-run workflows, and no-contact verification.

## Current State

Completed:

- Read-only graph-feedback planning, artifact, profile, report, preflight, and
  workflow surfaces are implemented.
- Guarded live seed path exists behind `--use-graph-feedback-seeds`, preview
  fingerprint evidence, freshness gates, host/candidate/request caps, and
  seed-attempt logs.
- First tiny approved real seed succeeded on 2026-05-28: `bbc.com`, 3
  graph-feedback URLs, current remote build, sync proof, and local recent DB
  proof.
- Deploy path was hardened after the smoke: default home-relative remote dir is
  expanded safely; native build-tool warnings/hints exist for
  `better-sqlite3`/Node 24 arm64 failures.
- Queue readiness now has read-only CLI coverage: `crawl-remote.js
  queue-summary` classifies retained/running/clean/error queue states from
  status/errors/content evidence, and `queue-checklist` emits a dry-run
  maintenance evidence checklist with separate maintenance/force-deploy
  approvals.
- Remote operation classification is now tested in
  `tools/crawl/lib/remote-queue-summary.js`, covering read-only proof,
  safe stop/stabilize, sync/local proof, destructive maintenance, deploy
  action, and live crawl behavior.
- Combined readiness reporting now has file-only CLI coverage:
  `crawl-remote.js readiness-report` reads saved graph artifact, queue summary,
  deploy proof, preview evidence, and post-seed checklist JSON files; reports
  stale/missing evidence; and omits candidate URLs/full remote payloads.
- Queue maintenance decisions now have file-only CLI coverage:
  `crawl-remote.js maintenance-decision` records intended action, approval
  token requirements, readiness blockers, affected hosts/pending counts, and
  proof commands without executing remote maintenance.
- Maintenance evidence is now stricter: decisions compare current
  queue-summary evidence to the combined readiness report for host spelling,
  pending-count, freshness, and deploy-implication drift. `crawl-remote.js
  sync-proof-readiness` produces the file-only no-prune sync/local DB proof
  plan before any destructive maintenance or second seed.
- Dry-run maintenance execution design now has file-only CLI coverage:
  `crawl-remote.js maintenance-execution-plan` validates maintenance-decision,
  sync-proof-readiness, readiness-report, queue-summary, and deploy-proof
  evidence; checks no-prune/local-DB/rollback proof requirements; records
  approval-token presence; and emits future command skeletons while execution
  remains disabled.
- Second-seed readiness now has file-only CLI coverage:
  `crawl-remote.js second-seed-readiness` combines saved graph artifact, queue
  summary, deploy proof, preview evidence, post-seed checklist, combined
  readiness report, and optional maintenance execution plan into one bounded
  blocker list. It refuses readiness while retained pending queues, non-current
  deploy proof, host mismatches, missing preview fingerprint, stale/missing
  evidence, or tiny-seed cap overflow remain unresolved.
- Monitored small-crawl evidence now has CLI and dashboard coverage:
  `tools/crawl/monitored-small-crawl.js` captures DB baselines, recent
  host/window download evidence, and post-crawl verification reports through
  DB-owned `downloadEvidence` APIs. The Cloud Crawl dashboard status payload
  exposes `monitoredSmallCrawl` and uses bounded recent samples as the visible
  Recent Downloads fallback.
- Tiny local monitored-crawl execution now has a dedicated harness:
  `tools/crawl/monitored-small-crawl.js local-smoke` plans or executes a
  one-host, page/depth-capped local UI-backed crawl on an isolated port,
  records baseline -> command -> DB verification evidence, and auto-stops the
  local run. `tools/crawl/profiles/local-tiny-monitored-smoke.json` makes the
  same target visible to launcher dry-runs.
- Local-smoke watch proof now uses DB-owned recent download evidence with a
  bounded `startedAt`/`finishedAt` window. The latest bounded execution exited
  cleanly from `--watch-min-fetches` DB proof and verified response/content
  persistence, so the previous URL-only local-smoke failure is resolved as a
  proof-path issue rather than a broad collector change.

Current blocker:

- Remote `bbc.com` is stopped with 0 running domains and 0 recent errors, but
  retains 1273 pending discovered URLs. Deploy preflight correctly reports
  `blocked-busy`.
- Queue retention is the safe default. Prune/drain/clear/force deploys require
  explicit maintenance approval and bounded sync/local proof.

## Day 1: Queue Readiness And Maintenance Design

Goal: make residual remote queue state legible and safe to act on.

Status: initial implementation complete. Future turns should use the combined
operator report, maintenance decision, sync-proof readiness, and maintenance
execution plan as the baseline for explicit approved maintenance execution
paths only if the human supplies separate maintenance approval.

Workload:

- Audit `crawl-remote.js` commands and remote API endpoints for status, errors,
  content, sync/pull, stop, prune, drain, and any pending URL visibility.
- Classify operations as read-only, safe stop/stabilize, sync/local proof,
  destructive maintenance, or live crawl behavior.
- Add a bounded read-only queue summary command/report if the current CLI lacks
  one, preferably JSON-first with a compact human mode.
- Include per-domain state, running flag, fetched/done/errors/pending,
  content counts, last activity where available, deploy-preflight readiness
  implications, and recommended next safe action.
- Add tests for stopped-with-pending, running-with-pending, no-pending,
  errors-present, host-not-found, malformed status, and bounded output.
- Document that retained pending URLs block deploy/live seed by default even
  when no worker is running.
- Do not prune/drain/clear in this phase without explicit approval.

Verification:

- Focused CLI tests.
- A bounded read-only queue summary smoke against the remote, only if the active
  prompt permits read-only remote contact.
- Direct graph-feedback remote flag rejection.
- Raw SQL/driver boundary scan.
- Diff and whitespace checks.

## Day 2: Explicit Queue Maintenance Gates

Goal: make destructive or semi-destructive queue actions deliberate, reversible
where possible, and auditable.

Workload:

- Design maintenance approval tokens or flags for prune/drain/clear/force deploy
  decisions. Keep these separate from live-seed approval.
- Reuse the tested remote operation taxonomy so future prompts do not treat
  `pull`/`sync` as pure read-only when prune flags or pending prune ledger state
  could mutate remote export state.
- Add a dry-run maintenance checklist/report that requires: current status,
  sync/pull proof plan, local DB confirmation plan, rollback/stop command,
  affected hosts, pending counts, and data-loss caveats.
- Use the file-only `maintenance-execution-plan` as the current execution
  skeleton. Any eventual maintenance command must refuse to run unless approval
  is present and bounded evidence files are supplied.
- Add tests proving no maintenance action runs from read-only summary/checklist
  surfaces.
- Update remote recovery docs with retain vs sync/drain vs prune decision
  points.

Verification:

- Focused tests for approval/missing-approval paths.
- No-contact checklist smoke.
- Optional read-only remote smoke only if permitted.
- No destructive remote command unless explicitly approved.

## Day 3: Deploy Reliability And Preflight Quality

Goal: keep deploy preflight useful and reduce operational ambiguity before
future seeds or crawls.

Workload:

- Review deploy JSON output cleanliness. Ensure `--json` deploy/preflight
  results can be parsed cleanly even when remote commands print setup logs, or
  document a bounded extraction pattern if not safe to fix now.
- Strengthen build-tool preflight evidence if useful: remote Node/npm version,
  native tool availability, remote build metadata, and dependency install risk.
- Add tests for home-relative paths, absolute paths, native tool hints, missing
  remote build metadata, busy pending queues, wrong service/dir/status target,
  and failed health after restart.
- Consider a deploy `--diagnose-only`/`--requirements-only` path if it can stay
  read-only and bounded.
- Keep `--force` gated by explicit human approval plus fresh busy evidence.

Verification:

- Deploy helper tests.
- Local deploy preflight smoke.
- Bounded remote deploy preflight only if active prompt permits remote contact.
- No force deploy.

## Day 4: Second Tiny Seed Readiness, Not Rollout

Goal: prepare the next seed candidate only after queue/deploy readiness is clean.

Workload:

- Use the implemented second-seed readiness package as the default second-seed
  gate, and keep extending it rather than adding ad hoc approval scripts.
- Support a new candidate host only after exact host/artifact/preflight evidence
  is ready. Keep caps tiny unless explicitly changed: max 1 host, max 3 URLs.
- Add readiness output that cites queue summary, deploy proof, preview
  fingerprint, seed-attempt log path, post-seed checklist, and rollback plan.
- If approval is absent, stop at dry-run package and docs/tests.
- If approval is present but queue/deploy proof is unhealthy, do not seed.
- If approval is present and all gates pass, run exactly one tiny live seed and
  capture bounded evidence.

Verification:

- Dry-run readiness smoke.
- Direct rejection smoke.
- Real seed only with explicit approval and clean queue/deploy proof.

## Day 5: Monitored Small Crawls And DB Persistence

Goal: use tiny, bounded crawls to accumulate real news data while proving the
CLI actually crawls and saves to `data/news.db`.

Workload:

- Keep improving `monitored-small-crawl` baseline/recent/verify outputs so
  every small crawl has a pre-crawl DB baseline, command/profile label, time
  window, host filter, success/error counts, bounded recent samples, and
  post-run DB persistence proof.
- Compare saved local-smoke reports across runs so DB deltas, command/profile
  identity, no-new-data regressions, slow proof timings, and stable pass/fail
  evidence become part of the normal crawler-development cadence.
- Prefer local or existing documented smoke profiles until remote queue/deploy
  readiness is clean. Remote small crawls must inspect queue/deploy readiness
  first and must not treat retained `bbc.com` queue state as broad crawl
  approval.
- Make CLI reliability visible: parseable JSON, clean exits, actionable timeout
  errors, DB evidence query timings, no-new-data warnings, and failed DB
  confirmation blockers. `local-smoke --execute` should fail automation when
  verification is blocked, while still preserving its evidence artifact.
  `run.js --watch` should fail automation on timeout/poll-error/missing-target
  outcomes.
- Keep local-smoke comparison diagnostics active for regressions. URL-only
  deltas, started-without-fetch evidence, stale latest fetch times, missing
  samples, and watch timeout/min-fetch failures should stay visible across
  runs even though the current proof-path bug is fixed.
- Surface recent crawl volume in operator UI: Cloud Crawl should show recent
  downloads by host/window, a recent-crawl health/readiness cell, and the API
  should expose the same bounded summary including recent proof timings.
- Add tests for successful evidence shape, no-new-data, DB-unavailable,
  malformed evidence, bounded samples, and no destructive side effects.
- Run one bounded monitored crawl only when the active prompt proves it is
  safe; otherwise run baseline/recent/verify dry-run/read-only smokes.
- Use the tiny local `local-smoke` harness as the first monitored execution
  path. Keep remote monitored crawls blocked by retained queue/deploy evidence
  unless a future prompt explicitly scopes and approves the remote action.

Verification:

- Focused tests.
- `monitored-small-crawl policy/baseline/recent/verify` smokes.
- Profile dry-run preview plus DB recent overview.
- Bounded actual small crawl only if queue/deploy/local runtime evidence is
  safe and the prompt explicitly scopes it.
- Optional read-only remote queue smoke if permitted.
- Session/LT notes and recursive prompt updated.

## Day 6: Broader Crawler Improvement Packaging

Goal: convert the operational loop into reusable crawler improvement surfaces.

Workload:

- Promote successful patterns into `tools/crawl/AGENT.md`,
  `docs/workflows/remote-crawler-health-recovery-deploy.md`, and any new
  queue-maintenance workflow doc.
- Consider a compact operator dashboard/report command that combines graph
  artifact readiness, queue readiness, deploy readiness, sync proof, and
  monitored-small-crawl DB evidence.
- Add fixtures and tests so future agents can improve crawler behavior without
  contacting the real fleet.
- Identify which future UI/LT-001 work should expose these reports.
- Decide whether the next track is broader graph-feedback live seeding, remote
  maintenance automation, deploy UX, monitored small crawls, or UI operator
  integration.

Verification:

- Focused tests.
- End-to-end no-contact workflow smoke.
- Optional read-only remote smoke if permitted.
- Session/LT notes and recursive prompt updated.

## Approval Gates

Separate approvals should be used for separate classes of action:

- `APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE`: at most one tiny live graph-feedback
  seed when queue/deploy/readiness proof is clean.
- Queue maintenance approval: required before prune, drain, clear, or any action
  that removes/changes pending remote state.
- Force deploy approval: required before `--force` or any deploy that interrupts
  busy/retained work.

Prompts should be explicit about which approval is present. A seed approval does
not imply queue maintenance approval or force deploy approval.

## Recurring Verification Matrix

Use this matrix in bundled turns, scaling down only when a file is untouched:

- `node --check` for touched JS and tests.
- Focused Jest suites under `tests/tools/`.
- Raw SQL/driver scan over graph-feedback/planning/deploy files.
- Direct `crawl-remote.js` graph-feedback flag rejection.
- No-contact dry-run/checklist/report smoke.
- Bounded read-only remote evidence smoke only when allowed.
- No destructive remote maintenance without approval.
- `git diff --check`.
- Trailing-whitespace scan for touched tracked and untracked files.

## Backlog For Future Bundled Prompts

- Explicit approved queue maintenance execution design beyond file-only decisions.
- Pending queue policy docs and tests.
- Sync/local proof execution gate after file-only readiness.
- Deploy JSON cleanliness.
- Remote native toolchain/readiness preflight.
- Second tiny seed readiness package.
- Sync/local DB proof hardening.
- Monitored small-crawl baseline/recent/verify workflow.
- Dashboard recent crawl volume and health summaries.
- Combined readiness report adoption in second-seed/maintenance prompts.
- UI/LT-001 handoff for crawler intelligence.
- Broader multi-host live-seeding rollout design after two clean tiny smokes.
