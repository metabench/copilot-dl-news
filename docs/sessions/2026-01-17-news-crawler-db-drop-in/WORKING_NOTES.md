# Working Notes – news-crawler-db drop-in labs

## Context
- Goal: validate if `news-crawler-db` can replace the existing DB layer without breaking adapter contracts.
- Current DB layer lives under `src/data/db/*` and exposes `NewsDatabase` with a `.db` (better-sqlite3) handle.

## Adapter Contract (initial)
- `createDatabase({ engine, dbPath|connectionString })` from `src/data/db/index.js`
- `getDbRW()` returns a NewsDatabase-like instance (has `.db` handle)
- Query modules in `src/data/db/sqlite/v1/queries/*` expect a raw better-sqlite3 handle.

## Evidence / Commands
- `node labs/news-crawler-db/experiments/001-adapter-surface-audit.js`
- `node labs/news-crawler-db/experiments/002-db-handle-compat.js`
- `node labs/news-crawler-db/experiments/003-basic-write-read-smoke.js`

## Results (2026-01-17)
- Added `news-crawler-db` file dependency and compat adapter registration.
- Adapter surface audit: compat wrapper matches 81 public methods.
- DB handle compatibility: compat wrapper exposes better-sqlite3 handle (countUrls ok).
- Basic smoke: compat wrapper skips writes but reads OK; current adapter passes write/read.
