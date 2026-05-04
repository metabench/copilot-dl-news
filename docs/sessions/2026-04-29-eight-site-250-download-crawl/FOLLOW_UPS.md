# Follow Ups

- Restore or replace the optional `remote-crawl-admin` unified-app router so distributed crawl status/control is visible directly in the jsgui3 UI shell.
- Promote `host-download-delta.js` or equivalent multi-site verification into `tools/dev/` if this style of crawl claim verification recurs.
- Document the remote sync pattern: start continuous sync before remote crawl, then drain backlog with explicit large `pull --limit 5000` batches after bounded runs complete.

- 2026-04-29 20:46 — 
## Follow Ups Added 2026-04-29
- Restore or replace the optional `remote-crawl-admin` unified-app router so remote crawl control/status is visible directly inside the UI shell.
- Consider adding a productionized `host-download-delta` command under `tools/dev/` so future crawl claims can be verified without session-local scripts.
- For large remote runs, start with continuous sync, then use large explicit `pull --limit 5000` batches after bounded crawls complete to drain export backlog faster.

- 2026-04-29 20:47 — 
## Completed Session Note
- No active crawl/sync process remains except the intentionally running unified UI at `http://localhost:51012` for user inspection.

- 2026-04-29 20:48 — 
## UI Gap
- The UI shell can show downloads and crawl status, but remote distributed crawl control is not currently visible because `src/ui/server/remoteCrawlAdmin/server.js` is missing. This should be repaired before relying on UI-only remote crawl operations.
