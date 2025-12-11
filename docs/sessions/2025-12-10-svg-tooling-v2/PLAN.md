# Plan – SVG Tooling V2: High-Bandwidth Templates & Recipes

## Objective
Design and implement dense, guarded, template-based SVG generation and editing system for AI agents that:
- Reduces token usage by 80-95% via templates and dense payloads
- Enables batch operations (multiple edits per tool call)
- Provides js-edit-style guardrails (hash/path verification)
- Supports multi-step recipes for complex workflows
- Guides weaker models with presets and structured errors

## Done When
- [x] Architecture document with full specification
- [x] Template schema and 3 starter templates (badge, node, legend)
- [x] Dense payload library with expansion logic
- [x] Template engine with validation
- [x] Guard system (hash, path, syntax)
- [x] 2 sample recipes (add-legend, auto-fix-overlaps)
- [x] Quick reference guide
- [ ] CLI integration into svg-edit.js (Phase 2)
- [ ] Recipe executor implementation (Phase 2)
- [ ] Full template catalog (Phase 3)
- [ ] Tests for libraries (Phase 3)

## Change Set (completed)
- `docs/designs/SVG_TOOLING_V2_ARCHITECTURE.md` — Full specification
- `docs/guides/SVG_TOOLING_V2_QUICK_REFERENCE.md` — Usage guide
- `tools/dev/lib/svgDensePayload.js` — Payload expansion
- `tools/dev/lib/svgTemplateEngine.js` — Template engine
- `tools/dev/lib/svgGuardSystem.js` — Guard verification
- `tools/dev/svg-templates/badge.json` — Badge template
- `tools/dev/svg-templates/node.json` — Graph node template
- `tools/dev/svg-templates/legend.json` — Legend template
- `tools/dev/svg-recipes/add-legend.json` — Legend recipe
- `tools/dev/svg-recipes/auto-fix-overlaps.json` — Overlap fix recipe

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Template expressions too complex | Use safe evaluator with limited scope |
| Recipe execution failures | Structured errors with suggestions |
| Guard hash collisions | 12-char base64 = negligible collision risk |
| Weaker models misuse API | Presets + validation + clear error messages |

## Tests / Validation
- [ ] Unit tests for svgDensePayload.js
- [ ] Unit tests for svgTemplateEngine.js
- [ ] Unit tests for svgGuardSystem.js
- [ ] Integration test: stamp badge template
- [ ] Integration test: run add-legend recipe
- [ ] E2E test: create diagram from plan.json

## Next Steps (Phase 2)
1. Wire template engine into svg-edit.js CLI
2. Implement recipe executor with step sequencing
3. Add --batch flag for bulk operations
4. Add --preset flag for common operations
5. Write tests for all libraries
