# Crawl Ops Loop — Cycle 1: L2 PROVEN + bridge hardened (two real defects fixed)

## Parcel A delivered

**Verification tooling:** bridge `run-node` action (repo-checked-in scripts only) + `tools/crawl/verify-crawl-delta.js` (read-only totals/window/politeness JSON). Known bug: `contentAdded` reads created_at/stored_at which don't match content_storage's schema — use totals deltas until fixed.

**L2 campaign (2026-07-07 19:48–19:51Z), guardian + bbc, ≤10pp each, sitemap ON, into data/news.db:**
19 new responses, ALL 200 (guardian ×12 / 5.4MB, bbc ×7 / 1.7MB); politeness clean (0×429, 0×5xx); totals 302117→302136 responses, 189977→189985 content (+8 articles), urls +843 (sitemap discovery). Article URLs visible in window.newest. **Ratchet: L2 PROVEN → L3 (25pp/2domains) eligible.** (L1's delta also retro-verified: +4/+3 from job cf150fff.)

## Defects found & fixed en route (both real, both bridge)

1. **Managed children died with bridge restarts** (Windows kills the dying parent's tree) — took the UI down twice. Fix: managed procs spawn `detached` + pid registry in state/procs.json (any bridge generation re-adopts/stops via registry). PROVEN: UI survived two subsequent restart-bridge cycles.
2. **Bridge wedged by a hung localhost fetch** — serial action loop + no fetch timeout; one stuck /api/v1/crawl/jobs call blocked the queue ~5min until undici's internal timeout drained it (observed recovery matched diagnosis). Fix (v3): 150s per-action watchdog (always answers), AbortSignal 20s on http, concurrent processing (≤4 in-flight), uncaught/unhandled handlers, fresh-named heartbeat files in state/ (mount shows new files reliably; appends lie). restart-bridge is now supervisor-aware (BRIDGE_SUPERVISED=1 → plain exit; else detached self-spawn).

## Protocol learnings (bake into habits)

- Action ids must be GLOBALLY unique: Windows filenames are case-insensitive (G1≡g1) and the mount serves overwritten files truncated at old byte-length.
- Poll results by existence+size with retries; never trust mount dir listings.
- /api/v1/crawl/jobs returns a non-array shape — inspect before parsing (deferred).

## State at close

Bridge v3 (pid 185652, unsupervised/detached; supervisor .cmd ready for next manual start). UI pid 135472 on data/news.db, port 3000. Heartbeats: state/hb-*.json every 30s.
