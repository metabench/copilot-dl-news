# Stage 4 — Chunked Deploy Protocol (design note)

## Core constraint & core insight

Sandbox bash calls are capped at ~44s and NOTHING survives between them —
but processes on the Oracle VM DO survive. So every slow step must either be
chunked (build) or run detached on the remote side (install/restart), with
each sandbox call doing one bounded action and every step independently
resumable.

## Why not `deploy-remote-server.js --apply`

Its `deployPackage()` runs scp + the remote install script SYNCHRONOUSLY over
one ssh session (stop → rm code → extract → `npm install --omit=dev` →
pm2 start). npm install alone can exceed 44s; a mid-call kill would strand
the server stopped with code deleted. We reuse its BUILD (stage 2 recipe) and
its install script CONTENT, but wrap execution in a detached remote runner
with a backup step added.

## The protocol (one sandbox call per step; resumable at any step)

Step 0 — auth gate: BatchMode probe must print AUTH-OK (stage 1). Abort
  otherwise.
Step 1 — build (3 calls, stage 2 recipe): copy news-crawler-db → /tmp/db-build;
  `npx tsc` there; `--build-only --skip-busy-check --skip-db-build
  --db-module-dir /tmp/db-build`. Record NEW_BUILD_ID from build-manifest.json.
  Resume check: manifest exists and buildId ≠ 20260527035514.
Step 2 — checkpoint (1 call): run the stage-3 pre-restart checklist
  (orchestrator idle, throughput 0, WAL 0, record per-domain pending
  baseline). Then STOP and obtain operator approval in-chat (hard rail).
  No approval → protocol ends here, nothing touched.
Step 3 — upload (1 call): scp tarball → `/tmp/remote-crawler-v2-deploy.tar.gz`
  and the generated `remote-install.sh` → `~/`. Idempotent (overwrite).
Step 4 — detached install (1 call):
  `ssh ... 'setsid nohup bash ~/remote-install.sh > ~/deploy-<NEW_BUILD_ID>.log
  2>&1 < /dev/null & echo LAUNCHED'`. Returns in ~1s; the script runs on the
  VM unaffected by sandbox call caps.
Step 5 — poll (repeat 1-call rounds): `ssh ... 'tail -5 ~/deploy-*.log'` +
  `curl /api/status`. Success = status reachable AND
  `build.buildId == NEW_BUILD_ID`. The log ends with a sentinel line
  (`DEPLOY-OK <buildId>` / `DEPLOY-FAIL <step>`), so a half-read log is
  unambiguous.
Step 6 — post-verify (1 call): stage-3 post-restart checks (pending counts
  match baseline, WAL 0) + stage-5 smoke.

## remote-install.sh (generated; deltas vs the stock script)

1. PRE-BACKUP (new): before any rm, `tar -czf ~/rollback-<OLD_BUILD_ID>.tar.gz
   -C ~/apps/remote-crawler-v2 deploy src vendor lib multi-domain-server.js
   crawl-domains.*.json package.json package-lock.json` — code only, data/
   untouched, ~1MB.
2. Stock sequence: pm2 stop/delete → rm code paths (preserves data/) →
   tar -xzf → `npm install --omit=dev --no-audit` → pm2 start → pm2 save.
3. Sentinel lines (new): `echo DEPLOY-OK $BUILD_ID` on success;
   `trap 'echo DEPLOY-FAIL $LAST_STEP' ERR` so polling never guesses.

## Failure modes → resume actions

- scp interrupted → rerun step 3 (overwrite, harmless).
- Install script dies pre-`pm2 stop` → server still running old build; rerun
  step 4.
- Install dies post-rm (npm failure) → server DOWN but rollback tarball
  exists: detached `ssh 'tar -xzf ~/rollback-*.tar.gz -C ~/apps/... &&
  pm2 start ...'` restores old build (full procedure in stage 5).
- Poll sees neither sentinel after ~5 min → read full log, decide manually.

## Exit criterion

Protocol note exists; every step fits one call, is idempotent or resumable,
and the operator-approval gate sits BEFORE the first destructive action.
