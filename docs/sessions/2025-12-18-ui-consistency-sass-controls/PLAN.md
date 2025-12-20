# Plan – UI Consistency: shared Sass + controls

## Objective
Introduce shared Sass tokens/components and align key UIs + silence noisy client logs

## Done When
- [x] Shared Sass tokens/components exist and can be compiled server-side.
- [x] Lab 039 uses compiled Sass instead of inline CSS.
- [x] A small shared UI kit (custom controls) exists and is used by Lab 039.
- [x] Known-benign activation console spam is suppressed (without filtering errors).
- [x] Validations captured in `WORKING_NOTES.md`.

## Change Set (initial sketch)
- src/ui/server/utils/sassCompiler.js
- src/ui/styles/sass/shared/_tokens.scss
- src/ui/styles/sass/shared/_base.scss
- src/ui/styles/sass/shared/_components.scss
- src/ui/controls/uiKit/index.js
- src/ui/lab/experiments/039-large-artifacts-pruner-observable-ui/styles/main.scss
- src/ui/lab/experiments/039-large-artifacts-pruner-observable-ui/server.js
- src/ui/lab/experiments/039-large-artifacts-pruner-observable-ui/client.js
- src/ui/client/consoleNoiseFilter.js

## Risks & Mitigations
- Risk: `sass` is a devDependency; missing installs will break Sass compilation.
	- Mitigation: compilation uses a clear error message; only wired into Lab 039 for now.
- Risk: suppressing logs could hide useful debug output.
	- Mitigation: only filters `console.log`/`console.warn` by default; does not filter `console.error`, and can be disabled via `__COPILOT_DISABLE_CONSOLE_FILTER__`.

## Tests / Validation
- `node src/ui/lab/experiments/039-large-artifacts-pruner-observable-ui/check.js`
- `node tools/dev/mcp-check.js --quick --json`
