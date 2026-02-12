---
type: workflow
id: doc-extraction-playbook
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: docs-indexer
audience: agents
tags:
  - docs
  - discovery
  - workflow
last-reviewed: 2026-02-12
---

# Documentation Extraction Playbook

This workflow standardizes how agents discover, read, and extract information from the documentation set before acting.

## Preflight Steps

1. Open `docs/INDEX.md` and locate the topic categories that apply to your task.
2. Note the ⭐ priority markers and read those docs first.
3. Skim secondary docs only when the ⭐ guidance references them.
4. Record any newly discovered patterns or gaps so they can be folded back into canonical docs.

## Discovery Pattern

```javascript
const taskCategories = {
  architecture: 'Understanding system design',
  crawls: 'Working with web crawling',
  backgroundTasks: 'Long-running processing',
  database: 'Schema, queries, normalization',
  ui: 'Frontend components and styling',
  testing: 'Writing and running tests',
  debugging: 'Investigating failures'
};
```

1. Identify the task category.
2. Use the index to jump to matching docs.
3. For each doc, confirm "When to Read" guidance before committing time.
4. Capture relevant cross-references in your working notes.

## Reading Order Guidance

| If you need to… | Read this first | Then read |
| --- | --- | --- |
| Understand system architecture | `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` ⭐ | `docs/SERVICE_LAYER_ARCHITECTURE.md` |
| Work with services | `docs/SERVICE_LAYER_GUIDE.md` ⭐ | `docs/SERVICE_LAYER_ARCHITECTURE.md` |
| Fix failing tests systematically | `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ | `docs/TESTING_STATUS.md` |
| Implement API consumers | `docs/API_ENDPOINT_REFERENCE.md` ⭐ | `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` |
| Understand place hub taxonomy | `docs/PLACE_HUB_HIERARCHY.md` ⭐ | `docs/HIERARCHICAL_PLANNING_INTEGRATION.md` |
| Implement geography crawl | `docs/GEOGRAPHY_CRAWL_TYPE.md` ⭐ | `docs/GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md` |
| Get database connection patterns | `docs/DATABASE_QUICK_REFERENCE.md` ⭐ | `docs/DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md` |
| Understand enhanced DB adapter | `docs/COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md` ⭐ | `docs/ADVANCED_PLANNING_SUITE.md` |
| Write new tests | `docs/agents/testing-guidelines.md` ⭐ | `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` |
| Debug child processes | `docs/DEBUGGING_CHILD_PROCESSES.md` ⭐ | SSE logging notes in repo |

Update this table whenever workflows evolve.

## js-edit Discovery Toolkit

- Start each extraction pass by running `node tools/dev/js-edit.js --list-functions --json <file>` and `--list-variables --json <file>` to capture symbol inventories before summarising a module.
- Use `--scan-targets --scan-target-kind function|variable --json` to obtain selector hashes/spans for sections you intend to document; embed these summaries or link to saved plan files in the extracted documentation.
- When context snippets are required, call `--context-function <selector> --emit-plan tmp/<doc>-context.plan.json` (or the variable equivalent) so the span metadata is preserved for reviewers.
- If you identify refactor opportunities while extracting docs, stage follow-up tasks rather than editing immediately; record the relevant js-edit commands and output paths in the tracker so future refactors can reuse the analysis.
- Document any js-edit limitations (unsupported syntax, parser gaps) alongside the extracted material and propose tooling enhancements in the change plan before switching to manual inspection.

## Extraction Rules

- When a section exceeds 40 lines or mixes concepts, extract it into a topical doc.
- Classify content by intent: policy, workflow, how-to, reference, or checklist.
- Use front matter with `status: canonical` for the destination doc.
- Replace the original section with a link pointing to the canonical location.

## Post-Extraction Checklist

- Confirm the new doc is listed in `docs/INDEX.md`.
- Verify all relative links resolve from the new location.
- Add a note to `docs/reports/link_check.md` indicating the extraction date and scope.
