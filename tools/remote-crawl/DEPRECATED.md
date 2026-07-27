# DEPRECATED — Gen-1 remote-crawl drivers (do not build against)

Marked deprecated 2026-07-21 (Phase D1 of `docs/plans/2026-07-distributed-crawl-unification.md`).

These drivers target `POST /api/jobs` on port **3120**, an endpoint **not served by anything
deployed** — the deployed Oracle server is the v2 multi-domain server on port **3200**
(`deploy/remote-crawler-v2`, PM2 `crawl-server-v4`), which uses `/api/seed`. The Gen-1 flow is
therefore dead relative to the current deployment.

Use instead:
- `tools/crawl/crawl-remote.js` — the v2 CLI (seed / start / sync / collect, watermark batch export).
- `tools/crawl/lib/fleet-host-resolver.js` — `getFleetEndpoints()` for the fleet's host + port map.

Kept for reference only; candidates for deletion once the unified remote server (plan Phase D6) lands.
