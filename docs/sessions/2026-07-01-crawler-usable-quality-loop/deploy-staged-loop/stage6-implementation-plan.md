# Stage 6 — Implementation Sizing (M=7, fixed)

Seven implementation stages (7–13), one bounded verified change each, then closeout at stage 14. Derived from stage 4 protocol + stage 5 checklist.

| Stage | Work | Verified by | Gate |
|---|---|---|---|
| 7 | Regenerate sandbox deploy key; give operator the .pub + one-line authorize command for their own terminal | Key pair exists in sandbox; .pub posted in chat | Operator must authorize before stage 8 |
| 8 | Read-only proof: BatchMode auth probe; `deploy-remote-server.js --preflight-only --json`; health/status/queue-summary baselines recorded | Probe exits 0; baselines captured (checklist §A1–A4) | — |
| 9 | VM rollback backup: tar app dir excluding `data/` → `~/apps/rollback-20260527035514.tar.gz` | Tar lists cleanly (checklist §A5) | — |
| 10 | Sandbox chunked build (`--skip-busy-check`, `/tmp/db-build` + `--db-module-dir`); record new buildId | Build exits 0; buildId recorded in notes | — |
| 11 | Package, split ≤20 MB, scp chunks to `/tmp/deploy-v2/`, reassemble | Remote sha256 == local sha256 | — |
| 12 | GATE 1 queue checkpoint, then detached `nohup` install (preserves `data/`, no pm2 touch) | Queue sane vs stage-8 baseline; install log shows completion | GATE 1: stop on queue anomaly |
| 13 | Restart `crawl-server-v4`, run checklist §B (buildId, health, queue, errors) | New buildId live; §B all green (else §C rollback) | GATE 2: explicit operator approval in-chat |

Rails restated: no restart without in-chat approval (stages 13 and any §C rollback); operator's own private key never enters the sandbox (stage 7 uses a sandbox-generated key). Failure at any stage → stop and report; numbering never shifts.
