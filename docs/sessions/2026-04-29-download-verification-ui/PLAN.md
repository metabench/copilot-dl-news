# Plan: Download Verification UI

Objective: Add a unified UI screen that verifies recent downloads were fetched, saved to `data/news.db`, and shows their storage compression algorithm, options, and level when recorded.

Done when:
- The unified app has a navigable download verification screen.
- A DB query helper returns recent verification rows without inline SQL in the UI layer.
- The API reports download success, DB persistence, storage type, compression algorithm, options, level, sizes, and SHA evidence.
- Focused render/API checks pass.
- The updated unified UI is running for inspection.

Change set: `src/data/db/queries/downloadEvidence.js`, `src/ui/controls/DownloadVerificationPanelControl.js`, `src/ui/server/unifiedApp/*`, focused checks/docs.

Risks/assumptions: Recent remote-imported rows may record compression as `content_storage.storage_type` without a `compression_types` row, so the UI must clearly show unknown/unrecorded level rather than inventing one.

Tests: Focused control check, unified shell check, API/check script, server check if time permits.

Docs to update: Session files and, if a reusable lesson emerges, durable lessons.
