# Hub Loop — Run 7: live dual-write correct but rarely fires; backfill is the real populator

## What happened

Dispatched a bounded `ensureCountryHubs` DISCOVERY crawl (guardian /world, 10pp) to trigger the run-6 dual-write live. Result: **zero new rows in BOTH place_hubs (legacy) AND hubs (new)** during the crawl. So HubSeeder's seeding path did not fire — this is NOT a dual-write bug.

## The real finding (reframes P3)

Guardian's country hubs are **already fully mapped**: `place_hubs` holds 507 rows, last_seen 2026-02-27. `ensureCountryHubs` (structureOnly + countryHubExclusive) VERIFIES known hubs rather than SEEDING new ones, so on a mature DB the seeding path — and thus the dual-write — rarely fires. The dual-write is correct and will capture genuinely NEW hub discoveries going forward, but it will not populate the new tables from EXISTING knowledge.

**The right populator for the 507 existing hubs is the P1 `backfillHubsFromPlaceHubs` accessor** (place_hubs → hubs/hub_members, idempotent). It can only be meaningfully tested against a DB that HAS place_hubs — i.e., production (sample dbs are fail-probe copies with none). So it's a GATED production DATA write, named for the next run.

## State

- Dual-write: wired + correct (identifyAndPersistHub proven on production, run 6). Fires on new discovery.
- Live discovery crawl: did not seed (site already mapped). Stopped it cleanly (job 254486cb, /stop 200).
- hubs table: still 3 hubs/5 members (from run-6 script). Backfill will bring the 507.

## Next run
GATED: run `backfillHubsFromPlaceHubs` against production news.db (additive; migrates 507 place_hubs → hubs/hub_members with place members; re-run of upsertHub is idempotent so safe). Then p3-hub-check to confirm ~507 place-kind hubs. THEN P3 freshness (§4.5): findHubs stale filter on last_verified_at. Keep the dual-write for future new discoveries.

## Files changed (UNCOMMITTED)
tools/crawl/p3-seeder-check.js (new diagnostic). No code changes to the pipeline this run (it was already correct). Evidence: run7-notes.md.
