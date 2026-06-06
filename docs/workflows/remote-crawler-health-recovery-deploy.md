---
type: workflow
id: remote-crawler-health-recovery-deploy
status: active
audience: crawler-operators, agents
tags:
  - crawling
  - remote-crawler
  - deployment
  - recovery
last-reviewed: 2026-05-28
---

# Remote Crawler Health, Recovery, And Deploy

Use this workflow before guarded live seeding or any larger remote crawl when
you need to determine quickly whether the remote crawler is healthy, recover a
broken worker, or deploy a current server package.

## Fast Health Check

Run these commands only when the active task permits real remote contact. For
the graph-feedback real-seed smoke, approval absence means stop at the
dry-run-only approval package and direct local rejection smokes.

```bash
node tools/crawl/crawl-remote.js health --host 141.144.193.218:3200
node tools/crawl/crawl-remote.js status --host 141.144.193.218:3200 --json
npm run crawl -- simple-distributed-smoke --dry-run
npm run crawl -- news-10x1000-15m-e2e --preflight-only
```

Healthy enough for live graph-feedback seeding means:

- `/api/health` responds quickly.
- `/api/status` shows the requested host or can accept `/api/domains/add`.
- The remote build metadata is present and current enough for the local CLI.
- A dry-run profile resolves the exact intended hosts.
- The e2e preflight can inspect health/throttle/status without starting work.

Quick decision points:

- Health fails: do not seed; inspect PM2/logs or deploy only after confirming
  whether active work may be interrupted.
- Health passes but status is stale/missing build metadata: run deploy preflight
  before seeding.
- Status shows active work: stop only with operator approval, or defer live
  seeding.
- Dry-run profile/artifact host mismatch: regenerate the artifact with exact
  host spelling before touching the remote.

## Tiny Real-Seed Approval Package

Do not run a real graph-feedback seed unless the active human prompt contains
the separate line `APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE`. Before asking for
that approval, prepare a dry-run-only package:

```bash
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --graph-feedback-approval-checklist tmp/graph-feedback-bbc-approval-checklist.json --graph-feedback-approval-readiness tmp/graph-feedback-bbc-approval-readiness.json --graph-feedback-post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json
```

Approval preconditions:

- Exactly 1 planned host and at most 3 graph-feedback seed URLs.
- Artifact is fresh, exact-host matched, schema-valid, and under byte caps.
- Preview evidence file exists and fingerprints the artifact/host/count/body.
- Seed-attempt log path is planned for the eventual live command.
- The file-only approval readiness check passes for the checklist and preview
  evidence; it still reports `realSeedAuthorized:false`.
- The approval readiness artifact lists no blockers, includes the required
  pre-seed usability command names, includes the post-seed proof and rollback
  command names, and contains no candidate URL dumps.
- The optional post-seed checklist artifact exists if requested; it records the
  post-seed proof commands and evidence shape only and does not execute them.
- Pre-seed `health`, `status --json`, recent errors, content probe, and deploy
  preflight commands are understood and pass or produce a clear recovery path.
- Rollback command is known: `crawl-remote.js stop --domains <host>`.
- Passing pre-seed proof means each required command exits cleanly within the
  guard. Do not proceed just because a timed-out command wrote parseable JSON;
  a timeout is still a failed proof for live seeding.

The approval checklist is file-only and dry-run-only. It does not authorize a
real seed, contact the fleet, or dump candidate URLs. The readiness helper in
`tools/crawl/lib/graph-feedback-live-seeds.js` validates this package locally
before a human approval request is made, including remote-usability, post-seed,
and rollback proof plans. Prefer writing that readiness artifact directly from
the dry-run package with `--graph-feedback-approval-readiness`.

## Stop And Stabilize

When a remote crawler is stuck, stop work before redeploying unless the operator
has explicitly approved interruption:

```bash
node tools/crawl/crawl-remote.js stop --all --host 141.144.193.218:3200
node tools/crawl/crawl-remote.js status --host 141.144.193.218:3200 --json
node tools/crawl/crawl-remote.js sync --rounds 1 --limit 5 --include-content true --include-links true
```

If status is unavailable, inspect the VM/service directly before using
`--force` deployment:

```bash
ssh ubuntu@141.144.193.218 'pm2 status crawl-server-v4; pm2 logs crawl-server-v4 --lines 80 --nostream'
ssh ubuntu@141.144.193.218 'du -sh ~/apps/remote-crawler-v2/data || true; ls -la ~/apps/remote-crawler-v2'
ssh ubuntu@141.144.193.218 'cat ~/apps/remote-crawler-v2/deploy/remote-crawler-v2/build-info.json 2>/dev/null || true'
```

## Deploy Current Code

Deployment is dry-run by default and preserves remote `data/`.

```bash
node tools/crawl/deploy-remote-server.js --if-needed --apply --quiet-if-current
node tools/crawl/deploy-remote-server.js --preflight-only --json
node tools/crawl/deploy-remote-server.js --build-only
node tools/crawl/deploy-remote-server.js --apply
node tools/crawl/deploy-remote-server.js --apply --force
node tools/crawl/deploy-remote-server.js --if-needed --apply --json
npm run crawl -- remote bounded --domains bbc.com --dry-run --remote-deploy always --remote-deploy-remote-dir /srv/crawler-test --remote-deploy-service crawl-server-v4-test --remote-deploy-status-host worker.example.com --remote-deploy-status-port 4300
```

The unified launcher dry-run prints both the delegated remote crawl command and
the exact deploy preflight command. Use that output to verify status host,
status port, remote directory, service name, and skip-check decisions before
any live launch or deploy.

Use `--force` only after deciding that interrupting active remote work is
acceptable. If deployment itself fails, analyze and improve
`tools/crawl/deploy-remote-server.js`, `tools/crawl/lib/remote-deploy-preflight.js`,
and their tests before retrying a live deploy.
If deploy fails before upload with `Permission denied (publickey)`, do not
retry live seeding. Configure SSH auth through `--ssh-key`,
`REMOTE_CRAWLER_SSH_KEY`, `ssh-agent`, or the operator's `~/.ssh` setup, then
rerun `deploy-remote-server.js --preflight-only --json` and the documented
`--if-needed --apply` path. Treat missing remote build metadata as
`deploy-needed`, not as sufficient proof for live graph-feedback seeding.
Before retrying deploy, a safe readiness check is:
`ssh -o BatchMode=yes -o ConnectTimeout=15 ubuntu@141.144.193.218 true`.
If that fails, stop before deploy and seed commands.
On WSL, OpenSSH may reject Windows-mounted private keys because their
permissions appear too open. Use an OpenSSH-accepted key path, such as a
private copy under `/root/.ssh` or the operator's Linux home with `0600`
permissions, only when the operator has explicitly approved local key handling.

Observed deployment pitfalls from the first tiny graph-feedback seed smoke:

- The deploy CLI now expands home-relative remote dirs safely inside the remote
  shell script. If an older checkout fails archive extraction with a literal
  `~/apps/remote-crawler-v2`, use an absolute path such as
  `--remote-dir /home/ubuntu/apps/remote-crawler-v2` or update this tool before
  retrying.
- On Node 24 arm64, `better-sqlite3` may compile from source because no prebuild
  exists. The remote needs build tooling such as `build-essential`, `make`,
  `g++`, and `python3`; otherwise `npm install` can fail after the service has
  been stopped.
- After a seed smoke, deploy preflight can be `blocked-busy` from pending
  discovered URLs even with zero running domains. Do not redeploy or broaden
  seeding until the pending queue is drained, pruned, or explicitly accepted.
  Stop-only and bounded sync proof are safe first steps; prune/drain is remote
  maintenance and needs explicit operator approval plus local/remote evidence.

Read-only queue readiness:

```bash
node tools/crawl/crawl-remote.js queue-summary --host 141.144.193.218:3200 --domains bbc.com --json
node tools/crawl/crawl-remote.js queue-summary --host 141.144.193.218:3200 --domains bbc.com --maintenance-checklist --json
node tools/crawl/crawl-remote.js queue-checklist --host 141.144.193.218:3200 --domains bbc.com
node tools/crawl/crawl-remote.js readiness-report --queue-summary tmp/queue-summary.json --deploy-proof tmp/deploy-preflight.json --graph-artifact tmp/graph-feedback-bbc-profile.json --preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json --json
node tools/crawl/crawl-remote.js maintenance-decision --readiness-report tmp/readiness-report.json --queue-summary tmp/queue-summary.json --maintenance-action retain-queue --json
node tools/crawl/crawl-remote.js sync-proof-readiness --readiness-report tmp/readiness-report.json --queue-summary tmp/queue-summary.json --json
node tools/crawl/crawl-remote.js maintenance-execution-plan --maintenance-decision tmp/maintenance-decision.json --sync-proof-readiness tmp/sync-proof-readiness.json --readiness-report tmp/readiness-report.json --queue-summary tmp/queue-summary.json --deploy-proof tmp/deploy-preflight.json --maintenance-action sync-local-proof --json
node tools/crawl/crawl-remote.js second-seed-readiness --queue-summary tmp/queue-summary.json --readiness-report tmp/readiness-report.json --deploy-proof tmp/deploy-preflight.json --graph-artifact tmp/graph-feedback-bbc-profile.json --preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json --maintenance-execution-plan tmp/maintenance-execution-plan.json --json
```

`queue-summary` only reads `/api/status`, `/api/errors`, and
`/api/content/stats`. It classifies each reported domain as running,
stopped-with-pending, errors-present, or no-pending; summarizes fetched/done,
pending, error, recent-error, and stored-content counts; and states the inferred
deploy-preflight implication. For the current post-seed state, a stopped domain
with pending URLs should remain `blocked-busy-pending` until a separate
maintenance decision is made.

`queue-checklist` and `queue-summary --maintenance-checklist` are dry-run
planning outputs. They list required evidence before maintenance: current
queue summary, recent errors, content proof, bounded sync/local DB proof plan,
rollback stop command, and deploy preflight. The checklist intentionally uses
separate approvals:

- Queue maintenance token: `APPROVE_REMOTE_QUEUE_MAINTENANCE`.
- Force deploy token: `APPROVE_REMOTE_FORCE_DEPLOY`.

A graph-feedback live seed approval does not authorize prune, drain, clear, or
force deploy. These queue surfaces do not stop crawlers, sync local data, prune,
drain, clear, deploy, force deploy, seed URLs, or change `collect`.

`readiness-report` is a file-only operator report. It reads saved queue summary,
deploy preflight, graph-feedback artifact, preview-evidence, and post-seed
checklist JSON files, then emits a compact readiness label, stale/missing
evidence warnings, preview fingerprint, candidate counts, pending-queue state,
deploy decision, and the next safest action. It deliberately omits candidate
URLs and full remote payloads, and it does not contact the fleet. Use
`--stale-after-min <n>` to adjust the evidence freshness warning threshold.

`maintenance-decision` is the next file-only gate. It consumes a saved
`readiness-report` and optional full `queue-summary`, records the requested
action (`retain-queue`, `sync-local-proof`, `stop-only`, `prune`, `drain`,
`clear`, or `force-deploy`), validates host/pending/freshness/deploy-implication
drift between the readiness report and the full queue summary, names the
required approval token, records whether the token was supplied, and still sets
every execution flag false. A maintenance decision artifact is not an execution
command. It exists to make the approval boundary auditable before any future
stop/sync/prune/drain/clear or force-deploy implementation.

`sync-proof-readiness` is also file-only. Use it when the next safe decision is
to prove what a bounded sync/local DB confirmation would do before any prune,
drain, clear, force deploy, or second seed. It emits the exact no-prune proof
command, local DB confirmation command, rollback stop command, stale/mismatch
blockers, and prune-ledger caveats. It does not run sync, pull, stop, prune,
drain, clear, deploy, seed URLs, or change `collect`.

`maintenance-execution-plan` is the final file-only dry-run step before any
future execution implementation. It consumes saved `maintenance-decision`,
`sync-proof-readiness`, `readiness-report`, `queue-summary`, and deploy proof
evidence. It validates freshness, host match, pending-count match, deploy proof
state, no-prune sync proof, local DB confirmation, rollback stop command, and
approval-token presence, then prints the future command skeleton. Execution is
still deliberately disabled even when an approval token is supplied; this mode
does not run stop, sync, prune, drain, clear, force deploy, seed, or collect.

`second-seed-readiness` is the file-only gate before considering another tiny
graph-feedback live seed. It refuses readiness while queue evidence shows
retained pending URLs, running domains, stale/missing proof, host mismatches,
deploy proof other than `current`, missing preview fingerprint, missing
post-seed checklist, or candidate counts over the tiny caps. It does not
contact the fleet, dump candidate URLs, seed URLs, run sync/local proof, or run
maintenance. Use it after queue/readiness/maintenance execution planning and
before asking for the separate live-seed approval token.

## Remote Operation Classes

Use this table when deciding whether a command can be run during approval-gated
work. The tested source of truth is `classifyRemoteOperation()` in
`tools/crawl/lib/remote-queue-summary.js`.

| Class | Commands / paths | Approval boundary |
| --- | --- | --- |
| Read-only | `health`, `status`, `errors`, `content`, `watch`, `profiles`, `queue-summary`, `queue-checklist`, `readiness-report`, `maintenance-decision`, `sync-proof-readiness`, `maintenance-execution-plan`, `second-seed-readiness` | No remote mutation. Safe for bounded evidence when remote contact is permitted; `readiness-report`, `maintenance-decision`, `sync-proof-readiness`, `maintenance-execution-plan`, and `second-seed-readiness` are file-only. |
| Safe stop/stabilize | `stop` | Mutates running state but does not remove queued URLs. Requires an explicit operator decision when not part of rollback. |
| Sync/local proof | `pull`, `sync`, `graph-seeds` | Writes local proof or reads local graph. `pull`/`sync` can prune under prune flags or pending prune ledger state, so do not treat as pure read-only. |
| Destructive maintenance | `remove`, remote export `prune`, drain/prune/clear decisions | Requires `APPROVE_REMOTE_QUEUE_MAINTENANCE` plus bounded sync/local proof and data-loss caveats. |
| Deploy action | deploy preflight/apply paths | Normal deploy requires clean preflight; `--force` requires `APPROVE_REMOTE_FORCE_DEPLOY` plus fresh busy evidence. |
| Live crawl behavior | `start`, `launch`, `bounded`, `run`, `collect`, `seed`, graph-feedback live seed | Starts or queues remote crawl work. Graph-feedback seeds must use unified launcher gates and their own approval token. |

If a command is not in the taxonomy, classify and test it before using it in a
queue maintenance or deploy workflow.

Deploy troubleshooting decision points:

- Failed health after restart: inspect PM2 logs, confirm `--service`,
  `--remote-dir`, config path, port, and DB path, then rerun preflight.
- Busy-server refusal: keep the refusal unless the operator approves
  interruption; rerun with `--force` only after stop/rollback commands are
  understood.
- Stale or missing build metadata: use `--if-needed --apply` first; use
  `--force-build` when local packaging evidence is stale or ambiguous.
- Wrong remote install path or service name: test with
  `deploy-remote-server.js --remote-dir <path> --service <name> --json` or
  launcher `--remote-deploy-remote-dir <path>` /
  `--remote-deploy-service <name>` dry-run arguments before `--apply`.
- Wrong status endpoint: prove it with launcher
  `--remote-deploy-status-host <host>` / `--remote-deploy-status-port <n>` or
  `--remote-deploy-status-url <url>` before any live launch.
- Deployment CLI/docs mismatch: update this workflow and focused tests before
  retrying against the real fleet.

## Post-Recovery Proof

```bash
node tools/crawl/crawl-remote.js health --host 141.144.193.218:3200
node tools/crawl/crawl-remote.js status --host 141.144.193.218:3200 --json
npm run crawl -- remote-bounded-smoke --dry-run
npm run crawl -- news-10x1000-15m-e2e --preflight-only
```

## Monitored Small Crawls

Use monitored small crawls to accumulate real news data during crawler
development without treating every run as a broad remote rollout:

```bash
node tools/crawl/monitored-small-crawl.js baseline --hosts bbc.com --out tmp/small-crawl-baseline.json --json
node tools/crawl/monitored-small-crawl.js local-smoke --json
node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json
node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report.json --json --out tmp/local-smoke-comparison.json
npm run crawl -- simple-distributed-smoke --dry-run
# Run the bounded crawl only after queue/deploy readiness is clean.
node tools/crawl/monitored-small-crawl.js verify --baseline tmp/small-crawl-baseline.json --since <crawl-start-iso> --until <crawl-end-iso> --hosts bbc.com --expected-min-downloads 1 --json
node tools/crawl/monitored-small-crawl.js recent --hosts bbc.com --window-min 1440 --limit 5 --json
```

The monitor uses DB-owned `downloadEvidence` APIs and is read-only: it does not
start crawlers, contact remote hosts, write local DB rows, prune queues, force
deploy, or change `collect`. The bounded crawl or sync command is the only
place where local DB writes are expected. `local-smoke --execute` is the
strictly bounded local exception for development proof: one host, tiny
page/depth caps, isolated UI port, auto-stop, and immediate DB verification.
It exits nonzero if that verification is blocked, while still writing the
bounded JSON evidence requested with `--out`. The underlying `run.js --watch`
path also exits nonzero on timeout/poll-error/missing-target outcomes, so a
started local job is not enough to count as verified persistence. Local watch
uses DB-owned recent response/content evidence with a bounded time window and
can stop cleanly on `--watch-min-fetches` proof even if the UI job registry
still has stale running-job evidence.
Saved local-smoke reports should be compared with
`monitored-small-crawl compare` so DB deltas, no-new-data regressions,
command/profile identity, partial-persistence diagnostics, and slow proof
timings stay visible across runs.
Recent, verify, and comparison reports include bounded DB evidence timings;
slow timing warnings mean the evidence path should be fixed before trusting a
larger crawl.
The Cloud Crawl dashboard status payload includes the same
`monitoredSmallCrawl` evidence, uses it for Recent Downloads fallback rows, and
shows a compact recent-crawl readiness/count/timing cell in Operator Health.

For graph-feedback live seeding, run the read-only artifact/profile dry-run
first, write preview evidence, then use `--use-graph-feedback-seeds` only on a
small explicit remote start-like command through the unified launcher:

```bash
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json
node tools/crawl/index.js remote bounded --domains bbc.com --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --seed-attempt-log tmp/graph-feedback-bbc-seed-attempts.jsonl
```

Direct `crawl-remote.js` graph-feedback artifact/live-seed flags are rejected by
design. This keeps live seed validation, freshness checks, preview fingerprints,
and seed-attempt logging in one launcher path.

After an approved tiny seed, capture bounded proof:

```bash
timeout 30s node tools/crawl/crawl-remote.js health
timeout 30s node tools/crawl/crawl-remote.js status --json
timeout 30s node tools/crawl/crawl-remote.js errors --limit 10 --json
timeout 30s node tools/crawl/crawl-remote.js content --domain bbc.com --json
timeout 30s node tools/crawl/deploy-remote-server.js --preflight-only --json
timeout 30s node tools/crawl/crawl-remote.js sync --rounds 1 --limit 5 --include-content true --include-links true
npm run db:downloads:recent
```

Store only a compact operator evidence artifact using the post-seed evidence
shape in `tools/crawl/lib/graph-feedback-live-seeds.js`: preview fingerprint,
seed-attempt log path, hosts, candidate/request body counts, each check name,
boolean result, short URL-redacted summary, and rollback status. Do not save
candidate URL dumps or full remote payloads in broad session notes. If any
proof looks unhealthy, stop the target host and return to the recovery workflow
before any further seeding.

Use `--preflight-only --json` for live-seed proof because it reports local and
remote build evidence without building or deploying. If that proof reports
`needs-local-build` or `deploy-needed`, prepare/build/deploy through the normal
deploy workflow before retrying the live seed.

## CLI And Doc Verification

```bash
node --check tools/crawl/deploy-remote-server.js
node --check tools/crawl/lib/remote-deploy-preflight.js
npm run test:by-path -- tests/tools/remote-crawler-deploy.test.js tests/tools/remote-deploy-preflight.test.js
npm run test:by-path -- tests/tools/crawl-index.test.js tests/tools/crawl/graph-feedback-live-seeds.test.js tests/tools/crawl/crawl-remote-graph-feedback-flags.test.js
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --graph-feedback-approval-checklist tmp/graph-feedback-bbc-approval-checklist.json
```

Keep this workflow aligned with `tools/crawl/AGENT.md`,
`docs/sessions/2026-05-26-crawler-graph-feedback-loop/PLAN.md`, and
`docs/sessions/2026-05-26-crawler-graph-feedback-loop/FUTURE_LIVE_SEEDING_DESIGN.md`.
Deploy helper tests should cover failed health, stale local package metadata,
busy-server refusal, `--force` decision points, custom `--remote-dir` /
`--service` target details, and troubleshooting hints without contacting the
real fleet.
