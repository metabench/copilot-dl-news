# `wip/legacy-distributed/`

Quarantined on **2026-04-25** because these files referenced `domain-intelligence`,
`self-healing`, and other v1 modules that were never committed (or were deleted
in earlier cleanups). They cannot run as-is.

| File | Was at | Why broken |
|------|--------|------------|
| `worker-cli.js` | `tools/crawl/worker-cli.js` | Imports `deploy/remote-crawler/lib/crawl-worker.js`, which requires missing `./domain-intelligence` and `./self-healing`. |
| `distributed-500.js` | `tools/crawl/distributed-500.js` | Spawns `worker-cli.js` (broken). Also lacks a `require.main === module` guard, so importing it auto-runs `main()`. |
| `remote-crawler-v1/` | `deploy/remote-crawler/` | v1 of the multi-domain server. Superseded by `deploy/remote-crawler-v2/`. Contains the broken `crawl-worker.js`. |

## Working replacement

For simple distributed crawls, use the **v2 path**:

```bash
# Smallest possible smoke (1 domain × 5 pages)
npm run crawl -- simple-distributed-smoke --dry-run
npm run crawl -- simple-distributed-smoke

# Slightly larger smoke (3 domains × 50 pages)
npm run crawl -- remote-bounded-smoke

# Status check
npm run crawl -- remote-status
```

These talk to the v2 multi-domain server (`deploy/remote-crawler-v2/multi-domain-server.js`)
running on the fleet host (default `144.21.35.104:3200`, override via
`FLEET_HOST` env var or `tools/crawl/.fleet-host` file).

## Promotion / deletion

If anyone restores the missing v1 modules and wants these tools back, move them
out of `wip/`. Otherwise, plan to delete this directory once the v2 path has
proven stable for another release cycle.
