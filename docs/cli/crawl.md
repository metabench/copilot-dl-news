# Crawl CLI quick reference

Purpose: fast orientation for crawl.js. Covers commands, override precedence, and verbosity modes. Keep this file short; deeper detail lives in AGENTS.md and source.

## Fleet / v4 Operations (recommended)

Use these npm scripts for daily operations:

- `npm run fleet:running` — instant yes/no snapshot of active crawlers.
- `npm run fleet:overview` — instant high-signal summary (running/fatal/unreachable/backlog).
- `npm run fleet:health` — authoritative live health scan.
- `npm run fleet:crawl-sync` — scan/start/recover plus continuous sync to local DB.
- `npm run fleet:sync` — sync only.
- `npm run fleet:sync:quick` — one-shot pull.
- `npm run fleet:stop-all` — fast parallel stop-all with per-process reporting.
- `npm run fleet:endpoints` — local+remote endpoint capability profile.
- `npm run fleet:question -- --q "<question>"` — deterministic routing to fast diagnostics.
- `npm run fleet:smoke:fast -- --count=1 --max-pages=1 --wait-ms=1200 --window=10 --limit=2` — tiny crawl+sync smoke.
- `npm run fleet:smoke:fast:check` — deterministic local harness for smoke script.
- `npm run fleet:benchmark` — bounded benchmark via unified `fleet-cli benchmark` command.
- `npm run fleet:benchmark:25` — bounded 5x5 benchmark (adaptive preflight + SLO tier A) via unified CLI.
- `npm run fleet:benchmark:matrix` — deterministic profile matrix via `fleet-cli benchmark matrix`.

v4 runtime scripts:

- `npm run v4:supervisor`
- `npm run v4:supervisor:remote`
- `npm run v4:server:single` (single-process crawl mode, max resources currently capped to 4)
- `npm run v4:stop-all`

sync helpers:

- `npm run crawl:sync:if-needed`
- `npm run crawl:sync:main`
- `npm run crawl:go`
- `npm run crawl:go:apply`

## See also

- [Architecture: Crawls vs Background Tasks](../ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md)
- [Reliable Crawler Roadmap](../goals/RELIABLE_CRAWLER_ROADMAP.md)
- [CLI Documentation Index](INDEX.md)
- [CLI Command Reference](commands.md)
- [tools/crawl/AGENT.md](../../tools/crawl/AGENT.md)

## Commands
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