# Hub Identification — Recursive Loop (chat-fed)

You are one node in a self-continuing loop. THIS FILE is the whole program; STATE is the only memory. Each paste = one run: ORIENT (verify STATE claims — redo what's false) → EXECUTE the `next:` work parcel, batched, fixing small defects en route → PROVE (tests via bridge run-tests on the operator machine; evidence to docs/sessions/2026-07-11-hub-loop/) → REWRITE STATE and output the full prompt in chat with a one-line pointer. Stop early only for: a GATED action not named on the pasted `next:`, unrecoverable infra, or DONE.

## Mission
Execute docs/plans/hub-identification-top-notch-plan.md — the plan is the backlog; this loop just walks it. Phases: P0 DB-only hygiene → P1 hubs/hub_members schema → P2 slug segmentation engine → P3 pipeline+freshness → P4 access-path consolidation → P5 measurement+UI. Done when the plan's §5 targets hold and every phase has evidence.

## Ground rules
1. All persistence in the DB via news-crawler-db accessors — never raw SQL outside the module, never new data files (the plan's §1/§2 inventories say what to migrate).
2. Schema work: develop + test against a SAMPLE DB copy first. GATED (require naming on pasted `next:`): applying schema changes to production data/news.db; git commits; deleting anything.
3. news-crawler-db is TypeScript — edit src/, run `npm run build` (tsc) ON THE OPERATOR MACHINE via bridge run-node/run-tests; it has unrelated pre-existing uncommitted changes — never revert them.
4. Environment (bridge protocol, sandbox quirks, crawl API): tools/crawl/AGENT.md "Dev Bridge & Operator-Machine Crawl Ops" section + docs/sessions/2026-07-07-crawl-ops-loop/ notes. Trust those over memory; verify liveness at ORIENT (heartbeat state/hb-*.json fresh, UI /api/apps 200).
5. Politeness hard floor on any live fetch; verification crawls bounded ≤10 pages.

## STATE (rewrite every run; keep ≤ 14 lines)
phase: P0 (not started)
next: run 1 — ORIENT, then P0: (a) move the sitemap file cache (tmp/sitemap-cache) into the DB — add sitemap_cache table + get/upsert accessors to news-crawler-db mirroring robots_cache, wire loadSitemaps to it via the coordinator's dbAdapter, delete the file-cache code, keep the 10/10 sitemap+coordinator tests green; (b) point throughput-meter.js at the db module instead of raw better-sqlite3; (c) add the eslint/CI guards from plan §1/§2. Schema addition lands in the SAMPLE db + module code only — production apply is a later gated step.
done: (nothing yet)
notes: sample DB for schema work: copy data/samples/c15-sitemap-cache.db or create fresh via crawl:sample. Plan doc = docs/plans/hub-identification-top-notch-plan.md. Evidence dir = docs/sessions/2026-07-11-hub-loop/. Bridge actions incl. run-node(timeoutMs), run-tests, ui-screenshot. Composite-hub test set for P2: russia-ukraine-war, israel-gaza-war, us-china-trade, new-caledonia (must parse as ONE place).
