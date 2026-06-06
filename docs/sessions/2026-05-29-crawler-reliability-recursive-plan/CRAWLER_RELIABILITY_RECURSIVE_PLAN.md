# Crawler Reliability Recursive Plan

Date: 2026-05-29

## Target Outcome

The crawler should be boring to operate for small and medium crawls:

- an operator can choose a profile and see exactly what will run;
- preflight reports show whether the run is safe, stale, blocked, or likely to
  no-op;
- launch and watch commands terminate with truthful exit codes;
- status exposes active hosts, throughput, pending work, errors, and last useful
  fetch evidence;
- sync and DB proof confirm what was downloaded and persisted;
- failures classify themselves into a small remediation set;
- every run leaves a bounded artifact packet that can be compared with previous
  runs.

For this track, "small" means one to three hosts and enough pages to prove real
response/content persistence. "Medium" means a bounded multi-host run large
enough to exercise scheduling, queue behavior, sync, monitoring, and DB evidence
without becoming a long unattended production crawl.

The recursive process must not become paperwork-only. Every implementation pass
should run real bounded crawls where the current safety gates allow it. If live
remote work is blocked or not approved, the pass should still run local small
crawls or at least local crawler planning/proof commands, then explain exactly
which safety gate prevented broader crawling.

## Recursive Workload Scale

Future continuation prompts should intentionally cover a large bundle of work,
not a single tiny fix. A normal pass should aim to complete 10-16 connected
items across these categories:

- inspect current helper/report/profile code;
- implement or tighten one reliability mechanism;
- add focused tests;
- run no-contact planning smokes;
- run a bounded local small crawl when the local environment allows it;
- run a bounded medium crawl or medium dry-run/profile proof when the small
  crawl proof is clean;
- run read-only remote checks only when explicitly permitted;
- classify every failure with the shared taxonomy;
- update dashboard/operator requirements if the evidence shape changes;
- update session docs and the next continuation prompt.

If a pass cannot run a real crawl, it must record the exact blocker: missing
dependencies, unsafe dirty state, occupied ports, DB lock, failed preflight,
remote queue/deploy blocker, missing approval, or another concrete cause.

## Crawl Execution Ladder

Use this ladder on every recursive pass:

1. **No-contact planning proof**
   Run `monitored-small-crawl policy`, `monitored-small-crawl local-smoke`, and
   any packet/profile dry-runs needed to prove what would run.

2. **Tiny local live crawl**
   Run `monitored-small-crawl local-smoke --execute` when local execution is not
   blocked. This is the default real-crawl proof for development turns because
   it starts one capped local crawl, auto-stops, and verifies DB persistence.

3. **Small local crawl**
   After tiny proof is clean, run or add a 1-3 host local profile with tight
   page/depth/time caps. It must use watch semantics and DB proof, not just
   process start evidence.

4. **Medium local or remote-readiness proof**
   After small proof is clean, exercise orchestration with a 3-5 host profile,
   explicit concurrency, bounded watch budget, and DB proof plan. If remote
   contact is not approved, this can be a local medium crawl or a no-contact
   packet/dry-run that proves the medium command shape.

5. **Small remote crawl**
   Only when read-only remote status, queue summary, deploy proof, and approval
   are clean. It must include sync/local DB proof.

6. **Medium remote crawl**
   Only after small remote proof is clean. It must remain bounded by hosts,
   pages, runtime, concurrency, sync limits, and artifact size.

The ladder is progressive, but it is not a reason to stop early. If a lower rung
passes quickly and the next rung is safe, continue upward in the same pass.

## Ownership Routing

- `copilot-dl-news`: operator CLI, profiles, dashboard/status views, session
  artifacts, local smoke harnesses, remote proof workflows, and first practical
  implementation of crawler reliability workflows.
- `news-crawler-backend-core`: reusable crawler runtime improvements after the
  operator repo proves the behavior.
- `news-crawler-db`: DB-owned evidence APIs, persistence checks, schema, and
  download/content proof queries.
- `news-db-analysis`: graph and site-analysis signals used as read-only crawler
  planning inputs.
- `coordination-jsgui-ecosystem.code-workspace`: no crawler implementation.

## Current Reliable Assets

- `npm run crawl -- <profile>` and `tools/crawl/run.js` are the unified entry
  points for local/remote crawl execution.
- Watch mode now has stricter timeout, poll-error, missing-target, and local
  DB-owned min-fetch semantics.
- Local watch mode now supports `--watch-min-hosts`, so fixture proofs can
  require DB evidence for every requested loopback host instead of accepting a
  global fetch count from one host.
- Local partial-launch watch handling can continue watching accepted local jobs
  under a bounded `--watch-min-fetches` policy while preserving nonzero launch
  failure.
- Local job watch evidence records unavailable job-registry polls and final
  `jobPollErrors`, so slow `/api/v1/crawl/jobs` behavior is visible in
  artifacts.
- `tools/crawl/monitored-small-crawl.js` provides no-action policy, baseline,
  recent, verify, compare, cadence, and tiny local smoke modes.
- `tools/crawl/crawl-packet.js` now provides a no-contact crawl reliability
  packet and scorecard for `tiny-local`, `small-local`, and `medium-local`.
  It records intent, preflight command, watched launch command, DB proof plan,
  queue/deploy boundary, failure taxonomy, score, and next safe action. It can
  attach saved local-smoke, verify, launch, and watch artifacts so failed live
  attempts become scored artifacts. It also checks local DB exact-target
  freshness, flags weak content proof, summarizes host-level launch/watch/DB
  evidence, and warns on missing host coverage.
- `tools/crawl/local-fixture-server.js` provides checked-in loopback fixture
  plans and servers for one-host small and three-host medium local proofs.
  `--target-token` creates fresh deterministic fixture URLs for repeated proof
  runs without internet target contact.
- Medium fixture packets now include a no-contact sequential per-host fallback
  strategy, and `crawl-packet.js compare` can compare concurrent versus
  sequential packet artifacts without raw log reading or crawler contact.
- Local watch and the sequential medium helper now support optional
  post-DB-proof terminal waits. Incomplete terminal waits are warning evidence
  for job endpoint responsiveness, not blockers, when DB proof and host
  coverage pass.
- `local-small-reliability` and `local-medium-reliability` profiles now provide
  bounded local dry-run targets for small and medium proof steps.
- Graph-feedback planning has read-only artifacts, profile preflight, operator
  reports, approval-readiness artifacts, and guarded live seeding behind
  explicit flags.
- Remote readiness has queue summary, queue checklist, readiness report,
  maintenance decision, sync-proof readiness, maintenance execution plan, and
  second-seed readiness surfaces.
- The Cloud Crawl dashboard exposes monitored small-crawl evidence and recent
  download samples.

## Known Blockers And Gaps

1. Remote queue/deploy state is not yet a smooth operator path. Retained pending
   URLs can correctly block deploy, but the ordinary "what next?" path still
   needs a concise scored packet and operator decision flow.
2. A standard crawl packet artifact exists, but it is not yet mandatory across
   all small and medium run paths.
3. Medium crawl profiles need a reliability ladder distinct from the strict
   15-minute e2e harness and the tiny local smoke.
4. Failure causes need a single taxonomy used by CLI output, artifacts, tests,
   dashboard cards, and recursive prompts.
5. The monitored small-crawl loop proves a tiny path, but cadence/trend evidence
   needs to become a first-class scorecard.
6. Remote read-only checks, local smokes, live remote starts, sync/pull, deploy,
   and queue maintenance need to remain visibly separate operation classes.
7. Dashboard/operator surfaces should show "next safe action" and proof quality,
   not just raw status.
8. Reusable runtime fixes should be promoted deliberately; the operational repo
   should not silently accumulate permanent backend ownership.
9. Small local fresh-target Reuters proof avoided the exact-target freshness
   warning and launched cleanly, but produced no DB rows before watch timeout.
10. Local job-registry endpoint responsiveness can still be poor while crawls
    are active. Reuters had 69 job poll timeouts and no final job evidence;
    the one-host loopback fixture had 13 early poll timeouts before job
    evidence became available; the three-host loopback fixture had 0 poll
    errors.
11. Loopback fixture proofs now validate local orchestration without internet
    target contact. The checked-in fixture helper produced a tokenized one-host
    small proof with response/content proof and a tokenized three-host medium
    proof with clean launch/watch and DB min-fetch proof.
12. Default medium targets include exact URLs that already have local DB
    response evidence (`bbc.com` and `apnews.com`), so an internet-target live
    medium run needs a fresh target set first.
13. DB snapshot evidence can be slow on this machine, but the latest tiny proof
    snapshot stayed under the 5000ms warning line. Keep timing in the packet
    scorecard before larger cadence runs.
14. Tokenized medium loopback proof exposed a host-attribution gap: all three
    fixture targets launched and watch reached `min-fetches-met`, but DB recent
    evidence was attributed only to `127.0.0.2`. Packets now surface this as
    `host-mismatch` and host-coverage warning.
15. Host-watch medium loopback proof confirms this is an orchestration/host
    coverage blocker, not just packet wording: with `--watch-min-hosts 3`, the
    run accepted all three launch jobs and fetched rows, but DB evidence covered
    only `127.0.0.1`; watch exited `local-host-coverage-not-met` and the packet
    blocked with `watch-host-coverage-not-met`.
16. Concurrent medium fixture launch remains blocked even after partial-launch
    min-host adjustment: it can accept a subset of hosts and still persist only
    one accepted host. Sequential per-host medium fixture proof is currently the
    repeatable medium local rung: it passed all three loopback hosts with DB
    proof and packet comparison selected it over concurrent launch.
17. Optional terminal wait after DB proof is proven but currently incomplete:
    `tmp/medium-sequential-terminal-wait-fixed-packet.json` passed DB and host
    proof at 26/28, while the terminal wait ended with job evidence unavailable
    for all three accepted jobs. The next reliability gap is job endpoint
    responsiveness during active crawls.

## Crawl Packet Contract

Every reliable small or medium crawl should produce one directory or JSON bundle
with these sections:

- `intent`: profile, hosts, page/depth limits, local/remote mode, approval
  tokens supplied, and expected minimum downloads.
- `preflight`: command explain output, queue/deploy readiness, graph artifact
  status when used, DB baseline, and no-contact safety classification.
- `launch`: exact command, start time, process id or remote run identity,
  launcher version/build metadata, and output tail.
- `watch`: terminal state, elapsed time, throughput samples, timeout/poll-error
  flags, missing target flags, min-fetch evidence, and per-host coverage fields
  (`minHosts`, `minHostsMet`, `coveredHosts`, `missingLocalTargets`) for local
  fixture proofs.
- `sync`: remote sync/pull command and no-prune/prune behavior when relevant.
- `dbProof`: recent download/content counts by host, baseline deltas, latest
  fetch timestamps, sample ids or URLs bounded/redacted where needed, and query
  timing.
- `queueAfter`: pending/done/error/running state after the run.
- `classification`: pass/fail label, primary failure cause, secondary symptoms,
  and next safe action.
- `comparison`: delta from previous packet or cadence baseline.

## Failure Taxonomy

Use these labels consistently:

- `ready`: preflight and prior state allow the requested run.
- `blocked-busy`: queue or deploy proof says the remote is busy or retained
  pending work blocks deploy.
- `approval-missing`: live crawl, deploy, force deploy, prune, drain, clear, or
  queue maintenance was requested without explicit approval.
- `no-new-data`: command ran, but DB proof found no new response/content rows.
- `partial-persistence`: URLs or job starts changed, but response/content proof
  is missing or stale.
- `watch-timeout`: watch budget expired before terminal state or min-fetch
  proof.
- `poll-error`: status/watch could not reliably poll the backend.
- `accepted-job-unobservable`: launch accepted a local job, but the watch could
  not obtain live job endpoint evidence before timing out.
- `target-already-processed`: selected exact URLs already have local DB response
  evidence and are likely to no-op under tight caps.
- `weak-content-proof`: DB proof exists but is zero-byte, robots-only, or
  otherwise too thin to unlock broader crawl scope.
- `missing-target`: status did not include requested hosts/domains.
- `stale-proof`: readiness artifact, queue evidence, deploy proof, graph
  artifact, or DB baseline is outside its freshness budget.
- `host-mismatch`: profile, artifact, queue proof, or DB proof uses a different
  exact host spelling.
- `watch-host-coverage-not-met`: local watch reached its fetch threshold or
  became stable before DB evidence covered the required requested hosts.
- `job-still-running-after-db-proof`: DB proof succeeded while accepted local
  operation jobs still reported non-terminal states.
- `job-terminal-wait-after-db-proof-incomplete`: optional terminal wait after
  DB proof expired or could not obtain terminal job evidence.
- `sync-unproven`: remote work may have happened, but local DB proof is missing.
- `runtime-error`: crawler process, server, dependency, or deploy command failed.

## Priority Workstreams

1. **Crawl packet generator**
   Landed first additive version plus launch/watch artifact ingestion, fixture
   target inference, and host-level launch/watch/DB rows. Continue by adding
   cadence packet comparison and dashboard surfacing.

2. **Scorecard and comparison**
   Landed separated launch result, watch result, DB proof, and smoke evidence
   categories plus target freshness, weak content proof, and host coverage
   scoring. Continue by turning host-level blockers into operator
   recommendations.

3. **Small local cadence**
   Tiny local smoke passed with DB proof. Small two-host proof is blocked by
   `watch-timeout`/`no-new-data`; one-host Reuters proof also blocked with
   `watch-timeout`, `no-new-data`, and `job-evidence-unavailable`. A one-host
   loopback fixture passed with nonzero response/content proof and captured
   launch/watch/verify/packet artifacts. The reusable fixture helper now exists;
   next work should compare repeated tokenized fixture packets and decide when
   an internet target is worth approving.

4. **Remote readiness closeout**
   Make the retained pending queue path produce a compact decision packet:
   retain, sync/local-proof, stop-only, prune, drain, clear, or force-deploy,
   with approval requirements and stale-evidence checks.

5. **Small remote crawl profile**
   Define a default one-host or two-host remote profile that can be run only
   after queue/deploy readiness is clean, then prove sync and DB persistence.

6. **Medium crawl profile**
   A three-host loopback fixture passed with explicit concurrency, watch
   budget, launch/watch artifacts, and DB response proof, but host attribution
   was partial in the tokenized helper run. Continue by diagnosing whether this
   is crawler scheduling, host normalization, or DB evidence attribution before
   approving internet-target medium live work. Latest job-ID proof removed
   retry-created duplicate launch jobs but concurrent medium still blocks on
   `partial-launch` plus single-host DB proof. The current safe medium rung is
   the sequential per-host loopback fixture proof plus packet comparison.

7. **Dashboard operator card**
   Show the latest packet score, primary blocker, recent downloads, query
   timing, queue state, and next safe command.

8. **Reusable promotion audit**
   After proof stabilizes, identify what should move to
   `news-crawler-backend-core` or `news-crawler-db` and what should remain an
   operator tool in `copilot-dl-news`.

## Recursive Improvement Loop

Every continuation turn should:

1. Read this session, the LT-001 plan/notes, and the graph-feedback next-days
   plan.
2. Select a large but bounded bundle of reliability work across crawl packet,
   scorecard, tests, docs, and actual crawl validation.
3. Produce or update a crawl packet artifact or contract.
4. Run the crawl execution ladder as far as the current safety gates allow,
   including real small/medium crawls where possible.
5. Classify failures with the shared taxonomy.
6. Implement the smallest code/docs/test changes that improve the next packet
   and make the next crawl more reliable.
7. Add or update focused tests.
8. Update session notes, scorecard status, and ownership routing.
9. Write the next continuation prompt to file and display the same full
   recursive prompt in the assistant's final chat output as a visible, copyable
   Markdown block. The chat output is the required handoff location; the saved
   file is persistence, not a substitute. The prompt must again require a broad
   bundle and crawl execution where safe.

If live remote work is not explicitly approved, the pass must still make
progress through local smokes, no-contact packet generation, file-only reports,
tests, docs, and read-only local DB evidence.

## Initial Recursive Nodes

- `define_crawl_packet_artifact_contract`
- `add_no_contact_crawl_packet_command_or_contract`
- `add_packet_scorecard_tests`
- `run_monitored_small_policy_and_plan_smoke`
- `run_tiny_local_crawl_execute_if_not_blocked`
- `run_local_small_cadence_if_safe`
- `run_medium_profile_orchestration_proof_if_safe`
- `classify_local_smoke_results`
- `close_remote_queue_readiness_decision_packet`
- `define_small_remote_profile_gate`
- `define_medium_profile_gate`
- `update_dashboard_packet_requirements`
- `run_checks`
- `update_session_and_continuation_prompt`

## Checks For The Next Implementation Pass

Default no-network checks:

```bash
node tools/crawl/monitored-small-crawl.js policy --json
node tools/crawl/monitored-small-crawl.js local-smoke --json
node tools/crawl/crawl-packet.js plan --fixture-preset small --fixture-target-token small-YYYYMMDD-HHMM --local-smoke-report tmp/local-smoke-report.json --json
node tools/crawl/crawl-packet.js plan --fixture-preset medium --fixture-target-token medium-YYYYMMDD-HHMM --local-smoke-report tmp/local-smoke-report.json --json
node tools/crawl/crawl-packet.js compare --packet tmp/crawl-packet-medium-concurrent.json --packet tmp/crawl-packet-medium-sequential.json --json
node tools/crawl/sequential-fixture-proof.js plan --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --json
node tools/crawl/crawl-packet.js compare --packet tmp/crawl-packet-medium-jobid-rerun.json --packet tmp/medium-sequential-terminal-live-packet.json --json
node tools/crawl/sequential-fixture-proof.js plan --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --wait-for-terminal --terminal-wait-timeout 15 --json
npm run test:by-path -- tests/tools/crawl/run.test.js tests/tools/crawl/crawl-backend.test.js
git diff --check
```

Bounded local live crawl checks expected when the local environment allows DB
writes and a local crawler process can be started:

```bash
node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json
node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report.json --json --out tmp/local-smoke-comparison.json
node tools/crawl/crawl-packet.js plan --crawl-class small-local --local-smoke-report tmp/local-smoke-report.json --verification-report tmp/small-local-verify.json --launch-report tmp/small-local-launch.json --watch-log tmp/small-local-watch.log --json --out tmp/crawl-packet-small-after-run.json
node tools/crawl/sequential-fixture-proof.js execute --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --artifact-prefix tmp/medium-sequential-live --local-smoke-report tmp/local-smoke-report.json --comparison tmp/local-smoke-comparison.json --json --out tmp/medium-sequential-live-result.json
node tools/crawl/sequential-fixture-proof.js execute --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --artifact-prefix tmp/medium-sequential-terminal-wait --local-smoke-report tmp/local-smoke-report.json --comparison tmp/local-smoke-comparison.json --wait-for-terminal --terminal-wait-timeout 15 --json --out tmp/medium-sequential-terminal-wait-result.json
```

If a medium profile/packet command exists after the implementation pass, run
the safest bounded medium proof available. Prefer local execution first; use
remote only when the active prompt explicitly approves remote contact and the
readiness gates are clean.

Only with explicit approval for remote contact:

```bash
node tools/crawl/crawl-remote.js status --json
node tools/crawl/crawl-remote.js queue-summary --domains bbc.com --json
```

Only with explicit approval for remote mutation:

```bash
# Use a prompt-specific command. Do not infer approval from this plan.
```

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

- DONE (read-only trace, spec-only, 2026-05-30): parallel local runner
  scheduling for the basic article crawl traced end-to-end. `runner.js` ->
  `runMultiModalCrawl()` -> `MultiModalCrawlManager` worker-pool (default
  `maxParallel=30`; tail-recursive `runNext()` chains joined by `Promise.all`).
  Key finding: the better-sqlite3 handle is opened ONCE at the boundary and
  injected into every parallel orchestrator (`createOrchestrator` closure), so
  the local fan-out already implements Option B of the server-side spec and does
  NOT recur the per-operation synchronous-boot starvation. No local change
  warranted. Node `inspect_basic_article_crawl_parallel_local_runner_scheduling`
  complete; next active node `inspect_accepted_job_no_db_rows_for_127_0_0_2`.
- Node `inspect_accepted_job_no_db_rows_for_127_0_0_2` complete: `127.0.0.2`'s
  accepted-but-no-rows is a ~38s late start (queued `/start` behind host1's
  synchronous boot under `--batch-concurrency 2`), not a crash. Same
  synchronous-boot root as the host3 ECONNRESET; one server-side
  accept-before-boot fix resolves both. Spec-only finding. Next active node
  `add_packet_cadence_compare_for_small_medium`.
- Node `add_packet_cadence_compare_for_small_medium` complete: shipped the
  read-only `crawl-packet.js cadence` comparison (small vs medium) with deltas,
  taxonomy diff, and `cadenceConsistent`. Next active node
  `rerun_small_fixture_cadence`.
- Node `rerun_small_fixture_cadence` complete: produced a FRESH bounded loopback
  small packet (token `small-cadence-20260530-224344`) scoring
  `ready-for-small-local` 96% (27/28, `jobPollErrors=0`, taxonomy
  `[target-already-processed]`) and re-fed the cadence comparison. Fresh small
  96% vs saved medium 93% => `cadenceConsistent:false` with `poll-error` only in
  medium -- a benign, expected divergence (the synchronous-boot job-registry
  timeout), surfaced honestly by refreshing the small rung. Loopback only, no
  contact. Next active node `add_dashboard_packet_comparison_card`.
- Node `add_packet_cadence_compare_for_small_medium` complete: added a bounded,
  no-contact, `--json` `cadence` mode (`buildPacketCadenceComparison`) that
  contrasts a SMALL vs a MEDIUM packet on score, DB delta, host coverage,
  label, and taxonomy, emitting `tmp/small-vs-medium-cadence-comparison.json`
  (both 93%, shared taxonomy, `cadenceConsistent: true`, deltas db +6/+6,
  hosts +2). 4 new focused tests -> 106 passing. Read-only over saved packets;
  no live crawl. Next active node `rerun_small_fixture_cadence`.


- 2026-05-30 `add_dashboard_packet_comparison_card` (read-only): compact
  comparison "card" renderer (`card` CLI mode + `--html` + `--cadence`;
  `buildPacketComparisonCard` and text/HTML renderers, no `<script>`).
  DIVERGENT verdict against fresh small 96% vs medium 93%. Brainstorm
  conclusion applied: `--max-lines` growth guard in the continuation-state
  validator. +4 tests -> 110 passing. Next active node
  `decide_fresh_internet_small_target_policy`.