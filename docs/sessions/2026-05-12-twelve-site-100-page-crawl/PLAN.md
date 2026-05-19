# Plan: Twelve-Site 100-Page Crawl

Objective: Run and monitor a remote crawl that syncs at least 100 new downloaded pages per selected news website into local `data/news.db`.

Linked long-term outcome: `docs/sessions/long-term/lt-001-advanced-crawler-ui/`

Done when:
- Twelve target news websites are recorded before crawl start.
- Local baseline counts are captured before the crawl where the DB tooling is healthy.
- The crawl runs through the remote v2 path with continuous local sync and safe prune-after-ingest enabled.
- Progress is monitored from remote status plus local DB growth.
- Final local verification shows whether each selected host reached 100 new downloaded pages, with blockers documented.

Selected hosts:
- `bbc.com`
- `theguardian.com`
- `reuters.com`
- `cnn.com`
- `apnews.com`
- `npr.org`
- `aljazeera.com`
- `independent.co.uk`
- `cbsnews.com`
- `nbcnews.com`
- `france24.com`
- `euronews.com`

Change set:
- `docs/sessions/2026-05-12-twelve-site-100-page-crawl/*`
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md` if the run produces durable crawl/UI learning.

Risks/assumptions:
- Remote server availability and per-site blocking may prevent all hosts from reaching 100 new pages in one pass.
- Existing remote domain state may need adding or refreshing for hosts not already configured.
- Local verification depends on a working `news-crawler-db` native SQLite binding in the current shell.

Operational workflow:
- Selected branch: remote v2 distributed crawl with continuous sync into local `data/news.db`.
- Workflow branch: healthy measurement branch, based on initial remote health/status showing the server online and idle.
- Sync policy: run with sync enabled and `--prune-after-ingest`; verify local DB growth before declaring success.

Checks:
- Remote health/status/content before crawl.
- Local DB baseline before crawl.
- Periodic remote status and local download count checks during crawl.
- Final local host deltas after sync/drain.
