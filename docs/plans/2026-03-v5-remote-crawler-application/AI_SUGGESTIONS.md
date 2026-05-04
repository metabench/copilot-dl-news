# AI Suggestions – V5 Remote Crawler Application

## Recommended First Tactical Slice

If implementation begins now, the first slice should be:

1. create the v5 subsystem boundary
2. restore a bootable crawl backend using current reusable assets
3. add a minimal gateway with stable status/health/control routes
4. add focused tests around those routes and lifecycle behavior

That is the foundation everything else depends on.

## Recommended Second Slice

1. mount a minimal operator shell
2. add Control Room + Discovery Intelligence + Monitoring
3. wire hub suggestion review/accept flows to the gateway
4. add HTML/check scripts and targeted UI tests

## Recommended Third Slice

1. integrate article library and reader
2. prove server-side browsing/search/filter flows
3. connect article views back to crawl runs/domains
4. keep accepted hub suggestions visible from crawl-run context

## Recommended Fourth Slice

1. implement bundle jobs
2. expose manifests and download routes
3. add progress/failure/retry UI
4. test with large synthetic bundle scenarios

## What Not To Do Early

- don’t start by redesigning the entire crawl internals
- don’t chase full fleet/federation before the single remote app works
- don’t build auth last if the app is remotely exposed
- don’t treat article browsing as a side feature
- don’t leave hub guessing stranded as analyst-only tooling outside the operator shell

## Signals That The Plan Is Working

- one remote URL can control real crawls
- one operator shell can generate/review place/topic hub suggestions and launch crawl work from them
- one operator shell can browse downloaded content
- one operator can request and download a large archive without CLI fallback
- focused tests exist for runtime, gateway, UI, bundles, and recovery
