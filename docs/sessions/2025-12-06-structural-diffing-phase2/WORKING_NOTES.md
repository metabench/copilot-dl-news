# Working Notes – Layout masks DB schema

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- 2025-12-06 — Added migration 013-layout-masks.sql creating layout_masks table (signature_hash PK/FK to layout_signatures, mask_json TEXT, sample_count, dynamic_nodes_count, timestamps).
- 2025-12-06 — Updated schema-definitions.js with layout_masks table and index idx_layout_masks_signature.
- 2025-12-06 — Ran `npm run schema:sync`; schema-definitions.js regenerated (Tables: 78, Indexes: 213, Triggers: 25, Views: 3).
