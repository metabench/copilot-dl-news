# Working Notes

## 2026-04-29 Kickoff
- User requested a UI screen showing proof that recent downloads successfully downloaded and were saved to the database, including compression algorithm, options, and level.
- Existing Downloads panel already uses a unified-shell panel activator and `/api/downloads/*` endpoints.
- Live schema: download metadata lives in `http_responses`; DB persistence evidence lives in `content_storage`; typed compression metadata lives in `compression_types` and bucket compression metadata can live through `compression_buckets`.
- Important data caveat: recent remote-imported rows use `content_storage.storage_type = 'gzip'` with no `compression_type_id`, so algorithm can be reported from storage type but level/options are not recorded for those rows.

## Implementation
- Added `getRecentDownloadVerifications()` to `src/data/db/queries/downloadEvidence.js` so the UI layer does not own the SQL join.
- Added shared jsgui3 `DownloadVerificationPanelControl` with a focused render check.
- Added unified app sub-app `download-verification` with a live activator and `/api/downloads/verifications` endpoint.
- The first live query shape joined latest content before limiting recent responses; on `data/news.db` that was too heavy. Reworked the query to limit recent `http_responses` first, then join content/compression metadata for just those rows.

## Verification
- `node src/ui/controls/checks/DownloadVerificationPanelControl.check.js` passed.
- `node src/ui/server/unifiedApp/checks/download-verification.check.js` passed, including typed Brotli and legacy `storage_type=gzip` cases.
- `node src/ui/server/unifiedApp/checks/shell.check.js` passed with the new nav entry.
- `node src/ui/server/unifiedApp/checks/unified.server.check.js` passed.
- Live endpoint on updated server `http://127.0.0.1:51015/api/downloads/verifications?limit=5` returned `verified=5/5`, `savedToDb=5/5`, algorithm `gzip`, and `levelRecorded=0/5` for recent imported rows.
- Puppeteer DOM check for `http://127.0.0.1:51015/?app=download-verification` passed: active nav `Download Verify`, table present, no horizontal overflow.
- Screenshot saved: `screenshots/download-verification-ui/download-verification.png`.
- Fresh Electron unified app launched on port `51016` directly to `/?app=download-verification`; API check returned `verified=3/3`.

## Running UI
- Web unified app: `http://127.0.0.1:51015/?app=download-verification`.
- Electron verification window: PID 14984, server `http://127.0.0.1:51016/?app=download-verification`.
