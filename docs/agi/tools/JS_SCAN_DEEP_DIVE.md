# js-scan Deep Dive & Meta-Scanning Playbook (2025-11-16)

This guide distills best practices for `tools/dev/js-scan.js`, including how to scan the scanning tool itself. Treat it as the reference for Sense-phase automation.

## CLI Anatomy
- **Entry**: `tools/dev/js-scan.js` bootstraps `CliArgumentParser`, `CliFormatter`, bilingual translation helpers, and the PowerShell encoding shim.
- **Core modules**:
  - `shared/scanner.js` – filesystem walk, SWC parsing, hash emission shared with js-edit.
  - `operations/search.js` – keyword search, match ranking, bilingual formatting.
  - `operations/patterns.js` – glob/regex finder with export filters.
  - `operations/dependencies.js` – `--deps-of`, dependency summaries, parse-error surfacing.
  - `operations/rippleAnalysis.js` – risk scoring + safety assertions.
  - `operations/relationships.js` – `--what-imports`, `--export-usage`, `--what-calls` multi-hop queries.
  - `operations/callGraph.js` – call graph builder, selector targeting, hot-path computation, dead-code hints.
- **Output helpers**: `i18n/dialect.js` for bilingual aliases, `i18n/language.js` for compact Chinese/English toggles, `TokenCodec` for continuation tokens used in AI mode.

## Baseline Workflow Template
1. `--what-imports` / `--what-calls` to map impact.
2. `--deps-of` to confirm adjacency and parse errors.
3. `--ripple-analysis` for risk gating (capture JSON for records).
4. `--build-index` or `--search` with `--view terse --fields location,name,selector,hash` to collect selectors for js-edit. Each JSON match now includes `jsEditHint` (command, args, plan metadata) so you can replay the suggested `js-edit` invocation without another locate step.
5. Store outputs (especially JSON/tokens) under `docs/sessions/<date>/` for reproducibility.

## Continuation Tokens & Follow-Up Actions
- Run discovery with `--ai-mode --json` so each match emits `continuation_tokens` and an embedded `match` snapshot (absolute file, hash, selector, traits, js-edit hint).
  ```powershell
  node tools/dev/js-scan.js --dir tools/dev --search scanWorkspace --limit 1 --ai-mode --json > tmp/scanWorkspace.search.json
  ```
- Later, replay any follow-up action by piping a stored token into `--continuation - --json`. The handler validates the token, hydrates the match snapshot, and executes:
  - `analyze` → returns the original match metadata plus the js-edit hint
  - `trace` → calls `RelationshipAnalyzer.whatCalls()` for the recorded function
  - `ripple` → runs `analyzeRipple(match.file)` using the same workspace root
  ```powershell
  $token = (Get-Content tmp/scanWorkspace.search.json | ConvertFrom-Json).continuation_tokens."trace:0"
  $token | node tools/dev/js-scan.js --continuation - --json | Tee-Object tmp/scanWorkspace.trace.json
  ```
- Tokens now carry `search_terms`, scanner context (dir/exclude/language), and the `match` snapshot, so replay skips redundant scans. If a token predates these fields, the CLI re-runs the search automatically but warns if metadata is missing.
- When the CLI needs to re-scan (no embedded match snapshot), it compares the fresh digest to the stored `results_digest`. If they differ you’ll see `warnings[].code = "RESULTS_DIGEST_MISMATCH"`; treat that as a cue to rerun discovery and refresh tokens before editing.
- Archive both the JSON result and the compact token string inside the session folder; they expire after one hour, but the cached payload under `tmp/.ai-cache/` can be refreshed with a new search run.
- Relationship queries likewise emit `_ai_native_cli` payloads: run `node tools/dev/js-scan.js --dir <root> --what-imports <path> --ai-mode --json` (or swap in `--export-usage`) to capture importer/usage tokens, then pipe any action (e.g., `importer-analyze:0`) into `--continuation -` to retrieve `relationship.entry` metadata plus js-edit hints.

## Meta-Scanning the Toolchain (js-scan on js-scan)
Use these commands to understand or refactor the scanner safely:
- **Dependency summary**
  - `node tools/dev/js-scan.js --deps-of tools/dev/js-scan.js --json > docs/sessions/<date>/js-scan.deps.json`
  - Highlights ties to `CliFormatter`, `TokenCodec`, `shared/scanner.js`, and all operations modules.
- **Importer audit**
  - `node tools/dev/js-scan.js --dir tools/dev --what-imports tools/dev/js-scan/operations/rippleAnalysis.js --json`
  - Confirms only the entry CLI consumes ripple analysis logic; refactors won’t surprise other binaries.
- **Call graph on scanner helpers**
  - `node tools/dev/js-scan.js --dir tools/dev/js-scan --call-graph tools/dev/js-scan/shared/scanner.js --depth 2 --json`
  - Surfaces how `scanWorkspace` fans out into file walkers, AST parsers, and token emitters.
- **Risk gating**
  - `node tools/dev/js-scan.js --ripple-analysis tools/dev/js-scan/operations/callGraph.js --json`
  - Expect higher risk due to shared usage; break refactors into helper extractions if score ≥ YELLOW.
- **Selector handoff validation**
  - `node tools/dev/js-scan.js --dir tools/dev --search scanWorkspace --limit 1 --json > tmp/js-scan-meta.json`
  - Inspect `matches[0].jsEditHint.command` and run it to ensure js-edit jumps straight into the scanner code before attempting tool rewrites.
- **Bilingual flag audit**
  - `node tools/dev/js-scan.js --dir tools/dev/js-scan --search "--搜" --view summary`
  - Ensures dialect helpers stay synchronized when new aliases are added.

## Applying js-scan to Core Modules
| Module | Primary Command Set | Notes |
| --- | --- | --- |
| Crawler stack (`src/crawler`) | `--dir src/crawler --search IntelligentPlanningFacade --view terse --fields location,name,selector,hash`; `--ripple-analysis src/crawler/IntelligentPlanningFacade.js`; `--deps-of src/crawler/CrawlOperations.js` | Capture selectors for planner integration; ripple analysis guards high-risk changes.
| Planner kernel (`src/planner`) | `--dir src/planner --outline --view terse`; `--what-calls PlannerHost` | Outline reveals plugin surface; call graph enumerates extensions.
| Services layer (`src/services`) | `--dir src/services --what-imports src/services/HubGapAnalyzerBase.js --json`; `--search GapAnalyzer --view summary` | Maintains analyzer inheritance map.
| Database adapters (`src/db`) | `--what-imports src/db/CoverageDatabase.js`; `--deps-of src/db/index.js`; `--ripple-analysis src/db/QueueDatabase.js` | Flags direct adapter access vs. aggregator exports. Archive the `jsEditHint` payload for each hit so adapter guard plans are pre-baked before edits.
| API surface (`src/api`, `src/server`) | `--dir src/api --search "route" --include-path routes`; `--what-calls loadRoutes` | Keeps route-loaders in sync with docs.
| Analysis/background (`src/analysis`, `src/background`) | `--dir src/analysis --find-pattern "*Analyzer"`; `--ripple-analysis src/background/JobRunner.js` | Spots derivations plus long-running job dependencies.

## Data Capture & Storage
- Always pair command + JSON output file path inside session notes. Example: `docs/sessions/2025-11-16/js-scan-crawler.json`.
- When using `--ai-mode --json`, stash the emitted continuation tokens alongside the JSON to resume long scans without reprocessing.
- Summaries derived from meta-scans should be mirrored in `docs/agi/LIBRARY_OVERVIEW.md` and relevant module docs.

## Troubleshooting Quick Hits
- **Slow scans**: Switch to `--view terse --no-snippets --limit 50` for reconnaissance, then narrow directories.
- **Missing TS parsing**: Force with `--source-language typescript` or alias `--码 ts`.
- **Noisy deprecated modules**: Add `--exclude-path deprecated-ui-root --exclude-path tools/dev` unless intentionally scanning tooling.
- **Encoding hiccups on Windows**: Ensure PowerShell session runs `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` prior to invoking the CLI (mirrors `setupPowerShellEncoding`).

## Next Iterations
- Formalize recipe files combining js-scan meta-analysis with js-edit guard plans for toolchain refactors.
- Add automated nightly meta-scan job dumping `--build-index` + `--ripple-analysis` results for `tools/dev/js-scan` and `tools/dev/js-edit` to detect drift early.
- **Continuation Tokens Phase 2 (Relationship Queries)**
  - ✅ `--what-imports` and `--export-usage` now support `--ai-mode --json`. Each importer/usage row is normalized into a match snapshot (absolute file, relative path, line range, js-edit hint) and gets a deterministic continuation action (`importer-analyze:<idx>`, `usage-import:<idx>`, `usage-call:<idx>`, `usage-reexport:<idx>`). Tokens carry `relationship`, `entry_kind`, and `entry_index` metadata so follow-up actions can resolve the same row even if the surrounding list changes.
  - ✅ `handleContinuationToken` replays the relationship query, recomputes a digest, and emits `RESULTS_DIGEST_MISMATCH` warnings when importer/usage sets drift. Responses now include `relationship.entry` payloads so agents can inspect files/specifiers/line numbers immediately; importer continuations also surface `jsEditHint` stubs (`--snipe-position <line>`) for the upcoming js-edit ingestion work.
  - ✅ `tests/tools/ai-native-cli.smoke.test.js` exercises both flows end-to-end: capture tokens via `--what-imports ... --ai-mode --json` / `--export-usage ... --ai-mode --json`, replay a continuation with `--continuation -`, and assert the returned relationship payloads.
  - ✅ js-edit  now consumes the emitted snapshots via `--match-snapshot` (file or stdin) or `--from-token -`, so relationship continuations can hydrate guard plans without another locate run.
