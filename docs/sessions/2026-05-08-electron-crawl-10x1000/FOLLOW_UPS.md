# Follow-Ups: Electron Cloud Crawl 10x1000

1. **Deploy /api/throttle to remote box.**
   - The stub is added to `multi-domain-server.js` but requires a PM2 restart of `crawl-server-v4` on 141.144.193.218.
   - Verify: `node -e "fetch('http://141.144.193.218:3200/api/throttle').then(r=>r.json()).then(console.log)"`
   - Once deployed, re-run the backpressure smoke test from the sync loop.

2. **Live 15-min crawl run with screenshot capture.**
   - Requires Electron app + remote crawler running simultaneously.
   - Capture ledger snapshots at t=5m and t=15m, content stats pre/post, and Health Card screenshots.
   - Use `scripts/ui/capture-unified-crawl-display.js`.

3. **Add `--lane` flag for parallel sync lanes.**
   - Goal: allow separate sync lanes (e.g. metadata-fast + full-payload-slow) running concurrently.
   - Design: each lane gets its own ledger partition keyed by lane name.

4. Add a regression test for exact-ID prune safety.
   - Goal: prove CLI-driven prune cannot delete rows outside the exported batch.
   - Candidate scope: fixture DB with two timestamps sharing a watermark boundary; export one limited batch; prune by `urlIds`; assert non-exported payload remains.
   - Validation: focused test around `deploy/remote-crawler-v2/lib/export-retention.js` and `crawl-remote.js` prune body generation.

5. Persist remote API server config selection in deployment docs/tooling.
   - Goal: prevent `crawl-server-v4` from silently returning to `crawl-domains.simple.json` after future PM2 restarts.
   - Validation: `node tools/crawl/crawl-remote.js health --host 141.144.193.218:3200 --json` reports `domains: 10` after restart.

6. Promote sync-latency metrics into the Cloud Crawl UI.
   - Goal: show last sync time, last batch row count, fetch ms, and ingest ms directly in Electron.
   - Validation: screenshot capture includes stable selectors for sync latency and non-empty values while the sync task is active.

7. Add tests for `includeContent=false` and `includeLinks=false` export options.
   - Goal: protect the fast export payload shape and prevent accidental link/content regressions.
   - Validation: focused Node/Jest route test asserts `content: []`, `links: []`, and correct counts.

8. Add a fixture for metadata-first then content-later ingest.
   - Goal: protect the response mapping fix that lets content attach to an existing response row.
   - Validation: fixture with metadata-first sync followed by full-content sync produces one URL row, one response row, and one content row.

9. **Real throttle implementation on remote.**
   - The current stub records state but doesn't actively pause PM2 workers or gate new domain starts.
   - Next step: wire `MAX_CONCURRENT` changes to actually stop/delay orchestrator scheduling.
