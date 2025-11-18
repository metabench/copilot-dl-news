# Working Notes — 2025-11-16 Diagram UI Session

## Sources Consulted
- AGENTS.md (core directives)
- `.github/instructions/GitHub Copilot.instructions.md`
- Singularity Engineer mode brief (current session)

## CLI Command Log
*(record exact commands + continuation tokens here)*

- `node tools/dev/js-scan.js --search express --limit 50 --json` → located 9 express-related matches across orchestration code, tests, and tooling; minimal direct Express server coverage in `src/` today, indicating need for new implementation path.
- `node tools/dev/js-scan.js --search jsgui3 --limit 50 --json` → only legacy references surfaced in tests, so the new UI will effectively pioneer fresh jsgui3 usage alongside Express.
- `node tools/dev/js-scan.js --dir src --build-index --limit 20 --json` → confirmed `build-index` output includes file-level stats (lines/functions) and dependency information we can transform into diagram data for files/features.
- `node tools/dev/js-scan.js --deps-of src/ui/server/dataExplorerServer.js --json --dep-depth 2` → dependency output (fan-out counts and hop paths) will fuel feature diagrams that emphasize multi-file compositions.
- `node tools/dev/js-edit.js --file src/ui/server/dataExplorerServer.js --list-functions --json` → confirmed js-edit exposes per-function metadata (hash, byteLength) we can use to visualize intra-file segments for feature diagrams.
- `node tools/dev/diagram-data.js --sections code,db,features --json` → validated the new aggregator CLI end-to-end; produced combined payload with code (top files), db tables, and config-driven features.
- `npm run diagram:check` → first run surfaced `jsgui.style`/`jsgui.article` constructor gaps; patched to use generic Control wrappers and reran successfully to emit `diagram-atlas.check.html`.
- `npm run diagram:server` → verified server boots without runtime errors but logs bind to `0.0.0.0` by default, which browsers treat as invalid; exit code reflects manual termination once log captured.
- `node src/ui/server/diagramAtlasServer.js --host localhost` → confirmed binding directly to `http://localhost:4620/diagram-atlas`, enabling local browser access; terminated the process after validation to avoid stray listeners.

## Findings / Decisions
- No active Express+jsgui3 hybrid surfaces exist in current codebase; closest assets reside in deprecated UI server directories and tests. New app can live alongside other UI servers under `src/ui/servers/` (to be confirmed during design).
- Will need to create fresh jsgui3 control helpers because existing codebase has no reusable modules for this pattern.
- js-scan `--build-index` output provides file-level metadata; plan to shell out from new server utilities rather than reimplement AST parsing.
- `--deps-of` output includes hop-by-hop file paths, ideal for showing how features span multiple modules.
- Data Explorer server demonstrates Express integration patterns (middleware, navigation helpers) we can mimic for bootstrapping.
- Diagram set:
	- **Codebase Map** → rectangles sized by `lines` from `js-scan --build-index`, grouped by directory.
	- **Database Topology** → tables pulled from migration SQL files (parsed once) showing column counts + relationships (foreign key heuristics).
	- **Feature Footprint** → features defined via config referencing entry files; uses `js-scan --deps-of` to derive participating files and function counts.
- js-edit `--list-functions` output will supply intra-file segment sizing (byteLength) so features can show "parts of files" usage.
- Server will expose JSON API so CLI consumers can reuse diagram data outside UI.

## Open Questions / Blockers
- _Pending_
