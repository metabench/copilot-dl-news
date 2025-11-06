---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: qa-team
---

# Testing Output Standards

## Jest Command Rules

- Run Jest with single-purpose commands (no pipes or complex chaining).
- Example: `npx jest tests/tools/__tests__/js-edit.test.js --forceExit`.
- Avoid piping output (`|`) or redirecting (`2>&1`) to filtering commands—these trigger approval dialogs.

## Console Noise Limits

- Keep test output under 100 lines (target <50) by filtering noisy logs.
- Add patterns to `tests/jest.setup.js` `DROP_PATTERNS` when suppressing noise.

## Troubleshooting

- If approval dialogs appear, review [../agents/command-rules.md](../agents/command-rules.md).
- For commands requiring focused runs, use Jest flags such as `--bail=1` or project scripts like `npm run test:focused`.
