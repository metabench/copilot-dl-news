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
| **Remote crawl ops** | `node tools/crawl/crawl-remote.js <command>` |
| **Local intelligent crawl** | `npm run crawl -- intelligent [args]` |
| **DB download stats** | `npm run db:downloads:stats` |
| **Legacy config crawl** | `npm start` |

## See also

- [tools/crawl/AGENT.md](../../tools/crawl/AGENT.md) - primary crawl tool reference
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

## Testing hooks
- Helpers exported from crawl.js for tests: createStructuredLogger, getLoggerWriter, resolveLoggerVerbosity, resolveOverrides, printStatus.
- Unit coverage lives in tests/cli/crawl.logger.test.js; extend there when changing override or verbosity behavior.

Keep this page updated when adding commands, changing override order, or expanding verbosity semantics.