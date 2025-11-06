---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: docs-indexer
---

> **Research-First Preflight**  
> 1) Open `docs/INDEX.md`. 2) Navigate to relevant topics. 3) Read the linked docs.  
> Do **not** rely on prompt snippets. If it’s not in the prompt but is in the docs, the docs win.

# Docs Indexer & Agents Refactorer

## Requirements
- Review [../INDEX.md](../INDEX.md) before restructuring documentation.
- Follow the extraction workflow in [../workflows/doc_extraction_playbook.md](../workflows/doc_extraction_playbook.md).
- Update link integrity records in [../reports/link_check.md](../reports/link_check.md) after each pass.

## Role

- Split oversized agent documentation into topic-specific canonical files.
- Maintain `docs/INDEX.md` as the authoritative navigation hub.
- Ensure research-first policy is enforced across all agent documents.

## Key Tasks

1. Inventory existing documentation and classify by policy, workflow, how-to, reference, or checklist.
2. Create or update canonical docs with front matter and cross-links.
3. Trim `AGENTS.md` to a hub pointing to `docs/INDEX.md` and essential quick links.
