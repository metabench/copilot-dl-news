# Working Notes: Simple Distributed Crawl Readiness

- 2026-04-29: Session opened. Initial docs show `tools/crawl/AGENT.md` already defines `simple-distributed-smoke` as the smallest distributed-node smoke profile, which matches the user's terminology requirement in principle.
- 2026-04-29: Initial exact search found Oracle Cloud references in `tools/remote-crawl/`, remote host resolution in `tools/crawl/lib/fleet-host-resolver.js`, launcher/profile references in `tools/crawl/index.js`, and unified app fallback host usage.
- 2026-04-29: Canonical simple crawl path verified as `npm run crawl -- simple-distributed-smoke` -> `tools/crawl/index.js` -> `tools/crawl/profiles/simple-distributed-smoke.json` -> `tools/crawl/crawl-remote.js bounded` -> Oracle v2 server at `deploy/remote-crawler-v2/multi-domain-server.js`.
- 2026-04-29: Clarified terminology in crawl docs/profiles: simple means low-scope/low-cardinality, not local-only. Updated `simple-distributed-smoke` and related docs to say distributed explicitly.
- 2026-04-29: Fixed readiness blockers found during audit: stale default fleet host, v2 port mismatch, missing bounded-domain registration, missing v2 deploy helpers, missing v2 sync ingest helper, root crawl wrapper import, and missing hub confidence utility.
- 2026-04-29: Added versioned remote configs: `deploy/remote-crawler-v2/crawl-domains.simple.json` for 1-domain/5-page simple distributed crawls and `crawl-domains.bounded-smoke.json` for the larger 3-domain/50-page smoke run.
- 2026-04-29: Added `autoStart` support to remote v2 config and set smoke configs to `autoStart: false`, so the Oracle API can sit idle until `/api/start` is requested by a bounded/simple profile.
- 2026-04-29: Oracle instance `worker-node-4cpu-12gb-20260212-205745` was started, SSH verified through `oracle-worker`, code deployed, PM2 process `crawl-server-v4` started and saved.
- 2026-04-29: VM iptables allowed `3300:3329` but rejected `3200`; OCI security list already allowed `3200`. Inserted and persisted a VM firewall allow rule for TCP `3200` via `netfilter-persistent`.
- 2026-04-29: Remote health/status verified on `141.144.193.218:3200`: server healthy, v4, one configured domain (`bbc.com`), max concurrent 1, idle before start.
- 2026-04-29: Ran the canonical simple distributed crawl. Result: `bbc.com` completed in 7.3s with 5 fetched, 5 stored, 0 errors, 435 pending discovered links left unprocessed by the simple cap.
- 2026-04-29: Checked remote export batch before local sync: 20 URL records, 5 HTTP responses, 5 content records, 907 discovered links. Added client fallback counts and server explicit export counts for compatibility.
- 2026-04-29: Synced the small remote batch into local `data/news.db` with `node tools/crawl/crawl-remote.js pull --window 300 --limit 20`. Recent-download view shows five BBC downloads at `2026-04-29 18:24:39`.
- 2026-04-29: Final redeploy after export-count fix succeeded; PM2 restarted `crawl-server-v4` and health/status remained green. Note: redeploy reset the simple remote DB to empty/idle, but the crawl evidence was already synced locally.

## Validation Evidence
- `node tools/crawl/index.js simple-distributed-smoke --dry-run` delegated to `crawl-remote.js bounded --domains bbc.com --max-pages 5 --poll 5 --timeout-min 10`.
- `node deploy/remote-crawler-v2/multi-domain-server.js --help` includes `--no-auto-start`.
- `node --check deploy/remote-crawler-v2/multi-domain-server.js; node --check tools/crawl/crawl-remote.js` passed.
- `npm run test:by-path -- tests/tools/crawl-index.test.js tests/tools/crawl-remote-bounded.test.js tests/tools/remote-crawler-server-config.test.js` passed: 3 suites, 26 tests.
- `node tools/crawl/crawl-remote.js health --json` after final deploy returned healthy v4 service on the default Oracle host.
- `npm run db:downloads:recent` showed the synced BBC URLs: `/news`, `/`, `/sport`, `/business`, `/technology`.
