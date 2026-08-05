# 2026-08-05 — Dashboard HTML snapshot cache (child-process builds)

**Context**: Cycle-205 latency census: /quality 19.1s cold / 9.1s warm,
/place-hubs 6.0s on the unified server. Both page builds are fully synchronous
(better-sqlite3 aggregates; jsgui3 render of an 8.5MB matrix), so one request
froze the whole event loop and every other route stalled behind it — the e2e
walk had to skip both apps. Profiling showed /quality is query-bound (14-39s
across three service calls) while /place-hubs is *render*-bound (queries 0.3s,
render ~9s). Constraint: no changes to the live db (indexes owner-gated).

**Options**:
- A. In-band TTL cache around the service calls. Smallest diff, but the cache
  *fill* still freezes the loop 14-39s; the walk's 20s budget fails on cold
  runs, and every TTL expiry re-freezes a busy server.
- B. Precompute in a child process, serve-stale from memory, placeholder until
  the first snapshot lands — the countryStats/hostHealth idiom already in
  unifiedApp/server.js (tasks #39/#40).
- C. Query/index work in news-crawler-db — owner-gated for the live db, and
  useless for /place-hubs (render-bound).

**Decision**: B, generalized as `src/ui/server/utils/htmlSnapshotCache.js`
(TTL 45s, single-flight child per cache, serve-stale, `--check`-aware skip,
auto-refreshing 200 placeholder). Children render the complete page HTML —
never serialized models — so cross-process data loss can't silently produce a
correctly-shaped empty page. /place-hubs' render moved to `renderMatrixPage.js`
so its child skips server.js's ~18s crawler-stack require chain.

**Consequences**: Warm serves are 3-190ms (measured); the event loop never
runs a heavy build. First visitor per parameter combination sees a "computing"
placeholder for the child's build time (~3-25s). Snapshot staleness ≤ TTL +
build time (~70s worst case). ~8.5MB per cached matrix entry (maxEntries 6).
Each refresh pays a node-boot + require cost in the child (~1-3s). The e2e
walk exceptions (`skipActivation`, `knownSlowRoutes`) are removed; the cache
behavior is pinned by tests/ui/htmlSnapshotCache.test.js.

**Links**: docs/sessions/2026-08-05-slow-dashboard-snapshot-cache/;
unifiedApp/server.js countryStats + hostHealth precedents.
