# Plan – Lab Experiments  Skills Consolidation

## Objective
Inventory existing jsgui3 lab experiments, run key checks, and distill stable findings into the Skills system with pointers for future experiments.

## Done When
- [x] Skill added for “lab-driven jsgui3 decisions” with SOP + validation commands.
- [x] Skills registry updated to include the new Skill.
- [x] A small subset of lab checks run and recorded as evidence.
- [x] Follow-ups captured (what to research next via lab).

## Change Set (initial sketch)
- docs/agi/skills/jsgui3-lab-experimentation/SKILL.md (new)
- docs/agi/SKILLS.md (add entry)
- docs/agi/PATTERNS.md (small add: distill validated outcomes into Skills)
- docs/sessions/2025-12-13-lab-to-skills/* (this session)

## Risks & Mitigations
- Risk: Lab experiments drift from reality (bitrot) → Mitigation: keep each experiment runnable via a small `check.js` and run a subset during consolidation.
- Risk: Browser harness tests hang → Mitigation: use the shared runner and keep runs targeted via `--scenario=...`.

## Tests / Validation
- `node src/ui/lab/checks/labConsole.check.js`
- `node src/ui/lab/experiments/002-platform-helpers/check.js`
- `node src/ui/lab/experiments/004-theme-mixin/check.js`
- `node src/ui/lab/experiments/001-color-palette/check.js`
- `node src/ui/lab/experiments/run-delegation-suite.js --scenario=005,006`
