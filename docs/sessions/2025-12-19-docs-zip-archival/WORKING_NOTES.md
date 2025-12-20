
## 2025-12-19

### What to archive

- Best archival target: `docs/sessions/` (many small files; reduces file count and background scanning).
- Current count: ~279 session directories.
- Dry-run preview (`--older-than 30`) shows **63** sessions eligible for archiving (down to 2025-11-18).

### Applied archive (28 days)

- Applied: `node tools/dev/session-archive.js --archive --older-than 28 --fix`
- Report written: `tmp/session-archive.applied.28d.json`
- Archived sessions: **71**
	- Oldest: `2025-05-19-svg-tooling-improvements`
	- Newest: `2025-11-20-ui-home-card-cli`
- Post-run folder count: `docs/sessions/` has **208** remaining session folders (+ `archive/` folder)
- ZIP size: `docs/sessions/archive/sessions-archive.zip` ≈ **0.27 MiB**

### Tooling

- Existing CLI: `node tools/dev/session-archive.js`
	- Supports: `--archive`, `--list`, `--search`, `--read`, `--extract`, `--remove`.
- Improvement: added `--output <file>` so `--json` can be written directly as UTF-8 (no PowerShell redirection encoding issues).
- Added npm scripts for common workflows (preview/apply/list/search/read/extract).

# Working Notes – Archive docs into ZIPs

- 2025-12-19 — Session created via CLI. Add incremental notes here.
