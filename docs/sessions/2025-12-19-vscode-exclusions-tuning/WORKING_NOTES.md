
## 2025-12-19

- Tightened VS Code exclusions to reduce background churn:
	- `jsconfig.json`: removed `tests/**/*` from `include` so tsserver indexes less by default.
	- `.vscode/settings.json`: excluded `**/tests/**` from watcher + Explorer + search; also excluded several non-core dirs and `**/*.check.*` artifacts from watchers.
	- Follow-up: excluded `**/docs/sessions/**` from file watching + search, and disabled extra auto-refresh/autodetect (git autorefresh/decorations/submodules/parent scan; grunt/gulp/jake autodetect; terminal shell integration; extension auto-update checks).
	- Massive cleanup: pruned `.vscode/tasks.json` from ~1000+ lines of ad-hoc tasks down to 8 core tasks (git status, schema check, UI build, diagram check/e2e, freeze sampler, session archive helpers).
# Working Notes – Tune VS Code excludes for fewer freezes

- 2025-12-19 — Session created via CLI. Add incremental notes here.
