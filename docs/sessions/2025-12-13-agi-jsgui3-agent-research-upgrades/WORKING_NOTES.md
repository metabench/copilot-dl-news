# Working Notes – AGI + jsgui3 Research Behaviour Upgrades

- 2025-12-13 — Session created via CLI.

## Evidence / Commands

- Located non-replayable pipeline examples in the jsgui3 research agent:
	- `grep_search` for `Get-ChildItem -Path node_modules/jsgui3-html` and `cat node_modules/jsgui3-html/control.js`.
- Confirmed repo already has authoritative satellite docs to link instead of duplicating:
	- `docs/guides/JSGUI3_COGNITIVE_TOOLKIT.md`
	- `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`
	- `docs/workflows/tier1_tooling_loop.md`

## Changes Applied

- Updated the selected agent personas to:
	- Prefer repo-standard Node CLIs (`tools/dev/js-scan.js`, `tools/dev/js-edit.js`) over shell pipelines for source discovery/inspection.
	- Require hypothesis + falsifier + smallest repro command captured in session notes.
