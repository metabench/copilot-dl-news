# Decisions – Single UI app cohesion  next steps

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-30 | `schema:check` false drift on Windows due to CRLF/LF hashing differences | Normalize CRLF→LF before hashing schema content (still ignore generated timestamp line) | Eliminates Windows-only false positives while preserving drift sensitivity |
| 2025-12-30 | `diagram:check` risk of hanging due to expensive default scanning/collection | Limit the check artifact to DB section for determinism | Faster check feedback; other sections remain available in the full UI |
| 2025-12-30 | Startup checks timing out due to expensive SSR routes | Add `--check`-mode fast path (Quality Dashboard `/`) and ensure `--port` overrides exist | Checks become reliable without changing normal runtime behavior |
