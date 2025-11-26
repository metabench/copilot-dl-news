# Implementation Plan: Database-Backed Gazetteer Caching

**Objective**: Eliminate the dependency on the `data/cache/` directory by migrating the gazetteer ingestion tools to use the SQLite database for caching API responses.

**Target State**:
- `src/tools/populate-gazetteer.js` and its dependencies read/write from `news.db`.
- `data/cache/` directory can be safely deleted.
- All external API responses (REST Countries, Wikidata) are stored in `http_responses` and `content_storage`.

---

## Phase 1: Core Infrastructure (Completed)

*   ✅ **Schema Verification**: The `http_responses` table already has the necessary columns:
    *   `cache_key`
    *   `cache_category`
    *   `cache_expires_at`
    *   `cache_created_at`
*   ✅ **Database Access**: The `SQLiteNewsDatabase` class and `ArticleOperations` already support inserting HTTP responses and content.

## Phase 2: Refactor `restcountries.js`

The `src/tools/restcountries.js` module currently contains hardcoded file system logic.

### Tasks
1.  **Update Function Signature**: Modify `fetchCountries` to accept a `db` instance instead of `cacheDir`.
2.  **Implement DB Cache Read**:
    *   Query `urls` + `http_responses` + `content_storage` for the target URL.
    *   Check `cache_expires_at` (if applicable) or rely on manual invalidation flags.
    *   Return parsed JSON from `content_storage.content_blob` if found.
3.  **Implement DB Cache Write**:
    *   After a successful `fetch`, insert the record into the DB.
    *   Use `upsertArticle` or `insertFetch` patterns to ensure `urls`, `http_responses`, and `content_storage` are populated.
    *   Set `classification` to `'gazetteer-source'` or similar.

### Code Changes
*   **File**: `src/tools/restcountries.js`
*   **Logic**: Replace `fs.existsSync` / `fs.readFileSync` with `db.getArticleByUrl(...)`.

## Phase 3: Refactor `populate-gazetteer.js`

This tool orchestrates the calls and currently passes the file path.

### Tasks
1.  **Remove CLI Argument**: Deprecate or remove `--cache-dir`.
2.  **Pass DB Handle**: Ensure the `db` instance created in `populate-gazetteer.js` is passed down to `fetchCountries`.
3.  **Wikidata Caching**:
    *   The tool also fetches from Wikidata (SPARQL).
    *   Implement a similar `fetchWithDbCache(url, db)` helper within the tool or as a shared utility.
    *   Replace direct `fetch` calls with this helper.

### Code Changes
*   **File**: `src/tools/populate-gazetteer.js`
*   **Logic**:
    *   Remove `fs` imports related to caching.
    *   Update calls to `fetchCountries`.
    *   Wrap Wikidata SPARQL requests with DB caching logic.

## Phase 4: Cleanup & Verification

### Tasks
1.  **Verify Data**: Run the tool with `--verbose` and confirm it logs "Loaded from DB cache" on the second run.
2.  **Verify Storage**: Inspect `http_responses` to see the cached JSON blobs.
3.  **Delete Directory**: Manually delete `data/cache/` and verify the tool still works (by re-fetching and re-caching to DB).
4.  **Update Documentation**: Update `docs/GAZETTEER_ARCHITECTURE.md` (if exists) or `README.md` to reflect the new architecture.

## Migration Strategy

*   **Non-Breaking**: We can support both for a short period if needed, but a clean break is preferred since the cache is transient.
*   **Cold Start**: The first run after this change will be slower as it repopulates the cache into the DB.

## Estimated Effort
*   **Refactoring**: ~2 hours
*   **Testing**: ~1 hour
