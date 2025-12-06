# Session Summary – Guide: jsgui3 debugging

## Accomplishments
- Created `docs/guides/JSGUI3_DEBUGGING_GUIDE.md`, covering server/client activation debugging, control registration, hydration diagnostics, Puppeteer patterns, and common failure modes.
- Captured concrete practices from WYSIWYG fixes (free port selection, server `--check`, bundle rebuilds, fallback drag handling) and aligned with AGENTS.md/UI Singularity workflow.

## Metrics / Evidence
- Documentation-only change; no automated tests executed.

## Decisions
- No ADR needed; guidance distilled from recent debugging work.

## Next Steps
- Add a lightweight client-side activation/drag check script for WYSIWYG demo and link it into the guide.
- Extend `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` with a short section that references the new debugging guide.
