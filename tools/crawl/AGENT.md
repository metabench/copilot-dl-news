# Agent Guide: `tools/crawl/` — Crawl Tools

> **Read this file first** when running crawls, investigating crawl issues, or managing the remote fleet.

---

## Architect Contract — `npm run crawl` (added 2026-05-12)

**Boundary**: pure CLI/config layer; no engine changes.
- `tools/crawl/run.js` — easy multi-site dispatcher (positional URL/hostname/CSV/`@list-name`); now also handles **local vs remote** target selection and wraps execution with a **live throughput meter**.
- `tools/crawl/lib/throughput-meter.js` — reusable docs/sec + bytes/sec sampler. Local mode polls `data/news.db` (`fetches.bytes_downloaded`, `fetches.fetched_at`) via direct better-sqlite3 readonly; remote mode polls `GET /api/status` on the fleet host and surfaces `aggregate.totalFetched/totalBytes`.
- `crawl-lists/` — user-curated newline/JSON lists, referenceable as `@<filename-stem>`.
- `src/core/crawler/config/defaultCrawlProfiles.js` — single source of truth for sensible CLI defaults (`safe`/`fast`/`gentle`); **engine constructor defaults intentionally untouched**.

**Owning repo**: `copilot-dl-news` (CLI + config). No cross-repo dependencies.

**Dependents**: `npm run crawl` script in `package.json` now points to `run.js`; legacy `index.js` still reachable via `npm run crawl:legacy` and via run.js fallback for non-batch shapes. Remote dispatch reuses `crawl-remote.js launch` unchanged.

**New flags (2026-05-12 follow-up)**:
- `--local` *(default)* — dispatch to `crawl-batch.js` against the local UI v1 API.
- `--remote` — dispatch to `crawl-remote.js launch --domains <hosts-csv>`; hostnames derived from positional URLs/lists.
- `--remote-host <h>` — explicit fleet host (else `$FLEET_HOST` → `.fleet-host` file → `crawl-remote.js` default).
- `--no-meter` / `--meter` — toggle the live throughput meter (enabled by default; writes to **stderr** so safe with `--json` stdout).
- `--meter-interval <ms>` — sample interval, default 2000.
- `--db <path>` — DB path for the local meter, default `data/news.db`.
- `--crawl-db <path>` — **writer** DB path for the crawl engine, default `<cwd>/data/news.db`. Forwarded as `--override dbPath=<path>` into the crawl request body so `NewsCrawler` writes to the chosen DB. Use this to isolate sample/test crawls from production (e.g. `--crawl-db data/samples/internet-small-sample.db`). Distinct from `--db` (meter-only).
- `--graph-feedback-artifact <path>` — with `--explain` only, validate a saved graph-feedback artifact against the planned crawl hosts and add a read-only `graphFeedback` seed-consideration block. This never enqueues URLs, seeds remote crawlers, or changes `collect`.

**Watch / stay-open mode (2026-05-12 follow-up)**:
- `--watch` — after launch, stay attached and poll backend status until all targets reach a terminal state. Timeout/poll-error/missing-target outcomes exit nonzero so automation cannot treat unproven completion as success. Default off (fire-and-forget preserved).
- `--no-watch` — explicitly disable (overrides a prior `--watch`).
- `--watch-interval <ms>` — poll interval, default 5000.
- `--watch-timeout <sec>` — overall watch budget, default 1800 (30 min).
- `--watch-min-fetches <n>` — local watch guard for proof runs; stop only after at least `n` DB-owned recent response/content evidence rows are visible.
- `--watch-min-hosts <n>` — local host-coverage guard; stop only after DB evidence covers at least `n` requested hosts.

**Terminal-wait (post-DB-proof) job-endpoint diagnostic (2026-05-30 follow-up)**:
- `--watch-wait-terminal-after-db-proof` — after DB proof is met, keep polling the accepted-job endpoint until all local jobs reach terminal state (or the bounded budget elapses). Default off; DB proof remains the primary stop condition.
- `--watch-terminal-timeout <sec>` — overall terminal-wait budget, default 30.
- `--watch-terminal-job-poll-timeout <ms>` — **per-poll** `/jobs/:jobId` request budget *during the terminal-wait phase only*, default 5000 (clamped 1500–5000). The longer budget prevents the in-process CPU-bound crawl from starving the cheap job route and producing false "endpoint unavailable" evidence.
- Terminal wait now records `jobPolls`, `jobPollErrors`, `endpointResponded`, and `jobPollTimeoutMs` in `watchFinal.terminalWait`, and classifies the outcome into exactly three states via the exported pure function `classifyTerminalWaitOutcome`:
  - `terminal` — job evidence present and all jobs terminal (`accepted-local-jobs-terminal-after-db-proof`).
  - `timed-out` — job evidence present OR endpoint responded but jobs still non-terminal (`accepted-local-jobs-still-non-terminal-after-db-proof`).
  - `endpoint-unavailable` — no job evidence and endpoint never responded (`job-endpoint-unavailable-after-db-proof`).
- Packet taxonomy distinguishes the two incomplete sub-states: `job-terminal-wait-timed-out` and `job-terminal-wait-endpoint-unavailable` (both under the umbrella `job-terminal-wait-after-db-proof-incomplete`).
- `--remote-deploy auto|never|always` — remote crawler build freshness mode for start-like remote runs. `auto` is the default and runs a fast metadata check before remote launch.
- `--no-remote-deploy` — disable the automatic freshness/deploy preflight.
- `--remote-deploy-force` — allow the automatic deploy path to interrupt an active remote crawl when deployment is needed.
- `--remote-deploy-ssh-host <target>` — SSH target for deploy, for example `ubuntu@141.144.193.218`.
- `--remote-deploy-status-host <host>` / `--remote-deploy-status-port <n>` — target the status endpoint used by deploy preflight.
- `--remote-deploy-remote-dir <path>` / `--remote-deploy-service <name>` — prove custom remote install path or PM2 service targets before launch.
- `--remote-deploy-skip-busy-check` / `--remote-deploy-skip-health-check` — recovery-only overrides passed to deploy preflight after an explicit operator decision.
- `--remote-deploy-skip-db-build` — pass through deploy preflight when the sibling DB package is already built.
- Remote launcher `--dry-run` prints the delegated crawl command and the exact
  deploy preflight command for start-like remote invocations, so wrong
  status-host/remote-dir/service decisions can be checked without contacting
  the fleet.
- Local watch uses DB-owned recent download evidence for response/content proof and falls back to a "no fetch growth for 3 polls" heuristic when no minimum is requested. Remote watch uses real `state`/`isRunning` from `/api/status`.
- `crawl-remote.js watch [--domains a,b] [--watch-interval ms] [--watch-timeout sec] [--json]` — standalone watch subcommand against the fleet (uses the same `CrawlBackend` loop).

**Interchangeable local + fleet code path (2026-05-12 follow-up)**:
- `tools/crawl/lib/crawl-backend.js` — `CrawlBackend` interface + `LocalBackend` (UI v1 + SQLite readonly status) + `RemoteBackend` (fleet `/api/status` + `/api/start` + `/api/stop`). One **NormalizedStatus** shape: `{ ok, kind, label, totals:{fetched,errors,pending,stored?,bytes?}, throughput:{fetchesPerSec,writesPerSec,windowSec?}, domains:[{domain,state,isRunning,fetched,errors,pending,stored?,bytes?,startedAt?,stoppedAt?,fatalState?}], raw }`. Static helper `CrawlBackend.allTerminal(status, hosts)` powers the watch loop on both sides. `getBackend('local'|'remote', opts)` factory picks the implementation.

**Evidence**: `tests/tools/crawl/run.test.js` covers watch/fail-fast flag parsing, no-output child timeout coverage, read-only graph-feedback artifact explain output, non-JSON graph-feedback summary rendering, remote explain host validation, and rejection of live graph-feedback seeding on the `run.js` surface. `tests/tools/crawl-index.test.js` covers unified launcher dry-run graph-feedback artifact attachment, guarded `--use-graph-feedback-seeds` parsing, preview-evidence writing/verification, dry-run approval checklist writing, seed-attempt logging, mocked live seed delegation, and negative-path validation. `tests/tools/crawl/graph-feedback-live-seeds.test.js` covers bounded live seed map generation, freshness/future-date rejection, preview fingerprints, redacted attempt logs, real-remote approval checklist/readiness shape, post-seed verification checklist/evidence shape, URL/body caps, `www.` rejection, and delimiter rejection. `tests/tools/crawl/crawl-remote-graph-feedback-flags.test.js` proves direct `crawl-remote.js` graph-feedback flags are rejected before remote contact. `tests/tools/crawl/graph-feedback-loader.test.js` covers schema, host, limit, sample, aggregate recommendation count, URL-length validation, file-only recipe generation, file-only host comparison, profile-aware compare, profile-aware recipes, profile preflight reports/text summaries, profile workflow checklists, help alignment, operator reports/Markdown cheat sheets, stale artifact warnings, artifact freshness/size evidence, readiness labels/aggregates, and operator-report compaction controls. `tests/tools/crawl/profile-hosts.test.js` covers file-only profile host extraction and compatibility summaries. `tests/tools/remote-crawler-deploy.test.js` and `tests/tools/remote-deploy-preflight.test.js` cover deploy packaging/preflight behavior, recovery overrides, stale/missing build metadata, busy-server refusal evidence, deploy troubleshooting hints, wrong target details, and start-like command classification. `tests/tools/crawl/crawl-batch.test.js` and `tests/tools/crawl/crawl-backend.test.js` cover local/remote crawl helper behavior.

**Validation**:
- `npm run test:by-path -- tests/tools/crawl/run.test.js tests/tools/crawl/crawl-batch.test.js tests/tools/crawl/crawl-backend.test.js` (80 passing).
- `npm run test:by-path -- tests/tools/crawl-index.test.js tests/tools/crawl/run.test.js tests/tools/crawl/graph-feedback-live-seeds.test.js tests/tools/crawl/crawl-remote-graph-feedback-flags.test.js tests/tools/crawl/graph-feedback-loader.test.js tests/tools/crawl/graph-feedback-planner.test.js tests/tools/crawl/profile-hosts.test.js tests/tools/remote-crawler-deploy.test.js tests/tools/remote-deploy-preflight.test.js` (240 passing).
- Smoke: `node tools/crawl/run.js --explain --json bbc.com,reuters.com` → `mode:"batch"`, delegated `crawl-batch.js`.
- Smoke: `node tools/crawl/run.js --remote --explain --json bbc.com,reuters.com` → `mode:"batch-remote"`, delegated `crawl-remote.js launch --domains bbc.com,reuters.com …`.
- Smoke: `node tools/crawl/run.js --remote --explain --json --watch --watch-interval 3000 --watch-timeout 60 bbc.com,reuters.com` → flags accepted, delegate args unchanged.
- Smoke: `node tools/crawl/crawl-remote.js help` lists `watch` subcommand.
- Live-meter smoke: `node -e "require('./tools/crawl/lib/throughput-meter').startLocalMeter({ dbPath:'./data/news.db', sinceIso:new Date(Date.now()-3600e3).toISOString(), intervalMs:700 })"` ticks every interval and prints a final summary.

**Deferred** (not landed in this pass): engine-level idle-exit + duplicate-ratio stop guards. Those need engine knowledge inside `CrawlerConfigNormalizer.js` / runtime; CLI dispatcher is reversible and already cuts the most common ergonomic friction.

---

## What's Here

This directory contains CLI tools for running and managing crawls. The **unified launcher** (`index.js`) is the preferred entry point for most crawl operations.

### Actual Tools

| File | Purpose | Status |
|------|---------|--------|
| `index.js` | **Unified crawl launcher** — delegates to tools and profiles; remote `--dry-run` can attach read-only graph-feedback artifact explanation | ✅ Working |
| `run.js` | **Easy multi-site dispatcher** — entry point for `npm run crawl` (URL/CSV/`@list`); delegates to `crawl-batch.js` for batch shapes and to `index.js` for everything else | ✅ Working |
| `cloud-crawl-e2e.js` | **Strict 15-minute cloud crawl validation** — preflight, useful crawl window, drain/sync, DB/ledger/perf diagnostics | ✅ Working |
| `crawl-remote.js` | **Remote multi-domain crawl** — start/stop/sync/monitor remote crawlers (the canonical "distributed node" entry point) | ✅ Working |
| `crawl-batch.js` | **Batch in-process crawl launcher** — POST N jobs to the unified UI v1 API (`/api/v1/crawl/operations/:op/start`) with bounded concurrency + retries | ✅ Working |
| `crawl-packet.js` | **No-contact crawl reliability packet** — scorecard and command packet for tiny/small/medium local proof runs; reads saved local-smoke evidence when supplied | ✅ Working |
| `local-fixture-server.js` | **Loopback crawl fixture server** — deterministic one-host small and three-host medium local targets for fixture-only reliability proofs | ✅ Working |
| `sequential-fixture-proof.js` | **Sequential medium fixture proof helper** — starts loopback fixture targets, runs one host at a time, composes launch/watch/DB proof artifacts, emits packet and comparison output | ✅ Working |
| `graph-feedback.js` | **Read-only graph feedback dry run** — live mode dynamically imports `news-db-analysis` and opens `news-crawler-db` read-only; artifact/profile/report modes validate saved bounded JSON and print planning-only guidance | ✅ Working |
| `crawl-multi-modal.js` | Multi-modal crawl (HTTP + Puppeteer fallback) | ✅ Working |
| `crawl-place-hubs.js` | Crawl discovered place hub URLs from local DB | ✅ Working |
| `deploy-remote-server.js` | Build and deploy the remote crawler v2 server with a busy-server guard; dry-run by default, `--apply` executes, `--force` required when active work is detected | ✅ Working |
| `intelligent-crawl.js` | Intelligent crawl with hub discovery + learning loops | ✅ Working |
| `guess-place-hubs.js` | Infer place hubs from existing crawl data | ✅ Working |
| `list-place-hubs.js` | List known place hubs from the DB | ✅ Working |
| `peer-server.js` | P2P NewsCrawler peer node | ✅ Working |
| `migrate-db-crawl-logs.js` | DB migration: crawl logs | Utility |
| `migrate-db-for-worker.js` | DB migration: worker schema | Utility |
| `lib/crawl-remote-bounded.js` | Bounded crawl helper (used by `crawl-remote.js`) | Internal |
| `lib/fleet-host-resolver.js` | Resolves fleet host (env `FLEET_HOST` → `.fleet-host` → default `141.144.193.218`) | Internal |
| `lib/throughput-meter.js` | Live docs/sec + bytes/sec sampler (local DB poll + remote `/api/status` poll); used by `run.js` to print a stderr meter while crawls run | Internal |
| `lib/crawl-backend.js` | **Unified `CrawlBackend` interface** + `LocalBackend` / `RemoteBackend` — one normalized status shape across local UI v1 and remote v2 fleet; powers `--watch` follow loops in both `run.js` and `crawl-remote.js watch` | Internal |

> **Terminology rule**: In this repo, **simple crawl** means low-scope and easy to run (few domains/pages, bounded timeout). It does **not** mean local-only. The canonical simple crawl is distributed through `simple-distributed-smoke` unless a user explicitly asks for a local crawl.

> **Mode rule**: **Harnessed crawls** run through `cloud-crawl-e2e.js` and must produce validation artifacts plus pass/fail diagnostics. Use them when proving the crawl system works under a fixed budget. **Non-harnessed crawls** run through `news-10x1000`, `crawl-remote.js`, `crawl-batch.js`, or legacy `npm start`; use them for normal operations, focused data collection, or manual recovery, then verify with status/DB/ledger checks.

> **Parallel local runner scheduling (read-only trace, 2026-05-30)**: The basic
> article crawl fans out via `src/cli/crawl/runner.js` → `runMultiModalCrawl()` →
> `MultiModalCrawlManager` — a worker-pool (default `maxParallel=30`) whose
> `runNext()` chains `shift()` domains off a queue and tail-recurse, joined by
> `Promise.all`. The better-sqlite3 handle is opened **once** at the boundary and
> **injected** into every parallel orchestrator (`createOrchestrator` closure), so
> the local fan-out does **not** re-open the DB per runner and does **not** recur
> the server-side per-operation synchronous-boot starvation (see
> `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md`).
> Residual single-handle in-process write serialization is bounded/benign.

> **Removed 2026-04-25**: `worker-cli.js`, `distributed-500.js`, and `deploy/remote-crawler/` (v1) were quarantined to `wip/legacy-distributed/` because they depended on `domain-intelligence`/`self-healing` modules that were never committed. Use `crawl-remote.js` (v2 path) for distributed crawls instead.

### Named Profiles (`profiles/`)

| Profile | Tool | Description |
|---------|------|-------------|
| `simple-distributed-smoke` | `remote` | **Simple distributed smoke**: 1 domain × 5 pages via Oracle/v2 remote server |
| `remote-bounded-smoke` | `remote` | Larger bounded distributed smoke crawl (3 domains × 50 pages) |
| `news-10x1000` | `orchestrate` | **Default 10x1000 operator crawl**: remote/cloud crawler when healthy, local fallback when unavailable, adaptive 5-second confirmed sync, exact remote payload pruning, ledger-tracked |
| `news-10x1000-15m-e2e` | `cloud-e2e` | **Strict 15-minute e2e validation**: preflight remote health/throttle, crawl useful data, drain/sync, verify local DB growth, ledger state, host spread, and benchmark stats |
| `remote-news-10x1000` | `remote` | Explicit remote/cloud alias for the adaptive 10x1000 operator crawl |
| `local-news-10x1000` | `batch` | Local/in-process fallback for 10 major news sites × 1000 pages each; use only when remote is unavailable |
| `remote-status` | `remote` | Quick remote crawl status snapshot |
| `remote-guardian-bbc-10-agent` | `remote` | Agent-observable Guardian/BBC collect run: 10 verified new local saves per host, depth-4 remote exploration, hub seed URLs, JSONL telemetry |
| `local-tiny-monitored-smoke` | `batch` | Tiny local monitored target: one BBC news URL, one page, depth 0. Prefer `monitored-small-crawl local-smoke --execute` for baseline/run/verify evidence. |
| `local-small-reliability` | `batch` | Small local reliability proof targets: BBC and Reuters, one page each, depth 0. Prefer `crawl-packet --crawl-class small-local` for watch and DB proof commands. |
| `local-medium-reliability` | `batch` | Medium local orchestration proof targets: BBC, Reuters, and AP, one page each, depth 0, concurrency 2. Prefer `crawl-packet --crawl-class medium-local` for watch and DB proof commands. |
| `place-hubs-local` | `place-hubs` | Local place-hub crawl against default news database |

### Lib Modules (`lib/`)

| Module | Purpose |
|--------|---------|
| `adaptive-sync-batching.js` | Adaptive batch controller: grow/shrink export limit toward a duration target |
| `backpressure.js` | Concurrency control: maps storage budget actions to crawler throttle requests |
| `cloud-crawl-e2e-validation.js` | Pure budget planning, evidence validation, ledger summary, and benchmark stat helpers for the 15-minute validator |
| `crawl-packet.js` | No-contact crawl reliability packet builder and scorecard for tiny/small/medium local proof runs |
| `local-fixture-server.js` | Deterministic loopback fixture server and plan builder for small/medium local proof ladders |
| `sequential-fixture-proof.js` | Sequential medium fixture plan/execution helper and composed artifact writer |
| `crawl-remote-bounded.js` | Bounded crawl utilities (domain resolution, summary) |
| `fleet-host-resolver.js` | Resolves fleet host from env / `.fleet-host` / default |
| `graph-feedback-loader.js` | Read-only bridge from `copilot-dl-news` to sibling `news-db-analysis` + `news-crawler-db` GraphAccess |
| `graph-feedback-planner.js` | Pure bounded planner that turns `WebsiteGraphAnalysisService` outputs into crawler seed recommendations and diagnostics |
| `graph-feedback-artifact-explain.js` | File-only artifact explanation helper shared by `run.js --explain` and unified-launcher remote dry-runs |
| `graph-feedback-live-seeds.js` | Guarded live seed preparation for explicit unified-launcher `--use-graph-feedback-seeds` remote start-like commands |
| `profile-hosts.js` | File-only crawl profile host extraction and graph-feedback compatibility summaries |
| `orchestrate-policy.js` | Orchestration decision (mode/profile/uiHint) from args |
| `perf-reporter.js` | Ring-buffer perf metrics with p50/p95 summaries |
| `prune-config.js` | Prune safety policy (refuses partial-export prune) |
| `storage-budget.js` | Storage budget evaluation (normal/shrink/pause-crawl) |
| `sync-ingest.js` | V2 batch ingest pipeline (urls/responses/content/links → local DB) |
| `sync-ledger.js` | **Append-only ledger** replacing the single-watermark file. Tracks batch → confirmed → pruned lifecycle with crash-resume support |
| `sync-loop-instrumentation.js` | **Shared instrumentation** for cmdSync and cmdRun: perf summaries, budget eval, backpressure transitions |

### New CLI Flags (crawl-remote.js)

| Flag | Default | Description |
|------|---------|-------------|
| `--remote-storage-budget-mb` | disabled | Soft cap on remote content storage (MB) |
| `--remote-storage-reserve-mb` | disabled | Hard reserve above the budget; triggers pause-crawl |
| `--perf-summary-every` | 10 | Print p50/p95 perf summary every N rounds |
| `--normal-concurrency` | 10 | Worker concurrency restored when budget returns to normal |
| `--reduced-concurrency` | 2 | Worker concurrency under storage pressure |
| `--max-depth` | server default | Remote worker link-follow depth for start/collect |
| `--seed-urls-by-domain` | disabled | Domain-specific hub/frontier URLs: `domain=url1\|url2;domain=url3`; known URLs are skipped and do not count as new downloads |
| `--agent-log` | disabled | Structured JSONL telemetry for agent/operator analysis |

### Graph Feedback Dry Run

Use `node tools/crawl/graph-feedback.js --domains <host> --json` to inspect
bounded graph-derived crawler recommendations without starting crawlers or
changing `collect` behavior. On populated hosts, prefer
`--fast --limit <n>` first; fast mode only calls
`WebsiteGraphAnalysisService.buildCrawlPriorityDataset()` and records skipped
summary/hub/orphan/dead-end analyses in the JSON diagnostics. Use
`--out tmp/graph-feedback-plan.json` when a future planning step needs a
bounded read-only JSON artifact; the command still prints JSON to stdout and
does not seed remote crawlers.

Use `node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains <host> --json`
to consume a saved artifact without opening the DB or importing sibling repos.
Artifact mode validates `schemaVersion`, requested hosts, and per-host/sample
limits, then prints how seed candidates would be considered with
`wouldEnqueue`, `wouldSeedRemote`, and `wouldChangeCollect` all false.

Use `node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains <host> --compare-hosts --pretty`
before a strict preview when host spelling may differ between an artifact and a
profile. This file-only check validates the artifact itself, then reports
artifact hosts, requested/planned hosts, matched hosts, missing hosts, extra
artifact hosts, and per-host recommendation counts. It does not open the DB,
import sibling repos, call remote crawlers, enqueue URLs, seed remote crawlers,
or change `collect`.

Use `node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --profile <profile-name> --compare-hosts --pretty`
to compare a saved artifact against the exact static hosts in a named crawl
profile. Profile-aware artifact mode reads only profile JSON files and the
artifact file. If the profile has no static host fields, the JSON output reports
that caveat instead of guessing.

Use `node tools/crawl/graph-feedback.js --profile-summary --pretty` to print a
file-only compatibility summary for common remote profiles. Add
`--profile <name>` one or more times to limit the summary to specific profiles.

Use `node tools/crawl/graph-feedback.js --profile-preflight --profile <profile-name> --from-artifact tmp/graph-feedback-plan.json --pretty`
for a compact operator preflight report. This mode is file-only: it reports the
profile hosts, artifact hosts, host matches/misses, candidate counts, caveats,
readiness label, artifact byte-size/freshness evidence, and recommended next
safe commands. Without `--from-artifact`, it still reports profile
hosts/caveats and suggests the bounded artifact generation command. `--out
<path>` may be used here to write the compact JSON report to an explicit path.
Add `--preflight-format text` for a human scan that keeps the JSON output
stable by requiring an explicit format switch. It never opens the DB, imports
sibling repos, invokes crawlers, enqueues URLs, seeds remote crawlers, or
changes `collect`.

Use `node tools/crawl/graph-feedback.js --operator-report --all-common-profiles --format markdown --out tmp/graph-feedback-operator-report.md`
to write a compact file-only operator cheat sheet for the common profile set.
The report can also target explicit profiles with repeated `--profile <name>`
and can include `--from-artifact <path>` to add host-match and candidate-count
evidence. Each profile gets a readiness label such as `ready-for-preview`,
`needs-artifact`, `host-mismatch`, or `hostless-caveat`; artifact evidence
includes byte size, `generatedAt` validity, age, and stale/invalid timestamp
warnings. The report also includes aggregate readiness counts by label,
profiles requested/shown, artifact supplied/missing counts, and matched
candidate totals without dumping candidate URLs. JSON is the default format;
`--format markdown` writes the same bounded planning evidence as readable
Markdown. Use `--report-max-profiles <n>` to truncate a broad report and
`--report-commands minimal|none` to reduce or omit repeated safe command
strings; defaults remain full output. Report mode reads only profile JSON plus
the optional artifact and never opens the DB, imports sibling repos, invokes
crawlers, enqueues URLs, seeds remote crawlers, or changes `collect`.

Use `node tools/crawl/graph-feedback.js --profile-workflow --profile <profile-name> --from-artifact tmp/graph-feedback-plan.json --workflow-format markdown`
for a profile-specific checklist that packages the safe workflow into one
operator scan. It shows exact profile hosts, readiness, artifact age/stale
warnings, host-match caveats, the bounded generation command, compare/validate
commands, `--profile-preflight --preflight-format text`, compact
`--operator-report --report-commands minimal`, and the canonical
`tools/crawl/index.js <profile> --dry-run --graph-feedback-artifact <path>`
preview. Without `--from-artifact`, the checklist still prints the safe command
sequence with a suggested artifact path. The durable workflow reference is
`docs/workflows/graph-feedback-artifact-planning.md`; a compact sample output
shape lives in `docs/workflows/graph-feedback-profile-workflow-sample.md`.
Before using guarded live seeding, run the remote health/recovery workflow in
`docs/workflows/remote-crawler-health-recovery-deploy.md`.

`--recipe` and `--profile-workflow` are intentionally separate. Use
`--from-artifact ... --recipe` for a compact artifact-derived JSON command
recipe. Use `--profile-workflow --profile <name>` for the complete
profile-specific checklist that includes preflight text, compact operator
report, stale evidence, references, and canonical profile dry-run preview.

Use `node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --domains <host> --recipe --pretty`
to print the safe operator workflow commands for a saved artifact. Recipe mode
is file-only: it validates the artifact and prints command strings for artifact
generation, host comparison, artifact validation, `run.js --explain`, and
unified-launcher remote `--dry-run`; it does not open the DB or import sibling
repos.

Use `node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-plan.json --profile <profile-name> --recipe --pretty`
for a profile-aware recipe. It generates command strings using the exact static
profile hosts, compares the artifact to the profile, validates with
`--profile`, previews `run.js --explain` using the resolved host CSV, and
previews `tools/crawl/index.js <profile> --dry-run --graph-feedback-artifact`.

Use `node tools/crawl/run.js --explain --json --graph-feedback-artifact tmp/graph-feedback-plan.json <host>`
to attach the same read-only artifact consideration block to the normal crawl
plan. `run.js` validates the artifact hosts against the planned crawl hosts and
refuses `--graph-feedback-artifact` without `--explain`, so live launch behavior
does not change. Without `--json`, `run.js --explain` also prints a compact
operator summary with planned hosts, candidate counts, top candidate URLs, and
the no-enqueue/no-remote-seed/no-collect-change policy.

Use `node tools/crawl/index.js remote bounded --domains <host> --dry-run --graph-feedback-artifact tmp/graph-feedback-plan.json`
to attach the same compact artifact summary to a resolved remote invocation.
Without `--use-graph-feedback-seeds`, the unified launcher only accepts this
flag with `--dry-run` remote invocations, validates the requested remote hosts
against the artifact, and does not open the DB, import sibling repos, enqueue
URLs, seed remote crawlers, or change `collect`.

For named profiles, the canonical safe preview is
`node tools/crawl/index.js <profile> --dry-run --graph-feedback-artifact <path>`.
`tools/crawl/run.js --explain` is the direct URL/host dispatcher preview; profile
names passed through `run.js` delegate to the unified launcher rather than
resolving profile hosts itself.

The current artifact contract is intentionally strict: `schemaVersion`, host
lists, per-host limits, diagnostic sample limits, aggregate
`recommendationCount`, recommendation URL length, and artifact byte size are all
validated before a planning surface prints output. File-only reports also expose
`generatedAt` validity and age warnings. The first live seeding slice now exists
only as an explicit unified-launcher opt-in:

```bash
node tools/crawl/index.js remote bounded --domains <host> --dry-run --graph-feedback-artifact tmp/graph-feedback-plan.json --use-graph-feedback-seeds
node tools/crawl/index.js remote bounded --domains <host> --dry-run --graph-feedback-artifact tmp/graph-feedback-plan.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-preview-evidence.json
node tools/crawl/index.js remote bounded --domains <host> --dry-run --graph-feedback-artifact tmp/graph-feedback-plan.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-preview-evidence.json --graph-feedback-approval-checklist tmp/graph-feedback-approval-checklist.json --graph-feedback-approval-readiness tmp/graph-feedback-approval-readiness.json --graph-feedback-post-seed-checklist tmp/graph-feedback-post-seed-checklist.json
node tools/crawl/index.js remote bounded --domains <host> --graph-feedback-artifact tmp/graph-feedback-plan.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-preview-evidence.json --seed-attempt-log tmp/graph-feedback-seed-attempts.jsonl
```

The dry-run form previews the exact delegated `--seed-urls-by-domain` argument
without contacting the fleet. `--graph-feedback-preview-evidence <path>` writes
a bounded fingerprint file that the live command must verify before deploy
preflight or remote delegation. `--graph-feedback-approval-checklist <path>` is
dry-run-only and writes a bounded real-remote approval package for a tiny smoke:
max 1 host, max 3 URLs, 30s guard, preview evidence path, seed-attempt log path,
health/status/errors/content/deploy-preflight proof commands, rollback stop
command, and the explicit approval line
`APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE`. It does not authorize a real seed or
dump candidate URLs. `--graph-feedback-approval-readiness <path>` is also
dry-run-only and writes a bounded readiness object for the checklist plus
preview evidence while still reporting `realSeedAuthorized:false`. The
readiness object includes a compact blocker summary, required pre-seed
usability command names (`health`, `status-build`, `recent-errors`,
`content-probe`, `deploy-preflight`), post-seed proof command names, rollback
command names, seed-attempt log path, and no-action policy so an approval
request can be reviewed from one bounded file.
`--graph-feedback-post-seed-checklist <path>` is dry-run-only and writes the
post-seed command/evidence shape as its own compact JSON artifact; it is a
plan for later proof capture, not execution of health/status/sync commands.
`--seed-attempt-log <path>` appends compact JSONL
live-delegation evidence with artifact path, hosts/counts/body/freshness
evidence, and a redacted delegated command; it does not dump candidate URL
lists. The live CLI form rejects missing preview evidence, stale artifacts, host
mismatches, `www.` seed-domain keys, more than 5 hosts, more than 10 candidates
per host, more than 25 URLs total, URL/body overflows,
status/sync/drain/hostless/non-remote paths, `collect`, and invocations that
already supply seed flags. It reuses the existing remote start path; it does not
add raw SQL or change `collect`.

Do not run a real graph-feedback seed unless the user has supplied a separate
explicit approval line in the active prompt. If that approval line is absent,
do not run real remote health/status/deploy/seed checks; stop at the dry-run
approval package and direct local rejection smokes. Before asking for approval,
read the remote health/recovery workflow and produce the approval checklist.
After an approved tiny seed, capture bounded post-seed proof with health,
status, errors, content, one-round sync/pull, and local DB confirmation; stop
the target host and switch to recovery if any proof is unhealthy.
For pre-seed approval proof, every required command must exit cleanly within
the guard. Parseable JSON written by a timed-out `status`, `errors`, `content`,
or deploy preflight command is not enough to send a live seed. The checklist
uses `deploy-remote-server.js --preflight-only --json` for build/deploy proof;
that command must not build, deploy, stop PM2, or contact SSH.
If deploy proof reports `deploy-needed`, do not seed even when health/status
are otherwise clean. Make the remote build current through the deploy workflow
first. A deploy failure such as `Permission denied (publickey)` means SSH auth
must be configured with `--ssh-key`, `REMOTE_CRAWLER_SSH_KEY`, `ssh-agent`, or
the operator's `~/.ssh` setup before retrying deployment or live seeding.
Use `ssh -o BatchMode=yes -o ConnectTimeout=15 ubuntu@141.144.193.218 true` as
a non-destructive auth check; if it fails, stop before deploy and seed commands.
If Windows-mounted keys are rejected as too open, use an explicitly approved
OpenSSH-accepted copy under the runtime home with `0600` permissions. The first
approved tiny live seed smoke completed on 2026-05-28 after that key path and a
current deploy were available: `bbc.com`, 3 graph-feedback URLs, matching
preview evidence, compact seed-attempt log, and local sync proof. The next
blocker is not seed validation; post-seed deploy preflight is `blocked-busy`
because `bbc.com` retained 1273 pending discovered URLs. Do not broaden live
seeding or redeploy until that residual queue is handled. Bounded read-only
follow-up showed the queue is retained while `bbc.com` is stopped, with zero
recent errors and 3 stored BBC content records; treat prune/drain as explicit
remote maintenance, not an automatic cleanup.

Read-only queue readiness is available through `crawl-remote.js` before any
second seed, deploy, or maintenance decision:

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

`queue-summary` reads only `/api/status`, `/api/errors`, and
`/api/content/stats`. It reports per-domain running state, fetched/done/error
counts, pending URLs, stored content, recent error samples, inferred
deploy-preflight implication, and the next safest action. `queue-checklist`
turns the same evidence into a dry-run maintenance checklist with required
sync/local proof commands, rollback stop command, data-loss caveats, and
separate approval tokens. These commands do not stop crawlers, sync data, seed
URLs, prune, drain, clear remote state, deploy, force deploy, or change
`collect`. A live seed approval does not approve queue maintenance or force
deploy.

`readiness-report` is file-only. It reads saved graph artifact, queue summary,
deploy proof, preview evidence, and post-seed checklist JSON files and emits a
bounded readiness label plus stale/missing evidence warnings. It reports counts,
build/proof decisions, pending-queue state, and preview fingerprint, but not
candidate URLs or full remote payloads. It does not contact the fleet.

`maintenance-decision` is also file-only. It consumes the saved readiness
report and optional full queue summary, records an intended action
(`retain-queue`, `sync-local-proof`, `stop-only`, `prune`, `drain`, `clear`, or
`force-deploy`), validates current queue evidence against the readiness report
for host, pending-count, freshness, and deploy-implication drift, cites required
evidence and approval tokens, and keeps all execution flags false. It is the
audit artifact before any future approved maintenance execution path, not a
maintenance command.

`sync-proof-readiness` is a file-only bridge between a retained queue decision
and a later operator-run sync/local DB proof. It emits a bounded proof plan
using `sync --rounds 1 --limit 25 --include-content true --include-links true
--no-prune-after-ingest`, the local DB confirmation command, rollback stop
command, stale/mismatch blockers, and prune-ledger caveats. It does not run
`sync` or `pull`, write local DB data, prune remote export state, stop crawlers,
deploy, seed URLs, or change `collect`.

`maintenance-execution-plan` is the dry-run execution skeleton that comes after
`maintenance-decision` and `sync-proof-readiness`. It validates fresh queue
summary, readiness report, deploy proof, maintenance decision, and, when needed,
sync-proof readiness evidence. It records the future command skeleton for
`sync-local-proof`, `stop-only`, `prune`, `drain`, `clear`, or `force-deploy`
decisions, checks host/pending-count drift, verifies no-prune/local-DB/rollback
proof requirements, and still keeps `executesRemoteAction:false`. Approval
tokens can be recorded for audit, but this mode never runs stop, sync, prune,
drain, clear, force deploy, seed, or collect.

`second-seed-readiness` is the file-only decision package before any future
second graph-feedback live seed. It reads saved queue summary, combined
readiness report, deploy proof, graph artifact, preview evidence, post-seed
checklist, and optional maintenance execution plan; enforces tiny-seed caps
(default 1 host, 3 URLs total, 3 per host); validates exact host agreement; and
blocks while retained pending queues or non-current deploy proof remain. It
does not run sync/pull/stop/prune/drain/clear/deploy, seed URLs, or change
`collect`. A ready label is not approval; the future seed still requires the
separate live-seed approval token in the active prompt.

Remote operation classes for this workflow are tested in
`tools/crawl/lib/remote-queue-summary.js` via `classifyRemoteOperation()`:
read-only (`health`, `status`, `errors`, `content`, `watch`, `profiles`,
`queue-summary`, `queue-checklist`, `readiness-report`,
`maintenance-decision`, `sync-proof-readiness`, `maintenance-execution-plan`,
`second-seed-readiness`),
safe stop/stabilize (`stop`),
sync/local proof (`pull`, `sync`, `graph-seeds`; note `pull`/`sync` can prune
under prune flags or pending prune ledger state), destructive maintenance
(`remove`, prune/drain/clear), deploy action (deploy preflight/apply, with
`--force` gated separately), and live crawl behavior (`start`, `launch`,
`bounded`, `run`, `collect`, `seed`). Unknown commands must be classified and
tested before use in maintenance prompts.
`tools/crawl/lib/graph-feedback-live-seeds.js` exposes
`writePostSeedVerificationEvidenceSync()` for a compact JSON evidence artifact:
preview fingerprint, seed-attempt log path, hosts, candidate/request body
counts, check names with booleans and short URL-redacted summaries, rollback
status, and no enqueue/remote-seed/collect-change action policy. It also
exposes `buildLiveSeedApprovalReadiness()` so agents can file-only validate an
approval checklist, preview evidence, remote usability proof, rollback plan,
post-seed verification plan, and optional post-seed evidence shape before
asking for the separate human approval line. Prefer the launcher
`--graph-feedback-approval-readiness <path>` output when building the approval
package.

Direct `crawl-remote.js` graph-feedback artifact/live-seed flags are rejected.
Use `tools/crawl/index.js` so all preview evidence, freshness, host, cap, and
attempt-log gates stay in one path.

Safe artifact workflow:

```bash
node tools/crawl/graph-feedback.js --domains www.bbc.com --limit 1 --sample-limit 1 --out tmp/graph-feedback-bbc-full-smoke.json --json
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-bbc-full-smoke.json --domains www.bbc.com --compare-hosts --pretty
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-bbc-full-smoke.json --profile simple-distributed-smoke --compare-hosts --pretty
node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-full-smoke.json --pretty
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-bbc-full-smoke.json --domains www.bbc.com --json
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-bbc-full-smoke.json --domains www.bbc.com --recipe --pretty
node tools/crawl/graph-feedback.js --domains bbc.com --limit 1 --sample-limit 1 --out tmp/graph-feedback-bbc-profile.json --json
node tools/crawl/graph-feedback.js --from-artifact tmp/graph-feedback-bbc-profile.json --profile simple-distributed-smoke --recipe --pretty
node tools/crawl/graph-feedback.js --profile-summary --profile simple-distributed-smoke --profile remote-bounded-smoke --pretty
node tools/crawl/graph-feedback.js --profile-preflight --profile remote-status --pretty
node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-profile.json --preflight-format text
node tools/crawl/graph-feedback.js --operator-report --all-common-profiles --pretty
node tools/crawl/graph-feedback.js --operator-report --all-common-profiles --report-max-profiles 3 --report-commands minimal --format markdown --out tmp/graph-feedback-operator-report-compact.md
node tools/crawl/graph-feedback.js --operator-report --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-profile.json --format markdown --out tmp/graph-feedback-simple-distributed-smoke-report.md
node tools/crawl/graph-feedback.js --profile-workflow --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-profile.json --workflow-format markdown
node tools/crawl/graph-feedback.js --domains bbc.com --limit 1 --sample-limit 1 --generated-at 2026-05-01T00:00:00.000Z --out tmp/graph-feedback-bbc-stale.json --json
node tools/crawl/graph-feedback.js --profile-preflight --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-stale.json --generated-at 2026-05-26T12:00:00.000Z --preflight-format text
node tools/crawl/graph-feedback.js --operator-report --profile simple-distributed-smoke --from-artifact tmp/graph-feedback-bbc-stale.json --generated-at 2026-05-26T12:00:00.000Z --report-commands minimal --format markdown
node tools/crawl/run.js --remote --explain --json --graph-feedback-artifact tmp/graph-feedback-bbc-full-smoke.json www.bbc.com
node tools/crawl/index.js simple-distributed-smoke --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json
node tools/crawl/index.js remote bounded --domains www.bbc.com --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-full-smoke.json
node tools/crawl/index.js simple-distributed-smoke --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json
node tools/crawl/index.js simple-distributed-smoke --dry-run --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --graph-feedback-approval-checklist tmp/graph-feedback-bbc-approval-checklist.json --graph-feedback-approval-readiness tmp/graph-feedback-bbc-approval-readiness.json --graph-feedback-post-seed-checklist tmp/graph-feedback-bbc-post-seed-checklist.json
node tools/crawl/index.js simple-distributed-smoke --graph-feedback-artifact tmp/graph-feedback-bbc-profile.json --use-graph-feedback-seeds --graph-feedback-preview-evidence tmp/graph-feedback-bbc-preview-evidence.json --seed-attempt-log tmp/graph-feedback-bbc-seed-attempts.jsonl
node tools/crawl/index.js remote bounded --domains bbc.com --dry-run --remote-deploy always --remote-deploy-remote-dir /srv/crawler-test --remote-deploy-service crawl-server-v4-test --remote-deploy-status-host worker.example.com --remote-deploy-status-port 4300
```

Host matching is exact. An artifact generated for `www.bbc.com` intentionally
does not validate a plan that requests `bbc.com`, and the reverse is also true.
Regenerate the artifact with the exact host spelling that the planning command
will use. For profile-based planning, inspect the profile `options.domains`
first or run the compare command before the strict preview. For example,
`simple-distributed-smoke` currently plans `bbc.com`, so a `www.bbc.com`
artifact is expected to fail strict profile validation.
Hostless profiles such as `remote-status` and `remote-drain` report caveats
instead of guessing hosts. Orchestrator and e2e profiles with static domains
show exact hosts but note that live execution may choose additional runtime
phases or a remote/local path later.

---

## How to Run a Crawl — Decision Tree

### Harnessed vs Non-Harnessed Modes

| Mode | Use when | Preferred command | What it guarantees |
|------|----------|-------------------|--------------------|
| Harnessed validation | You need proof the remote crawl path can do useful work under a strict 15-minute cap. | `npm run crawl -- news-10x1000-15m-e2e` | Preflight health/throttle, bounded crawl budget, stop/drain, DB growth, host spread, failure ratio, ledger state, p50/p95 benchmark stats, JSON/log artifacts. |
| Harnessed dry-run/preflight | You need to inspect the exact plan or verify the remote is safe before spending 15 minutes. | `npm run crawl -- news-10x1000-15m-e2e --dry-run` or `--preflight-only` | No long crawl; confirms budget math or remote contracts. |
| Non-harnessed operator crawl | You want the normal 10-site crawl with remote-first orchestration and local fallback. | `npm run crawl -- news-10x1000` | Runs useful crawling but does not impose the e2e harness deadline or produce a pass/fail validation artifact. |
| Non-harnessed explicit remote | You need direct remote control, bounded domains, sync, drain, or recovery. | `node tools/crawl/crawl-remote.js <status|bounded|run|sync|pull|stop>` | Operator-controlled lifecycle; you are responsible for stop/sync/ledger verification. |
| Non-harnessed local/batch | Remote is unavailable or the user explicitly asks for local/in-process crawling. | `npm run crawl -- local-news-10x1000` or `npm run crawl -- batch ...` | Local API-driven jobs; requires unified UI when using `crawl-batch.js`. |

For harnessed live runs, always keep the generated `cloud-crawl-e2e-*.json` and `cloud-crawl-e2e-*.log` artifacts with the session notes. For non-harnessed remote runs, always confirm `crawl-remote.js status`, local DB growth (`npm run db:downloads:recent` / `npm run db:downloads:stats`), and ledger state before declaring the crawl complete.

### Monitored Small-Crawl Loop

Use this loop when development needs real crawl data without broadening remote
state or graph-feedback seeding:

```bash
node tools/crawl/monitored-small-crawl.js policy
node tools/crawl/monitored-small-crawl.js baseline --hosts bbc.com --out tmp/small-crawl-baseline.json --json
node tools/crawl/monitored-small-crawl.js local-smoke --json
node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json
node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report.json --json --out tmp/local-smoke-comparison.json
npm run crawl -- simple-distributed-smoke --dry-run
# Run a bounded crawl only when queue/deploy readiness is clean.
node tools/crawl/monitored-small-crawl.js verify --baseline tmp/small-crawl-baseline.json --since <crawl-start-iso> --until <crawl-end-iso> --hosts bbc.com --expected-min-downloads 1 --json
node tools/crawl/monitored-small-crawl.js recent --hosts bbc.com --window-min 1440 --limit 5 --json
```

Use `crawl-packet` before broadening from the tiny smoke into small or medium
local proof runs:

```bash
node tools/crawl/crawl-packet.js plan --crawl-class tiny-local --json --out tmp/crawl-packet-tiny.json
node tools/crawl/crawl-packet.js plan --crawl-class small-local --local-smoke-report tmp/local-smoke-report.json --json --out tmp/crawl-packet-small.json
node tools/crawl/crawl-packet.js plan --crawl-class medium-local --local-smoke-report tmp/local-smoke-report.json --json --out tmp/crawl-packet-medium.json
node tools/crawl/crawl-packet.js plan --crawl-class small-local --local-smoke-report tmp/local-smoke-report.json --verification-report tmp/small-local-verify.json --json --out tmp/crawl-packet-small-after-run.json
node tools/crawl/crawl-packet.js plan --crawl-class small-local --local-smoke-report tmp/local-smoke-report.json --verification-report tmp/small-local-verify.json --launch-report tmp/small-local-launch.json --watch-log tmp/small-local-watch.log --json --out tmp/crawl-packet-small-after-run.json
node tools/crawl/local-fixture-server.js --preset small --port 41901 --target-token small-YYYYMMDD-HHMM --plan --json --out tmp/small-local-fixture-plan.json
node tools/crawl/crawl-packet.js plan --fixture-preset small --fixture-port 41901 --fixture-target-token small-YYYYMMDD-HHMM --local-smoke-report tmp/local-smoke-report.json --json --out tmp/crawl-packet-small-fixture-plan.json
node tools/crawl/local-fixture-server.js --preset medium --port 41902 --target-token medium-YYYYMMDD-HHMM --plan --json --out tmp/medium-local-fixture-plan.json
node tools/crawl/crawl-packet.js plan --fixture-preset medium --fixture-port 41902 --fixture-target-token medium-YYYYMMDD-HHMM --local-smoke-report tmp/local-smoke-report.json --json --out tmp/crawl-packet-medium-fixture-plan.json
node tools/crawl/index.js local-small-reliability --dry-run
node tools/crawl/index.js local-medium-reliability --dry-run
```

The packet is no-contact by default: it writes only `--out`, never starts a
crawler, never contacts the remote crawler, and never mutates queue/deploy
state. It records the exact watched local launch command, DB baseline/verify
commands, queue/deploy approval boundary, failure taxonomy, score, and next safe
action. In CLI use it also reads local DB exact-target freshness: if a target
URL already has response evidence, the packet lowers the score and recommends a
fresh exact URL or one-host proof before another watched small/medium run. Live
small/medium local execution should use the launch command from the packet only
after the tiny local smoke has produced clean DB evidence. The watched
small/medium launch commands include a bounded
`CRAWL_RUN_SERVER_READY_TIMEOUT_MS` value so UI startup does not fail at the
default 30-second readiness window; the watch and DB verification budgets remain
separate and explicit. Packet-generated fixture launches also force
`--batch-retries 0 --batch-request-timeout-ms 60000`; a timed-out
operation-start request must be preserved as launch uncertainty rather than
retried into duplicate local operation jobs. Attach `--verification-report` after a live small/medium
attempt so DB failures become part of the scored packet. Attach
`--launch-report` and `--watch-log` when stdout/stderr were saved from a watched
`run.js` attempt; the packet records accepted/failed launch targets and parses
the final watch line so `partial-launch`, `watch-timeout`, `no-new-data`,
`poll-error`, accepted-job unobservability, and weak content proof cases are
visible without reading raw logs. For loopback-only fixture URLs
(`localhost`/`127.*`/`::1`), the packet marks
`contactsInternetTargetsWhenExecuted=false`; it still marks
`writesLocalDbWhenExecuted=true` because the watched local crawler writes DB
evidence. Prefer `--fixture-target-token <token>` for repeated fixture proofs:
the token makes fresh deterministic URLs without internet contact and prevents
same-URL cache/history from hiding new-data failures. Packets also include
host-level launch/watch/DB proof summaries and warn with `host-mismatch` when
medium verification is missing recent DB evidence for requested hosts. Watched
local runs can require both a global DB fetch threshold and a requested-host
threshold: use `--watch-min-fetches <n>` with `--watch-min-hosts <n>`. A medium
fixture proof should not be treated as clean unless
`watchFinal.minHostsMet=true` and DB verification has no
`missingRecentEvidence` hosts.

When a local multi-target launch exits partially but has accepted jobs,
`run.js --watch --watch-min-fetches <n>` may continue watching the accepted
subset under the same bounded watch budget. Add `--watch-min-hosts <n>` for
small/medium fixture proofs where per-host coverage matters. If fetches arrive
from too few requested hosts, watch exits nonzero with
`local-host-coverage-not-met` or
`local-job-terminal-without-host-coverage`, and the packet classifies the run as
`watch-host-coverage-not-met`/`host-mismatch`. The process still preserves the
nonzero launch result after the watch so automation cannot mistake a partial
target failure for a clean pass.

Local watch job-registry polling is intentionally bounded below the watch tick
interval. When launch accepted job IDs are available, watch polls
`/api/v1/crawl/jobs/:jobId` for those specific jobs before falling back to the
broad `/jobs` list, so medium packets are tied to accepted operation jobs
rather than retry-created jobs. If the job endpoint is slow while the crawler is
busy, JSON watch ticks and `watchFinal` include unavailable job evidence with a
poll-error count instead of silently returning `jobs=null`. Clean local launches
also carry accepted launch job IDs into `watchFinal.launchJobs`, so a timeout
can still be tied back to the accepted operation job even when the live job
endpoint is unobservable.

Medium fixture packets include a no-contact
`preflight.sequentialStrategy` fallback and helper commands. Use
`sequential-fixture-proof.js` when concurrent medium fixture launches block on
`partial-launch`, `watch-host-coverage-not-met`, or single-host DB proof. The
helper starts the loopback fixture server, launches one host at a time with
`--watch-min-fetches 1 --watch-min-hosts 1`, verifies each host, composes one
medium verification/launch/watch summary, rebuilds the medium packet, and can
compare it to the blocked concurrent packet:

```bash
node tools/crawl/sequential-fixture-proof.js plan --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --artifact-prefix tmp/medium-sequential-live --local-smoke-report tmp/local-smoke-report.json --json --out tmp/medium-sequential-live-plan.json
node tools/crawl/sequential-fixture-proof.js execute --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --artifact-prefix tmp/medium-sequential-live --local-smoke-report tmp/local-smoke-report.json --comparison tmp/local-smoke-comparison.json --compare-with tmp/crawl-packet-medium-concurrent.json --json --out tmp/medium-sequential-live-result.json
```

Compare saved packets file-only with:

```bash
node tools/crawl/crawl-packet.js compare --packet tmp/crawl-packet-medium-concurrent.json --packet tmp/crawl-packet-medium-sequential.json --json --out tmp/medium-concurrent-vs-sequential-comparison.json
```

The comparison is no-contact and file-only. Treat a clean sequential packet as
the current medium loopback reliability rung until the concurrent local launch
path can prove every requested host in one batch. Sequential packets now also
surface per-target job terminal state. If DB proof succeeds while accepted
operation jobs still report `running`, the packet remains usable but carries
`job-still-running-after-db-proof` so operators know the proof stopped at DB
evidence rather than job terminal completion.

DB proof remains the default stopping condition for sequential medium fixture
proofs. When you need a bounded post-proof job-status diagnostic, add
`--wait-for-terminal --terminal-wait-timeout <seconds>` to
`sequential-fixture-proof.js execute`. This polls accepted job IDs after DB
proof without broadening target contact. If terminal status is still unavailable
or non-terminal when the terminal wait budget expires, the packet remains
usable when DB and host proof passed, but it carries
`job-terminal-wait-after-db-proof-incomplete` as an operator warning. Treat
that warning as job endpoint responsiveness evidence, not as a DB proof
failure.

`monitored-small-crawl` uses DB-owned `downloadEvidence` APIs through
`src/data/db/queries/downloadEvidence.js`. It does not start crawlers, contact
the remote fleet, write database rows, prune queues, force deploy, or change
`collect` in `policy`, `baseline`, `recent`, `verify`, and `local-smoke`
planning mode. `local-smoke --execute` is the deliberately tiny exception: it
starts a local UI-backed crawl on an isolated port, caps itself to one host,
1-3 pages, depth 0-1, auto-stops, and expects new local DB rows as the thing
being verified. The actual bounded crawl/sync command is the only allowed
source of new DB rows, and its output must be followed by the verification
report. `local-smoke --execute` exits nonzero when the watch path times out or
when its own verification report is blocked, while still writing the bounded
JSON evidence requested with `--out`. A started local operation job is not
enough for a verified pass; response/content evidence must appear in
`data/news.db` through the DB-owned download evidence API.

Recent and verify reports include a bounded `evidence.queryTimings` block and
the human output prints DB evidence timings. Treat slow-timing warnings as a
CLI reliability issue before broadening crawl scope; the recent evidence query
path is owned by `news-crawler-db`, not local SQL in this repo.

Use `monitored-small-crawl compare` after each saved local-smoke report. It is
file-only and read-only; it compares saved reports, summarizes DB deltas,
command/profile identity, no-new-data evidence, DB timing regressions, and
stable pass/fail evidence without rerunning crawls or dumping candidate URLs.
It explicitly flags partial-persistence cases such as URL-only DB deltas,
started jobs with no fetch evidence, stale `latestFetchedAt`, and missing
recent samples. Local-smoke reports keep bounded stdout/stderr tails and parsed
`watchFinal` evidence so timeout/min-fetch failures are visible without storing
full child output.

The unified Cloud Crawl dashboard status payload includes a
`monitoredSmallCrawl` report and uses its bounded recent samples as a fallback
for the visible Recent Downloads list. The payload also includes
`monitoredSmallCrawlSummary`, and the Cloud Crawl health card shows a compact
recent-crawl readiness/count/timing cell, giving operators a quick overview of
recent crawled pages by host/window while preserving the no-action policy.

```
What kind of crawl do you need?
│
├── 🔹 Quick status check / "are crawlers running?"
│   └── npm run crawl -- remote-status
│       (or: node tools/crawl/crawl-remote.js status)
│
├── 🔹 Smallest distributed-node smoke (1 domain × 5 pages)
│   └── npm run crawl -- simple-distributed-smoke --dry-run    # preview
│       npm run crawl -- simple-distributed-smoke              # run
│
├── 🔹 Larger bounded smoke (3 domains × 50 pages)
│   └── npm run crawl -- remote-bounded-smoke
│
├── 🔹 Remote/cloud 10-site operator crawl (10 domains × 1000 pages)
│   └── npm run crawl -- news-10x1000
│       (non-harnessed remote-first default; confirmed local save then exact remote payload prune)
│
├── 🔹 Strict 15-minute cloud crawl e2e validation
│   └── npm run crawl -- news-10x1000-15m-e2e
│       npm run crawl -- news-10x1000-15m-e2e --dry-run
│       npm run crawl -- news-10x1000-15m-e2e --preflight-only
│       (harnessed 15-minute hard cap; validates DB growth, host spread, ledger, health, and p50/p95 stats)
│
├── 🔹 Remote bounded crawl (specific domains)
│   └── npm run crawl -- remote bounded --domains bbc.com,reuters.com --max-pages 50 --max-concurrent 2
│
├── 🔹 Batch start N in-process crawls against the unified UI (single command)
│   └── npm run crawl -- local-news-10x1000                   # explicit local fallback preset
│       npm run crawl -- batch --preset news-5 --max-pages 200
│       npm run crawl -- batch --urls-file urls.txt --concurrency 4 --json
│       (Requires unified UI on UI_HOST:UI_PORT, default 127.0.0.1:3000,
│        started with UI_ALLOW_MULTI_JOBS=true for parallel jobs.)
│
├── 🔹 Start/manage remote crawl server
│   └── npm run crawl -- remote-deploy --dry-run
│       npm run crawl -- remote-deploy --apply
│       npm run crawl -- remote-deploy --apply --force   # only when intentionally interrupting active work
│       (Builds remote crawler v2 + news-crawler-db adapter package, checks /api/status,
│        preserves remote data/, overwrites code, installs deps, and restarts PM2 crawl-server-v4.)
│
├── 🔹 Local intelligent crawl
│   └── npm run crawl -- intelligent [args]
│
├── 🔹 Place hub crawling
│   └── npm run crawl -- place-hubs-local
│       (or: npm run crawl -- place-hubs [args])
│
└── 🔹 Legacy config-driven crawl
    └── npm start  (runs node src/crawl.js)
        See docs/cli/crawl.md for commands & override precedence
```

The simple distributed smoke path is:
`npm run crawl -- simple-distributed-smoke` → `tools/crawl/index.js` → `tools/crawl/profiles/simple-distributed-smoke.json` → `tools/crawl/crawl-remote.js bounded --domains bbc.com --max-pages 5` → Oracle/v2 multi-domain server `/api/status`, `/api/domains/add` when needed, `/api/start`, repeated `/api/status` until complete.

The strict validation harness path is:
`npm run crawl -- news-10x1000-15m-e2e` → `tools/crawl/index.js` → `tools/crawl/profiles/news-10x1000-15m-e2e.json` → `tools/crawl/cloud-crawl-e2e.js` → remote preflight (`/api/health`, `/api/throttle`, `/api/content/stats`, `/api/status`) → `crawl-remote.js run` with bounded sync/prune → remote stop → drain sync → local DB/ledger/log validation artifact.

---

## Writer-DB Isolation — Proven, and the Closed `fetched=0` Leak

The `--crawl-db <path>` writer redirect is **isolation-proven end-to-end**
(2026-05-30). A real BBC crawl redirected to
`data/samples/internet-small-sample.db` produced sample delta **+16 responses /
+6 content** while production `data/news.db` stayed **exactly unchanged (delta
0/0/0)** — see `tests/core/crawler/config/writer-db-isolation.test.js` and
`tmp/iso-small-proof.json`.

**Closed leak ledger:** when `--crawl-db` redirects the writer, the legacy live
throughput meter and the `run.js --watch-min-fetches` gate read the **default
production meter DB**, not the redirected writer. A successful isolated crawl
therefore looked like `fetched=0` and exited 2 (false negative). The fix is a
**writer-DB-aware monitor** that reads the writer (sample) DB directly.

### Writer-DB-Aware Crawl-Progress Monitor (`crawl-progress-monitor`)

`tools/crawl/crawl-progress-monitor.js` (lib: `tools/crawl/lib/crawl-progress-monitor.js`)
is a **read-only** agentic progress poller for scaled, isolated crawls. It opens
the writer DB read-only, reads the DB-owned snapshot, and emits a compact,
machine-readable progress packet an agent can poll on a cadence. It never starts
a crawler, contacts a remote host, writes DB rows, or mutates a queue.

```bash
# Poll an isolated crawl's writer DB against a 1000-download target:
node tools/crawl/crawl-progress-monitor.js progress \
  --writer-db data/samples/internet-small-sample.db \
  --target-downloads 1000 --elapsed-ms 60000 \
  --baseline tmp/iso-sample-before.json --json --out tmp/progress.json
```

Packet shape (`mode: crawl-progress-monitor`, `schemaVersion: 1`):
`actionPolicy{readOnlyReport,startsCrawler:false,contactsRemote:false,writesLocalDb:false}`,
`writerDb{path,exists}`, `target{downloads}`, `elapsedSec`, `downloads`
(=successResponses), `contentDownloads`, `successResponses`, `failedResponses`,
`progress{fraction,percent,remaining,reached}`, `dbGrowth{...}|null` (vs
baseline), `throughput{docsPerSec,bytesPerSec}`, `latestFetchedAt`,
`msSinceLastDownload`, `stalled`, `anomalies[]`
(`db-shrank-vs-baseline`, `no-downloads-yet`, `high-failure-ratio`,
`exceeded-target`, `writer-db-missing`), `projectedCompletion{etaSec,etaIso,basis}|null`,
and `verdict` (`idle`|`in-progress`|`stalled`|`target-reached`). Exit codes: 0
normal/in-progress/reached, 3 stalled or writer-DB missing, 2 on error/bad args.
Unit + CLI tests live in `tests/tools/crawl/crawl-progress-monitor.test.js`.

**Self-clocking elapsed (2026-05-31):** the packet now reports `elapsedSource`
(`db-latest-fetched-delta` | `elapsed-ms-arg` | `none`). When the baseline
snapshot carries a `latestFetchedAt`, `elapsedSec` is derived from
`(current.latestFetchedAt − baseline.latestFetchedAt)` clamped ≥ 0 — never the
harness wall-clock, which once produced a **negative −3.5M ms** reading from a
session-clock vs file-timestamp skew. `--elapsed-ms` is only a fallback when the
baseline has no timestamp. The baseline loader also accepts the both-DB shape
from `tmp/snapshot-both-dbs.js` (`{ sample: { totals, latestFetchedAt }, production: { totals } }`),
so `dbGrowth` is a true DELTA, not absolute totals.

### Boot Preflight for Scaled Runs (REQUIRED for size ≥ small)

The auto-spawned unified UI trips a **30s readiness timeout on first launch**
(`auto-spawned unified UI did not become ready within 30s`). Before any crawl at
size ≥ small, export a longer readiness window so the first boot does not fail:

```powershell
$env:CRAWL_RUN_SERVER_READY_TIMEOUT_MS = "120000"   # 120s; required for runs >= small
node tools/crawl/run.js ... --crawl-db data/samples/internet-small-sample.db
```

Do NOT add harness start retries to work around this (duplicate-job risk). Set
the env var once per shell and leave start logic untouched.

### Gated Scaling Ladder (1k → 5k → 25k)

Each rung must be **isolation-proven to a sample DB under the monitor** (prod
delta 0) before promotion. Production-DB writes remain **GATED on small AND
medium sample proofs**:

1. **1k** — BBC crawl → `data/samples/internet-small-sample.db`, monitored, prod
   delta 0. (Next node.)
2. **5k** — broaden hosts → sample DB, monitored, prod delta 0.
3. **25k** — sample DB, monitored, prod delta 0; promote only after small+medium
   proofs pass and explicit approval.

---

## Unified Launcher Usage

The launcher (`tools/crawl/index.js`) is the preferred way to run crawl tools:

```bash
# List all available tools and profiles
npm run crawl -- list
npm run crawl -- list --json      # machine-readable

# Run a named profile (preferred for repeatable operations)
npm run crawl -- remote-bounded-smoke
npm run crawl -- remote-bounded-smoke --dry-run

# Run a tool directly with arguments
npm run crawl -- remote bounded --domains bbc.com --max-pages 50
npm run crawl -- remote status

# Explicit forms
npm run crawl -- profile remote-bounded-smoke
npm run crawl -- run remote bounded --domains bbc.com

# Help
npm run crawl -- help
```

**Precedence**: If a name matches both a tool and a profile, the tool wins. Reserved launcher commands (`help`, `list`, `profile`, `run`) require the explicit `profile <name>` form.

---

## Remote Crawl Operations

`crawl-remote.js` is the CLI for controlling the remote multi-domain crawl server.
`deploy-remote-server.js` is the CLI for replacing that server on the remote VM.

**Default host**: resolved in this order:
1. `--host <h:p>` flag
2. `process.env.CRAWL_REMOTE_HOST`
3. `process.env.FLEET_HOST` (host only — port `:3200` appended)
4. `tools/crawl/.fleet-host` file (host only)
5. Default `141.144.193.218:3200`

### Commands

```bash
# Check what's happening
node tools/crawl/crawl-remote.js status
node tools/crawl/crawl-remote.js health --host 141.144.193.218:3200

# Start/stop domains
node tools/crawl/crawl-remote.js start --all
node tools/crawl/crawl-remote.js start --domain bbc.com
node tools/crawl/crawl-remote.js stop --all

# Bounded crawl (start, wait for completion, exit)
node tools/crawl/crawl-remote.js bounded --domains bbc.com,reuters.com --max-pages 50 --max-concurrent 2 --poll 5 --timeout-min 30

# Domain management
node tools/crawl/crawl-remote.js add --domain nytimes.com --max-pages 100
node tools/crawl/crawl-remote.js seed --domain nytimes.com --urls https://www.nytimes.com
node tools/crawl/crawl-remote.js remove --domain nytimes.com

# Data sync
node tools/crawl/crawl-remote.js sync --interval 10    # continuous sync
node tools/crawl/crawl-remote.js pull --window 30       # single batch pull

# Error inspection
node tools/crawl/crawl-remote.js errors
node tools/crawl/crawl-remote.js content
node tools/crawl/crawl-remote.js queue-summary --domains bbc.com --json
node tools/crawl/crawl-remote.js queue-checklist --domains bbc.com

# Build/deploy the remote server runtime
node tools/crawl/deploy-remote-server.js                  # dry-run + busy check
node tools/crawl/deploy-remote-server.js --build-only     # local package only
node tools/crawl/deploy-remote-server.js --apply          # build, upload, overwrite, restart
node tools/crawl/deploy-remote-server.js --apply --force  # interrupt active crawl work
```

Deploy behavior:
- Builds `news-crawler-db` first, vendors its compiled DB adapter into the deployment package, and packages `deploy/remote-crawler-v2` plus `src/db/openNewsCrawlerDb.js`.
- Writes a timestamp build id into `deploy/remote-crawler-v2/build-info.json`; `/api/status` and `/api/health` expose it as `build`.
- In `--if-needed` mode, compares the local build timestamp with the remote build timestamp and skips deployment when the remote is current.
- Tracks local source mtimes in `tmp/remote-crawler-v2-deploy/build-manifest.json`, so normal preflight is a fast metadata check unless local crawler/DB source changed.
- Queries `/api/status` before applying. If the server is busy (`running`, active domains, pending URLs, or non-zero throughput), it exits without stopping PM2 and prints the exact `--force` rerun command.
- Remote install preserves `data/`, replaces only application code/package files, installs production dependencies, deletes/restarts PM2 `crawl-server-v4`, then optionally waits for `/api/status`.

Remote setup/recovery workflow:
- Fast health: `node tools/crawl/crawl-remote.js health --host 141.144.193.218:3200`, then `status --json`, then `npm run crawl -- news-10x1000-15m-e2e --preflight-only`.
- If broken or stuck: `node tools/crawl/crawl-remote.js stop --all --host 141.144.193.218:3200`, inspect status again, then use SSH/PM2 logs only when the API is unavailable.
- If deployment is needed: start with `node tools/crawl/deploy-remote-server.js --if-needed --apply --quiet-if-current`; use `--apply --force` only after deciding that interrupting active work is acceptable.
- If a deploy needs the default remote dir, current `deploy-remote-server.js`
  expands `~/apps/remote-crawler-v2` as `$HOME/apps/remote-crawler-v2` inside
  the remote shell. Older checkouts may need `--remote-dir
  /home/ubuntu/apps/remote-crawler-v2`.
- On Node 24 arm64, native dependencies such as `better-sqlite3` may compile
  from source; remote deploy requires build tooling (`build-essential`, `make`,
  `g++`, `python3`) or `npm install` can fail after PM2 is stopped.
- LOCAL Windows/WSL native-module mismatch: if a local spawned crawl crashes
  with `...better_sqlite3.node is not a valid Win32 application` (or the
  inverse under WSL), the sibling `news-crawler-db` better-sqlite3 addon was
  built for the *other* platform. Confirm by reading the `.node` magic bytes:
  `7F 45 4C 46` (`\x7FELF`) is a Linux build; `4D 5A` (`MZ`) is a Windows PE
  build. The native addon is dlopen'd lazily on the first `new Database(...)`,
  so a plain `require('news-crawler-db')` can succeed while the live crawl still
  fails. Fix by rebuilding for the current platform:
  `npm rebuild better-sqlite3` in `news-crawler-db` under the same node that the
  crawl spawns (`process.execPath`). Prior "working" runs under WSL leave a
  Linux addon that Windows node rejects, and vice versa.
- If deploy behavior is unclear or fails: read and improve `tools/crawl/deploy-remote-server.js`, `tools/crawl/lib/remote-deploy-preflight.js`, `tests/tools/remote-crawler-deploy.test.js`, `tests/tools/remote-deploy-preflight.test.js`, and this documentation before retrying a live deploy.
- Durable runbook: `docs/workflows/remote-crawler-health-recovery-deploy.md`.

For explicit bounded domains, `crawl-remote.js` registers any missing domain with `/api/domains/add` before starting. That keeps the simple distributed smoke profile usable even when the Oracle server was launched with a narrower domain config.

### Remote-First Storage Drain Policy

Use the remote crawler by default for medium/large crawls. The local/in-process batch path is a fallback for local debugging or remote outages, not the operator default.

### Concurrent local launch: accepted-but-no-rows means late start (not a crash)

Under `--batch-concurrency >1`, an in-process `/start` accepted late can show as
"accepted but no recent DB rows". This is the synchronous-boot starvation root:
the first host's engine+DB boot blocks the event loop, so the second concurrent
socket can reset (`read ECONNRESET`) and a queued third host's `/start` is not
accepted until the prior crawl frees the loop (~one host-crawl later). The late
job is genuinely `running`, just started too late to commit rows inside the
bounded watch window. Fix is server-side (accept-before-boot); locally, prefer
the sequential rung for the canonical medium proof. See
`docs/sessions/2026-05-29-crawler-reliability-recursive-plan/SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md`.

### Packet cadence comparison: small vs medium (no-contact)

To see at a glance how the small and medium sequential rungs compare, run the
read-only cadence comparison over two already-saved reliability packets:

```
node tools/crawl/crawl-packet.js cadence \
  --small tmp/crawl-packet-small-jobid-live.json \
  --medium tmp/medium-sequential-terminalcap-packet.json \
  --json --out tmp/small-vs-medium-cadence-comparison.json
```

It emits `mode: crawl-packet-cadence-comparison` with per-rung summaries
(`score`, `db{downloads,success,content}`, `hostCoverage`, `label`,
`taxonomy`, `blockers`), medium-minus-small `deltas`, a taxonomy diff
(`shared`/`onlySmall`/`onlyMedium`), and a `cadenceConsistent` boolean.
Exit is 0 when consistent (same score percent, same taxonomy, no blockers),
2 otherwise. It starts no crawler, contacts nothing, and writes no DB rows —
only the `--out` artifact.

Refresh the small rung before trusting a saved cadence artifact: produce a
fresh bounded loopback small packet (start `local-fixture-server.js --preset
small`, capture a pre-run baseline, run the watched `run.js` launch against the
single loopback target, `monitored-small-crawl.js verify` over the launch
window, then `crawl-packet.js plan --fixture-preset small ...`), and feed that
fresh packet in as `--small`. A 2026-05-30 fresh small refresh (token
`small-cadence-20260530-224344`) scored `ready-for-small-local` 96% (27/28)
with taxonomy `[target-already-processed]` only — a warm UI meant
`jobPollErrors=0`, so the small rung did NOT carry the `poll-error` the saved
medium rung still shows. The comparison then correctly reports
`cadenceConsistent:false` (small 96% vs medium 93%; `poll-error` only in
medium). That divergence is benign and expected: medium's `poll-error` is the
known synchronous-boot job-registry timeout (see the server-side spec), not a
small-rung regression. If a live small refresh would require disallowed
contact or a cross-repo change, pass the saved small packet instead and note
why the live refresh was skipped.

### Packet comparison card (dashboard widget, no-contact)

To surface the cadence comparison as a compact dashboard "card", run the
read-only card renderer:

```
node tools/crawl/crawl-packet.js card \
  --cadence tmp/small-vs-medium-cadence-comparison.json --json
```

It accepts a saved `crawl-packet-cadence-comparison` artifact via `--cadence`,
or builds one on the fly from `--small <packet> --medium <packet>`. It emits
`mode: crawl-packet-comparison-card` with one row per rung (`scorePercent`,
`db{downloads,success,content}`, `hostCoverage{requested,dbCovered,dbMissing}`,
`taxonomy`, `blockers`) plus a `verdict{cadenceConsistent, diagnostics,
nextSafestAction}`. Add `--html` for a read-only HTML `<section>` fragment
(no `<script>`, all values HTML-escaped) and `--out <path>` to save the JSON or
HTML. Exit is 0 when the cadence is consistent, 2 otherwise. The card is
strictly read-only: no crawler start, no network, no DB write, no queue
mutation. Use `--cadence` (saved cadence artifact) — do NOT confuse it with
plan mode's `--comparison` (saved local-smoke comparison).

### Continuation-state validator growth guard

`node tools/crawl/validate-continuation-state.js` now accepts `--max-lines <n>`
(default 800). When `CONTINUATION_PROMPT.md` exceeds that line count it prints a
non-fatal `WARN:` line pointing at the
`split_execution_state_to_standalone_file_if_growth_warrants` node. The warning
never changes the exit code, so the recursive loop stays green while still
getting an objective, evidence-based trigger to split the serialized state into
a standalone file instead of relying on a judgement call.


For storage-constrained crawler nodes, sync and cleanup must follow this order:

1. Export a full payload batch from `/api/export/batch` (`includeContent=true`, `includeLinks=true`).
2. Ingest the batch into local `data/news.db`.
3. Confirm the local DB contains the exported URLs, responses, content rows, and links.
4. Prune the remote node with exact exported `urlIds`, not a watermark-only sweep.
5. Retain remote URL state rows while crawls are active unless `--prune-delete-urls` is explicitly requested for a completed/manual maintenance run.

`--prune-after-ingest` enforces this sequence in `crawl-remote.js`. It refuses partial exports because metadata-only sync cannot safely delete content/link payloads that were not transferred. The five-second metadata lane is useful for UI visibility, but it must not be combined with destructive pruning.

### Adaptive Sync Batching

Use adaptive batching when the operator wants a duration budget instead of a fixed row count:

```bash
node tools/crawl/crawl-remote.js sync --adaptive-limit --target-sync-ms 5000 --limit 5 --min-limit 1 --max-limit 25
```

The controller starts at `--limit`, shrinks immediately after slow/error rounds, and grows only after repeated fast full batches. It uses total round work time: remote fetch + local ingest + local verification + remote prune. For confirmed-prune production profiles, prefer conservative caps (`min=1`, `max=25`) because content and link payload size varies sharply by page.

Use `/api/health` for lightweight status under load. Reserve `/api/status` for bounded completion polling or cases where detailed per-domain state is required.

### Remote Server Configs

The v2 server accepts either CLI domains or a JSON config:

```bash
node deploy/remote-crawler-v2/multi-domain-server.js --config deploy/remote-crawler-v2/crawl-domains.simple.json
node deploy/remote-crawler-v2/multi-domain-server.js --config deploy/remote-crawler-v2/crawl-domains.bounded-smoke.json
node deploy/remote-crawler-v2/multi-domain-server.js --domains bbc.com,reuters.com --max-pages 50 --max-concurrent 2
```

Config files may set `port`, `db`, `maxPages`, `maxConcurrent`, `idleTimeoutMin`, `coordinatorMode`, `autoStart`, and `domains`. CLI flags override config values. The smoke configs set `autoStart: false` so the Oracle server can sit ready until a profile starts bounded work.

### Remote Server Architecture

```
Remote VM (141.144.193.218)           Local Machine
┌─────────────────────────┐           ┌──────────────────┐
│ multi-domain-server.js  │──batch──→ │ crawl-remote.js  │
│ (single process,        │  export   │ (pull / sync)    │
│  N CrawlWorkers,        │           │       │          │
│  shared SQLite DB)      │           │       ▼          │
│                         │           │  data/news.db    │
└─────────────────────────┘           └──────────────────┘
```

- **Server code**: `deploy/remote-crawler-v2/multi-domain-server.js`
- **Domain config**: `deploy/remote-crawler-v2/crawl-domains.json`

---

## Crawl-Adjacent NPM Scripts

These NPM scripts relate to crawling but use tools outside `tools/crawl/`:

### Database Inspection

| Script | Purpose |
|--------|---------|
| `npm run db:downloads` | Full download listing |
| `npm run db:downloads:recent` | Last 25 downloads |
| `npm run db:downloads:today` | Today's downloads |
| `npm run db:downloads:stats` | Download statistics |
| `npm run db:downloads:hosts` | Downloads by host |
| `npm run crawl:monitored-small` | Bounded small-crawl DB baseline/recent/verify evidence |

### Intelligent Crawl Server (ICS)

The ICS is a separate background service for intelligent crawling, managed via `tools/dev/intelligent-crawl-server.js`:

| Script | Purpose |
|--------|---------|
| `npm run ics:start` | Start ICS server (background, port 3150) |
| `npm run ics:stop` | Stop ICS server |
| `npm run ics:status` | Show server status |
| `npm run ics:crawl:start` | Start a crawl via ICS |
| `npm run ics:crawl:stop` | Stop ICS crawl |
| `npm run ics:db:status` | ICS database status |
| `npm run ics:db:export` | Export ICS database |
| `npm run ics:backfill` | Backfill missing data |

### V4 Supervisor

| Script | Purpose |
|--------|---------|
| `npm run v4:supervisor` | Run V4 fleet supervisor (local) |
| `npm run v4:supervisor:remote` | Run V4 fleet supervisor (remote target) |
| `npm run v4:server:single` | Single-process V4 crawl (max 4 resources) |

### Mini Crawl

| Script | Purpose |
|--------|---------|
| `npm run crawl:mini` | Quick mini crawl via `tools/dev/mini-crawl.js` |

### Test Hang Analyzer

Static analysis to catch test patterns that commonly hang Jest (spawn without kill, setInterval without cleanup, puppeteer.launch without close, missing per-test timeouts, unbounded loops, SSE/sqlite leaks).

| Script | Purpose |
|--------|---------|
| `npm run test:hang-check` | Scan `tests/` and exit 1 on any error-severity finding |
| `npm run test:hang-report` | Write a full JSON report to `tmp/test-hang-report.json` |

Source: `tools/dev/test-hang-analyzer.js`. Regression tests: `tests/tools/test-hang-analyzer.test.js`.

---

## Legacy Local Crawling

For config-driven local crawling (operations, sequences, place commands):

```bash
npm start                    # Default config-driven crawl
node crawl.js availability   # List operations and sequences
```

See [docs/cli/crawl.md](../../docs/cli/crawl.md) for full CLI reference including:
- Override precedence (CLI flags > JSON blobs > config > defaults)
- Verbosity modes (`--output-verbosity`, `--json`)
- Sequence/operation commands

---

## Known Issues

> [!NOTE]
> The `CliFormatter` import paths in `intelligent-crawl.js`, `crawl-multi-modal.js`, `crawl-place-hubs.js`, and `list-place-hubs.js` were fixed (April 2025). All tools should now load without MODULE_NOT_FOUND errors.

> [!NOTE]
> 55 broken NPM scripts (`fleet:*`, `v4:*`, `data:*`, etc.) that referenced non-existent files were removed from `package.json` (April 2025). The remaining scripts all point to real files.

---

## Related Paths

| Path | Relationship |
|------|-------------|
| `src/v4/` | V4 distributed crawl system |
| `deploy/remote-crawler-v2/` | CrawlWorker + multi-domain server |
| `tools/remote-crawl/` | Legacy Oracle crawler scripts; do not use for the simple distributed smoke path |
| `src/core/crawler/` | V1/V3 core crawler pipeline |
| `tools/dev/intelligent-crawl-server.js` | ICS server management |
| `tools/dev/mini-crawl.js` | Quick mini crawl script |
| `tools/dev/db-downloads.js` | Download DB inspection |
| `data/news.db` | Main local crawl database |
| `docs/cli/crawl.md` | Legacy CLI quick reference |
| `docs/RUNBOOK.md` | Operational runbook (legacy focus) |

---

## Related Agent Specs

| Agent | When to Use |
|-------|------------|
| 🕷️ Crawler Singularity | Architecture-level crawler changes |
| 💡UI Singularity💡 | Crawler UI / dashboard work |
