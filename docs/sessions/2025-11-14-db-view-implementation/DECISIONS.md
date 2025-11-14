# Decisions – Db View Implementation

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-11-14 | `articles_view` must expose legacy `content_length`/`text` columns even though normalized tables do not store them. | Surface those columns as `NULL` placeholders (plus `compressed_html` mirrors `content_blob`) so downstream analytics keep their schemas without inventing fake values. | Keeps compatibility for readers while signalling future backfill work; record follow-up to populate plain-text extracts when available. |
| 2025-11-14 | Raw or compressed HTML blobs should not be exposed via views when no uncompressed source exists. | Drop the `html`, `text`, and `compressed_html` columns from `articles_view` (migration 011) and require consumers/analysis runs to fetch + decompress content through storage adapters. | Prevents partial/incorrect data access while making it explicit that decompression happens inside `analyse-pages` / storage utilities rather than generic views. |
