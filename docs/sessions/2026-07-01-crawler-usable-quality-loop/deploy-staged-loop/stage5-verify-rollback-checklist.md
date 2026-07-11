# Stage 5 — Verification + Rollback Checklist

Grounded in `tools/crawl/AGENT.md` (~49, 356–366, 875–916) and CONTINUATION_PROMPT.md "Remote fleet". Baseline: build `20260527035514` (STALE), pm2 `crawl-server-v4`, dir `~/apps/remote-crawler-v2`, API `141.144.193.218:3200`. Queue baseline: TOTAL 4176 (bbc 1273, guardian 1482, apnews 1023, npr 398) — bbc's 1273 trips the deploy busy-guard.

## A. Pre-deploy proof (read-only, safe from sandbox)

1. Auth probe (non-destructive): `ssh -o BatchMode=yes -o ConnectTimeout=15 ubuntu@141.144.193.218 true` — must exit 0. If `Permission denied (publickey)`, stop: deploy key not authorized yet.
2. `node tools/crawl/deploy-remote-server.js --preflight-only --json` — must not build/deploy/touch pm2/SSH. Expect `deploy-needed` (build stale). Busy-guard will flag bbc's pending queue — that is expected and does NOT justify `--force`; our protocol restarts only at GATE 2 with approval, and the queue is DB-backed/restart-safe (stage 3).
3. `crawl-remote.js health` + `status --json` — record uptime, buildId `20260527035514`, orchestrator state (expect idle).
4. `crawl-remote.js queue-summary --json` — record per-domain counts as the queue baseline for post-restart comparison.
5. Backup for rollback: on VM, tar `~/apps/remote-crawler-v2` EXCLUDING `data/` → `~/apps/rollback-20260527035514.tar.gz`. Verify tar lists cleanly. (data/ stays live; install script preserves it.)

## B. Post-restart verification (after GATE 2 approval + restart)

Every check bounded; any failure → section C.

1. pm2: `pm2 describe crawl-server-v4` — status online, uptime reset, restart count stable across two polls ~60s apart (increment = crash loop → C).
2. Health: `crawl-remote.js health` responds; `status --json` buildId == new buildId recorded at sandbox build time (stage 4 step 1) and != `20260527035514`.
3. Queue integrity: `queue-summary --json` vs baseline from A4 — counts equal or explainably drained; large deviation or missing domain → C.
4. Errors: `crawl-remote.js errors` — no new fatal errors post-restart; `pm2 logs --lines 50` free of crash/stack-loop.
5. No autonomous crawl mutation: verification is read-only. Any smoke seed is a separate, operator-approved action (existing rail).

## C. Rollback (requires operator approval in-chat — it restarts the service)

Triggers: health unreachable >2 min, pm2 crash loop, buildId mismatch, queue anomaly, fatal startup errors.

1. Report the trigger + evidence in chat; request rollback approval (GATE 2 applies to this restart too).
2. On approval: unpack `~/apps/rollback-20260527035514.tar.gz` over the app dir (data/ untouched), `pm2 restart crawl-server-v4`.
3. Re-run B1–B4 expecting OLD buildId `20260527035514` and baseline queue.
4. Preserve failed-deploy logs/bundle under `/tmp/deploy-v2/failed-<ts>/`; no retry without a revised plan.

## Notes

- `deploy-remote-server.js --apply` does build+upload+overwrite+**restart** in one shot — do NOT use it from the loop; it bypasses GATE 1/2. Use it only as reference for what the install must replicate.
- All VM-side steps run via short SSH calls or `nohup`; never rely on long-lived sandbox processes.
