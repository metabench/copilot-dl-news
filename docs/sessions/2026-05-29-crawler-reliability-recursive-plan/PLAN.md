# Plan: Crawler Reliability Recursive Plan

Date: 2026-05-29

## Objective

Identify the concrete work needed to make small and medium crawls reliable to
run, monitor, verify, and improve recursively, without moving crawler work into
the jsgui3 ecosystem coordination repo. Future recursive prompts should cover a
large bundle of work and should run bounded small/medium crawler validations
where the local/remote safety gates allow it.

## Source Of Truth

- `AGENTS.md`
- `tools/crawl/AGENT.md`
- `docs/cli/crawl.md`
- `docs/RUNBOOK.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/PLAN.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md`
- `docs/sessions/2026-05-26-crawler-graph-feedback-loop/NEXT_FEW_DAYS_PLAN.md`
- This session's `CRAWLER_RELIABILITY_RECURSIVE_PLAN.md`
- This session's `CONTINUATION_PROMPT.md`

## Done When

- [x] The active crawler ownership boundary is recorded.
- [x] The reliability target for small and medium crawls is defined.
- [x] Current strong paths and known blockers are identified.
- [x] A prioritized implementation backlog exists.
- [x] A recursive improvement process exists.
- [x] A first continuation prompt exists for the next implementation pass.
- [x] Validation commands and outcomes are recorded in `WORKING_NOTES.md`.
- [x] A first additive no-contact crawl packet and scorecard implementation
  exists for tiny/small/medium local proof runs.
- [x] Tiny local live crawl proof has been run and compared.
- [x] Small local live proof has been attempted, classified, and converted into
  a scored packet.
- [x] Medium local orchestration proof exists at no-contact packet/profile
  dry-run level.
- [x] Partial local launch handling now preserves accepted-job watch evidence
  under bounded `--watch-min-fetches` policy while keeping nonzero launch exit
  behavior.
- [x] Crawl packets can ingest saved launch stdout and watch stderr artifacts
  so launch result, watch timeout, and DB proof failures appear in one scored
  operator packet.
- [x] Crawl packets warn on exact target URLs that already have local DB
  response evidence.
- [x] Small local one-host Reuters proof was rerun with saved launch/watch/DB
  artifacts and classified as a job-observability/no-new-data blocker.
- [x] Clean local launches now preserve accepted launch job IDs in
  `watchFinal.launchJobs`; packets classify accepted jobs that become
  unobservable during watch as `accepted-job-unobservable`.
- [x] Loopback-only fixture packets now distinguish local target contact from
  internet target contact while still warning that live execution writes the
  local DB.
- [x] Deterministic one-host loopback small proof produced nonzero DB response,
  content, and artifact evidence.
- [x] Deterministic three-host loopback medium proof produced nonzero multi-host
  DB response and watch evidence.
- [x] A checked-in `local-fixture-server.js` helper now produces reusable
  tokenized one-host small and three-host medium loopback targets.
- [x] Crawl packets can infer fixture targets with `--fixture-preset`,
  `--fixture-port`, and `--fixture-target-token`.
- [x] Crawl packets include host-level launch/watch/DB proof summaries and
  score missing host coverage as `host-mismatch`.
- [x] Local watch can now require requested-host DB coverage with
  `--watch-min-hosts`, and packets block medium fixture runs that hit global
  fetch count without per-host coverage.
- [x] Medium fixture packets now include a no-contact sequential per-host
  fallback strategy and packet comparison can score concurrent versus
  sequential medium proof artifacts.
- [x] The medium job-ID fixture proof was rerun after partial-launch min-host
  adjustment and then compared against a clean sequential per-host medium
  proof.
- [x] The manual sequential medium proof has been promoted into checked-in
  `tools/crawl/sequential-fixture-proof.js` and
  `tools/crawl/lib/sequential-fixture-proof.js` helpers.
- [x] A fresh sequential medium helper proof passed with composed launch/watch/
  verify/packet/comparison artifacts and per-host DB evidence.
- [x] Sequential helper and packet artifacts now preserve per-target job
  terminal state and warn when DB proof succeeds while accepted jobs still run.
- [x] Optional post-DB-proof terminal wait is implemented for local watch and
  sequential medium helper proofs; a timeout-boundary bug was fixed so DB proof
  is not overwritten by the global watch timeout once terminal wait starts.

## Ownership Boundary

- `copilot-dl-news` owns the current operator workflow, CLI harnesses, local
  smoke evidence, dashboard/operator proof surfaces, and session coordination.
- `news-crawler-backend-core` should own reusable crawler runtime behavior once
  a pattern is proven in the operational repo.
- `news-crawler-db` owns schema, persistence, and DB-owned evidence APIs.
- `news-db-analysis` owns graph and analysis read models consumed by crawler
  planning.
- `coordination-jsgui-ecosystem.code-workspace` is not the crawler workspace and
  should not receive this implementation work.

## Change Set

- Add session plan, working notes, reliability roadmap, and continuation prompt.
- Link this session from the sessions hub and LT-001 working notes.
- Add `tools/crawl/crawl-packet.js` and `tools/crawl/lib/crawl-packet.js`.
- Add focused packet/scorecard tests in
  `tests/tools/crawl/crawl-packet.test.js`.
- Add `local-small-reliability` and `local-medium-reliability` local batch
  profiles for dry-run/profile proof.
- Update `tools/crawl/AGENT.md` with the packet workflow.
- Update `tools/crawl/run.js` so a partially successful local launch can keep
  watching accepted jobs when `--watch-min-fetches` supplies a bounded DB proof
  target, while preserving the failed launch exit status.
- Add saved launch/watch artifact ingestion to the packet scorecard.
- Update `tools/crawl/AGENT.md` with the packet workflow and saved artifact
  workflow.
- Add target freshness, weak content proof, and job-poll observability scoring
  to packets.
- Add checked-in loopback fixture helper, tokenized fixture target support,
  host-level packet proof, host coverage scoring, and fixture helper tests.
- Add local watch host-coverage gating with `--watch-min-hosts`, packet
  propagation of `minHostsMet`, and tests for host-coverage watch blockers.
- Add sequential medium fixture helper command, composed artifact writer, packet
  comparison integration, and helper-focused tests.
- Add per-target terminal-state assertions to sequential helper summaries and
  packet evidence.
- Add optional post-DB-proof terminal wait flags, terminal-wait packet evidence,
  and warning taxonomy for incomplete terminal waits.

## Risks And Mitigations

- Risk: planning duplicates existing graph-feedback and monitored-small-crawl
  work.
  Mitigation: treat the 2026-05-26 graph-feedback plan and LT-001 notes as
  current facts, then route the next pass to implementation of missing proof
  packets and scorecards.
- Risk: a prompt accidentally authorizes remote mutation.
  Mitigation: continuation prompt explicitly separates local bounded crawl
  execution, read-only remote proof, remote live crawl, and destructive remote
  maintenance. Deploy, prune, drain, clear, force deploy, remote seed, and queue
  maintenance remain gated behind exact explicit approval.
- Risk: reliability remains subjective.
  Mitigation: define a crawl packet, pass/fail scorecard, and failure taxonomy
  that every recursive pass must update.
- Risk: future turns only update docs instead of exercising crawler logic.
  Mitigation: the continuation prompt now requires no-contact smokes, a real
  bounded tiny local crawl when not blocked, small local proof, and medium
  orchestration proof as far up the safety ladder as the environment allows.

## Validation Plan

- Targeted Markdown whitespace scan for touched session files.
- `node tools/crawl/monitored-small-crawl.js policy --json`
- `node tools/crawl/monitored-small-crawl.js local-smoke --json`
- `node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json`
- `node tools/crawl/sequential-fixture-proof.js plan --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --json`
- `node tools/crawl/sequential-fixture-proof.js execute --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --artifact-prefix tmp/medium-sequential-live --local-smoke-report tmp/local-smoke-report.json --comparison tmp/local-smoke-comparison.json --json --out tmp/medium-sequential-live-result.json`
- `git diff --check`

## Current Reliability Status

- Tiny local BBC smoke passed on 2026-05-29 with DB proof and stable comparison
  evidence in `tmp/local-smoke-report.json` and
  `tmp/local-smoke-comparison.json`.
- Small two-host BBC/Reuters proof launched both targets, but the bounded watch
  reached timeout with zero fetched rows. DB verification produced
  `verification-blocked` with no new rows for the requested hosts.
- The classified packet
  `tmp/crawl-packet-small-after-partial-watch.json` records launch success,
  `watch-timeout`, `no-new-data`, `partial-persistence`, DB blockers, and score
  16/22 (73%).
- Fresh-target one-host Reuters proof avoided the exact-target freshness warning
  and launched one accepted job, but the watch timed out with zero fetched rows
  and 69 local job poll timeouts. The classified packet
  `tmp/crawl-packet-small-reuters-after-run.json` records score 18/24 (75%),
  blockers `expected-download-count-not-met`,
  `db-success-delta-below-expected`, `watch-timeout`, and
  `job-evidence-unavailable`.
- Small loopback fixture proof passed on 2026-05-29 without remote or internet
  target contact. Artifacts:
  `tmp/small-local-fixture.stdout.json`,
  `tmp/small-local-fixture.stderr.log`,
  `tmp/small-local-fixture-verify.json`, and
  `tmp/crawl-packet-small-fixture-after-run.json`. The run exited 0, reached
  `watchFinal.stoppedReason=min-fetches-met`, produced DB delta 2 URLs, 3
  responses, 3 successful responses, 1 content row, and scored 24/26 (92%).
  Remaining warning: 13 early local job poll timeouts before job evidence became
  available.
- Medium loopback fixture proof passed on 2026-05-29 without remote or internet
  target contact. Artifacts:
  `tmp/medium-local-fixture.stdout.json`,
  `tmp/medium-local-fixture.stderr.log`,
  `tmp/medium-local-fixture-verify.json`, and
  `tmp/crawl-packet-medium-fixture-after-run.json`. The run exited 0, accepted
  3 launch jobs, reached `min-fetches-met`, produced DB delta 3 URLs and 6
  successful responses across 3 loopback hosts, and scored 25/26 (96%).
  Remaining gap: response/byte proof passed but `content` delta was 0 for the
  medium fixture.
- Tokenized small loopback helper proof passed on 2026-05-29 without remote or
  internet target contact. Artifacts:
  `tmp/small-local-fixture-helper-token-baseline.json`,
  `tmp/small-local-fixture-helper-token.stdout.json`,
  `tmp/small-local-fixture-helper-token.stderr.log`,
  `tmp/small-local-fixture-helper-token-verify.json`, and
  `tmp/crawl-packet-small-fixture-helper-token-after-run.json`. It exited 0,
  reached `min-fetches-met`, produced DB delta 1 URL, 3 responses, 3 successes,
  1 content row, and scored 24/26 (92%). Remaining warnings: 11 transient job
  poll errors before proof and the post-run exact target is now already
  processed.
- Tokenized medium loopback helper proof passed launch/watch/DB min-fetch on
  2026-05-29 without remote or internet target contact. Artifacts:
  `tmp/medium-local-fixture-helper-token-baseline.json`,
  `tmp/medium-local-fixture-helper-token.stdout.json`,
  `tmp/medium-local-fixture-helper-token.stderr.log`,
  `tmp/medium-local-fixture-helper-token-verify.json`, and
  `tmp/crawl-packet-medium-fixture-helper-token-after-run.json`. It exited 0,
  accepted 3 launch jobs, reached `min-fetches-met`, and produced DB delta 4
  URLs, 3 responses, 3 successes, and 1 content row. Packet score is 26/28
  (93%) with `host-mismatch`: DB recent evidence attributed rows only to
  `127.0.0.2`, missing `127.0.0.1` and `127.0.0.3`.
- Host-watch small fixture proof passed on 2026-05-29 without remote or
  internet target contact. Artifacts:
  `tmp/small-hostwatch-live-baseline.json`,
  `tmp/small-hostwatch-live-launch.stdout.json`,
  `tmp/small-hostwatch-live-watch.stderr.log`,
  `tmp/small-hostwatch-live-verify.json`, and
  `tmp/crawl-packet-small-hostwatch-live.json`. It exited 0, stopped at
  `min-fetches-and-hosts-met`, produced DB delta 1 URL, 3 responses, 3
  successes, 1 content row, and scored 26/28 (93%). Remaining warnings:
  10 transient job poll errors and post-run exact-target freshness.
- Host-watch medium fixture proof was safely blocked on 2026-05-29 without
  remote or internet target contact. Artifacts:
  `tmp/medium-hostwatch-live-baseline.json`,
  `tmp/medium-hostwatch-live-launch.stdout.json`,
  `tmp/medium-hostwatch-live-watch.stderr.log`,
  `tmp/medium-hostwatch-live-verify.json`, and
  `tmp/crawl-packet-medium-hostwatch-live.json`. It accepted 3 launch jobs and
  reached global min fetches, but watch exited 2 with
  `local-host-coverage-not-met`: DB evidence covered only `127.0.0.1`, missing
  `127.0.0.2` and `127.0.0.3`. Packet score 23/28 (82%) and classification:
  `blocked` / `watch-host-coverage-not-met` / `host-mismatch`.
- Job-ID fixture proof pass on 2026-05-29 removed retry-created duplicate
  operation jobs from packet-generated local fixture launches by adding
  `--batch-retries 0 --batch-request-timeout-ms 60000` and a job-ID watch
  status path. Small passed again with
  `tmp/crawl-packet-small-jobid-live.json` at 26/28 (93%). Medium produced a
  clearer blocker in `tmp/crawl-packet-medium-jobid-live.json`: no duplicate
  jobs, but launch accepted only `127.0.0.1` and `127.0.0.2`, failed
  `127.0.0.3` with `read ECONNRESET`, and DB proof remained single-host
  (`127.0.0.1`). Packet score 20/28 (71%), primary `partial-launch`, taxonomy
  `partial-launch`, `host-mismatch`, and `runtime-error`.
- Medium job-ID rerun after partial-launch min-host adjustment used
  `medium-jobid-rerun-20260529-1` on `127.0.0.1:41952`,
  `127.0.0.2:41952`, and `127.0.0.3:41952`. The watch correctly adjusted
  min-hosts from 3 to the two accepted jobs, but the run still blocked:
  `127.0.0.3` failed launch with `read ECONNRESET`, `127.0.0.2` accepted but
  produced no DB rows, and only `127.0.0.1` had recent DB evidence. Packet:
  `tmp/crawl-packet-medium-jobid-rerun.json`, score 20/28 (71%), label
  `blocked`, primary `partial-launch`.
- Sequential medium fixture proof used `medium-sequential-live-20260529-1` on
  `127.0.0.1:41953`, `127.0.0.2:41953`, and `127.0.0.3:41953`. It launched
  and watched one host at a time, exited 0, produced DB delta 4 URLs, 9
  responses, 9 successes, and 3 content rows, and verified recent DB evidence
  for all three hosts. Packet: `tmp/crawl-packet-medium-sequential-live.json`,
  score 26/28 (93%), label `ready-for-medium-local`; warnings are transient
  job poll errors and post-run exact target freshness.
- Packet comparison
  `tmp/medium-concurrent-vs-sequential-comparison.json` shows sequential as the
  best packet: concurrent blocked at 71%, sequential passed at 93%, score delta
  +22 points, and DB host coverage delta +2.
- Sequential medium helper proof used token
  `medium-seq-helper-live-20260529-1` on `127.0.0.1:41966`,
  `127.0.0.2:41966`, and `127.0.0.3:41966`. It ran through
  `tools/crawl/sequential-fixture-proof.js execute`, exited 0, produced DB
  delta 3 URLs, 9 responses, 9 successes, 0 failed responses, and 3 content
  rows, and verified recent DB evidence for all three hosts. Packet:
  `tmp/medium-sequential-helper-live-packet.json`, score 26/28 (93%), label
  `ready-for-medium-local`; comparison
  `tmp/medium-sequential-helper-live-comparison.json` selected the helper
  packet over blocked concurrent `tmp/crawl-packet-medium-jobid-rerun.json`
  with score delta +22 and DB host coverage delta +2.
- Terminal-state sequential helper proof used token
  `medium-terminal-live-20260529-1` on `127.0.0.1:41972`,
  `127.0.0.2:41972`, and `127.0.0.3:41972`. It ran through
  `tools/crawl/sequential-fixture-proof.js execute`, exited 0, produced DB
  delta 3 URLs, 9 responses, 9 successes, 0 failed responses, and 3 content
  rows, and verified recent DB evidence for all three hosts. Packet:
  `tmp/medium-sequential-terminal-live-packet.json`, score 26/28 (93%), label
  `ready-for-medium-local`; taxonomy includes `poll-error`,
  `job-still-running-after-db-proof`, and `target-already-processed`.
  Per-target evidence shows all three accepted operation jobs still reported
  `running` when DB proof stopped.
- Terminal-wait sequential helper proof used token
  `medium-terminal-wait-fixed-20260530-1` on `127.0.0.1:41986`,
  `127.0.0.2:41986`, and `127.0.0.3:41986` with
  `--wait-for-terminal --terminal-wait-timeout 15`. It exited 0, produced DB
  delta 3 URLs, 9 responses, 9 successes, 0 failed responses, and 3 content
  rows, and verified recent DB evidence for all three hosts. Packet:
  `tmp/medium-sequential-terminal-wait-fixed-packet.json`, score 26/28 (93%),
  label `ready-for-medium-local`; taxonomy includes `poll-error`,
  `job-still-running-after-db-proof`,
  `job-terminal-wait-after-db-proof-incomplete`, and
  `target-already-processed`.

## Backlog

- Improve local job endpoint responsiveness during active crawls so watch
  evidence does not rely on repeated timeout samples.
- Diagnose why concurrent local medium fixture launch still drops/fails hosts
  while sequential per-host launch proves every host.
- Improve terminal-wait job evidence so accepted job IDs become terminal or
  explicitly unavailable instead of timing out under active crawler load.
- Investigate why accepted local operation jobs against Reuters can produce no
  DB rows before the bounded watch timeout while loopback fixtures do produce
  rows.
- Investigate medium loopback host attribution: launch accepted all hosts, but
  DB recent evidence remains single-host under per-host watch gating; latest
  blocked host-watch proof attributed only `127.0.0.1`.
- Inspect why medium local launch creates more active operation jobs than the
  three accepted launch jobs, then decide whether the fixture strategy or local
  operation runner needs a one-job-per-host terminal guarantee.
- Add packet/preflight warnings for weak exact target classes beyond already
  processed URLs.
- Rerun the small local proof with saved launch, watch, verify, and packet
  artifacts after choosing a content-quality target.
- Add tests for medium-live gating beyond the current host/content packet
  coverage.
- Add cadence comparison between successive tiny/small packets.
- Surface latest packet score, primary blocker, and next safe command in the
  Cloud Crawl operator view.
- Keep remote queue/deploy checks separated by read-only approval and mutation
  approval classes.
- Promote proven reusable runtime or DB evidence changes to the owner repos
  only after the operational path is stable.

---

### 2026-05-30 status � terminal-wait job-poll responsiveness

- DONE (code + 99 focused tests): `--watch-terminal-job-poll-timeout` (default
  5000ms, clamp 1500-5000) raises the per-poll `/jobs/:jobId` budget during
  terminal wait so the in-process crawl cannot starve the cheap job route;
  3-state classifier `classifyTerminalWaitOutcome` (terminal/timed-out/
  endpoint-unavailable) + packet sub-taxonomy
  `job-terminal-wait-timed-out` / `job-terminal-wait-endpoint-unavailable`.
- BLOCKED: fresh live `--wait-for-terminal` sequential medium proof � sibling
  `news-crawler-db` better-sqlite3 native binary rejected as "not a valid
  Win32 application" by the spawned crawl process (copilot-dl-news has no local
  better-sqlite3). Requires approved install/rebuild. Next node:
  `resolve_better_sqlite3_env_and_run_terminal_wait_proof`.

### 2026-05-30 status -- parallel local runner scheduling trace (read-only)

- DONE (spec-only, no code change): traced the basic article crawl parallel
  local runner path: `src/cli/crawl/runner.js` -> `runMultiModalCrawl()` ->
  `MultiModalCrawlManager` worker-pool (default `maxParallel=30`, tail-
  recursive `runNext()` chains joined by `Promise.all`). Key finding: the
  better-sqlite3 handle is opened ONCE at the boundary and INJECTED into every
  parallel domain orchestrator via the `createOrchestrator` closure, so the
  local fan-out already implements Option B of
  `SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md` -- it does NOT re-open the DB per
  runner and does NOT recur the server-side per-operation synchronous-boot
  starvation. Residual single-handle in-process serialization is bounded/benign.
  No local harness change warranted. See WORKING_NOTES dated section.
- 2026-05-30: Node `inspect_accepted_job_no_db_rows_for_127_0_0_2` complete.
  Forensics of token `medium-jobid-rerun-20260529-1` show `127.0.0.2` was
  accepted-too-late-to-prove (job `createdAt 20:15:37`, ~38s after host1) — its
  queued `/start` waited behind host1's synchronous boot, leaving too little of
  the watch window to commit rows. Same synchronous-boot root as the host3
  ECONNRESET; one server-side accept-before-boot (Option A+B) fixes both. No
  local harness change warranted. See WORKING_NOTES + SERVERSIDE spec addendum.
- 2026-05-30: Node `rerun_small_fixture_cadence` complete. Produced a FRESH
  bounded loopback small packet (token `small-cadence-20260530-224344`,
  `127.0.0.1:41901`) -> `ready-for-small-local` 96% (27/28), taxonomy
  `[target-already-processed]` only (`jobPollErrors=0`). Re-fed the no-contact
  cadence comparison: fresh small 96% vs saved medium 93% =>
  `cadenceConsistent:false`, `poll-error` only in medium. Benign/expected
  divergence (medium's `poll-error` is the synchronous-boot job-registry
  timeout, not a small regression); the refresh surfaced it honestly. Loopback
  only, no contact. See WORKING_NOTES "Fresh Small Rung Cadence Refresh".
- 2026-05-30: Node `add_packet_cadence_compare_for_small_medium` complete.
  Added a no-contact `--json` `cadence` mode to `tools/crawl/crawl-packet.js`
  (`buildPacketCadenceComparison` in `lib/crawl-packet.js`) contrasting a SMALL
  vs a MEDIUM packet on score, DB delta, host coverage, label, and taxonomy.
  Artifact `tmp/small-vs-medium-cadence-comparison.json` over saved
  `tmp/crawl-packet-small-jobid-live.json` vs
  `tmp/medium-sequential-terminalcap-packet.json`: both 93%, shared taxonomy,
  `cadenceConsistent: true`, deltas db +6/+6, hosts +2. 4 new tests -> 106
  passing. Saved small packet reused; no live crawl needed. Next active node
  `rerun_small_fixture_cadence`.


- 2026-05-30 node `add_dashboard_packet_comparison_card` (read-only, no-contact):
  added a compact dashboard "card" renderer over the small-vs-medium cadence
  comparison. New `crawl-packet.js` `card` mode + `--html` flag +
  `--cadence` option; lib gained `buildPacketComparisonCard` /
  `renderPacketComparisonCardText` / `renderPacketComparisonCardHtml` (no
  `<script>`, HTML-escaped). Rendered DIVERGENT against fresh small 96% vs
  medium 93% (`tmp/small-vs-medium-card.json` / `.html`). Also applied the
  brainstorm conclusion: a non-fatal `--max-lines` growth guard in
  `validate-continuation-state.js` that flags the pending state-split node.
  +4 tests -> 110 passing. Next active node
  `decide_fresh_internet_small_target_policy`.

- 2026-05-31 node `rerun_internet_small_crawl_to_sample_db_after_isolation_fix`
  (operator-approved internet crawl, writer isolated): PROVED writer DB
  isolation end-to-end. Bounded BBC crawl via `run.js --crawl-db
  data/samples/internet-small-sample.db` grew the sample DB (delta content +6,
  responses +16, urls +5150) while production `data/news.db` stayed exactly
  unchanged (delta 0/0/0). Leak ledger CLOSED for small rung. Confirmed the
  meter/watch-gate read the wrong DB under `--crawl-db` (reports `fetched=0`).
  Operator added the AGENTIC SCALED-CRAWL MONITORING directive: build progress
  monitoring, then methodically run 1000-download -> larger internet crawls to
  sample DBs, each isolation-proven, production GATED. New pending ladder
  inserted: `design_agentic_crawl_progress_monitor_for_scaled_runs` ->
  `run_internet_1000_download_crawl_to_sample_db_with_agentic_monitoring` ->
  `run_internet_medium_crawl_to_sample_db` ->
  `define_scaling_crawl_size_ladder_1k_5k_25k_gated_on_tooling`. 115 tests pass.
  Next active node `design_agentic_crawl_progress_monitor_for_scaled_runs`.