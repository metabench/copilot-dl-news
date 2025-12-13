# Working Notes – Crawler Documentation Coverage & Accuracy

- 2025-12-12 — Session created via CLI.
- Docs inventory findings:
	- Crawler docs exist but are scattered (architecture, CLI, crawl types, DB query reference, roadmap).
	- `docs/INDEX.md` did not surface crawler entry points.
	- `README.md` referenced `npm run gui` / `npm run gui:detached`, but those scripts are not present in `package.json`.
	- The legacy Express UI server lives at `src/deprecated-ui/express/server.js` and supports `--detached`.
- Changes applied:
	- Added a `## Crawling` section to `docs/INDEX.md` linking to the main crawler docs.
	- Added cross-links in `docs/cli/crawl.md`.
	- Added “how to use this roadmap” guidance to `docs/goals/RELIABLE_CRAWLER_ROADMAP.md`.
	- Updated `README.md` to point to the active Data Explorer UI (`npm run ui:data-explorer`, port 3001) and clarified the deprecated Express UI startup.
	- Linked and refreshed existing operational docs:
		- `docs/RUNBOOK.md` (updated paths + current test runner examples)
		- `docs/DEBUGGING_CHILD_PROCESSES.md` (updated file paths and server startup command)
