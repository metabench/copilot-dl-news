# Follow Ups – Place Hub Guessing: jsgui3 controls + DB-layer SQL

- Decide policy for SQL boundary enforcement:
	- Option A: enforce “no new violations” (add a scoped allowlist entry or a scoped runner for Place Hub Guessing only).
	- Option B: enforce “zero violations repo-wide” (bigger project; migrate other UI servers/modules).

- If Option A: adjust `tools/dev/sql-boundary-check.js` usage in CI/dev docs to support scoping by feature/path.

- Add a small check script for `/cell` SSR if we want deterministic coverage beyond the matrix page.
