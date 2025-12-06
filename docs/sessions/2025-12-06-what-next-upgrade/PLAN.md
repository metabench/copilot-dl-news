# Plan – Improve what-next CLI

## Objective
Add json output, session selection, sections filter

## Done When
- [ ] what-next supports --json, --session selection, and --sections filtering with robust parsing.
- [ ] Tool still produces human-readable output and proper exit codes (0 success, 1 no active, 2 error).
- [ ] Usage documented in tools/dev/README.md and notes captured.

## Change Set (initial sketch)
- tools/dev/what-next.js
- tools/dev/README.md (usage notes)
- docs/sessions/2025-12-06-what-next-upgrade/WORKING_NOTES.md

## Risks & Mitigations
- Parsing brittleness on headings → implement case-insensitive heading map with fallbacks.
- Accidental noisy JSON/human mixed output → gate JSON to `--json` only.
- Agent discoverability → surface quick links and sections explicitly.

## Tests / Validation
- Manual: run `node tools/dev/what-next.js --json` (parseable JSON) and without flags (human readable) with active sessions present.
- Manual: `--session <slug>` selects specified session; `--sections done,change,tests` limits output.
