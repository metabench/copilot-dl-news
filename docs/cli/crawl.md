# Crawl CLI quick reference

Purpose: fast orientation for crawl.js. Covers commands, override precedence, and verbosity modes. Keep this file short; deeper detail lives in AGENTS.md and source.

## See also

- [Architecture: Crawls vs Background Tasks](../ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md)
- [Reliable Crawler Roadmap](../goals/RELIABLE_CRAWLER_ROADMAP.md)

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