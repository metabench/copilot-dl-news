# js-edit Deep Dive & Guarded Refactor Playbook (2025-11-16)

Use this document when planning any AST-aware edit. It captures the CLI internals, guard workflows, and meta-guidance for editing the tooling itself.

## Architecture Snapshot
- **Entry**: `tools/dev/js-edit.js` wires up `CliArgumentParser`, `CliFormatter`, bilingual alias handling, and SWC parser bootstrap.
- **Operation Modules** (split November 2025):
  - `operations/discovery.js` – `--list-*`, `--outline`, `--search-text`, `--snipe`. Emits canonical selectors, guard hashes, and selector metadata.
  - `operations/context.js` – `--context-function`, `--context-variable`, preview helpers, plan emission for context windows, enclosing-mode logic.
  - `operations/mutation.js` – `--locate`, `--replace`, `--replace-variable`, `--rename`, guard verification, diff previews, syntax re-parse.
  - `shared/` helpers – hash encoding, selector parsing, formatting, SWC configuration, bilingual lexicon.
- **Recipe Runner**: drives orchestrated workflows mixing js-scan + js-edit steps with parameter substitution and guard assertions.

## Core Workflow Template
1. **Sense** – `--list-functions` or `--outline` to understand the module; capture selectors + hashes (JSON + `--emit-plan`).
2. **Guard Prep** – `--locate <selector> --emit-plan` to persist hash/span/path; store plans under `tmp/plan-*.json` or session-specific paths.
3. **Dry-Run Edit** – `--replace` / `--rename` / `--replace-variable` with `--expect-hash` + `--expect-span`, `--preview-edit`, `--emit-diff`.
4. **Fix** – Repeat command with `--fix` only after reviewing guard summary; re-run `--locate` to capture new hash for follow-up steps.
5. **Document** – Drop commands + plan paths into the journal and reference `docs/agi/tools/JS_EDIT_DEEP_DIVE.md` when onboarding future runs.

## Guardrail Mechanics
- Hashes: 8-char base64 digests computed via shared `hashConfig.js`; guard output shows both before/after digests.
- Spans: Byte and UTF-16 ranges recorded in locate/context/plan JSON; use `--expect-span` to block drift from newline changes.
- Path Signatures: Canonical symbol paths (`exports.Widget > #render`, `module.exports.handler`, `call:describe[0]`) ensure selectors stay valid even if names collide.
- Plan Files: JSON objects containing selector, file, expected hash/span/path, and summary metadata. Safe to share between agents.

## Advanced Tactics
- **Selector Surfacing**: Pair `js-scan --view terse --fields location,name,selector,hash` with js-edit so selectors are ready before opening the file.
- **Variable Targets**: Use `--variable-target declarator` for CommonJS exports, `binding` for destructured identifiers, `declaration` for entire statements.
- **Range Surgery**: `--replace-range start:end` edits a slice within the located function; still requires `--expect-hash` to guard the outer function.
- **Call-Site Editing**: `call:*` selectors (e.g., `call:describe[0]`) let you patch Jest/Mocha hooks with guardrails identical to function edits.
- **Context Plans**: `--context-function --emit-plan` records padding/enclosing metadata so multi-agent workflows can replay the same review window before editing.

## Meta-Usage: Running js-edit on js-edit
Apply js-edit to its own sources before modifying the tooling:
- **Inventory operations**
  ```powershell
  node tools/dev/js-edit.js --file tools/dev/js-edit.js --outline --json > docs/sessions/2025-11-16/js-edit-outline.json
  ```
- **Guard mutation module**
  ```powershell
  node tools/dev/js-edit.js --file tools/dev/js-edit/operations/mutation.js \
    --list-functions --match "*replace*" --json
  ```
- **Plan a refactor**
  ```powershell
  node tools/dev/js-edit.js --file tools/dev/js-edit/operations/mutation.js \
    --locate "exports.replace" --emit-plan docs/sessions/2025-11-16/mutation-plan.json
  ```
- **Dry-run a tweak**
  ```powershell
  node tools/dev/js-edit.js --file tools/dev/js-edit/operations/mutation.js \
    --replace "exports.replace" --with tmp/replace.snip.js \
    --expect-hash <from-plan> --expect-span <start:end> --preview-edit --emit-diff --json
  ```
- **Recipe rehearsal**: Execute `node tools/dev/js-edit.js --recipe tools/dev/js-edit/recipes/rename-globally.json --json` to confirm guard assertions still pass after tool edits.

## Module-Specific Command Recipes
| Module | Command Set | Purpose |
| --- | --- | --- |
| Crawler (`src/crawler`) | `node tools/dev/js-edit.js --file src/crawler/IntelligentPlanningFacade.js --outline`; `--locate "exports.IntelligentPlanningFacade" --emit-plan ...` | Capture canonical selectors before touching planner integration logic.
| Planner (`src/planner`) | `--file src/planner/PlannerHost.js --list-functions --match "*Plugin*"`; `--context-function "exports.PlannerHost" --emit-plan ...` | Understand plugin hooks and guard host edits.
| Services (`src/services`) | `--file src/services/HubGapAnalyzerBase.js --list-functions --match "*analyze*"`; pair with `--replace` guard for shared analyzer behavior tweaks.
| Database (`src/db`) | `--file src/db/CoverageDatabase.js --list-functions --view terse`; `--locate "exports.createConnection" --emit-plan ...` | Prevent accidental adapter drift by capturing selectors + spans.
| API (`src/api/routes/index.js`) | `--list-functions --match "load*"`; `--rename loadRoutes --rename registerRoutes` (guarded). | Keeps route loaders consistent with docs when renaming/moving endpoints.
| Tooling (`src/utils`, `tools/dev`) | `--dir tools/dev --file tools/dev/js-scan/shared/scanner.js --list-functions`; treat tooling refactors with the same guard plans as product code.

## Dataset & Artifact Storage
- Store all plans and JSON outputs under `docs/sessions/<date>/` alongside notes. Example: `docs/sessions/2025-11-16/js-edit-mutation-plan.json`.
- Reference these artifacts from the journal so future agents can replay guardrails without re-discovery.

## Troubleshooting
- **Hash Mismatch**: Re-run `--locate` to capture the latest hash. If drift is intentional, reissue plan + document rationale in journal.
- **Selector Not Found**: Use `--list-functions --view terse --fields selector,hash` to confirm canonical naming; fallback to `hash:<digest>` selectors.
- **SWC Parse Errors**: Ensure file still contains valid syntax; run `npm run lint` if available, or use js-edit `--preview` to inspect surrounding code.
- **Windows Encoding**: Same as js-scan, rely on `setupPowerShellEncoding` or manually set console encoding before running the CLI.

## Token-driven Guard Replay (Shipped 2025-11-21)
Tokens emitted by `js-scan --ai-mode --json` now flow directly into guarded js-edit plans.

1. **Capture match snapshot**: Run a search or relationship continuation and save the `_ai_native_cli` JSON (`js-scan --continuation - --json > tmp/match.json`).
2. **Hydrate guards**: `node tools/dev/js-edit.js --match-snapshot tmp/match.json --emit-plan tmp/plan.json --json` validates the embedded file/hash/span and writes a plan identical to `--locate --emit-plan`.
3. **Skip files entirely**: Pipe compact tokens straight in – `echo %TOKEN% | node tools/dev/js-edit.js --from-token - --emit-plan tmp/plan.json --json` decodes the cache-backed reference and produces the same plan.
4. **Apply edits**: Use the emitted plan with `--from-plan tmp/plan.json --replace ... --fix`, keeping BatchDryRunner guard verification in place.

If the on-disk hash diverges from the snapshot hash, js-edit adds a `HASH_MISMATCH` warning and refuses to emit a misleading plan. Smoke coverage for both flows lives in `tests/tools/ai-native-cli.smoke.test.js` (match snapshot + stdin token scenarios).

### Token ➜ Plan ➜ Replace (Recipe)
1. **Sense with js-scan** – capture a continuation payload that already contains the match snapshot:  
  ```powershell
  node tools/dev/js-scan.js --dir src/services --search HubGapAnalyzerBase --limit 1 --ai-mode --json > docs/sessions/2025-11-21-js-edit-ingestion/analyzer.search.json
  ```
2. **Ingest the token** – reuse the emitted `continuation_tokens."analyze:0"` (or any relationship token) and hydrate a guard plan via stdin:  
  ```powershell
  $token = (Get-Content docs/sessions/2025-11-21-js-edit-ingestion/analyzer.search.json | ConvertFrom-Json).continuation_tokens."analyze:0"
  $token | node tools/dev/js-edit.js --from-token - --emit-plan docs/sessions/2025-11-21-js-edit-ingestion/analyzer.plan.json --json
  ```
  This validates file/hash/span, emits the standard BatchDryRunner plan summary, and stores the plan for future replay.
3. **Apply the edit** – feed the plan straight into a guarded mutation. Provide `--with` (or `--replace-text`) plus `--preview-edit` for the dry run, then rerun with `--fix` once the diff looks good:  
  ```powershell
  node tools/dev/js-edit.js --from-plan docs/sessions/2025-11-21-js-edit-ingestion/analyzer.plan.json \
    --replace "exports.HubGapAnalyzerBase" --with tmp/analyzer.patch.js --preview-edit --emit-diff
  node tools/dev/js-edit.js --from-plan docs/sessions/2025-11-21-js-edit-ingestion/analyzer.plan.json \
    --replace "exports.HubGapAnalyzerBase" --with tmp/analyzer.patch.js --fix
  ```
4. **Verify** – rerun the targeted smoke to ensure Sense→Act handoffs still pass:  
  ```powershell
  npm run test:by-path tests/tools/ai-native-cli.smoke.test.js
  ```
  Capture these commands + artifacts inside the session folder so future agents can rerun the same plan without rediscovery.

## Next Improvements
- Author recipe templates that combine js-scan ripple analysis with js-edit guard application for high-risk modules (crawler, adapters).
- Automate plan verification by storing expected hashes in `docs/agi/tools/plan-index.json` and comparing during future sessions.
