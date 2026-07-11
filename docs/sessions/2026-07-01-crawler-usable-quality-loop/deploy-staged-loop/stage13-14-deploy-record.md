# Stage 13/14 — Deploy Record: ROLLED BACK (precautionary), data intact

Date: 2026-07-07. Loop: sandbox build → scp → detached install → gated restarts → §C rollback.

## Timeline

Build `20260707163023` (570 KiB, sha256 `40c0d9ae…76a40`) built in sandbox, transferred, checksum-verified, and installed with `data/` byte-identical (4,751,290,311 bytes / 91 files before and after) and pm2 untouched. GATE 2 restart #1 used the deploy script's canonical default `--db data/news.db` — wrong DB (production instance runs `data/news-simple.db`); queue read 0. Corrective restart #2 with `--db data/news-simple.db`: queue still 0, stored 0 → §C rollback executed. Old build `20260527035514` restored from `~/apps/rollback-20260527035514.tar.gz` + `npm install` + restart on `news-simple.db`: **also reports queue 0 / 0 stored.**

## Corrected root cause

The queue/stored figures in `health`/`queue-summary` are **process-session-scoped** — they reset on every fresh process and do not reload at boot. The pre-deploy "1273 pending / 3 stored" was the 40-day-old process's in-memory state. Comparing these counters across a restart is an invalid verification standard (my stage-5 checklist encoded this false assumption; it triggered §C). Direct sqlite reads prove no data was ever at risk: `discovered_links` 3236 rows, `content_storage` 17 rows, unchanged throughout.

**Consequently, build `20260707163023` was never proven defective.** Its 0/0 readings match old-build fresh-boot behavior exactly. The rollback was precautionary under a standard now known to be wrong.

## Findings for the repo/docs

1. `deploy-remote-server.js` default `remoteDb=data/news.db` ≠ production reality `data/news-simple.db`. A canonical `--apply` would silently switch DBs. Fix the default or document `--db data/news-simple.db` as mandatory for this VM.
2. `newsSourcesSeeder` ENOENT (`data/bootstrap/news-sources.json`) is pre-existing boot noise on old AND new builds — the file exists nowhere (repo, builds, VM). Non-fatal (returns []). Add the file or silence the warn.
3. A valid restart-proof metric is needed before the next attempt: direct sqlite pending computation pre/post restart, or a gated bounded `bbc.com` start to watch the queue reload from `discovered_links`.
4. `crawl-server-v4` health/status buildId reads `build-manifest.json` from disk per-request — shows the new id before any restart. Restart proof must use pm2 uptime reset.

## Current state

VM runs OLD build `20260527035514` on `data/news-simple.db`, healthy, pm2 online/0 restarts, `pm2 save` done. New bundle staged at `/tmp/deploy-v2/` for a future gated redeploy (stages 12–13 only; nothing to rebuild). Rollback tar retained at `~/apps/rollback-20260527035514.tar.gz`. Sandbox deploy key (`cowork-sandbox-deploy-20260707`) remains authorized on the VM — operator should decide whether to keep it or remove its line from `~/.ssh/authorized_keys`.
