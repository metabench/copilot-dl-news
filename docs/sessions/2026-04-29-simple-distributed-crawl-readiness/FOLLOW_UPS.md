# Follow Ups: Simple Distributed Crawl Readiness

- Update `scripts/deploy-remote.js` so it can start `crawl-server-v4` when the PM2 process does not already exist; today it only restarts an existing process.
- Consider adding a first-class `--dry-run`/schema-check mode to `tools/crawl/crawl-remote.js pull` so production DB sync safety is visible before import.
- Investigate why `npm run db:downloads:stats` prints no stats body in the current workspace, while `db:downloads:recent` works.
- If the Oracle image is rebuilt, verify the persisted VM firewall rule for TCP `3200` remains present alongside the OCI security-list rule.
