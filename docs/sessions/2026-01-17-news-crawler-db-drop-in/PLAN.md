# Plan: news-crawler-db drop-in labs

Objective: Establish lab experiments that validate whether `news-crawler-db` can replace the current DB layer without breaking API contracts.

Done when:
- Experiments for adapter surface, handle compatibility, and read/write smoke tests exist with deterministic outputs.
- Session notes capture adapter contract expectations and any missing pieces.
- Labs run safely against temp DBs (no writes to `data/news.db`).

Change set:
- labs/news-crawler-db/README.md
- labs/news-crawler-db/EXPERIMENTS.md
- labs/news-crawler-db/FINDINGS.md
- labs/news-crawler-db/experiments/001-adapter-surface-audit.js
- labs/news-crawler-db/experiments/002-db-handle-compat.js
- labs/news-crawler-db/experiments/003-basic-write-read-smoke.js
- docs/sessions/2026-01-17-news-crawler-db-drop-in/WORKING_NOTES.md
- docs/sessions/SESSIONS_HUB.md

Risks/assumptions:
- `news-crawler-db` is not installed yet; experiments must degrade gracefully.
- API compatibility centers on `NewsDatabase` + `.db` handle usage.

Tests/validation:
- `node labs/news-crawler-db/experiments/001-adapter-surface-audit.js`
- `node labs/news-crawler-db/experiments/002-db-handle-compat.js`
- `node labs/news-crawler-db/experiments/003-basic-write-read-smoke.js`

Docs to update:
- docs/sessions/SESSIONS_HUB.md (add session)
