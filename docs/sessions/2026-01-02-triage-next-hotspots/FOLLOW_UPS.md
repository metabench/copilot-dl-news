# Follow Ups – Triage Next System Hotspots

- Investigate the recurring Jest runner warning: `Warning: --localstorage-file was provided without a valid path`.
	- Likely source: `scripts/jest_careful_runner.mjs` or a Playwright/Puppeteer helper invoked by config.
	- Goal: remove the warning or provide a sensible default path.
