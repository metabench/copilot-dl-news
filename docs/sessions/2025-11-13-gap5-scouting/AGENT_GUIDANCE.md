# Agent Guidance — Gap 5 Scouting & Feasibility

## Mission
Understand the remaining js-scan/js-edit roadmap (Gap 5 & Gap 6), clarify scope, and prepare executable guidance.

## Steps for Agents
1. Read `ROADMAP.md` to orient on tasks.
2. Use repo tooling for discovery (`node tools/dev/md-scan.js`, `node tools/dev/js-scan.js`).
3. Record findings in `WORKING_NOTES.md` and decisions in `DECISIONS.md`.
4. Update `FOLLOW_UPS.md` with actionable next steps.

## Tooling Checklist
- `node tools/dev/js-scan.js --help`
- `node tools/dev/js-scan.js --what-imports <path> --json`
- `node tools/dev/js-scan.js --deps-of <file> --json`
- `node tools/dev/js-edit.js --list-functions`

## Output Expectations
- Feasibility report in `SESSION_SUMMARY.md`
- Implementation outline for Gap 5 (and optionally Gap 6)
- Updated search index for quick reference
