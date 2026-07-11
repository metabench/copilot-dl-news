# Stage 2 — Sandbox Build Pipeline (design note)

## What the build does (`deploy-remote-server.js --build-only`)

1. Queries `/api/status` FIRST — the busy-guard runs even for local-only
   builds and currently blocks (1273 pending URLs). For a build that touches
   nothing remote, pass `--skip-busy-check` (measured: guard exits in 0.3s
   otherwise).
2. Runs `npm run build` (= `tsc`) in the news-crawler-db module
   (default `../news-crawler-db`, overridable via `--db-module-dir <path>`;
   skippable via `--skip-db-build` when `dist/db` is already current).
3. Packages: `deploy/remote-crawler-v2/**` + `src/db/openNewsCrawlerDb.js` +
   vendored `news-crawler-db/dist/db/**` + a production package.json →
   tarball `tmp/remote-crawler-v2-deploy/remote-crawler-v2-deploy.tar.gz`
   (~0.54 MB) + `build-manifest.json` with a fresh timestamp `buildId`
   (format YYYYMMDDHHMMSS — this is the deploy verification anchor; the
   running server reports it in `/api/status.build.buildId`).

## Measured sandbox constraints

- `tsc` over the mounted repo FS did NOT finish within a 42s call
  (network-mount I/O bound). A full one-shot `--build-only` therefore does
  not fit the 44s per-call cap when the DB build is needed.
- The tar/manifest step alone is small (payload 0.54 MB) and fits easily.
- Build output lands VM-side on the mount (`tmp/remote-crawler-v2-deploy/`);
  VM→host writeback does not propagate, which is FINE — scp uploads from the
  sandbox's view, and the Windows repo never needs the tarball.

## Recommended chunked recipe (each step one ≤44s call)

1. `cp -r` mounted news-crawler-db → `/tmp/db-build` (local FS, seconds).
   Staleness rule: files modified in PRIOR sessions serve stale bytes on the
   mount — spot-check `wc -l` (VM) vs `Grep '^'` count (host) for recently
   changed src files before trusting the copy.
2. `npx tsc` inside `/tmp/db-build` (local FS — expected well under 44s; if
   not, tsc is resumable-by-rerun since it is deterministic).
3. `node tools/crawl/deploy-remote-server.js --build-only --skip-busy-check
   --skip-db-build --db-module-dir /tmp/db-build` — packages in seconds,
   writes fresh buildId manifest.
4. Record the new buildId from `build-manifest.json` into STATE; it must
   differ from the running server's `20260527035514`.

Fallback if `/tmp/db-build` tsc fails on missing dev deps: `npm install` dev
deps into /tmp/db-build (network OK), or `--skip-db-build` against the
mounted `dist/` after verifying its freshness vs `src/` mtimes.

## Exit criterion

Design note exists; guard behavior, flags, and the >42s tsc constraint are
measured facts, not guesses. Actual fresh build happens in an implementation
stage.
