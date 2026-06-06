# Future Live Seeding Design

Date: 2026-05-26

## Status

Initial guarded live-seeding slices are implemented in the unified launcher. The
remaining items in this document define the safety envelope for expanding them
after remote crawler health/recovery/deploy workflows are verified and a small
real-remote smoke is explicitly approved.

Current blocker: without a separate `APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE`
line in the active prompt, agents must not run real remote health/status/deploy
or seed commands. Work should stop at file-only dry-run artifacts, local
approval readiness, local post-seed checklist shape, and direct remote flag
rejection.

Current live-smoke evidence: the first prompt with the standalone approval token
entered the approved path, but no seed was sent because pre-seed proof commands
did not all exit within the 30 second guard. `health` passed; `status`,
`errors`, `content`, and deploy preflight hit the timeout guard after partial or
parseable output. The next implementation pass should harden that proof path
before any retry.

Proof-path hardening now fixes the local `crawl-remote.js` timeout lifecycle
for read-only JSON commands and adds `deploy-remote-server.js --preflight-only
--json` for build/deploy evidence without a local package build or SSH/deploy
action. A later approved retry must still prove those commands against the real
remote and must not seed unless all pre-seed commands exit cleanly under guard.

Current retry evidence: a later approved prompt regenerated a fresh tiny
`bbc.com` artifact, refreshed the local deploy package with
`deploy-remote-server.js --build-only --json --skip-busy-check`, and proved that
remote `health`, `status --json`, `errors --json`, `content --domain bbc.com
--json`, and deploy preflight all exit within the 30 second guard. No seed was
sent because deploy preflight reported `deploy-needed` from missing remote build
metadata, and the documented deploy path failed before upload with SSH
public-key authentication unavailable for `ubuntu@141.144.193.218`. The next
approved retry should first make remote build metadata current by configuring
SSH auth or using another documented deploy path, then rerun deploy preflight.
A subsequent approved prompt reconfirmed the blocker before deployment: the
environment had no configured deploy key or ssh-agent, and BatchMode SSH still
failed with `Permission denied (publickey)`. Do not retry deployment or live
seeding until SSH auth is configured or an alternate documented deploy route is
available.
A later approved prompt repeated the non-destructive SSH gate and found the
same blocker, so no deploy or seed commands were run.
The latest approved prompt repeated the SSH gate again and found no configured
deploy key, no ssh-agent, no default private key under the runtime home, and
the same BatchMode public-key denial. Do not retry deployment or live seeding
from this environment until SSH auth is available.
A follow-up approved prompt found a Windows SSH config entry for `oracle-worker`
pointing at the target host and candidate key files under
`/mnt/c/Users/james/.ssh`, but OpenSSH ignored those keys because their file
permissions were too open. The next live-seed retry still requires an accepted
SSH key path or another documented deploy route before remote build metadata can
be made current.
A later approved prompt confirmed that blocker is unchanged: the same candidate
keys are present, but OpenSSH still ignores them because their permissions are
too open. No deploy or live seed should be retried until the key path is
accepted by OpenSSH or another deployment path is provided.
A 2026-05-28 approved prompt confirmed the same SSH blocker again. The active
constraints forbade chmod/copy key handling, so the pass stopped at
non-destructive auth probes and did not run deploy, remote proof, or live seed
commands.
After explicit local key-handling approval, the Windows key was copied into
the runtime home with OpenSSH-acceptable permissions and SSH succeeded. The
first tiny live seed smoke then completed through the guarded unified launcher:
one host (`bbc.com`), three graph-feedback URLs, matching preview fingerprint,
compact seed-attempt log, `--remote-deploy never`, and pre-seed proof showing
current build `20260527035514`. Post-seed proof confirmed 3 remote content
records, one sync round pulled 3 content rows locally, and recent local DB
downloads show the 3 BBC seed records. This proves the guarded path works for a
tiny approved smoke.

The current blocker has moved from SSH/auth to residual remote state after the
smoke. Post-seed deploy preflight reports `blocked-busy` because `bbc.com`
retains 1273 pending discovered URLs even though no domain is running. Do not
broaden live seeding or deploy again until that pending queue and the safe
drain/prune/stop policy are understood. The same run also exposed two deploy
readiness issues to harden: the default `~/apps/remote-crawler-v2` remote dir
failed under quoted shell-variable use, and Node 24 arm64 needed remote build
tooling to compile `better-sqlite3`.
A follow-up closeout pass reconfirmed the residual state with bounded
read-only status/errors/content evidence and chose queue retention as the safe
default. Stop-only had already been run, sync proof had already been captured,
and prune/drain would be a separate maintenance action requiring explicit human
approval. The deploy CLI now expands home-relative remote dirs safely in the
remote install script and emits build-tool warnings/hints for native dependency
compile failures, but the pending queue remains the rollout blocker.

Current read-only operator tooling already exposes artifact evidence through
`--profile-preflight`, `--operator-report`, and `--profile-workflow`. Stale
artifacts warn in those preview/report modes, but they are not rejected solely
for age. The explicit live seeding slice now rejects missing, invalid, future,
or stale `generatedAt` evidence before delegation.

Read-only artifact/profile/report/preflight/workflow modes remain unchanged.
Live seeding is available only when `--use-graph-feedback-seeds` is explicitly
combined with `--graph-feedback-artifact <path>` on a supported remote
start-like unified-launcher command.

## Current Surface

Preferred future flag:

```bash
node tools/crawl/index.js remote bounded --domains bbc.com --graph-feedback-artifact tmp/graph-feedback-plan.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-preview-evidence.json --seed-attempt-log tmp/graph-feedback-seed-attempts.jsonl
```

Dry-run-only approval package:

```bash
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-plan.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-preview-evidence.json --graph-feedback-approval-checklist tmp/graph-feedback-approval-checklist.json --graph-feedback-approval-readiness tmp/graph-feedback-approval-readiness.json --graph-feedback-post-seed-checklist tmp/graph-feedback-post-seed-checklist.json
```

Rejected direct remote surface:

```bash
node tools/crawl/crawl-remote.js status --use-graph-feedback-seeds
```

The unified launcher remains the only live entrypoint. Direct `crawl-remote.js`
graph-feedback artifact/live-seed flags are rejected so lower-level remote
operations cannot bypass artifact validation, freshness checks, command
fingerprints, or seed-attempt logging.

## Implemented First Slice

- `tools/crawl/index.js` parses `--use-graph-feedback-seeds` and keeps
  `--graph-feedback-artifact` dry-run/read-only unless the live flag is present.
- Supported live commands are explicit remote `start`, `launch`, `bounded`, and
  `run` with resolved `--domain` or `--domains`.
- `collect`, status/sync/drain/hostless, non-remote, stale artifact, host
  mismatch, excessive host/candidate/URL/body size, and pre-seeded invocations
  are rejected.
- Validated candidates are converted into the existing
  `crawl-remote.js --seed-urls-by-domain` argument; no new endpoint or SQL path
  was added.
- `--graph-feedback-preview-evidence <path>` writes a compact dry-run
  fingerprint over artifact identity, exact planned hosts, candidate counts,
  request body size, caps, and the seed map. The evidence file intentionally
  does not dump candidate URLs.
- When the same evidence path is supplied on a live command, the launcher
  verifies the fingerprint before any deploy preflight or remote delegation.
  The operator CLI requires this evidence path for live mode.
- `--seed-attempt-log <path>` appends compact JSONL before live delegation with
  artifact path, planned hosts, counts, body size, freshness evidence, preview
  fingerprint, and a redacted delegated command.
- `--graph-feedback-approval-checklist <path>` writes a dry-run-only real-remote
  approval checklist with max 1 host, max 3 URLs, a 30s guard, preview evidence
  path, seed-attempt log path, health/status/errors/content/deploy-preflight
  proof commands, rollback stop command, post-seed verification checklist, and
  the explicit approval line `APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE`. It does
  not authorize live seeding.
- `--graph-feedback-approval-readiness <path>` writes the bounded local
  readiness artifact for the checklist and preview evidence during the same
  dry-run package. The readiness artifact now includes a blocker summary,
  required pre-seed usability command names, post-seed proof command names,
  rollback command names, seed-attempt log path, and dry-run-only/no-action
  policy, still without candidate URL dumps or remote contact.
- `--graph-feedback-post-seed-checklist <path>` writes the post-seed
  verification command/evidence shape as its own bounded dry-run-only artifact.
  It is a plan for later proof capture and does not run remote checks.
- `writePostSeedVerificationEvidenceSync()` records bounded post-seed proof
  after an approved smoke: preview fingerprint, seed-attempt log path, hosts,
  candidate/request body counts, check booleans, short URL-redacted summaries,
  rollback status, and an evidence-only action policy.
- `buildLiveSeedApprovalReadiness()` validates the approval checklist, preview
  evidence, caps, remote-usability proof, post-seed verification plan, rollback
  plan, no-action policy, and optional post-seed evidence shape as a file-only
  dry-run package. It reports `realSeedAuthorized:false` and does not contact
  the fleet.
- Direct `crawl-remote.js` graph-feedback flags are rejected with a pointer to
  `tools/crawl/index.js`.
- Tests use mocked process delegation only; no real remote crawler is contacted.

## Remaining Implementation Scope

- Keep direct `crawl-remote.js` support rejected unless a future implementation
  can prove the exact same gates are reused without changing `collect`.
- Run one tiny real-remote seed smoke only after an active prompt contains the
  separate explicit approval line and the approval checklist is ready for human
  approval, with approval readiness passing locally.
- Capture post-seed verification evidence with the compact helper before
  broader live profiles are used.
- Expand remote crawler setup/health/recovery/deploy workflow tests and docs
  before larger live-seeding profiles are used.

## Safety Gates

- Default off. Artifact previews stay read-only unless `--use-graph-feedback-seeds` is present.
- Require `--graph-feedback-artifact <path>`; never build live graph feedback while launching a crawl.
- Require an explicit remote command with resolved `--domain` or `--domains`; reject status/sync/drain-only commands.
- Require `--graph-feedback-preview-evidence <path>` from a dry-run preview for
  live operator commands; the live seed plan must match the exact fingerprint.
- Require a dry-run approval checklist before asking for a real remote smoke:
  max 1 host, max 3 URLs, 30s guard, seed-attempt log path, pre-seed
  health/status/errors/content/build proof, rollback stop command, and bounded
  post-seed proof plan.
- Validate `schemaVersion`, requested hosts, per-host limits, sample limits, aggregate `recommendationCount`, and URL length before any remote request.
- Use the existing artifact evidence fields (`generatedAtValid`, `ageSeconds`, stale warnings, and byte size) as the future live freshness gate input.
- Reject artifacts older than the documented freshness window; current
  file-only preview/report modes warn only.
- Refuse mixed-host artifacts unless every requested host is present and every
  seeded URL host matches the requested host. The first live slices also reject
  `www.` remote domain keys because `crawl-remote.js` canonicalizes seed domain
  keys; a future `www.` variant policy must be explicit and tested before being
  allowed.

## Bounds

- Max hosts per live seed request: 5.
- Max candidates per host: 10 initially, even if the artifact contains a larger per-host limit.
- Max total URLs per command: 25.
- Max URL length: 4096 characters.
- Max artifact size: 256 KB for live seeding.
- Max remote seed request body: keep below 128 KB after JSON serialization.

## Rollback And Disable Path

- Keep `--use-graph-feedback-seeds` as an additive flag; removing it returns all commands to current behavior.
- Add `--no-graph-feedback-seeds` as an explicit override if profiles ever opt in.
- Log seed-attempt evidence to a bounded JSONL operator artifact without URL
  dumps. If full URL-level response evidence is later required, it must be
  capped, explicit, and separate from broad operator reports.
- Provide a follow-up `crawl-remote.js remove-seeds` or rely on existing remote URL state controls only after confirming the remote server supports safe seed removal. Do not invent local SQL cleanup in `copilot-dl-news`.

## Verification Before Implementation

```bash
node tools/crawl/graph-feedback.js --domains www.bbc.com --limit 3 --sample-limit 1 --out tmp/graph-feedback-bbc-full-smoke.json --json
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-bbc-full-smoke.json --domains www.bbc.com --json
node tools/crawl/index.js remote bounded --domains www.bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-full-smoke.json
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --graph-feedback-approval-checklist tmp/graph-feedback-bbc-approval-checklist.json --graph-feedback-approval-readiness tmp/graph-feedback-bbc-approval-readiness.json --graph-feedback-post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json
npm run test:by-path -- tests/tools/crawl-index.test.js tests/tools/crawl/graph-feedback-live-seeds.test.js tests/tools/crawl/graph-feedback-loader.test.js tests/tools/crawl/run.test.js
```

Additional implementation-time checks:

- Unit tests must prove no seed request is sent without `--use-graph-feedback-seeds`.
- Unit tests must prove stale artifacts are rejected for live seeding unless a separately documented override is supplied.
- Unit tests must prove preview evidence mismatches reject before spawning the
  remote CLI and seed-attempt logs redact candidate URL data.
- Integration smoke must use a tiny single-host artifact and a mocked remote seed endpoint before any real remote call.
- Real-remote smoke, if later approved, must include the approval checklist,
  approval readiness artifact, seed-attempt log, health/status/error/content
  proof, post-seed verification evidence, and rollback stop command.
- Do not treat parseable JSON from a timed-out proof command as sufficient
  health evidence for live seeding. All required pre-seed proof commands must
  exit cleanly under the guard before a seed request is sent.
- Raw SQL/driver scan must remain clean for crawler planning files; graph data access stays in `news-crawler-db`.
- Live smoke, if later approved, must seed at most one host and at most three URLs with a 30 second guard and a session note recording the exact artifact.

## Remote Crawler Readiness And Recovery

Before real live seed use, operators should run
`docs/workflows/remote-crawler-health-recovery-deploy.md`:

- Quick health/status/preflight checks to determine whether the remote crawler
  is usable.
- Stop and status inspection steps for stuck work.
- SSH/PM2/log inspection only when API checks fail.
- `deploy-remote-server.js --if-needed --apply --quiet-if-current` for current
  code deployment, with `--force` only after explicit interruption approval.
- Unified-launcher deploy preflight passthrough for status host/port, remote
  dir, PM2 service, busy/health skip overrides, and DB-build skip decisions so
  wrong-target recovery can be rehearsed before live seed use.
- Follow-up CLI/docs/test improvements if deployment behavior is unclear.
- `crawl-remote.js queue-summary --domains <hosts> --json` and
  `crawl-remote.js queue-checklist --domains <hosts>` for read-only queue
  readiness before any second live seed. The checklist uses separate
  `APPROVE_REMOTE_QUEUE_MAINTENANCE` and `APPROVE_REMOTE_FORCE_DEPLOY` tokens;
  seed approval does not authorize queue mutation or force deploy.
- `crawl-remote.js readiness-report` for a file-only combined readiness review
  before any second live seed or maintenance decision. It should cite saved
  graph artifact freshness, queue summary, deploy proof decision, preview
  fingerprint, and post-seed proof plan while omitting candidate URLs and full
  remote payloads.
- `crawl-remote.js maintenance-decision` for file-only queue maintenance
  decisions before any second seed or deploy. It records intended action,
  approvals, readiness blockers, affected hosts, pending counts, sync/local
  proof plan, rollback command, data-loss caveats, and readiness-vs-queue
  evidence drift without executing stop, sync, prune, drain, clear, or force
  deploy.
- `crawl-remote.js sync-proof-readiness` for the file-only no-prune sync/local
  proof plan before any destructive maintenance or second seed. It records the
  exact bounded sync command and local DB confirmation command without running
  either command.
- `crawl-remote.js maintenance-execution-plan` for the file-only dry-run
  execution skeleton before any future approved maintenance implementation. It
  validates fresh queue/readiness/deploy/decision/sync-proof evidence, no-prune
  sync proof, local DB confirmation, rollback stop command, pending-count
  match, host match, and approval-token presence while still keeping execution
  disabled.
- `crawl-remote.js second-seed-readiness` for the file-only gate before any
  future second graph-feedback live seed. It combines saved graph artifact,
  queue summary, deploy proof, preview evidence, post-seed checklist, combined
  readiness report, and optional maintenance execution plan, and refuses
  readiness while retained queues, non-current deploy proof, stale/missing
  evidence, host mismatches, missing preview fingerprint, or tiny-candidate cap
  overflow remain unresolved.
- `tools/crawl/monitored-small-crawl.js` should be the default development
  loop before broader live seeding. It captures local DB baselines, recent
  host/window download evidence, and post-crawl verification through DB-owned
  APIs, and the Cloud Crawl dashboard exposes the same bounded
  `monitoredSmallCrawl` evidence. A monitored small crawl can write DB rows only
  through the explicitly bounded crawl/sync command being verified; the
  monitor itself remains read-only and does not authorize another seed.
  `local-smoke --execute` is the current tiny local proof path for CLI crawling
  plus DB persistence. Its watch proof now depends on DB-owned response/content
  evidence, not only job-start evidence; successful local smoke evidence is
  useful development proof but is not a substitute for graph-feedback live-seed
  approval, queue/deploy readiness, or post-seed remote proof.
- `classifyRemoteOperation()` for the tested remote operation taxonomy. Future
  live-seed expansion should cite this taxonomy before running stop/sync/deploy
  or maintenance paths, especially because `pull`/`sync` can become remote
  mutation paths when prune flags or pending prune ledger state are present.
