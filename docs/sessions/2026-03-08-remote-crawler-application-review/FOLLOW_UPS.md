# Follow-ups – Remote Crawler Application Review

## Priority 1
- Restore one bootable remote runtime path end-to-end, preferably `deploy/remote-crawler-v2/`, by restoring its missing `lib/` modules and verifying `node deploy/remote-crawler-v2/multi-domain-server.js --help` and a local smoke boot.
- Decide whether `deploy/docker-compose.yml` is meant to deploy the same system as `deploy/remote-crawler-v2/`. If yes, wire them together; if no, document the distinction explicitly.

## Priority 2
- Restore or rebuild the missing remote admin UI path referenced by `src/ui/server/unifiedApp/server.js` so remote operations have a real browser surface instead of CLI/API only.
- Reconcile `tools/crawl/AGENT.md` and `package.json` with the current worktree by either restoring the missing fleet/v4 toolchain or reducing the docs/scripts to the code that actually exists.

## Priority 3
- Consolidate sync/import guidance around one supported path: either the v2 manifest/pull model plus `tools/crawl/crawl-remote.js`, or the older `tools/remote-crawl/*` workflow.
- Add deployment checks that fail fast when critical remote crawler helper modules are missing.
