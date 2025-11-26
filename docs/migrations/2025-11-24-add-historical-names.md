# Migration Plan: Add Historical Names Support

**Date**: 2025-11-24
**Author**: GitHub Copilot
**Status**: Implemented

## 1. Objective
Enable the `place_names` table to represent historical names (e.g., "Bombay" vs "Mumbai") by adding temporal validity columns.

## 2. Schema Changes
Target Table: `place_names`

| Column | Type | Change |
|--------|------|--------|
| `valid_from` | TEXT | New column (ISO 8601 date) |
| `valid_to` | TEXT | New column (ISO 8601 date) |

## 3. Impact Analysis
- **Reads**: Existing queries selecting specific columns will work unchanged. Queries selecting `*` will receive two extra columns, which is generally safe in the current codebase (object-based returns).
- **Writes**: `src/bootstrap/bootstrapDbLoader.js` uses explicit column lists for INSERTs, so it is safe. `tools/gazetteer-dedupe.js` may need updates if it copies row data blindly, but it generally constructs objects.
- **Search**: `src/db/sqlite/v1/queries/gazetteer.search.js` joins on `place_names`. It will need to be updated to prefer current names or filter by date if required in the future, but for now, it will simply return all names as before.

## 4. Migration Strategy
- **Type**: Non-breaking additive change.
- **Script**: `tools/migrations/2025-11-24-add-temporal-cols-to-place-names.js`
- **Rollback**: `ALTER TABLE place_names DROP COLUMN valid_from; ALTER TABLE place_names DROP COLUMN valid_to;` (SQLite does not support DROP COLUMN easily in older versions, but modern SQLite does. Alternatively, ignore the columns).

## 5. Verification
- Run migration script.
- Verify columns exist using `PRAGMA table_info(place_names)`.
- Verify application startup and basic search functionality.

## 6. Execution Log
- [x] Impact analysis complete.
- [x] Migration script created.
- [x] Migration script executed successfully.
- [x] Documentation (`DATABASE_SCHEMA_ERD.md`) updated.
