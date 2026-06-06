# Crawl CLI quick reference

**Scope**: Crawl commands for operators and agents. Start here for command choice, then use [tools/crawl/AGENT.md](../../tools/crawl/AGENT.md) for full remote/fleet details.

Terminology: **simple crawl** means low-scope/easy-to-run, not local-only. The preferred simple crawl is the distributed smoke profile in `tools/crawl`: `npm run crawl -- simple-distributed-smoke`.

## Harnessed vs Non-Harnessed Crawls

| Mode | Command | Use for | Output / validation |
|------|---------|---------|---------------------|
| Harnessed 15-minute e2e | `npm run crawl -- news-10x1000-15m-e2e` | Proving cloud crawl readiness under a strict time limit. | JSON/log artifact, pass/fail checks, DB growth, host spread, failure ratio, ledger state, benchmark stats. |
| Harnessed dry-run | `npm run crawl -- news-10x1000-15m-e2e --dry-run` | Inspecting the exact budget/arguments without network or DB work. | Plan artifact only. |
| Harnessed preflight | `npm run crawl -- news-10x1000-15m-e2e --preflight-only` | Verifying remote health/throttle/content/status before a live validation. | Preflight artifact; no long crawl. |
| Non-harnessed operator crawl | `npm run crawl -- news-10x1000` | Normal useful 10-domain crawling. | Remote-first orchestration with sync/prune, but no e2e pass/fail artifact or hard 15-minute harness. |
| Non-harnessed remote direct | `node tools/crawl/crawl-remote.js <command>` | Manual status, start/stop, bounded, run, sync, pull, or recovery work. | Direct control; operator must verify stop/sync/ledger/DB state. |
| Non-harnessed local/batch | `npm run crawl -- local-news-10x1000` or `npm run crawl -- batch ...` | Explicit local fallback or API-launched in-process jobs. | Requires local services as documented by the selected tool. |

Harnessed crawls are for validation and diagnostics. Non-harnessed crawls are for ordinary data collection or manual operations. After non-harnessed remote work, check `npm run crawl -- remote-status`, `npm run db:downloads:recent`, `npm run db:downloads:stats`, and ledger state before calling the crawl complete.

## Quick Entry Points

| Task | Command |
|------|---------|
| **Unified launcher** (preferred) | `npm run crawl -- <tool> [args]` |
| **Strict e2e harness** | `npm run crawl -- news-10x1000-15m-e2e` |
| **Default operator crawl** | `npm run crawl -- news-10x1000` |
| **Simple distributed crawl** | `npm run crawl -- simple-distributed-smoke` |
| **No-contact reliability packet** | `node tools/crawl/crawl-packet.js plan --crawl-class tiny-local --json` |
| **Tiny local DB proof** | `node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json` |
| **Small loopback fixture proof plan** | `node tools/crawl/crawl-packet.js plan --fixture-preset small --fixture-target-token small-YYYYMMDD-HHMM --local-smoke-report tmp/local-smoke-report.json --json` |
| **Medium loopback fixture proof plan** | `node tools/crawl/crawl-packet.js plan --fixture-preset medium --fixture-target-token medium-YYYYMMDD-HHMM --local-smoke-report tmp/local-smoke-report.json --json` |
| **Sequential medium fixture proof** | `node tools/crawl/sequential-fixture-proof.js execute --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --artifact-prefix tmp/medium-sequential-live --local-smoke-report tmp/local-smoke-report.json --comparison tmp/local-smoke-comparison.json --json --out tmp/medium-sequential-live-result.json` |
| **Sequential proof with terminal wait** | `node tools/crawl/sequential-fixture-proof.js execute --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --artifact-prefix tmp/medium-sequential-terminal-wait --local-smoke-report tmp/local-smoke-report.json --comparison tmp/local-smoke-comparison.json --wait-for-terminal --terminal-wait-timeout 15 --json --out tmp/medium-sequential-terminal-wait-result.json` |
| **Compare medium packets** | `node tools/crawl/crawl-packet.js compare --packet tmp/crawl-packet-medium-concurrent.json --packet tmp/crawl-packet-medium-sequential.json --json` |
| **Compare small vs medium cadence** | `node tools/crawl/crawl-packet.js cadence --small tmp/crawl-packet-small-jobid-live.json --medium tmp/medium-sequential-terminalcap-packet.json --json --out tmp/small-vs-medium-cadence-comparison.json` |
| **Render comparison card** | `node tools/crawl/crawl-packet.js card --cadence tmp/small-vs-medium-cadence-comparison.json --json` (add `--html --out tmp/small-vs-medium-card.html` for a read-only HTML fragment) |
| **Remote crawl ops** | `node tools/crawl/crawl-remote.js <command>` |
| **Local intelligent crawl** | `npm run crawl -- intelligent [args]` |
| **DB download stats** | `npm run db:downloads:stats` |
| **Legacy config crawl** | `npm start` |

## See also

Small/medium fixture packets now emit launch commands with
`--watch-min-fetches`, `--watch-min-hosts`, `--batch-retries 0`, and
`--batch-request-timeout-ms 60000`. A medium fixture run that reaches
the fetch threshold from only one host, or launches only a subset of requested
hosts, is blocked as
`watch-host-coverage-not-met`/`host-mismatch`; use the packet's
`watchFinal.coveredHosts`, `missingLocalTargets`, launch accepted/failed
summary, and host proof summary before broadening scope.
Medium fixture packets also include a sequential per-host fallback strategy and
helper command. When concurrent medium is blocked, run
`sequential-fixture-proof.js execute` with a fresh target token; it starts
loopback fixtures, runs one host at a time, composes per-host launch/watch/DB
artifacts into one medium packet, then can compare the concurrent and
sequential packets with `crawl-packet.js compare`. The packet includes
per-target terminal-state evidence; `job-still-running-after-db-proof` means
DB proof passed before accepted operation jobs reached a terminal status.
Optional `--wait-for-terminal --terminal-wait-timeout <seconds>` adds a bounded
post-DB-proof job-status diagnostic. Incomplete terminal wait is a packet
warning, not a blocker, when DB proof and host coverage are already clean.
During the terminal-wait phase the per-poll `/jobs/:jobId` request budget is
raised to `--watch-terminal-job-poll-timeout <ms>` (default 5000, clamped
1500–5000) so the in-process CPU-bound crawl cannot starve the cheap job route
and emit false "endpoint unavailable" evidence. The terminal-wait outcome is
classified into exactly three states — `terminal`, `timed-out`, or
`endpoint-unavailable` — and the packet records `jobPolls`, `jobPollErrors`,
`endpointResponded`, and `jobPollTimeoutMs`. Incomplete sub-states surface as
`job-terminal-wait-timed-out` vs `job-terminal-wait-endpoint-unavailable`.

To compare the small and medium sequential rungs without any crawl, run
`crawl-packet.js cadence --small <packet> --medium <packet>`. It reads two
already-saved reliability packets and emits a
`crawl-packet-cadence-comparison` artifact with per-rung summaries, taxonomy
diff, medium-minus-small deltas, and a `cadenceConsistent` boolean (exit 0 when
consistent, 2 otherwise). It is read-only: no crawler start, no network, no DB
writes. Refresh the small rung first (start `local-fixture-server.js --preset
small`, baseline, watched `run.js` launch, `monitored-small-crawl.js verify`,
then `crawl-packet.js plan --fixture-preset small ...`) so the artifact
reflects a current small rung; a warm-UI fresh small run can score 96% with
`jobPollErrors=0`, which legitimately diverges from the saved medium rung's
`poll-error` (the known synchronous-boot job-registry timeout) and is reported
as `cadenceConsistent:false`.

To surface that cadence comparison as a compact dashboard widget without any
crawl, run `crawl-packet.js card --cadence <saved cadence artifact>` (or
`card --small <packet> --medium <packet>` to build the comparison on the fly).
It emits a `crawl-packet-comparison-card` object with one row per rung
(score percent, db downloads/success/content, host coverage, taxonomy,
blockers) plus the `cadenceConsistent` verdict, divergence diagnostics, and the
next safest action. Add `--html` for a read-only HTML `<section>` fragment
(no `<script>`, all values HTML-escaped) suitable for embedding in a dashboard;
add `--out <path>` to save the JSON or HTML. Card mode is strictly read-only:
no crawler start, no network, no DB write, no queue mutation. Exit is 0 when
the cadence is consistent, 2 otherwise — note `--cadence` (saved cadence
artifact) is distinct from plan mode's `--comparison` (saved local-smoke
comparison).

- [tools/crawl/AGENT.md](../../tools/crawl/AGENT.md) - primary crawl tool reference
- [Crawler reliability recursive plan](../sessions/2026-05-29-crawler-reliability-recursive-plan/CRAWLER_RELIABILITY_RECURSIVE_PLAN.md) - current small/medium crawl packet, watch, DB proof, and failure taxonomy workflow
- [Session: Cloud Crawl 15m Validation](../sessions/2026-05-09-cloud-crawl-15m-validation/SESSION_SUMMARY.md) - latest live harness evidence and edge-case notes

## Commands

The commands below are for the legacy config-driven `crawl.js` path. Prefer `npm run crawl -- ...` for current remote/operator workflows unless the user explicitly asks for this older interface.

- Default run (no command): uses config defaults (crawlDefaults) or runner config if provided.
- availability: show operations and sequences; flags: --all, --operations, --sequences.
- run-operation <operationName> <startUrl>: execute one operation; flags: --overrides JSON.
- run-sequence <sequenceName> <startUrl>: execute a preset; flags: --shared-overrides JSON, --step-overrides JSON, --continue-on-error.
- run-sequence-config <configName>: execute a sequence defined in config files; flags: --config-dir, --config-host, --start-url, --shared-overrides JSON, --step-overrides JSON, --config-cli-overrides JSON, --continue-on-error.
- place guess <domain|url>: guess hubs/topics; flags: --kinds, --limit, --apply, --json, plus planner/crawl overrides.
- place explore <domain|url>: crawl a domain/url for hubs; flags: --overrides JSON, --output-verbosity, --json.

## Override precedence (highest to lowest)
1) CLI flags for overrides (e.g., --max-downloads, --limit, --output-verbosity, --concurrency, --planner-verbosity, --logging-queue).
2) Per-command JSON flags (--overrides, --shared-overrides, --step-overrides, --config-cli-overrides).
3) Shared overrides passed to main (parseSharedOverrides argv) and runner config sharedOverrides/stepOverrides.
4) Default run config (configService.getDefaultRunConfig): crawlDefaults in config.json.
5) Hard defaults: DEFAULT_START_URL, DEFAULT_SEQUENCE_PRESET, DEFAULT_BASIC_OUTPUT_VERBOSITY.

Notes:
- resolveOverrides applies flag overrides before merging JSON blobs to keep CLI flags authoritative.
- normalizeVerbosity throws on invalid levels; allowed levels mirror OUTPUT_VERBOSITY_LEVELS.

## Verbosity and output modes
- --output-verbosity <level>: controls info logging; levels include extra-terse, terse, basic, verbose (see src/utils/outputVerbosity.js).
- --json: suppresses info logs and emits JSON payloads directly when supported.
- Logging: createStructuredLogger uses getLoggerWriter; info/log are silenced when json or extra-terse is set.
- Availability and place summaries respect the structured logger; they are muted under json/extra-terse except for errors.

## Runner notes
- determineRunnerMode chooses sequence-config > operation > sequence based on config fields.
- Runner dispatch (runConfiguredCrawl) threads logger and overrides into operation/sequence flows.
- Default flow uses crawlDefaults (sequenceName/startUrl/sharedOverrides/stepOverrides/continueOnError); emits a summary via structured logger.
- Parallel local runner scheduling: multi-domain runs go through `runMultiModalCrawl()` → `MultiModalCrawlManager`, a worker-pool (default `maxParallel=30`) of tail-recursive `runNext()` chains joined by `Promise.all`. The better-sqlite3 handle is opened **once** at the boundary and injected into every parallel orchestrator, so the local fan-out does not re-open the DB per runner (read-only trace 2026-05-30; see the recursive-plan session's SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md).

## Testing hooks
- Helpers exported from crawl.js for tests: createStructuredLogger, getLoggerWriter, resolveLoggerVerbosity, resolveOverrides, printStatus.
- Unit coverage lives in tests/cli/crawl.logger.test.js; extend there when changing override or verbosity behavior.

Keep this page updated when adding commands, changing override order, or expanding verbosity semantics.

## Concurrent launch caveat (accepted-but-no-rows = late start)
With `--batch-concurrency >1` against the in-process server, a host shown as
accepted with no recent DB rows is usually a *late start*, not a failure: its
`/start` was queued behind a prior host's synchronous engine+DB boot and only
accepted once the event loop freed (~one host-crawl later), leaving too little of
the watch window to commit rows. The same blocking prefix can reset a second
concurrent socket (`read ECONNRESET`). Prefer the sequential rung for the
canonical local medium proof; the durable fix is server-side accept-before-boot.
