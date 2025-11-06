---
title: "Database Schema Evolution"
intent: "Enable schema evolution without export/import cycles through normalization and compression infrastructure"
audience: "agents,devs"
owner: "agents"
last_review: "2025-10-19"
tags: ["database", "schema", "normalization", "compression", "migration"]
supersedes: []
related: ["docs/DATABASE_NORMALIZATION_PLAN.md", "docs/PHASE_0_IMPLEMENTATION.md", "docs/COMPRESSION_IMPLEMENTATION_FULL.md"]
---

> **Research-First Preflight**  
> 1) Open `docs/INDEX.md`. 2) Navigate to relevant topics. 3) Read the linked docs.  
> Do **not** rely on prompt snippets. If it’s not in the prompt but is in the docs, the docs win.

## Requirements
- Review the database references in [../INDEX.md](../INDEX.md) before proposing schema changes.
- Coordinate with migration workflows documented in `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md`.

## Summary
Comprehensive database normalization and compression infrastructure plan enabling schema evolution without breaking changes. Includes migration-free normalization, dual-write compatibility, and 70-85% size reduction through compression. Ready for incremental implementation with zero downtime.

## When to use
- When planning database schema changes or normalization
- When implementing compression infrastructure
- When needing to evolve schema without export/import cycles
- When adding new normalized tables alongside existing schema
- When planning migration strategies with backward compatibility

## Procedure
1. **Review full plan**: Read `docs/DATABASE_NORMALIZATION_PLAN.md` (80+ pages) for technical specification
2. **Start with Phase 0**: Implement migration infrastructure (`docs/PHASE_0_IMPLEMENTATION.md`) - zero risk, 1-2 days
3. **Add compression**: Implement gzip/brotli infrastructure (`docs/COMPRESSION_IMPLEMENTATION_FULL.md`) - 2-4 hours
4. **Add normalized tables**: Create new tables alongside existing schema without breaking changes
5. **Implement dual-write**: Write to both old and new schemas during transition
6. **Create views**: Add backward compatibility views for zero-downtime migration
7. **Gradual cutover**: Switch reads to views, then normalized tables
8. **Validate and cleanup**: Archive legacy tables after validation period

## Gotchas
- **No breaking changes**: Always maintain backward compatibility during transition
- **Dual-write overhead**: Temporary performance impact during migration period
- **View complexity**: Ensure views accurately reconstruct denormalized tables
- **Compression trade-offs**: Higher compression ratios = slower access times
- **Schema versioning**: Track schema versions for migration management
- **Testing required**: Extensive testing needed for dual-write and view accuracy