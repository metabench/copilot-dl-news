# Long-Term Plan – LT-001 Advanced Crawler + Advanced UI

## Outcome
Deliver a v5 remote crawler application that an operator can access directly in the browser to control crawls, monitor activity, browse downloaded news, and generate/download large compressed article bundles.

## Why This Exists
- The repo already contains serious crawler, export, monitoring, and UI assets.
- Those assets are fragmented across `remote-crawler-v2`, unified shell, Data Explorer, Article Viewer, and older remote tools.
- The v5 goal is to turn those assets into one coherent remote product instead of a loose collection of scripts and dashboards.

## Success Criteria
- A browser-accessible remote shell exists as the main operator entrypoint.
- Operators can start, stop, seed, scope, and monitor crawls without falling back to ad-hoc scripts for routine work.
- Operators can browse and read downloaded articles directly on the remote server.
- Operators can create and download large compressed bundles filtered by time range and scope.
- The remote app has a clear storage/export story, auth boundary, and deployment shape.

## Planned Phases
1. Stabilize the reusable remote crawler backend.
2. Add/standardize the remote API gateway and auth boundary.
3. Assemble the remote operator shell and monitoring views.
4. Expose article library/reader on the remote host.
5. Add async bundle-job export/download flows.
6. Harden deployment, recovery, and local sync/federation.

## Primary Reuse Targets
- `deploy/remote-crawler-v2/`
- `src/ui/server/unifiedApp/`
- `src/ui/server/dataExplorerServer.js`
- `src/ui/server/articleViewer/server.js`
- `src/ui/server/crawlObserver/server.js`
- `tools/crawl/crawl-remote.js`
