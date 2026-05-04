# Findings – news-crawler-db drop-in evaluation

## 2026-01-17 – Initial lab runs

- Adapter surface audit: compat wrapper (engine `news-crawler-db`) matches all 81 public methods.
- DB handle compatibility: compat wrapper exposes `db.prepare` and reads URL counts from existing DB.
- Basic read/write smoke: compat wrapper passes read-only flow (writes skipped); current adapter passes full write/read.

### Next actions

1. Decide whether to migrate call sites to `newsDb.core` repositories gradually.
2. Add targeted adapter shims for any missing behaviors discovered during integration.
3. Re-run labs when upgrading `news-crawler-db` schema or repositories.
