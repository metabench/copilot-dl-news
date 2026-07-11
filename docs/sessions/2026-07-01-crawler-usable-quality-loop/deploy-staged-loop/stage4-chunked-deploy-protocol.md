# Stage 4 — Chunked Deploy Protocol (detached, gated)

Rewritten 2026-07-06 after sandbox reset wiped all prior artifacts (stages 1–4) and the sandbox deploy key. Reconstructed from STATE notes. **Operator: save these artifacts outside the sandbox — the scratchpad does not survive between runs.**

## Preconditions (from stages 1–3)

- **SSH**: sandbox deploy key was LOST in the reset. Regenerate in-sandbox (`ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""`), paste the .pub in chat, operator authorizes it on the VM. Hard rail: the operator's own private key never enters the sandbox.
- **Build** (stage 2): sandbox build requires `--skip-busy-check` and chunked DB build via `/tmp/db-build` + `--db-module-dir`. Current remote build: `20260527035514`.
- **Queue safety** (stage 3): pending queue is DB-backed and restart-safe. Baseline TOTAL 4176 (bbc 1273, guardian 1482, apnews 1023, npr 398). Install script preserves `data/`.

## Protocol

Each numbered step is one bounded sandbox call. Remote work runs under `nohup` on the VM (survives call caps); never rely on long-lived sandbox processes.

1. **Build in sandbox** — chunked build as above; record new buildId from the build output.
2. **Package** — tar the build output; split into ≤20 MB chunks (`split -b 20m`) so no single scp call risks a timeout. Record sha256 of the full tar.
3. **Transfer** — scp chunks one per call to VM `/tmp/deploy-v2/`; final call reassembles (`cat parts > bundle.tar`) and verifies sha256 matches.
4. **Queue checkpoint (GATE 1)** — read pending-queue counts on the VM; compare to baseline. Report in chat. Proceed only if queue state is sane (DB-backed, so pending work survives restart, but anomalies stop the deploy).
5. **Detached install (no restart)** — `nohup` the install script on the VM: unpacks bundle, installs alongside current build, preserves `data/`, does NOT touch pm2. Poll its logfile in later calls rather than holding a connection.
6. **Restart (GATE 2 — operator approval required in-chat)** — only after explicit approval: `pm2 restart crawl-server-v4`. Never restart without it.
7. **Verify** — confirm reported buildId changed from `20260527035514` to the new build; confirm queue counts consistent with baseline minus normal drain. (Full checklist = stage 5.)

## Failure handling

Any step failing → stop, report, do not advance. Rollback details are stage 5's artifact; the invariant here: old build stays on disk until verification passes, so rollback is re-pointing pm2 at the previous build (with GATE 2 approval again).
