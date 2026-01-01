# Follow Ups – Fix analysis-run.logging test: FTS shadow tables in schema

## Optional hardening

- Investigate the repeated Jest warning: `--localstorage-file was provided without a valid path` (likely coming from Puppeteer or a shared test harness).
- Consider adding a small unit test around `tools/schema-sync.js` normalization:
	- Ensures `CREATE UNIQUE INDEX` and triggers get `IF NOT EXISTS`.
	- Ensures FTS shadow tables are excluded.

- _Add actionable follow-ups here._
