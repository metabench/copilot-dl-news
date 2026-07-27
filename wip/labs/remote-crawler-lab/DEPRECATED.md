# DEPRECATED — Gen-1 remote-crawler-lab (superseded)

Marked deprecated 2026-07-21 (Phase D1 of `docs/plans/2026-07-distributed-crawl-unification.md`).

This lab server (port 3120, `POST /api/jobs`, own SQLite) was the first-generation remote crawl
experiment. It is superseded by:
- `deploy/remote-crawler-v2/multi-domain-server.js` (port 3200) — the DEPLOYED remote queue +
  watermark batch-export server, driven by `tools/crawl/crawl-remote.js`.
- `wip/labs/distributed-crawl/worker-server.js` (port 8081) — the stateless batch-fetch worker
  (`POST /batch`) used by the remote-fetch adapter.

Nothing deployed serves this lab's API. Kept for reference only; do not build against it.
