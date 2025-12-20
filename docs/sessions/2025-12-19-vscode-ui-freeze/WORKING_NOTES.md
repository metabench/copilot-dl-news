# Working Notes – VS Code UI freeze investigation

- 2025-12-19 — Session created via CLI. Add incremental notes here.

## Fast triage (2 minutes)

1) **Identify the freezing process**
	 - Command Palette → **Developer: Open Process Explorer**
	 - Reproduce the freeze and watch for:
		 - **Window (Renderer)** spiking CPU → UI thread issue (often GPU/rendering)
		 - **Extension Host** spiking CPU → an extension is doing heavy work
		 - **Search** / **File Watcher** / **Git** spiking → indexing/scanning

2) **Check logs quickly**
	 - Command Palette → **Developer: Toggle Developer Tools** → Console tab
	 - View → Output → pick **Log (Window)** / **Log (Extension Host)**

## Repro isolation

- Run once with extensions off:
	- `code-insiders --disable-extensions` (or use the “Disable All Installed Extensions” command)
	- If freezes disappear → re-enable extensions in halves to find the culprit.

## Common mitigations

- GPU/render jank:
	- Try **Help → Disable Hardware Acceleration** (restart required)
- Git scanning stalls:
	- Consider temporarily setting `git.enabled=false` or `git.autorefresh=false`.
- Workspace indexing:
	- This repo already excludes `data/`, `migration-*`, etc via `.vscode/settings.json`.

## Evidence to capture (best signal)

- Screenshot or quick note from **Process Explorer** during the freeze: which process spikes.
- `code-insiders --status` output (Renderer/ExtensionHost memory + GPU status).

## If Process Explorer shows no spikes

Sometimes the freeze ends before you can see the offender, or the display is too coarse. Use a *profile* instead:

### Renderer/UI profile (best for “typing freezes then catch-up”)

1) Command Palette → **Developer: Start Performance Profile**
2) Reproduce the freeze (even 1–2 seconds of “bad” is enough)
3) Command Palette → **Developer: Stop Performance Profile**
4) VS Code will save a `.cpuprofile` / trace file you can inspect (or share its top stacks).

### Extension Host profile

1) Command Palette → **Developer: Start Extension Host Profile**
2) Reproduce a freeze
3) Command Palette → **Developer: Stop Extension Host Profile**
4) Inspect the saved profile for which extension functions dominate.

### Quick extension heatmap

- Command Palette → **Developer: Show Running Extensions**
	- Sort by CPU time / activation time; anything with large CPU while idle is suspicious.

## 2025-12-19 result

- Change: disabled hardware acceleration (runtime argument).
- Outcome: after restart, UI appears stable so far (no freezes observed yet).
- Next if freeze returns: grab Process Explorer spike + `code-insiders --status`, then A/B test with `code-insiders --disable-extensions`.

## Workspace scale snapshot

- Total files in repo: ~39,228
- Rough “active set” after excluding heavy dirs (node_modules/.git/data/migration/tmp/etc): ~4,305 files (~0.301 GB)
- `data/` is small file-count but huge bytes (dominant is `data/news.db`).
- Source maps (`*.map`): ~4,309 total; overwhelmingly under `node_modules` trees.
- Git scale: tracked files ~4,204; working tree entries ~15 (untracked).

## Implication

- This repo is not at a file-count scale that should inherently freeze VS Code.
- Remaining likely causes for pauses:
	- Extension Host periodic work (Copilot, Jest, linters, database viewers)
	- TS/JS language service inferred projects (no jsconfig/tsconfig → broader scanning + more watchers)
	- OS-level stalls (Defender/OneDrive/Documents folder sync)

## Mitigation applied in repo

- Added root `jsconfig.json` to constrain the TS/JS language service to `src/`, `tools/`, `scripts/`, `tests/` and exclude heavy/generated folders.
- After adding, run **TypeScript: Restart TS Server** or **Developer: Reload Window**.

## Workspace knobs (anti-freeze)

- Updated `.vscode/settings.json` to reduce background churn:
	- Git: `git.autoRepositoryDetection=openEditors`, `git.repositoryScanMaxDepth=1`, `git.untrackedChanges=hidden`
	- Editor rendering: disabled semantic highlighting, CodeLens, lightbulb, sticky scroll, smooth scrolling
	- Diagnostics experiments: `javascript.validate.enable=false`, `typescript.validate.enable=false`, `markdown.validate.enabled=false`
- Rollback plan: revert those keys if you want the full diagnostics experience back.

## Tooling: system sampler (Node)

- New CLI: `tools/vscode-freeze-diagnose.js`
- Run (short): `npm run diag:vscode-freeze:short`
- Run (longer): `npm run diag:vscode-freeze -- --duration-sec 300 --interval-ms 750`
- Outputs:
	- `tmp/vscode-freeze-diagnosis.ndjson` (timeline samples)
	- `tmp/vscode-freeze-diagnosis.summary.json` (aggregate peaks per focus process)
- Focus defaults include: `Code - Insiders`, `OneDrive`, `MsMpEng`, `SearchIndexer`, `git`, `node`.

### 2025-12-19 upgrade: split VS Code processes by role

Problem: `Get-Process` reports many `Code - Insiders` PIDs, but the actionable question is *which* one spikes: renderer/UI vs extension host vs GPU vs utility.

Change: the sampler now enriches selected process names (default: `Code - Insiders`) by querying `Win32_Process` for `ParentProcessId` + `CommandLine`, then parsing Chromium/Electron roles:
- `main` (no `--type=`)
- `renderer`
- `extensionHost`
- `gpu`
- `utility:<subtype>` (e.g. `utility:network.mojom.NetworkService`)
- `crashpad`

Usage:
- Default (role splitting enabled for `Code - Insiders`):
	- `node tools/vscode-freeze-diagnose.js --duration-sec 600 --interval-ms 750`
- Include full command lines in NDJSON (usually not needed):
	- `node tools/vscode-freeze-diagnose.js --include-commandline --duration-sec 600`
- Change which processes get role splitting:
	- `node tools/vscode-freeze-diagnose.js --split "Code - Insiders" "Code"`

## Sampler runs (before/after archiving sessions)

- Pre-archive run:
	- `tmp/vscode-freeze-diagnosis.summary.json` (t=2025-12-19T07:36Z, duration=120s)
- Post-archive run:
	- `tmp/vscode-freeze-diagnosis.post-archive.ndjson`
	- `tmp/vscode-freeze-diagnosis.post-archive.summary.json` (t=2025-12-19T08:42Z, duration=150s)

### Quick comparison (focus peaks)

- `Code - Insiders`
	- max CPU% total: 19.7 → 18.8
	- max Working Set: 6.34 GB → 4.12 GB
- OneDrive focus changed:
	- pre: `OneDrive` peaked at 7.3% total CPU
	- post: `OneDrive` did not appear; `OneDrive.Sync.Service` only peaked at 0.3% total CPU

### NDJSON timeline analysis (deeper)

- Note: `tmp/vscode-freeze-diagnosis.ndjson` has mtime ~07:49Z, while `tmp/vscode-freeze-diagnosis.summary.json` has mtime ~07:36Z (they are likely from different runs).
- The post-archive pair matches (NDJSON+summary both ~08:42Z), so NDJSON-based metrics below are most trustworthy for the post run.

- Post-archive (150s, 141 samples):
	- `Code - Insiders`: CPU spikes >=10% total occurred 13 times; >=15% occurred 2 times.
	- OneDrive-family: 0 spikes >=1% total CPU during this window.

- Baseline NDJSON (unpaired; 593 samples): OneDrive CPU spikes were frequent (>=1%: 405; >=5%: 207), suggesting sync/watcher churn was a major confounder at least in that earlier window.
