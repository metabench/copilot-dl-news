# Experiments – news-crawler-db drop-in evaluation

## Experiment 1: Adapter Surface Audit

**Objective**: Compare method coverage between the current `NewsDatabase` and the `news-crawler-db` adapter.

**Hypothesis**: The external module exposes all required instance methods or provides a compatibility wrapper.

**Method**:
- Load current `NewsDatabase` (SQLite) and extract public instance method names.
- Attempt to require `news-crawler-db` and create its database instance.
- Compare method sets and report missing/extra methods.

**Script**: `experiments/001-adapter-surface-audit.js`

---

## Experiment 2: DB Handle Compatibility

**Objective**: Validate that the adapter exposes a `.db` handle compatible with `better-sqlite3` query modules.

**Hypothesis**: Query modules in `src/data/db/sqlite/v1/queries/*` can run against the new adapter without modification.

**Method**:
- Instantiate both adapters against a temp DB.
- Verify `.db.prepare()` exists and executes a simple SQL statement.
- Probe a small set of query modules that accept a raw handle.

**Script**: `experiments/002-db-handle-compat.js`

---

## Experiment 3: Basic Read/Write Smoke

**Objective**: Ensure core writes + reads work using the adapter’s high-level API.

**Hypothesis**: Basic operations like `upsertArticle`, `insertFetch`, or `getCount` behave the same.

**Method**:
- Create temp DB.
- Seed a minimal article row using adapter API (or fallback to raw handle where required).
- Read back and validate counts/fields.

**Script**: `experiments/003-basic-write-read-smoke.js`

---

## Future Experiments (Planned)

4) **Telemetry compatibility** — can `wrapWithTelemetry` or equivalent be applied?
5) **DualDatabaseFacade integration** — can the new adapter run in dual-write/export mode?
6) **Migration compatibility** — schema initialization + migrations parity.
