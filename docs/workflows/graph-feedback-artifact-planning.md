---
type: workflow
id: graph-feedback-artifact-planning
status: active
audience: crawler-operators, agents
tags:
  - crawling
  - graph-feedback
  - planning
last-reviewed: 2026-05-28
---

# Graph Feedback Artifact Planning

Use this workflow when graph-derived recommendations should inform crawler
planning previews without changing live crawler behavior.

Current implementation status lives in
`docs/sessions/2026-05-26-crawler-graph-feedback-loop/PLAN.md`, especially the
`Recursive Backlog Status` section. Implementation evidence and verification
history live in that session's `WORKING_NOTES.md`. Guarded live seeding status
and remaining safety design live in `FUTURE_LIVE_SEEDING_DESIGN.md`. Strategic
context is tracked in
`docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md`.

## Safety Boundary

- Artifact generation may open `news-crawler-db` read-only through sibling repo
  APIs and `WebsiteGraphAnalysisService`.
- Artifact/profile/report/preflight/workflow consumer modes are file-only. They
  read profile JSON and optional bounded artifacts only.
- Artifact/profile/report/preflight/workflow consumer commands do not enqueue
  URLs, seed remote crawlers, open DBs, import sibling repos, invoke crawlers,
  or change `collect`.
- Host matching is exact. `bbc.com` and `www.bbc.com` are different planned
  hosts.
- Stale artifacts warn in read-only preview/report modes. Hard freshness
  rejection applies to explicit live seeding only.

## Profile Workflow

For a named profile, start with the checklist command:

```bash
node tools/crawl/graph-feedback.js --profile-workflow --profile simple-distributed-smoke --workflow-format markdown
```

With an existing artifact:

```bash
node tools/crawl/graph-feedback.js --profile-workflow --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-profile.json --workflow-format markdown
```

The checklist ties together:

- exact profile host summary
- bounded artifact generation with exact profile hosts
- artifact/profile host comparison
- strict artifact validation
- `--profile-preflight --preflight-format text`
- compact `--operator-report --report-commands minimal`
- canonical `tools/crawl/index.js <profile> --dry-run --graph-feedback-artifact <path>`

`--recipe` and `--profile-workflow` intentionally stay separate:

- `--from-artifact ... --recipe` is the compact artifact-derived command recipe
  for quick copy/paste previews.
- `--profile-workflow --profile <name>` is the complete profile-specific
  operator checklist, including preflight text, compact operator report, stale
  evidence, references, and canonical profile dry-run preview.

A small sample output is kept in
`docs/workflows/graph-feedback-profile-workflow-sample.md`.

## Copy/Paste Sequence

```bash
node tools/crawl/graph-feedback.js --profile-summary --profile simple-distributed-smoke --pretty
node tools/crawl/graph-feedback.js --domains bbc.com --limit 25 --sample-limit 5 --out tmp/graph-feedback-simple-distributed-smoke.json --json
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-simple-distributed-smoke.json --profile simple-distributed-smoke --compare-hosts --pretty
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-simple-distributed-smoke.json --profile simple-distributed-smoke --json
node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-simple-distributed-smoke.json --preflight-format text
node tools/crawl/graph-feedback.js --operator-report --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-simple-distributed-smoke.json --report-commands minimal --format markdown --out tmp/graph-feedback-simple-distributed-smoke-report.md
node tools/crawl/index.js simple-distributed-smoke --dry-run --graph-feedback-artifact tmp/graph-feedback-simple-distributed-smoke.json
```

The dry-run is the final preview step. It does not start crawlers or seed remote
systems.

## Stale Artifact Check

To intentionally exercise stale warning behavior, generate an artifact with an
old timestamp:

```bash
node tools/crawl/graph-feedback.js --domains bbc.com --limit 1 --sample-limit 1 --generated-at 2026-05-01T00:00:00.000Z --out tmp/graph-feedback-bbc-stale.json --json
node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-stale.json --generated-at 2026-05-26T12:00:00.000Z --preflight-format text
node tools/crawl/graph-feedback.js --operator-report --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-stale.json --generated-at 2026-05-26T12:00:00.000Z --report-commands minimal --format markdown
```

Both commands should warn that the artifact is older than the configured
warning window and still remain read-only. They should not reject solely for
staleness unless future live seeding is explicitly implemented with a freshness
gate.

## Guarded Live Seeding Queue

The first guarded live-seeding slice is available only through the unified
launcher and only with an explicit opt-in flag:

```bash
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --graph-feedback-approval-checklist tmp/graph-feedback-bbc-approval-checklist.json --graph-feedback-approval-readiness tmp/graph-feedback-bbc-approval-readiness.json --graph-feedback-post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json
node tools/crawl/index.js remote bounded --domains bbc.com --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --seed-attempt-log tmp/graph-feedback-bbc-seed-attempts.jsonl
```

The dry-run form previews the exact `--seed-urls-by-domain` argument without
contacting the fleet. Add `--graph-feedback-preview-evidence <path>` to write a
bounded fingerprint file with artifact/host/count/body evidence and no
candidate URL dump. Add `--graph-feedback-approval-checklist <path>` only on
the dry-run command to write a bounded real-remote approval package. That
package is not authorization: it records max 1 host, max 3 URLs, 30s guard,
preview evidence, seed-attempt log path, health/status/errors/content/deploy
preflight commands, rollback stop command, and the explicit approval line
`APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE`. Add
`--graph-feedback-approval-readiness <path>` on the same dry-run to write a
bounded local readiness object for the checklist and preview evidence. This
readiness object is the compact approval-review artifact: it reports blockers,
planned host/candidate counts, seed-attempt log path, required pre-seed
usability command names, post-seed proof command names, rollback command names,
and the dry-run-only/no-action policy without candidate URL dumps.
Add `--graph-feedback-post-seed-checklist <path>` on the same dry-run when a
separate compact JSON artifact is useful for the post-seed command/evidence
shape. It writes the plan only; it does not run remote health/status/sync
commands.
Supplying the same evidence path on the live command is required: the launcher
verifies that the live seed plan still matches the preview before deploy
preflight or remote delegation. Add `--seed-attempt-log <path>` on live
commands to append compact JSONL evidence with redacted delegated command data.

The live form validates artifact schema, exact hosts, recommendation/sample
bounds, URL length, artifact freshness, max 5 hosts, max 10 candidates per
host, max 25 URLs total, and max 128 KB seed request body before delegating to
the existing remote start path. `collect`, status, sync, drain/hostless,
non-remote, stale-artifact, `www.` seed-domain keys, direct `crawl-remote.js`
graph-feedback flags, and pre-seeded invocations are rejected in this slice.

Before live use, verify the remote crawler with
`docs/workflows/remote-crawler-health-recovery-deploy.md`.

No real remote seed smoke should be run from this workflow unless the operator
adds the explicit approval line in the active prompt and the approval checklist
is ready for human approval. Stale artifacts are warnings in read-only
previews/reports, but explicit live seeding rejects stale, future, missing, or
invalid `generatedAt` evidence before delegation. After an approved smoke, use
the post-seed verification evidence shape from
`tools/crawl/lib/graph-feedback-live-seeds.js` rather than saving raw command
payloads: preview fingerprint, seed-attempt log path, hosts, check booleans,
short URL-redacted summaries, and rollback status. Before asking for approval,
agents can use `buildLiveSeedApprovalReadiness()` from the same helper to
file-only validate the approval checklist, preview evidence, caps, pre-seed
usability proof, post-seed verification plan, rollback plan, no-action policy,
and optional post-seed evidence shape; this does not contact the fleet or
authorize a real seed. Prefer the launcher-written
`--graph-feedback-approval-readiness` artifact over an ad hoc helper script.
The first approved real-smoke attempt did not send a seed because several
pre-seed proof commands timed out under the 30 second guard. Treat timed-out
proof commands as failed proof even when they wrote parseable JSON; harden the
remote proof path before retrying.
The deploy proof command is now `deploy-remote-server.js --preflight-only
--json`, which reports local/remote build readiness without building or
deploying. Use the normal deploy workflow if that proof reports stale local
package evidence or a remote deploy requirement.
The latest approved retry proved that the remote read-only proof commands exit
cleanly, but the live seed is still blocked until remote build metadata is
current. The concrete deploy blocker was SSH authentication for
`ubuntu@141.144.193.218`; configure SSH auth or use another documented deploy
path, then rerun `deploy-remote-server.js --preflight-only --json` before any
seed retry.
After explicit local key-handling approval, the first tiny live smoke completed
successfully with one host (`bbc.com`) and 3 graph-feedback URLs. The live
command used matching preview evidence, a compact seed-attempt log, and
`--remote-deploy never` after separate deploy proof showed build
`20260527035514` current. Post-seed proof confirmed health, zero recent errors,
3 remote BBC content records, a one-round sync that pulled 3 content records,
and local recent-download evidence for the 3 BBC seed downloads.

Do not treat that smoke as broad rollout approval. The post-seed deploy
preflight reported `blocked-busy` because `bbc.com` retained 1273 pending
discovered URLs even though no domain was running. Resolve or explicitly accept
that residual queue state before any second live seed or deploy. The smoke also
exposed deploy hardening work: default `~/apps/remote-crawler-v2` remote-dir
handling and remote build-tool prerequisites for Node 24 arm64.
A follow-up closeout pass reconfirmed the queue with bounded read-only
status/errors/content evidence and retained it rather than pruning or draining
implicitly. The default remote-dir deploy bug is now fixed in the CLI, and the
deploy path warns/hints when native build tooling is missing. The residual
queue remains the reason not to broaden live seeding yet.

Before any second tiny seed or deploy, use the remote queue readiness surface:

```bash
node tools/crawl/crawl-remote.js queue-summary --host 141.144.193.218:3200 --domains bbc.com --json
node tools/crawl/crawl-remote.js queue-checklist --host 141.144.193.218:3200 --domains bbc.com
node tools/crawl/crawl-remote.js readiness-report --queue-summary tmp/queue-summary.json --deploy-proof tmp/deploy-preflight.json --graph-artifact tmp/graph-feedback-bbc-profile.json --preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json --json
node tools/crawl/crawl-remote.js maintenance-decision --readiness-report tmp/readiness-report.json --queue-summary tmp/queue-summary.json --maintenance-action retain-queue --json
node tools/crawl/crawl-remote.js sync-proof-readiness --readiness-report tmp/readiness-report.json --queue-summary tmp/queue-summary.json --json
node tools/crawl/crawl-remote.js maintenance-execution-plan --maintenance-decision tmp/maintenance-decision.json --sync-proof-readiness tmp/sync-proof-readiness.json --readiness-report tmp/readiness-report.json --queue-summary tmp/queue-summary.json --deploy-proof tmp/deploy-preflight.json --maintenance-action sync-local-proof --json
node tools/crawl/crawl-remote.js second-seed-readiness --queue-summary tmp/queue-summary.json --readiness-report tmp/readiness-report.json --deploy-proof tmp/deploy-preflight.json --graph-artifact tmp/graph-feedback-bbc-profile.json --preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json --maintenance-execution-plan tmp/maintenance-execution-plan.json --json
```

The queue summary is read-only and reports whether pending URLs are retained
even when no worker is running. The checklist is also read-only and separates
queue-maintenance approval from graph-feedback seed approval. Do not treat
`APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE` as permission to prune, drain, clear,
or force deploy retained remote state.

For ordinary crawler-development progress after the first seed, prefer the
monitored small-crawl loop over another graph-feedback seed. Capture a DB
baseline, run only a bounded crawl when queue/deploy readiness is clean, then
verify DB persistence:

```bash
node tools/crawl/monitored-small-crawl.js baseline --hosts bbc.com --out tmp/small-crawl-baseline.json --json
node tools/crawl/monitored-small-crawl.js local-smoke --json
node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json
node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report.json --json --out tmp/local-smoke-comparison.json
npm run crawl -- simple-distributed-smoke --dry-run
node tools/crawl/monitored-small-crawl.js verify --baseline tmp/small-crawl-baseline.json --since <crawl-start-iso> --until <crawl-end-iso> --hosts bbc.com --expected-min-downloads 1 --json
node tools/crawl/monitored-small-crawl.js recent --hosts bbc.com --window-min 1440 --limit 5 --json
```

`monitored-small-crawl` is a local DB evidence/report tool backed by
`news-crawler-db` download evidence APIs through this repo's DB access wrapper.
It does not enqueue URLs, seed remote crawlers, contact the fleet, prune queues,
force deploy, write DB rows, or change `collect` unless `local-smoke --execute`
is explicitly used. That mode is capped to a tiny local UI-backed crawl and
exists only to prove CLI crawling plus local DB persistence before broader
remote work. It exits nonzero if its own DB verification is blocked, while
still writing the bounded JSON evidence requested with `--out`. The underlying
`run.js --watch` path also exits nonzero on timeout/poll-error/missing-target
outcomes, so a started local job is not enough to count as verified
persistence. Local watch uses the same DB-owned recent download evidence path
as the monitored verification report; with `--watch-min-fetches`, response or
content proof in `data/news.db` can cleanly finish the smoke even if the UI job
registry still reports a stale running job.

Use the report's bounded `evidence.queryTimings` and the Cloud Crawl recent
crawl health cell to monitor crawler-development reliability. Use
`monitored-small-crawl compare` to track local-smoke reports over time and make
no-new-data, command/profile drift, DB deltas, partial-persistence diagnostics,
and slow proof regressions explicit. A slow DB evidence warning should be
treated as a proof-path issue before another graph seed or broader crawl.

The combined readiness report is also file-only. Use it to review graph
artifact freshness, retained queue state, deploy proof decision, preview
fingerprint, and the post-seed proof plan in one bounded JSON report. It does
not contact the fleet, and broad output intentionally excludes candidate URLs
and full remote payloads.

The maintenance decision artifact is also file-only. Use it after the combined
readiness report to choose `retain-queue`, `sync-local-proof`, `stop-only`,
`prune`, `drain`, `clear`, or `force-deploy` as an auditable plan. It records
approval-token requirements, host/pending/freshness drift blockers, and
required proof commands, but it does not execute maintenance even when an
approval token is supplied. Use `sync-proof-readiness` to produce the next
file-only no-prune sync/local DB proof plan before any destructive queue
maintenance or second seed decision.

`maintenance-execution-plan` is the dry-run execution design surface. It reads
the saved maintenance decision, sync-proof readiness, queue summary, readiness
report, and deploy proof; validates freshness, host match, pending counts,
deploy proof state, no-prune sync proof, local DB confirmation, rollback stop
command, and approval-token presence; then prints the future command skeleton.
It is still non-executing: even if approval tokens are present, it does not run
stop, sync, prune, drain, clear, force deploy, seed, or collect.

`second-seed-readiness` is the graph-feedback handoff after the maintenance
execution plan. It combines saved graph artifact, queue summary, deploy proof,
preview evidence, post-seed checklist, combined readiness report, and optional
maintenance execution plan into one file-only blocker list. It refuses a second
seed while retained pending queues, non-current deploy proof, stale/missing
evidence, host mismatches, missing preview fingerprint, or candidate caps remain
unresolved. It does not enqueue URLs or contact the remote crawler.

For the remote operation taxonomy used by queue/deploy decisions, see
`docs/workflows/remote-crawler-health-recovery-deploy.md` and the tested
`classifyRemoteOperation()` helper. In particular, `pull`/`sync` are
sync/local proof, not pure read-only, because existing prune flags or pending
prune ledger state can mutate remote export state.

## Host Mismatch Check

`simple-distributed-smoke` currently plans `bbc.com`. An artifact generated for
`www.bbc.com` should fail strict profile validation and dry-run preview. Use
the non-failing compare command first when spelling is uncertain:

```bash
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-bbc-full-smoke.json --profile simple-distributed-smoke --compare-hosts --pretty
```

Regenerate the artifact with the exact profile host spelling before strict
validation.

## Verification

Focused verification for this workflow:

```bash
node --check tools/crawl/graph-feedback.js
node --check tools/crawl/lib/graph-feedback-live-seeds.js
node --check tools/crawl/index.js
node --check tools/crawl/crawl-remote.js
node --check tests/tools/crawl/graph-feedback-loader.test.js
npm run test:by-path -- tests/tools/crawl-index.test.js tests/tools/crawl/run.test.js tests/tools/crawl/graph-feedback-live-seeds.test.js tests/tools/crawl/crawl-remote-graph-feedback-flags.test.js tests/tools/crawl/graph-feedback-loader.test.js tests/tools/crawl/graph-feedback-planner.test.js tests/tools/crawl/profile-hosts.test.js
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --graph-feedback-approval-checklist tmp/graph-feedback-bbc-approval-checklist.json --graph-feedback-approval-readiness tmp/graph-feedback-bbc-approval-readiness.json --graph-feedback-post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json
rg -n "SELECT|db\\.query|db\\.execute|better-sqlite3|new Database|prepare\\(" tools/crawl/graph-feedback.js tools/crawl/lib/graph-feedback-artifact-explain.js tools/crawl/lib/graph-feedback-live-seeds.js tools/crawl/lib/profile-hosts.js tests/tools/crawl/graph-feedback-loader.test.js tests/tools/crawl/graph-feedback-live-seeds.test.js tests/tools/crawl/profile-hosts.test.js
git diff --check
```
