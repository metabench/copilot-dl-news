# Working Notes — Crawl Config Runner (2025-11-13)

## Initial Thoughts
- Goal is to let operators run `node crawl.js --config path/to/file` (or even `node crawl.js`) and have parameters resolved from a config manifest.
- Need to inspect existing `crawl.js` for CLI handling, environment variable support, and how it weaves options into `NewsCrawler`.
- Determine whether there is already a config directory (e.g., `config/`) that we can leverage rather than inventing new paths.
- Consider layering: defaults < file < CLI overrides, plus maybe environment-specific sections.

## Implementation Notes (2025-11-17)
- Added `config/crawl-runner.json` as the default manifest. Format: `{ "mode": "sequence", "sequence": "basicArticleDiscovery", "startUrl": "https://...", "sharedOverrides": { ... } }`. YAML equivalents are also supported.
- `crawl.js` now searches for configs in this order: explicit `--config` flag, `CRAWL_CONFIG_PATH` env var, repository defaults (`config/crawl-runner.json|yaml|yml`). Missing optional files fall back to the legacy `config.json` defaults.
- The runner manifest can target one of three modes: `sequence` (default), `sequence-config`, or `operation`. Mode is inferred automatically when `sequenceConfig`/`operation` fields exist.
- CLI overrides still work: `--start-url`, `--shared-overrides`, `--step-overrides`, `--config-dir`, `--config-cli-overrides`, etc. Flags merge shallowly on top of manifest values so operators can tweak one-off runs without editing the file.
- Relative `configDir` values are resolved against the manifest directory, making it easy to keep everything under `config/`.
