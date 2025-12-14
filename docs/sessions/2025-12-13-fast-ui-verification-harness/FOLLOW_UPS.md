# Follow Ups – Fast UI verification harness (no repeated Puppeteer reloads)

- Add a suite for a dedicated “control fixture” server route (single control, minimal DB), to validate jsgui3 control-level fixtures.
- Consider adding a tiny check script that creates a brand-new SQLite DB and asserts `ensureDatabase()` leaves core tables present (guards future schema-definition drift).
